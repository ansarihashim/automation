"""
Admin-only client management endpoints.

Mounted at /api/admin/clients via admin_routes.py include_router call.
All endpoints require the 'admin' role — normal users receive 403 Forbidden.

Endpoints
---------
GET    /                    List all clients (pagination + search)
POST   /                    Upsert one client (add or update email)
POST   /bulk                Bulk upsert many clients
DELETE /{client_name}       Remove a client record
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, field_validator

from app.auth.dependencies import require_admin
from app.database import get_db
from app.models.user_model import CurrentUser
from app.services.client_service import (
    bulk_save_clients,
    delete_client,
    save_client_emails,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------


class ClientEmailIn(BaseModel):
    """Single client upsert payload (supports up to 5 email addresses)."""

    client_name: str
    emails: List[EmailStr]

    @field_validator("client_name", mode="before")
    @classmethod
    def normalise_name(cls, v: str) -> str:
        v = str(v).strip().upper()
        if not v:
            raise ValueError("client_name must not be empty")
        return v

    @field_validator("emails", mode="before")
    @classmethod
    def validate_emails(cls, v) -> List[str]:
        if isinstance(v, str):
            # Accept a bare string for backward compatibility
            v = [v]
        if not v:
            raise ValueError("At least one email is required")
        # Normalise, deduplicate, validate count
        seen: set = set()
        clean: list = []
        for e in v:
            e = str(e).strip().lower()
            if e and e not in seen:
                seen.add(e)
                clean.append(e)
        if not clean:
            raise ValueError("At least one valid email is required")
        if len(clean) > 5:
            raise ValueError("A maximum of 5 email addresses is allowed per client")
        return clean


class BulkClientEmailIn(BaseModel):
    """Bulk upsert payload — list of client + emails pairs."""

    clients: List[ClientEmailIn]


# ---------------------------------------------------------------------------
# GET /  — list all clients with optional search + pagination
# ---------------------------------------------------------------------------


@router.get("/")
async def list_clients(
    page: int = Query(
        default=1, ge=1, description="Page number (1-based)"
    ),
    limit: int = Query(
        default=50, ge=1, le=500, description="Records per page (max 500)"
    ),
    search: Optional[str] = Query(
        default=None,
        description="Case-insensitive substring filter on client_name",
    ),
    admin: CurrentUser = Depends(require_admin),
):
    """
    Return a paginated list of all clients.

    GET /api/admin/clients?page=1&limit=50&search=pharma

    Response
    --------
    {
        "total":   120,
        "page":    1,
        "limit":   50,
        "clients": [
            {
                "client_name": "AJANTA PHARMA",
                "email":       "mis@ajanta.com",
                "created_at":  "2026-02-01T10:00:00Z",
                "updated_at":  "2026-02-20T14:33:10Z"
            },
            ...
        ]
    }
    """
    db = get_db()
    col = db["clients"]

    # Build filter — empty dict returns all documents
    query_filter: dict = {}
    if search and search.strip():
        query_filter["client_name"] = {
            "$regex": search.strip(),
            "$options": "i",
        }

    total = await col.count_documents(query_filter)
    skip = (page - 1) * limit

    cursor = (
        col.find(
            query_filter,
            {
                "_id":         0,
                "client_name": 1,
                "email":       1,   # kept for backward-compat display
                "emails":      1,
                "created_at":  1,
                "updated_at":  1,
            },
        )
        .sort("client_name", 1)
        .skip(skip)
        .limit(limit)
    )

    raw_clients = await cursor.to_list(length=limit)

    # Normalise: always expose 'emails' list to the frontend
    def _migrate(doc: dict) -> dict:
        if not doc.get("emails"):
            legacy = doc.get("email")
            doc["emails"] = [legacy] if legacy else []
        return doc

    clients = [_migrate(c) for c in raw_clients]

    return {
        "total":   total,
        "page":    page,
        "limit":   limit,
        "clients": clients,
    }


# ---------------------------------------------------------------------------
# POST /  — upsert single client
# ---------------------------------------------------------------------------


@router.post("/", status_code=status.HTTP_200_OK)
async def save_client(
    body: ClientEmailIn,
    admin: CurrentUser = Depends(require_admin),
):
    """
    Add a new client or update an existing client's email addresses (max 5).

    POST /api/admin/clients
    Body:
        {
            "client_name": "AJANTA PHARMA",
            "emails":      ["mis@ajanta.com", "accounts@ajanta.com"]
        }

    Response:
        { "message": "Client emails saved" }
    """
    await save_client_emails(body.client_name, body.emails)
    return {"message": "Client emails saved"}


# ---------------------------------------------------------------------------
# POST /bulk  — bulk upsert many clients
# ---------------------------------------------------------------------------


@router.post("/bulk", status_code=status.HTTP_200_OK)
async def save_clients_bulk(
    body: BulkClientEmailIn,
    admin: CurrentUser = Depends(require_admin),
):
    """
    Bulk upsert many client emails in a single MongoDB bulk_write call.

    Designed for post-upload flows where many clients may be missing.
    Handles up to 10 000 clients efficiently via ordered=False bulk_write.

    POST /api/admin/clients/bulk
    Body:
        {
            "clients": [
                { "client_name": "CLIENT A", "email": "a@mail.com" },
                { "client_name": "CLIENT B", "email": "b@mail.com" }
            ]
        }

    Response:
        {
            "message":  "Bulk save complete",
            "inserted": 2,
            "modified": 0,
            "total":    2
        }
    """
    if not body.clients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="clients list must not be empty",
        )

    result = await bulk_save_clients(
        [{"client_name": c.client_name, "emails": c.emails} for c in body.clients]
    )
    return result


# ---------------------------------------------------------------------------
# DELETE /{client_name}  — remove a client record
# ---------------------------------------------------------------------------


@router.delete("/{client_name}", status_code=status.HTTP_200_OK)
async def remove_client(
    client_name: str,
    admin: CurrentUser = Depends(require_admin),
):
    """
    Delete a client record by exact name match (URL-decoded, uppercased).

    DELETE /api/admin/clients/AJANTA%20PHARMA

    Returns 404 if the client does not exist.

    Response:
        { "message": "Client 'AJANTA PHARMA' deleted successfully" }
    """
    normalised = client_name.strip().upper()
    if not normalised:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name must not be empty",
        )

    deleted = await delete_client(normalised)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client '{normalised}' not found",
        )

    return {"message": f"Client '{normalised}' deleted successfully"}
