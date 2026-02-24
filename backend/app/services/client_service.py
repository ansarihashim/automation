"""
Client email management service.

Maintains the 'clients' collection — one document per client_name (uppercase).
Emails are stored permanently so they only need to be entered once.

Public API
----------
    extract_clients_from_dataframe(df)          → list[str]
    check_missing_client_emails(client_names)   → {"existing": {...}, "missing": [...]}
    save_client_emails(client_name, emails)     → None   (multi-email, max 5)
    save_client_email(client_name, email)       → None   (legacy single-email alias)
    get_all_clients()                           → list[dict]
    get_email_map_for_clients(client_names)     → dict[str, str]  (first email, compat)
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from pymongo import UpdateOne

from app.database import get_db
from app.utils.client_utils import normalize_client_name


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize_client(order_id_val) -> Optional[str]:
    """
    Extract and normalise a client name from an 'Order id' cell value.
    Rules: strip whitespace, collapse internal spaces, uppercase.
    Returns None for blank / NaN.
    Mirrors the same logic used in processing_service.py and shipment_service.py.
    """
    if order_id_val is None:
        return None
    if isinstance(order_id_val, float) and math.isnan(order_id_val):
        return None
    s = normalize_client_name(str(order_id_val))
    return s if s else None


def _migrate_doc(doc: dict) -> dict:
    """
    Ensure a client document always has an 'emails' list.

    Old documents only have a single 'email' string field.
    This helper promotes it to a 1-element list so all callers
    can treat 'emails' as the canonical field without a DB migration.
    The original 'email' field is never deleted.
    """
    if not doc.get("emails"):
        legacy = doc.get("email")
        doc["emails"] = [legacy] if legacy else []
    return doc


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def extract_clients_from_dataframe(df: pd.DataFrame) -> list[str]:
    """
    Extract unique, normalised client names from the master DataFrame.

    The client name is taken from the 'Order id' column, uppercased.
    Blank / NaN values are skipped.

    Parameters
    ----------
    df : pd.DataFrame
        Raw master Excel data (column names must already be strip-normalised).

    Returns
    -------
    Sorted list of unique uppercase client name strings.
    """
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    if "Order id" not in df.columns:
        return []

    names: set[str] = set()
    for val in df["Order id"]:
        name = _normalize_client(val)
        if name:
            names.add(name)

    return sorted(names)


async def check_missing_client_emails(client_names: list[str]) -> dict:
    """
    Check which of the supplied client names already have an email stored.

    Uses a single $in query — no per-client round-trips.

    Parameters
    ----------
    client_names : list[str]
        Normalised (uppercase) client names to check.

    Returns
    -------
    {
        "existing": {"CLIENT A": "a@example.com", ...},
        "missing":  ["CLIENT B", "CLIENT C", ...]
    }
    """
    if not client_names:
        return {"existing": {}, "missing": []}

    db = get_db()
    cursor = db["clients"].find(
        {"client_name": {"$in": client_names}},
        {"_id": 0, "client_name": 1, "email": 1, "emails": 1},
    )
    docs = await cursor.to_list(length=None)

    # Build existing map — a client counts as "existing" only if it has
    # at least one valid email (handles old 'email' field transparently).
    existing: dict[str, list[str]] = {}
    for d in docs:
        d = _migrate_doc(d)
        if d["emails"]:
            existing[d["client_name"]] = d["emails"]

    missing: list[str] = sorted(
        name for name in client_names if name not in existing
    )

    return {"existing": existing, "missing": missing}


async def save_client_emails(client_name: str, emails: list[str]) -> None:
    """
    Upsert a client with a list of email addresses (max 5) into 'clients'.

    • New client  → inserts with created_at = now.
    • Existing    → updates emails + updated_at only.

    Parameters
    ----------
    client_name : str        Will be stored uppercase.
    emails      : list[str]  1–5 validated, deduplicated email addresses.
    """
    if not emails:
        raise ValueError("At least one email address is required.")
    if len(emails) > 5:
        raise ValueError("A maximum of 5 email addresses is allowed per client.")

    db = get_db()
    now = datetime.now(timezone.utc)
    client_name = normalize_client_name(client_name)

    # Deduplicate while preserving order
    seen: set[str] = set()
    clean: list[str] = []
    for e in emails:
        e = e.strip().lower()
        if e and e not in seen:
            seen.add(e)
            clean.append(e)

    await db["clients"].update_one(
        {"client_name": client_name},
        {
            "$set": {
                "emails":     clean,
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
    )


async def save_client_email(client_name: str, email: str) -> None:
    """Legacy single-email alias — wraps save_client_emails([email])."""
    await save_client_emails(client_name, [email])


async def get_all_clients() -> list[dict]:
    """
    Return all client documents sorted alphabetically by client_name.
    Old documents with only 'email' are migrated on read to include 'emails'.
    _id is excluded from the result.
    """
    db = get_db()
    cursor = db["clients"].find({}, {"_id": 0}).sort("client_name", 1)
    docs = await cursor.to_list(length=None)
    return [_migrate_doc(d) for d in docs]


async def get_email_map_for_clients(client_names: list[str]) -> dict[str, str]:
    """
    Fetch  {client_name: email}  for the given client names from MongoDB.
    Uses a single $in query.

    Only clients that exist in the DB are included in the result.
    """
    if not client_names:
        return {}

    db = get_db()
    cursor = db["clients"].find(
        {"client_name": {"$in": client_names}},
        {"_id": 0, "client_name": 1, "email": 1, "emails": 1},
    )
    docs = await cursor.to_list(length=None)

    result: dict[str, str] = {}
    for d in docs:
        d = _migrate_doc(d)
        # Return the first email as a string for backward compatibility
        # (used by upload.py to store per-client metadata).
        result[d["client_name"]] = d["emails"][0] if d["emails"] else ""
    return result


async def bulk_save_clients(clients: list[dict]) -> dict:
    """
    Bulk upsert many clients in a single MongoDB bulk_write call.

    Each item in *clients* must have:
        { "client_name": str (uppercase), "email": str }

    Uses ordered=False so partial failures do not abort the batch.

    Returns
    -------
    {
        "message":  "Bulk save complete",
        "inserted": <upserted count>,
        "modified": <modified count>,
        "total":    <input count>
    }
    """
    if not clients:
        return {"message": "Nothing to save", "inserted": 0, "modified": 0, "total": 0}

    now = datetime.now(timezone.utc)
    ops = [
        UpdateOne(
            {"client_name": normalize_client_name(c["client_name"])},
            {
                "$set": {
                    # Support both legacy {email: str} and new {emails: list[str]} format
                    "emails":     (
                        [e.strip().lower() for e in c["emails"] if e.strip()]
                        if c.get("emails")
                        else ([c["email"].strip().lower()] if c.get("email") else [])
                    ),
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "client_name": normalize_client_name(c["client_name"]),
                    "created_at": now,
                },
            },
            upsert=True,
        )
        for c in clients
    ]

    db = get_db()
    result = await db["clients"].bulk_write(ops, ordered=False)

    return {
        "message":  "Bulk save complete",
        "inserted": result.upserted_count,
        "modified": result.modified_count,
        "total":    len(clients),
    }


async def delete_client(client_name: str) -> bool:
    """
    Delete a client by exact (already-uppercased) name.

    Returns True if a document was deleted, False if not found.
    """
    db = get_db()
    result = await db["clients"].delete_one({"client_name": normalize_client_name(client_name)})
    return result.deleted_count > 0
