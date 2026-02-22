"""
MongoDB persistence service for batches and email logs.

Batch document schema:
{
    batch_id: str,
    created_at: str (ISO),
    total_rows: int,
    total_clients: int,
    status: "processed",
    mother_file_url: str | None,
    clients: [
        {
            client_name: str,   # display name (spaces)
            safe_name: str,     # filename-safe (underscores)
            email: str,
            generated_file_url: str | None,
            custom_file_url: str | None,
            status: "pending" | "sent" | "failed"
        }
    ]
}
"""

from datetime import datetime
from app.database import get_db


# ---------------------------------------------------------------------------
# Batch CRUD
# ---------------------------------------------------------------------------

async def create_batch(batch_doc: dict) -> str:
    """Insert a new batch document. Returns batch_id."""
    db = get_db()
    # Remove _id if accidentally present
    batch_doc.pop("_id", None)
    await db["batches"].insert_one(batch_doc)
    return batch_doc["batch_id"]


async def get_all_batches() -> list:
    """Return all batches sorted newest first."""
    db = get_db()
    cursor = db["batches"].find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(None)


async def get_recent_batches(limit: int = 5) -> list:
    """Return the N most recent batches (summary only — no clients array)."""
    db = get_db()
    cursor = (
        db["batches"]
        .find({}, {"_id": 0, "clients": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    return await cursor.to_list(None)


async def get_batch_by_id(batch_id: str) -> dict | None:
    """Return a full batch document by batch_id, or None."""
    db = get_db()
    return await db["batches"].find_one({"batch_id": batch_id}, {"_id": 0})


async def update_client_custom_url(
    batch_id: str, safe_name: str, custom_file_url: str
) -> bool:
    """Set custom_file_url for a specific client inside a batch."""
    db = get_db()
    result = await db["batches"].update_one(
        {"batch_id": batch_id, "clients.safe_name": safe_name},
        {"$set": {"clients.$.custom_file_url": custom_file_url}},
    )
    return result.modified_count > 0


async def update_client_status(
    batch_id: str, safe_name: str, status: str
) -> bool:
    """Update a client's email send status (pending / sent / failed)."""
    db = get_db()
    result = await db["batches"].update_one(
        {"batch_id": batch_id, "clients.safe_name": safe_name},
        {"$set": {"clients.$.status": status}},
    )
    return result.modified_count > 0


# ---------------------------------------------------------------------------
# Email logs
# ---------------------------------------------------------------------------

async def insert_email_log(log_doc: dict) -> None:
    """Insert one email log entry."""
    db = get_db()
    log_doc.pop("_id", None)
    await db["email_logs"].insert_one(log_doc)


async def get_all_email_logs() -> list:
    """Return all email log entries sorted newest first."""
    db = get_db()
    cursor = db["email_logs"].find({}, {"_id": 0}).sort("sent_at", -1)
    return await cursor.to_list(None)
