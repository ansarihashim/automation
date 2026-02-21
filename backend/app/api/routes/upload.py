from fastapi import APIRouter, UploadFile, File, HTTPException
import shutil
import os
from datetime import datetime
from app.services.processing_service import (
    process_master_file,
    process_master_with_email_validation,
    generate_client_mis_files,
)

router = APIRouter()


def _is_excel(filename: str) -> bool:
    return filename.endswith((".xlsx", ".xls"))


def _save_upload(upload: UploadFile, dest: str) -> None:
    """Stream an uploaded file to disk."""
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)


@router.post("/master")
async def upload_master(
    master_file: UploadFile = File(...),
    email_file: UploadFile = File(...),
):
    """
    Phase-1 upload endpoint.
    Accepts two Excel files:
      - master_file : shipment data  (must contain 'Order id' column)
      - email_file  : client→email mapping  (Client_Name, Client_Email columns)

    Validates that every client in the master file has a mapped email.
    On success saves batch artifacts and returns the batch_id.
    """

    # 1. Validate file types
    if not _is_excel(master_file.filename):
        raise HTTPException(
            status_code=400,
            detail="master_file must be an Excel file (.xlsx / .xls)",
        )
    if not _is_excel(email_file.filename):
        raise HTTPException(
            status_code=400,
            detail="email_file must be an Excel file (.xlsx / .xls)",
        )

    # 2. Create batch folder structure
    now = datetime.now()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    batch_id = f"batch_{timestamp}"
    batch_dir = os.path.join("app/storage/batches", batch_id)
    raw_dir = os.path.join(batch_dir, "raw")
    processed_dir = os.path.join(batch_dir, "processed")
    client_dir = os.path.join(batch_dir, "client_files")

    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(processed_dir, exist_ok=True)
    os.makedirs(client_dir, exist_ok=True)

    # 3. Save uploaded files to raw/
    master_path = os.path.join(raw_dir, "master.xlsx")
    email_path = os.path.join(raw_dir, "email_mapping.xlsx")
    _save_upload(master_file, master_path)
    _save_upload(email_file, email_path)

    # 4. Run Phase-1 validation + processing
    result = process_master_with_email_validation(
        master_path=master_path,
        email_path=email_path,
        batch_id=batch_id,
        output_dir=batch_dir,
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    # 5. Run Phase-2: generate mother.xlsx + split client files
    mis_result = generate_client_mis_files(batch_dir)

    if not mis_result["success"]:
        raise HTTPException(status_code=400, detail=mis_result["message"])

    # 6. Save batch metadata
    import json
    meta = {
        "batch_id": batch_id,
        "created_at": now.isoformat(),
        "total_rows": mis_result.get("total_rows", 0),
        "total_clients": mis_result["total_clients"],
        "files": {
            "master": "raw/master.xlsx",
            "email": "raw/email_mapping.xlsx",
            "mother": "processed/mother.xlsx",
            "client_folder": "client_files/",
        },
    }
    with open(os.path.join(batch_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    return {
        "batch_id": batch_id,
        "total_rows": mis_result.get("total_rows", 0),
        "clients_generated": mis_result["total_clients"],
        "message": "Batch created successfully",
    }
