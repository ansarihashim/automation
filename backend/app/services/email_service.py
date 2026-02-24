import boto3
import time
import os
import requests as _requests
import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders as _encoders
from botocore.exceptions import ClientError
from datetime import datetime, timezone
from app.config import settings
from app.services.aws_ses import get_ses_client
from app.database import get_db

# ---------------------------------------------------------------------------
# Mandatory CC addresses for all MIS emails — sourced from centralised config
# ---------------------------------------------------------------------------
_MIS_CC: list[str] = settings.MIS_CC_EMAILS


# ---------------------------------------------------------------------------
# send_mis_email — async, used by the new send-batch endpoint
# ---------------------------------------------------------------------------

async def send_mis_email(
    batch_id: str,
    client_name: str,
    file_url: str,
) -> dict:
    """
    Send a MIS Excel report to a client via AWS SES.

    Steps
    -----
    1. Fetch client email from 'clients' collection.
    2. Download the Excel file from Cloudinary (bytes, no local file).
    3. Build a MIME multipart email with HTML body + .xlsx attachment.
    4. Add mandatory CC addresses.
    5. Send via ses.send_raw_email.
    6. Return result dict.

    Parameters
    ----------
    batch_id    : str  — used for logging context only
    client_name : str  — must match exactly as stored in clients collection
    file_url    : str  — Cloudinary secure URL for the Excel attachment

    Returns
    -------
    {
        "status":     "sent" | "failed",
        "email":      str,
        "message_id": str | None,
        "error":      str | None,
    }
    """
    db = get_db()

    # ── Step 1: Fetch client email(s) ───────────────────────────────────────
    client_doc = await db["clients"].find_one(
        {"client_name": client_name},
        {"_id": 0, "email": 1, "emails": 1},
    )

    # Backward compatibility: old docs have 'email' string; new docs have 'emails' list.
    if client_doc:
        emails: list[str] = client_doc.get("emails") or []
        if not emails and client_doc.get("email"):
            emails = [client_doc["email"]]
    else:
        emails = []

    if not emails:
        msg = f"No email found in 'clients' collection for '{client_name}'"
        print(f"  ⚠️  {msg}")
        return {"status": "failed", "email": None, "message_id": None, "error": msg}

    primary_email: str = emails[0]

    # ── Step 2: Download Excel from Cloudinary (in-memory) ──────────────────
    try:
        resp = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: _requests.get(file_url, timeout=30),
        )
        resp.raise_for_status()
        file_bytes: bytes = resp.content
    except Exception as exc:
        msg = f"Failed to download MIS file from Cloudinary: {exc}"
        print(f"  ❌ {msg}")
        return {"status": "failed", "email": recipient_email, "message_id": None, "error": msg}

    # ── Step 3: Build MIME message ──────────────────────────────────────────
    sender_addr = f"{settings.SES_SENDER_NAME} <{settings.SES_SENDER_EMAIL}>"
    subject     = f"MIS Report - {client_name}"

    html_body = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <p>Dear Customer,</p>
  <p>Please find attached your MIS report for <strong>{client_name}</strong>.</p>
  <p>
    If you have any questions, please reach out at
    <a href="mailto:{settings.SUPPORT_EMAIL}">{settings.SUPPORT_EMAIL}</a>.
  </p>
  <br>
  <p>Regards,<br><strong>Kiirus Xpress</strong></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;">
  <p style="font-size:11px;color:#9ca3af;">This is an automated email. Please do not reply directly.</p>
</body>
</html>
"""

    msg = MIMEMultipart("mixed")
    msg["From"]    = sender_addr
    msg["To"]      = ", ".join(emails)
    msg["CC"]      = ", ".join(_MIS_CC)
    msg["Subject"] = subject

    # HTML body part
    body_part = MIMEMultipart("alternative")
    body_part.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(body_part)

    # Excel attachment
    safe_name      = client_name.strip().upper().replace(" ", "_").replace("/", "_")
    attachment_name = f"{safe_name}_MIS.xlsx"
    part = MIMEBase(
        "application",
        "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    part.set_payload(file_bytes)
    _encoders.encode_base64(part)
    part.add_header(
        "Content-Disposition",
        f'attachment; filename="{attachment_name}"',
    )
    msg.attach(part)

    # ── Step 4+5: Send via SES send_raw_email ───────────────────────────────
    all_destinations = emails + _MIS_CC
    try:
        ses = get_ses_client()
        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: ses.send_raw_email(
                Source=sender_addr,
                Destinations=all_destinations,
                RawMessage={"Data": msg.as_bytes()},
            ),
        )
        message_id = response.get("MessageId", "")
        print(
            f"  ✅ Sent to {emails} | "
            f"client: {client_name} | msg_id: {message_id}"
        )
        return {
            "status":     "sent",
            "email":      primary_email,
            "emails":     emails,
            "message_id": message_id,
            "error":      None,
        }
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        detail = exc.response["Error"]["Message"]
        msg_err = f"SES ClientError [{code}]: {detail}"
        print(f"  ❌ {msg_err}")
        return {
            "status":     "failed",
            "email":      primary_email,
            "emails":     emails,
            "message_id": None,
            "error":      msg_err,
        }
    except Exception as exc:
        msg_err = f"Unexpected SES error: {exc}"
        print(f"  ❌ {msg_err}")
        return {
            "status":     "failed",
            "email":      primary_email,
            "emails":     emails,
            "message_id": None,
            "error":      msg_err,
        }


# ===========================================================================
# Legacy class removed — row-based email workflow retired.
# All email sending now uses send_mis_email() above.
# ===========================================================================
