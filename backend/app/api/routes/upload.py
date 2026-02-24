"""
Master upload endpoint — orchestrates the full ingestion pipeline.

POST /api/upload/master

Pipeline
--------
1.  Validate file type (.xlsx / .xls).
2.  Parse the uploaded Excel from memory (no disk write).
3.  Validate required columns ('Order id', 'LRN').
4.  Extract unique client names from the file.
5.  Check for missing emails in the 'clients' collection.

    CASE A — Missing clients exist
    ┌─────────┬────────────────────────────────────────────────────────┐
    │ Role    │ Behaviour                                                 │
    ├─────────┼────────────────────────────────────────────────────────┤
    │ user    │ HTTP 422  {"status": "failed", "missing_clients": [...]}  │
    │         │ Nothing is stored.                                        │
    ├─────────┼────────────────────────────────────────────────────────┤
    │ admin   │ HTTP 200  {"status": "missing_clients", ...}              │
    │         │ Admin adds emails via Step-5 APIs and re-uploads.        │
    └─────────┴────────────────────────────────────────────────────────┘

    CASE B — All emails present → proceed to full processing.

6.  Upsert every shipment row into the cumulative 'shipments' collection.
7.  Generate per-client MIS Excel files from MongoDB, upload to Cloudinary.
8.  Create batch document in MongoDB.
9.  Return success response.

The system is fully stateless — no local folders, no local files are kept.
Data source of truth: MongoDB (batches, clients, shipments) + Cloudinary (files).
"""

from __future__ import annotations

import io
import time
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.services.batch_mongo_service import create_batch
from app.services.shipment_service import upsert_shipments_from_dataframe
from app.services.mis_service import generate_mis_for_all_clients
from app.services.client_service import (
    extract_clients_from_dataframe,
    check_missing_client_emails,
    get_email_map_for_clients,
)
from app.auth.dependencies import require_write_access
from app.models.user_model import CurrentUser
from app.database import get_db

router = APIRouter()

# Columns that must be present in the uploaded master file.
REQUIRED_COLUMNS: set[str] = {"Order id", "LRN"}


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _is_excel(filename: str) -> bool:
    return filename.endswith((".xlsx", ".xls"))


def _check_required_columns(df: pd.DataFrame) -> list[str]:
    """Return missing column names from REQUIRED_COLUMNS."""
    return sorted(REQUIRED_COLUMNS - set(df.columns))


def _make_safe_name(client_name: str) -> str:
    """Convert a client name into a Cloudinary/URL-safe key."""
    return (
        client_name
        .replace(" ", "_")
        .replace("/", "_")
        .replace("\\", "_")
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/master")
async def upload_master(
    master_file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_write_access),
):
    """
    Full ingestion pipeline.

    Accepts one Excel file (master_file) containing daily shipment data.
    Client email addresses are sourced from the 'clients' MongoDB collection —
    no email file is required.  The uploaded file is parsed in-memory; nothing
    is persisted to the local filesystem.

    Returns one of:
    • { status: "failed",          ... }  — user, missing emails  (HTTP 422)
    • { status: "missing_clients", ... }  — admin, missing emails (HTTP 200)
    • { status: "success",         ... }  — all emails present, batch created
    """
    t_start = time.perf_counter()
    now_utc = datetime.now(timezone.utc)

    # ── Step 1: Validate file type ─────────────────────────────────────────
    if not _is_excel(master_file.filename or ""):
        raise HTTPException(
            status_code=400,
            detail="master_file must be an Excel file (.xlsx or .xls)",
        )

    # ── Step 2: Generate batch ID ──────────────────────────────────────────
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_id  = f"batch_{timestamp}"

    # ── Step 3: Parse master file from memory (no disk write) ─────────────
    try:
        master_file.file.seek(0)
        file_bytes = master_file.file.read()
        master_df  = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot read master file: {exc}",
        )

    # Strip whitespace from all column headers for reliable lookups.
    master_df.columns = [str(c).strip() for c in master_df.columns]

    missing_cols = _check_required_columns(master_df)
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Master file is missing required column(s): {', '.join(missing_cols)}",
        )

    total_rows = len(master_df)
    if total_rows == 0:
        raise HTTPException(status_code=400, detail="Master file contains no data rows.")

    print(
        f"\n🚀 Upload started — batch: {batch_id} | "
        f"rows: {total_rows} | user: {current_user.email}"
    )

    # ── Step 4: Extract clients ────────────────────────────────────────────
    client_names = extract_clients_from_dataframe(master_df)
    if not client_names:
        raise HTTPException(
            status_code=400,
            detail="No valid client names found in the 'Order id' column.",
        )

    # ── Step 5: Check email mapping ────────────────────────────────────────
    email_check = await check_missing_client_emails(client_names)
    missing: list[str] = email_check["missing"]

    # ── CASE A: Missing client emails ──────────────────────────────────────
    if missing:
        elapsed = round(time.perf_counter() - t_start, 3)
        print(
            f"⚠️  Upload blocked — {len(missing)} client(s) missing emails "
            f"({elapsed}s) | user: {current_user.email} | role: {current_user.role}"
        )

        # Persist unresolved missing-client requests so admin can see them.
        _db = get_db()
        for _client in missing:
            await _db.missing_client_requests.update_one(
                {"client_name": _client, "resolved": False},
                {
                    "$setOnInsert": {
                        "client_name":   _client,
                        "requested_by":  current_user.email,
                        "created_at":    datetime.utcnow(),
                        "resolved":      False,
                    }
                },
                upsert=True,
            )

        if current_user.role != "admin":
            raise HTTPException(
                status_code=422,
                detail={
                    "status":          "failed",
                    "message":         (
                        "Email mapping is missing for one or more clients. "
                        "Please contact an admin to add them before uploading."
                    ),
                    "missing_clients": missing,
                },
            )

        return {
            "status":          "missing_clients",
            "message":         (
                "The following clients are missing email addresses. "
                "Please add them via the admin panel and re-upload."
            ),
            "missing_clients": missing,
            "existing_count":  len(email_check["existing"]),
            "total_clients":   len(client_names),
        }

    # ── CASE B: All emails present ─────────────────────────────────────────
    email_map: dict[str, str] = await get_email_map_for_clients(client_names)

    # ── Step 6: Upsert shipments ───────────────────────────────────────────
    upsert_summary: dict = {"inserted": 0, "updated": 0, "skipped": 0}
    try:
        upsert_summary = await upsert_shipments_from_dataframe(master_df)
        print(
            f"📦 Shipments — "
            f"Inserted: {upsert_summary['inserted']} | "
            f"Updated: {upsert_summary['updated']} | "
            f"Skipped: {upsert_summary['skipped']}"
        )
    except Exception as exc:
        print(f"⚠️  Shipment upsert failed (non-fatal): {exc}")

    # ── Step 7: Generate MIS files for all clients ─────────────────────────
    mis_cloud_files: dict[str, dict] = {}
    try:
        mis_cloud_files = await generate_mis_for_all_clients()
        print(f"📊 MIS generated for {len(mis_cloud_files)} client(s)")
    except Exception as exc:
        print(f"⚠️  MIS generation failed (non-fatal): {exc}")

    # ── Step 8: Build client records ───────────────────────────────────────
    clients_list: list[dict] = []
    for client_name in sorted(email_map.keys()):
        cloud_info = mis_cloud_files.get(client_name, {})
        file_url   = cloud_info.get("url") if isinstance(cloud_info, dict) else None
        clients_list.append({
            "client_name":        client_name,
            "safe_name":          _make_safe_name(client_name),
            "email":              email_map[client_name],
            "file_url":           file_url,
            "generated_file_url": file_url,
            "custom_file_url":    None,
            "status":             "pending",
            "sent_at":            None,
        })

    total_clients = len(clients_list)

    # ── Step 8 (cont): Persist batch to MongoDB ────────────────────────────
    mongo_doc: dict = {
        "batch_id":        batch_id,
        "created_at":      now_utc.isoformat(),
        "created_by":      current_user.email,
        "total_rows":      total_rows,
        "total_clients":   total_clients,
        "status":          "processed",
        "mother_file_url": None,
        "clients":         clients_list,
    }
    try:
        await create_batch(mongo_doc)
    except Exception as exc:
        print(f"⚠️  MongoDB batch save failed: {exc}")

    # ── Step 9: Return summary ─────────────────────────────────────────────
    elapsed = round(time.perf_counter() - t_start, 3)
    print(
        f"✅ Upload complete — batch: {batch_id} | "
        f"clients: {total_clients} | rows: {total_rows} | time: {elapsed}s\n"
    )

    return {
        "status":             "success",
        "batch_id":           batch_id,
        "total_clients":      total_clients,
        "total_rows":         total_rows,
        "shipments_inserted": upsert_summary["inserted"],
        "shipments_updated":  upsert_summary["updated"],
        "shipments_skipped":  upsert_summary["skipped"],
        "mis_generated":      len(mis_cloud_files),
        "processing_time_s":  elapsed,
        "message":            "Upload processed successfully",
    }
