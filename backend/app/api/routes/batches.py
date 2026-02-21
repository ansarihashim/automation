from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
import json
from app.services.batch_service import BatchService

router = APIRouter()
batch_service = BatchService()
STORAGE_DIR = "app/storage/batches"


@router.get("/{batch_id}/clients")
async def get_batch_clients(batch_id: str):
    """
    Return list of clients for a batch with their email and file name.
    GET /api/batches/{batch_id}/clients
    """
    batch_folder = os.path.join(STORAGE_DIR, batch_id)
    if not os.path.exists(batch_folder):
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' not found.")

    mapping_path = os.path.join(batch_folder, "client_email_map.json")
    if not os.path.exists(mapping_path):
        raise HTTPException(status_code=404, detail="client_email_map.json not found.")

    with open(mapping_path, "r") as f:
        email_map: dict = json.load(f)

    client_folder = os.path.join(batch_folder, "client_files")
    files = (
        [f for f in os.listdir(client_folder) if f.endswith(".xlsx")]
        if os.path.exists(client_folder) else []
    )

    result = []
    for filename in sorted(files):
        client_key  = filename.replace(".xlsx", "")
        client_name = client_key.replace("_", " ").strip()
        email = email_map.get(client_name) or email_map.get(client_name.upper(), "")
        result.append({
            "client_name": client_name,
            "email": email,
            "file_name": filename,
        })

    return result


@router.get("/")
async def list_batches():
    """List all batches with simplified stats"""
    return batch_service.list_batches()

@router.get("/{batch_id}")
async def get_batch(batch_id: str):
    """Get full batch data by ID"""
    try:
        return batch_service.get_batch(batch_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{batch_id}/files")
async def get_batch_files(batch_id: str):
    """Get file paths for a batch"""
    try:
        files = batch_service.get_batch_files(batch_id)
        # Check which files exist
        return {
            "batch_id": batch_id,
            "files": {
                "master": os.path.exists(files["master"]),
                "mother": os.path.exists(files["mother"]),
                "summary": os.path.exists(files["summary"]),
                "email_log": os.path.exists(files["email_log"])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{batch_id}/download/{file_type}")
async def download_batch_file(batch_id: str, file_type: str):
    """
    Download a specific file from a batch.
    file_type: master | email | processed
    """
    ALLOWED = {"master", "email", "processed"}
    if file_type not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"Invalid file_type. Choose from: {', '.join(ALLOWED)}")

    try:
        files = batch_service.get_batch_files(batch_id)
        file_path = files[file_type]

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"{file_type} file not found for batch '{batch_id}'")

        filename_map = {
            "master":    f"{batch_id}_master.xlsx",
            "email":     f"{batch_id}_email_mapping.xlsx",
            "processed": f"{batch_id}_processed_master.xlsx",
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
