from fastapi import APIRouter, HTTPException, Depends
import os
from app.services.file_service import load_batch_by_id, save_batch
from app.services.email_service import AmazonSESEmailService
from app.services.processing_service import send_client_mis_emails
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
    Body: { "batch_id": "...", "limit": <optional int> }
    """
    batch_folder = os.path.join(STORAGE_DIR, request.batch_id)

    if not os.path.exists(batch_folder):
        raise HTTPException(
            status_code=404,
            detail=f"Batch '{request.batch_id}' not found.",
        )

    result = send_client_mis_emails(
        batch_folder=batch_folder,
        clients=request.clients,
        limit=request.limit,
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

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
    """Get email sending logs"""
    log_file = "app/storage/logs/email_logs.txt"
    logs = []
    
    if os.path.exists(log_file):
        try:
            with open(log_file, "r") as f:
                lines = f.readlines()
                for line in reversed(lines):
                    parts = line.strip().split(" | ")
                    if len(parts) >= 4:
                        log_entry = {
                            "timestamp": parts[0],
                            "batch_id": parts[1].replace("Batch: ", ""),
                            "email": parts[2].replace("Email: ", ""),
                            "status": parts[3].replace("Status: ", ""),
                            "error": parts[4].replace("Error: ", "") if len(parts) > 4 else None
                        }
                        logs.append(log_entry)
        except Exception as e:
            print(f"Error reading log file: {e}")
            
    return logs
