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

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, ValidationError, field_validator

from app.auth.dependencies import require_admin
from app.database import get_db
from app.models.user_model import CurrentUser
from app.utils.client_utils import normalize_client_name
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
        result = normalize_client_name(str(v))
        if not result:
            raise ValueError("client_name must not be empty")
        return result

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
# GET /missing-requests  — unresolved missing-client notifications
# ---------------------------------------------------------------------------


@router.get("/missing-requests")
async def get_missing_requests(
    admin: CurrentUser = Depends(require_admin),
):
    """
    Return all unresolved missing-client requests created during uploads.

    GET /api/admin/clients/missing-requests

    Response:
        [
            {
                "client_name": "AJANTA PHARMA",
                "requested_by": "user@example.com",
                "created_at": "2026-02-24T10:00:00"
            },
            ...
        ]
    """
    db = get_db()
    requests_cursor = db.missing_client_requests.find(
        {"resolved": False},
        {"_id": 0, "client_name": 1, "requested_by": 1, "created_at": 1},
    ).sort("created_at", -1)
    return await requests_cursor.to_list(length=100)


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
    # Auto-resolve any pending missing-client requests for this client.
    db = get_db()
    await db.missing_client_requests.update_many(
        {"client_name": body.client_name, "resolved": False},
        {"$set": {"resolved": True}},
    )
    return {"message": "Client emails saved"}


# ---------------------------------------------------------------------------
# POST /bulk  — bulk upsert many clients
# ---------------------------------------------------------------------------


@router.post("/bulk", status_code=status.HTTP_200_OK)
async def save_clients_bulk(
    request: Request,
    admin: CurrentUser = Depends(require_admin),
):
    """
    Bulk upsert many client emails in a single MongoDB bulk_write call.

    Accepts BOTH body formats:
        Format A (array):    [{"client_name": ..., "emails": [...]}, ...]
        Format B (wrapped):  {"clients": [{"client_name": ..., "emails": [...]}, ...]}

    Each client:
        client_name  → trimmed + uppercased
        emails       → list[str], 1-5 valid addresses, duplicates removed
                       also accepts a bare string for backward compat

    POST /api/admin/clients/bulk

    Response:
        {
            "message":  "Bulk save complete",
            "inserted": 2,
            "modified": 0,
            "total":    2
        }
    """
    # ── Parse raw body ────────────────────────────────────────────────────
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON body — could not parse request.",
        )

    print("Bulk clients payload:", raw)

    # ── Normalise to list — accept both formats ───────────────────────────
    if isinstance(raw, list):
        clients_raw: list = raw
    elif isinstance(raw, dict) and "clients" in raw:
        clients_raw = raw["clients"]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Invalid format. Send a JSON array [...] or {"clients": [...]}.',
        )

    if not clients_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="clients list must not be empty",
        )

    # ── Validate each client via ClientEmailIn ────────────────────────────
    validated: list[dict] = []
    errors: list[str] = []

    for item in clients_raw:
        if not isinstance(item, dict):
            errors.append("Each entry must be a JSON object with client_name and emails.")
            continue

        raw_name = str(item.get("client_name") or "").strip().upper()

        # Also accept bare 'email' string for backward compat
        raw_emails = item.get("emails") or item.get("email")
        if isinstance(raw_emails, str):
            raw_emails = [raw_emails]
        if raw_emails is not None:
            item = {**item, "emails": raw_emails}

        try:
            parsed = ClientEmailIn(**item)
        except (ValidationError, Exception) as exc:
            label = raw_name or "UNKNOWN"
            email_count = len(raw_emails) if isinstance(raw_emails, list) else 0
            if email_count > 5:
                errors.append(f"Client {label} has invalid emails. Max 5 allowed.")
            elif not raw_emails:
                errors.append(f"Client {label} has no emails. At least one is required.")
            else:
                errors.append(f"Client {label} has invalid emails. Max 5 allowed.")
            continue

        validated.append({"client_name": parsed.client_name, "emails": parsed.emails})

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": errors[0], "all_errors": errors},
        )

    result = await bulk_save_clients(validated)
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
