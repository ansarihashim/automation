"""
Email routes â€” fully stateless.

All data is served from MongoDB (batches, clients) and Cloudinary (files).
No local folders, no meta.json, no client_email_map.json are used.
The system survives a Render redeploy without any data loss.

Endpoints
---------
POST  /api/email/send-batch             â€” send MIS emails for a batch (primary)
POST  /api/email/send-mis               â€” alias with file_type support (legacy callers)
POST  /api/email/upload-custom          â€” upload custom Excel override to Cloudinary
GET   /api/email/mis-preview/{batch_id} â€” list clients + Cloudinary URLs
GET   /api/email/download/{batch_id}/{file_type}/{safe_name} â€” redirect to Cloudinary
GET   /api/email/logs                   â€” email audit log from MongoDB
"""

from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.auth.dependencies import require_read_access, require_write_access
from app.models.schemas import MISEmailRequest
from app.models.user_model import CurrentUser
from app.utils.client_utils import normalize_client_name
from app.services.batch_mongo_service import (
    get_batch_by_id,
    get_all_email_logs,
    insert_email_log,
    update_client_custom_url,
    update_client_email_result,
)
from app.services.email_service import send_mis_email

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class SendBatchRequest(BaseModel):
    batch_id: str
    clients:  Optional[List[str]] = None  # None â†’ all pending
    limit:    Optional[int]       = None  # None â†’ no cap


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_file_url(client: dict, file_type: str) -> str | None:
    """
    Pick the Cloudinary URL for *client* based on *file_type*.
    Always falls back to the other URL type if the preferred one is absent.
    """
    if file_type == "custom":
        return client.get("custom_file_url") or client.get("generated_file_url")
    return client.get("generated_file_url") or client.get("custom_file_url")


def _filter_candidates(
    all_clients: list[dict],
    requested: list[str] | None,
    limit: int | None,
) -> list[dict]:
    """Return pending clients filtered by optional name list and limit."""
    candidates = [c for c in all_clients if c.get("status") == "pending"]
    if requested:
        upper = {normalize_client_name(n) for n in requested}
        candidates = [c for c in candidates if normalize_client_name(c["client_name"]) in upper]
    if limit and limit > 0:
        candidates = candidates[:limit]
    return candidates


async def _send_clients(
    batch_id: str,
    candidates: list[dict],
    file_type: str,
) -> dict:
    """
    Core email sending loop.

    For each candidate:
      â€¢ Resolves Cloudinary URL (no local file read).
      â€¢ Calls send_mis_email() â€” downloads file in-memory, sends via SES.
      â€¢ Persists status to MongoDB (batch client + email_logs).

    Returns a summary dict with sent / failed / skipped counts and per-client results.
    """
    sent_count    = 0
    failed_count  = 0
    skipped_count = 0
    results: list[dict] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for client in candidates:
        client_name = client["client_name"]
        safe_name   = client.get("safe_name", client_name.replace(" ", "_"))
        file_url    = _resolve_file_url(client, file_type)

        if not file_url:
            reason = f"File URL missing for client '{client_name}'"
            print(f"  â© Skipped {client_name}: {reason}")
            skipped_count += 1
            results.append({"client_name": client_name, "status": "skipped", "reason": reason})
            continue

        result     = await send_mis_email(batch_id=batch_id, client_name=client_name, file_url=file_url)
        status     = result["status"]
        email_addr = result.get("email", "")
        message_id = result.get("message_id")
        error      = result.get("error")

        if status == "sent":
            sent_count += 1
        else:
            failed_count += 1

        try:
            await update_client_email_result(
                batch_id=batch_id, safe_name=safe_name, status=status, sent_at=now_iso,
            )
        except Exception as exc:
            print(f"  âš ï¸  Batch status update failed for '{client_name}': {exc}")

        try:
            await insert_email_log({
                "batch_id": batch_id, "client_name": client_name,
                "email": email_addr, "status": status,
                "message_id": message_id, "error": error, "sent_at": now_iso,
            })
        except Exception as exc:
            print(f"  âš ï¸  Email log insert failed for '{client_name}': {exc}")

        results.append({
            "client_name": client_name, "email": email_addr,
            "status": status, "message_id": message_id, "error": error,
        })

    return {
        "sent": sent_count, "failed": failed_count,
        "skipped": skipped_count, "total": len(candidates), "results": results,
    }




# ---------------------------------------------------------------------------
# POST /api/email/send-batch  (primary)
# ---------------------------------------------------------------------------

@router.post("/send-batch")
async def send_batch_mis_emails(
    request: SendBatchRequest,
    current_user: CurrentUser = Depends(require_write_access),
):
    """
    Send MIS Excel reports to clients for a given batch.

    Body:
        {
            "batch_id": "batch_20260223_120000",
            "clients":  ["AJANTA PHARMA"],   // optional â€” omit for all pending
            "limit":    10                   // optional â€” omit for no cap
        }

    Uses generated_file_url preferentially; falls back to custom automatically.
    """
    batch = await get_batch_by_id(request.batch_id)
    if not batch:
        raise HTTPException(
            status_code=404,
            detail=f"Batch '{request.batch_id}' not found in database.",
        )

    all_clients: list[dict] = batch.get("clients", [])
    if not all_clients:
        raise HTTPException(status_code=400, detail="Batch has no clients.")

    candidates = _filter_candidates(all_clients, request.clients, request.limit)
    if not candidates:
        return {
            "batch_id": request.batch_id,
            "message":  "No pending clients to send to.",
            "sent": 0, "failed": 0, "skipped": 0, "total": 0, "results": [],
        }

    print(f"\nðŸ“§ send-batch: batch={request.batch_id} | candidates={len(candidates)}")
    summary = await _send_clients(request.batch_id, candidates, file_type="generated")
    print(
        f"âœ… send-batch complete â€” "
        f"Sent: {summary['sent']} | Failed: {summary['failed']} | "
        f"Skipped: {summary['skipped']} | Total: {summary['total']}\n"
    )
    return {"batch_id": request.batch_id, **summary}


# ---------------------------------------------------------------------------
# POST /api/email/send-mis  (alias â€” supports file_type param)
# ---------------------------------------------------------------------------

@router.post("/send-mis")
async def send_mis_emails(
    request: MISEmailRequest,
    current_user: CurrentUser = Depends(require_write_access),
):
    """
    Send MIS Excel files to each client via AWS SES.

    Body: { "batch_id": "...", "clients": [...], "limit": N, "file_type": "generated"|"custom" }

    Fully MongoDB-driven â€” no local files required.
    """
    batch = await get_batch_by_id(request.batch_id)
    if not batch:
        raise HTTPException(
            status_code=404,
            detail=f"Batch '{request.batch_id}' not found in database.",
        )

    all_clients: list[dict] = batch.get("clients", [])
    if not all_clients:
        raise HTTPException(status_code=400, detail="Batch has no clients.")

    candidates = _filter_candidates(all_clients, request.clients, request.limit)
    if not candidates:
        return {"message": "No pending clients to send to.", "total_sent": 0, "failed": 0, "errors": []}

    file_type = (request.file_type or "generated").lower()
    summary   = await _send_clients(request.batch_id, candidates, file_type)

    errors = [
        {"client": r["client_name"], "reason": r.get("error") or r.get("reason", "")}
        for r in summary["results"]
        if r["status"] in ("failed", "skipped")
    ]
    return {"message": "MIS emails sent", "total_sent": summary["sent"], "failed": summary["failed"], "errors": errors}


# ---------------------------------------------------------------------------
# GET /api/email/logs
# ---------------------------------------------------------------------------

@router.get("/logs")
async def get_email_logs(current_user: CurrentUser = Depends(require_read_access)):
    """Email audit log â€” served from MongoDB email_logs collection."""
    try:
        return await get_all_email_logs()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load email logs: {exc}")


# ---------------------------------------------------------------------------
# POST /api/email/upload-custom
# ---------------------------------------------------------------------------

@router.post("/upload-custom")
async def upload_custom_file(
    batch_id:    str        = Form(...),
    client_name: str        = Form(...),
    file:        UploadFile = File(...),
    current_user: CurrentUser = Depends(require_write_access),
):
    """
    Upload a custom Excel attachment for a specific client.

    Flow: uploaded file â†’ /tmp â†’ Cloudinary â†’ MongoDB (custom_file_url).
    Temp file is deleted immediately after the Cloudinary upload.
    No permanent local storage is used.
    """
    batch = await get_batch_by_id(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' not found in database.")

    if not (file.filename or "").endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are accepted.")

    safe_name = (
        client_name.strip()
        .replace(" ", "_")
        .replace("/", "")
        .replace("\\", "")
    )

    tmp_dir  = os.path.join("app", "storage", "tmp", batch_id)
    tmp_path = os.path.join(tmp_dir, f"{safe_name}.xlsx")
    os.makedirs(tmp_dir, exist_ok=True)

    try:
        with open(tmp_path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        from app.utils.cloudinary_service import upload_excel
        cloud_info: dict = upload_excel(tmp_path, batch_id, "custom_files", safe_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {exc}")
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            if os.path.exists(tmp_dir) and not os.listdir(tmp_dir):
                os.rmdir(tmp_dir)
        except Exception:
            pass

    try:
        await update_client_custom_url(
            batch_id=batch_id,
            safe_name=safe_name,
            custom_file_url=cloud_info.get("url", ""),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Cloudinary upload succeeded but MongoDB update failed: {exc}",
        )

    return {
        "message":  f"Custom file uploaded to Cloudinary for '{client_name}'",
        "filename": f"{safe_name}.xlsx",
        "url":      cloud_info.get("url"),
    }


# ---------------------------------------------------------------------------
# GET /api/email/mis-preview/{batch_id}
# ---------------------------------------------------------------------------

@router.get("/mis-preview/{batch_id}")
async def get_mis_clients(
    batch_id: str,
    current_user: CurrentUser = Depends(require_read_access),
):
    """
    Return list of clients with Cloudinary URLs for a batch.
    Served entirely from MongoDB â€” no local files.
    """
    batch = await get_batch_by_id(batch_id)
    if not batch:
        raise HTTPException(
            status_code=404,
            detail=f"Batch '{batch_id}' not found in database.",
        )

    raw_clients: list[dict] = batch.get("clients", [])
    if not raw_clients:
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' has no clients.")

    clients = []
    for c in raw_clients:
        safe = c.get("safe_name", c["client_name"].replace(" ", "_"))
        clients.append({
            "client_name":        c["client_name"],
            "safe_name":          safe,
            "generated_file":     f"{safe}.xlsx",
            "generated_url":      c.get("generated_file_url"),
            "custom_file_exists": bool(c.get("custom_file_url")),
            "custom_url":         c.get("custom_file_url"),
            "recipient_email":    c.get("email", ""),
            "status":             c.get("status", "pending"),
        })

    return {"batch_id": batch_id, "clients": clients}


# ---------------------------------------------------------------------------
# GET /api/email/download/{batch_id}/{file_type}/{client_safe_name}
# ---------------------------------------------------------------------------

@router.get("/download/{batch_id}/{file_type}/{client_safe_name}")
async def download_client_file(
    batch_id:         str,
    file_type:        str,
    client_safe_name: str,
    current_user: CurrentUser = Depends(require_read_access),
):
    """
    Redirect to Cloudinary URL for a generated or custom Excel file.
    Served entirely from MongoDB â€” no local files.
    """
    batch = await get_batch_by_id(batch_id)
    if not batch:
        raise HTTPException(
            status_code=404,
            detail=f"Batch '{batch_id}' not found in database.",
        )

    for c in batch.get("clients", []):
        if c.get("safe_name") == client_safe_name:
            url = _resolve_file_url(c, file_type)
            if url:
                return RedirectResponse(url=url, status_code=302)
            raise HTTPException(
                status_code=404,
                detail=f"File URL missing for client '{client_safe_name}'.",
            )

    raise HTTPException(
        status_code=404,
        detail=f"Client '{client_safe_name}' not found in batch '{batch_id}'.",
    )
