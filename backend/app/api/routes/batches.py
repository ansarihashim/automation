"""
Batch routes — all data served from MongoDB for full persistence.

GET /api/batches/           → list all batches (summary, no clients array)
GET /api/batches/recent     → last 5 batches (summary)
GET /api/batches/{batch_id} → full batch details including clients
GET /api/batches/{batch_id}/clients → client list (kept for backward compat)
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, RedirectResponse
import os
import json

from app.services.batch_mongo_service import (
    get_all_batches,
    get_recent_batches,
    get_batch_by_id,
)
from app.services.batch_service import BatchService
from app.auth.dependencies import require_read_access
from app.models.user_model import CurrentUser

router = APIRouter()
_batch_service = BatchService()
STORAGE_DIR = "app/storage/batches"


# ---------------------------------------------------------------------------
# MongoDB-backed list / detail endpoints
# NOTE: /recent MUST be declared before /{batch_id} so it is not swallowed.
# ---------------------------------------------------------------------------

@router.get("/recent")
async def list_recent_batches(current_user: CurrentUser = Depends(require_read_access)):
    """Return last 5 batches (summary, no clients). Served from MongoDB."""
    return await get_recent_batches(5)


@router.get("/")
async def list_batches(current_user: CurrentUser = Depends(require_read_access)):
    """List all batches sorted newest first. Served from MongoDB."""
    return await get_all_batches()


@router.get("/{batch_id}")
async def get_batch(batch_id: str, current_user: CurrentUser = Depends(require_read_access)):
    """
    Full batch document including clients array.
    Served from MongoDB; falls back to local meta.json for legacy batches.
    """
    batch = await get_batch_by_id(batch_id)
    if batch:
        return batch

    # Fallback: local meta.json (pre-MongoDB batches)
    meta_path = os.path.join(STORAGE_DIR, batch_id, "meta.json")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' not found.")
    try:
        with open(meta_path, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.get("/{batch_id}/clients")
async def get_batch_clients(batch_id: str, current_user: CurrentUser = Depends(require_read_access)):
    """
    Client list for a batch.
    Prefers MongoDB data; falls back to local folder for legacy batches.
    """
    batch = await get_batch_by_id(batch_id)
    if batch and batch.get("clients"):
        return batch["clients"]

    # Legacy fallback
    batch_folder = os.path.join(STORAGE_DIR, batch_id)
    mapping_path = os.path.join(batch_folder, "client_email_map.json")
    if not os.path.exists(mapping_path):
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' not found.")

    with open(mapping_path, "r") as f:
        email_map: dict = json.load(f)

    client_folder = os.path.join(batch_folder, "client_files")
    files = (
        [fi for fi in os.listdir(client_folder) if fi.endswith(".xlsx")]
        if os.path.exists(client_folder) else []
    )
    result = []
    for filename in sorted(files):
        client_key  = filename.replace(".xlsx", "")
        client_name = client_key.replace("_", " ").strip()
        email = email_map.get(client_name) or email_map.get(client_name.upper(), "")
        result.append({"client_name": client_name, "email": email, "file_name": filename})
    return result


@router.get("/{batch_id}/download/{file_type}")
async def download_batch_file(
    batch_id: str,
    file_type: str,
    current_user: CurrentUser = Depends(require_read_access),
):
    """Download master/email/mother file. Mother redirects to Cloudinary URL."""
    ALLOWED = {"master", "email", "processed", "mother"}
    if file_type not in ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file_type. Choose from: {', '.join(ALLOWED)}",
        )

    # For mother file, redirect to Cloudinary if available
    if file_type == "mother":
        batch = await get_batch_by_id(batch_id)
        if batch and batch.get("mother_file_url"):
            return RedirectResponse(url=batch["mother_file_url"], status_code=302)

    try:
        files = _batch_service.get_batch_files(batch_id)
        file_path = files.get(file_type, "")
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail=f"{file_type} file not found for batch '{batch_id}'",
            )
        filename_map = {
            "master":    f"{batch_id}_master.xlsx",
            "email":     f"{batch_id}_email_mapping.xlsx",
            "processed": f"{batch_id}_processed_master.xlsx",
            "mother":    f"{batch_id}_mother.xlsx",
        }
        return FileResponse(
            path=file_path,
            filename=filename_map[file_type],
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

