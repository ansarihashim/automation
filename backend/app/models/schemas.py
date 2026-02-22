from pydantic import BaseModel
from typing import List, Optional, Union

class RowRecord(BaseModel):
    """Individual row from uploaded file - no aggregation"""
    row_id: int
    customer_name: str
    customer_email: str
    parcel_count: int
    total_weight: float
    dispatch_date: Optional[str] = None
    payment_status: str
    status: str  # NotSent | Sent | Failed

class BatchData(BaseModel):
    """Batch = One uploaded file with all rows preserved"""
    batch_id: str
    created_at: str
    total_rows: int
    rows: List[RowRecord]

class BatchListItem(BaseModel):
    """Summary for batch listing"""
    batch_id: str
    created_at: str
    total_rows: int
    sent_count: int
    failed_count: int
    remaining_count: int

class EmailSendRequest(BaseModel):
    """Request to send emails in controlled batches"""
    batch_id: str
    limit: Union[int, str]  # Number of emails to send (1, 5, 10, 20, 50, custom) or "all"

class EmailPreviewRequest(BaseModel):
    """Request to preview an email"""
    batch_id: str
    row_id: int  # Changed from customer_email to row_id

class MISEmailRequest(BaseModel):
    """Request to send Phase-3 MIS emails to clients"""
    batch_id: str
    clients: Optional[List[str]] = None  # client names to send to; None = all
    limit: Optional[int] = None          # max emails to send; None = no cap
    file_type: Optional[str] = "generated"  # "generated" | "custom"
