from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from app.services.file_service import load_batch_by_id
from app.auth.dependencies import require_read_access
from app.models.user_model import CurrentUser

router = APIRouter()

@router.get("/{batch_id}")
async def get_batch_customers(
    batch_id: str,
    status: Optional[str] = Query(None, description="Filter by status: NotSent, Sent, Failed"),
    current_user: CurrentUser = Depends(require_read_access),
):
    """Get rows for a specific batch, optionally filtered by status"""
    try:
        batch_data = load_batch_by_id(batch_id)
        rows = batch_data.get("rows", [])
        
        # Filter if status provided
        if status:
            rows = [
                r for r in rows 
                if r.get("status", "").lower() == status.lower()
            ]
        
        return {
            "batch_id": batch_data.get("batch_id"),
            "created_at": batch_data.get("created_at"),
            "total_rows": len(rows),
            "rows": rows
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
