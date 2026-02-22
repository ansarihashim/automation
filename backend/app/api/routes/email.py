from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import RedirectResponse
import os
import json
import shutil
from datetime import datetime, timezone
from app.services.file_service import load_batch_by_id, save_batch
from app.services.email_service import AmazonSESEmailService
from app.services.processing_service import send_client_mis_emails
from app.services.batch_mongo_service import (
    get_batch_by_id,
    update_client_custom_url,
    update_client_status,
    insert_email_log,
    get_all_email_logs,
)
from app.models.schemas import EmailSendRequest, EmailPreviewRequest, MISEmailRequest
from app.auth.dependencies import require_read_access, require_write_access
from app.models.user_model import CurrentUser

router = APIRouter()
email_service = AmazonSESEmailService()

STORAGE_DIR = "app/storage/batches"


@router.post("/send-mis")
async def send_mis_emails(request: MISEmailRequest, current_user: CurrentUser = Depends(require_write_access)):
    """
    Phase-3: Send MIS Excel files to each client via AWS SES.
    POST /api/email/send-mis
    Body: { "batch_id": "...", "clients": [...], "limit": N, "file_type": "generated"|"custom" }

    Reads from MongoDB if local batch folder is missing (full persistence support).
    After sending, updates MongoDB client statuses and inserts email log entries.
    """
    batch_folder = os.path.join(STORAGE_DIR, request.batch_id)

    # ── If local folder is gone, reconstruct minimal files from MongoDB ──────
    if not os.path.exists(batch_folder):
        batch_mongo = await get_batch_by_id(request.batch_id)
        if not batch_mongo:
            raise HTTPException(
                status_code=404,
                detail=f"Batch '{request.batch_id}' not found.",
            )
        os.makedirs(batch_folder, exist_ok=True)

        # Reconstruct meta.json
        client_files = {
            c["safe_name"]: {"url": c["generated_file_url"]}
            for c in batch_mongo.get("clients", [])
            if c.get("generated_file_url")
        }
        custom_files = {
            c["safe_name"]: {"url": c["custom_file_url"]}
            for c in batch_mongo.get("clients", [])
            if c.get("custom_file_url")
        }
        meta = {
            "batch_id": request.batch_id,
            "client_files": client_files,
            "custom_files": custom_files,
        }
        with open(os.path.join(batch_folder, "meta.json"), "w") as f:
            json.dump(meta, f)

        # Reconstruct client_email_map.json
        email_map = {
            c["client_name"].upper(): c["email"]
            for c in batch_mongo.get("clients", [])
        }
        with open(os.path.join(batch_folder, "client_email_map.json"), "w") as f:
            json.dump(email_map, f)

    result = send_client_mis_emails(
        batch_folder=batch_folder,
        clients=request.clients,
        limit=request.limit,
        file_type=request.file_type or "generated",
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    # ── Update MongoDB: client statuses + email logs ─────────────────────────
    now_iso = datetime.now(timezone.utc).isoformat()

    for entry in result.get("sent_clients", []):
        try:
            await update_client_status(request.batch_id, entry["safe_name"], "sent")
            await insert_email_log({
                "batch_id": request.batch_id,
                "client_name": entry["client_name"],
                "email": entry["email"],
                "status": "sent",
                "sent_at": now_iso,
                "error": None,
            })
        except Exception as exc:
            print(f"⚠️  MongoDB update failed for sent client '{entry['client_name']}': {exc}")

    for entry in result.get("failed_clients", []):
        try:
            await update_client_status(request.batch_id, entry["safe_name"], "failed")
            await insert_email_log({
                "batch_id": request.batch_id,
                "client_name": entry["client_name"],
                "email": entry["email"],
                "status": "failed",
                "sent_at": now_iso,
                "error": entry.get("reason"),
            })
        except Exception as exc:
            print(f"⚠️  MongoDB update failed for failed client '{entry['client_name']}': {exc}")

    return {
        "message": "MIS emails sent",
        "total_sent": result["total_sent"],
        "failed": result["failed"],
        "errors": result["errors"],
    }

@router.post("/send")
async def send_emails(request: EmailSendRequest, current_user: CurrentUser = Depends(require_write_access)):
    """Send emails in controlled batches (1, 5, 10, 20, 50, custom)"""
    try:
        batch_data = load_batch_by_id(request.batch_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    try:
        stats = email_service.send_batch_emails(batch_data, limit=request.limit)
        save_batch(batch_data)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email sending failed: {str(e)}")

@router.post("/preview")
async def preview_email(request: EmailPreviewRequest, current_user: CurrentUser = Depends(require_read_access)):
    """Preview email content for a specific row"""
    try:
        batch_data = load_batch_by_id(request.batch_id)
        rows = batch_data.get("rows", [])
        
        row = next(
            (r for r in rows if r.get("row_id") == request.row_id),
            None
        )
        
        if not row:
            raise HTTPException(
                status_code=404, 
                detail=f"Row {request.row_id} not found in batch {request.batch_id}"
            )
        
        enriched_data = email_service.enrich_data(row)
        html_body = email_service.build_shipment_email(enriched_data)
        subject = "Shipment Update – Kiirusxpress"
        
        return {
            "subject": subject,
            "html": html_body,
            "customer_name": row.get("customer_name"),
            "customer_email": row.get("customer_email"),
            "row_id": row.get("row_id")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}")

@router.get("/preview-first/{batch_id}")
async def preview_first_email(batch_id: str, current_user: CurrentUser = Depends(require_read_access)):
    """Preview the first email in a batch"""
    try:
        batch_data = load_batch_by_id(batch_id)
        rows = batch_data.get("rows", [])
        
        if not rows:
            raise HTTPException(status_code=404, detail="No rows found in this batch")
        
        first_row = rows[0]
        enriched_data = email_service.enrich_data(first_row)
        html_body = email_service.build_shipment_email(enriched_data)
        subject = "Shipment Update – Kiirusxpress"
        
        return {
            "subject": subject,
            "html": html_body,
            "customer_name": first_row.get("customer_name"),
            "customer_email": first_row.get("customer_email"),
            "row_id": first_row.get("row_id")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}")

@router.get("/logs")
async def get_email_logs(current_user: CurrentUser = Depends(require_read_access)):
    """Get email sending logs — reads from MongoDB (persistent)."""
    try:
        logs = await get_all_email_logs()
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load email logs: {e}")


@router.post("/upload-custom")
async def upload_custom_file(
    batch_id: str = Form(...),
    client_name: str = Form(...),
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_write_access),
):
    """Upload a custom Excel attachment for a specific client to Cloudinary."""
    batch_folder = os.path.join(STORAGE_DIR, batch_id)

    # Accept if either local folder OR MongoDB record exists
    batch_mongo = await get_batch_by_id(batch_id)
    if not os.path.exists(batch_folder) and not batch_mongo:
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' not found.")

    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are accepted.")

    safe_name = client_name.strip().replace(" ", "_").replace("/", "").replace("\\", "")

    # Save to tmp
    tmp_dir = os.path.join("app", "storage", "tmp", batch_id)
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_path = os.path.join(tmp_dir, f"{safe_name}.xlsx")

    with open(tmp_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    # Upload to Cloudinary
    cloud_info: dict = {}
    try:
        from app.utils.cloudinary_service import upload_excel
        cloud_info = upload_excel(tmp_path, batch_id, "custom_files", safe_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        try:
            if os.path.exists(tmp_dir) and not os.listdir(tmp_dir):
                os.rmdir(tmp_dir)
        except Exception:
            pass

    # Update meta.json with the custom file URL (local cache)
    meta_path = os.path.join(batch_folder, "meta.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                meta = json.load(f)
            meta.setdefault("custom_files", {})[safe_name] = cloud_info
            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=2)
        except Exception as e:
            print(f"⚠️  Failed to update meta.json: {e}")

    # Update MongoDB (persistent)
    try:
        await update_client_custom_url(
            batch_id=batch_id,
            safe_name=safe_name,
            custom_file_url=cloud_info.get("url", ""),
        )
    except Exception as e:
        print(f"⚠️  MongoDB custom_file_url update failed: {e}")

    return {
        "message": f"Custom file uploaded to Cloudinary for '{client_name}'",
        "filename": f"{safe_name}.xlsx",
        "url": cloud_info.get("url"),
    }


@router.get("/mis-preview/{batch_id}")
async def get_mis_clients(batch_id: str, current_user: CurrentUser = Depends(require_read_access)):
    """Return list of clients with Cloudinary URLs. Prefers MongoDB; falls back to meta.json."""

    # ── MongoDB path ─────────────────────────────────────────────────────────
    batch_mongo = await get_batch_by_id(batch_id)
    if batch_mongo and batch_mongo.get("clients"):
        clients = []
        for c in batch_mongo["clients"]:
            safe = c.get("safe_name", c["client_name"].replace(" ", "_"))
            clients.append({
                "client_name": c["client_name"],
                "safe_name": safe,
                "generated_file": f"{safe}.xlsx",
                "generated_url": c.get("generated_file_url"),
                "custom_file_exists": bool(c.get("custom_file_url")),
                "custom_url": c.get("custom_file_url"),
                "recipient_email": c.get("email", ""),
                "status": c.get("status", "pending"),
            })
        return {"batch_id": batch_id, "clients": clients}

    # ── Legacy fallback: local meta.json ─────────────────────────────────────
    batch_folder = os.path.join(STORAGE_DIR, batch_id)
    if not os.path.exists(batch_folder):
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' not found.")

    meta_path = os.path.join(batch_folder, "meta.json")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="meta.json not found for this batch.")

    try:
        with open(meta_path, "r") as f:
            meta = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read meta.json: {e}")

    cloud_generated: dict = meta.get("client_files", {})
    cloud_custom: dict = meta.get("custom_files", {})

    email_map: dict = {}
    map_path = os.path.join(batch_folder, "client_email_map.json")
    if os.path.exists(map_path):
        try:
            with open(map_path, "r") as f:
                email_map = json.load(f)
        except Exception:
            pass

    clients = []
    for safe_name in sorted(cloud_generated.keys()):
        display_name = safe_name.replace("_", " ").strip()
        custom_exists = safe_name in cloud_custom
        recipient = email_map.get(display_name) or email_map.get(display_name.upper()) or ""
        clients.append({
            "client_name": display_name,
            "safe_name": safe_name,
            "generated_file": f"{safe_name}.xlsx",
            "generated_url": cloud_generated[safe_name].get("url"),
            "custom_file_exists": custom_exists,
            "custom_url": cloud_custom[safe_name].get("url") if custom_exists else None,
            "recipient_email": recipient,
            "status": "pending",
        })

    return {"batch_id": batch_id, "clients": clients}


@router.get("/download/{batch_id}/{file_type}/{client_safe_name}")
async def download_client_file(
    batch_id: str,
    file_type: str,
    client_safe_name: str,
    current_user: CurrentUser = Depends(require_read_access),
):
    """Redirect to Cloudinary URL for generated or custom Excel file."""
    batch_folder = os.path.join(STORAGE_DIR, batch_id)
    meta_path = os.path.join(batch_folder, "meta.json")

    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Batch metadata not found.")

    try:
        with open(meta_path, "r") as f:
            meta = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read meta.json: {e}")

    if file_type == "custom":
        entry = meta.get("custom_files", {}).get(client_safe_name)
    else:
        entry = meta.get("client_files", {}).get(client_safe_name)

    if not entry or not entry.get("url"):
        raise HTTPException(status_code=404, detail="File not found in Cloudinary.")

    return RedirectResponse(url=entry["url"], status_code=302)
