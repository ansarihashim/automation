"""
Cloudinary integration for Kiirus Automation.
Handles upload and download of Excel files (mother, client_files, custom_files).
"""

import os
import requests
import cloudinary
import cloudinary.uploader
import cloudinary.api

# ---------------------------------------------------------------------------
# Lazy initialisation — configured on first call, not at import time.
# This avoids import-order races with load_dotenv().
# ---------------------------------------------------------------------------

_configured = False


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return

    # Try to load .env ourselves as a safety net (idempotent if already loaded)
    try:
        from dotenv import load_dotenv
        import pathlib
        # Walk up from this file to find backend/.env
        _here = pathlib.Path(__file__).resolve()
        for parent in _here.parents:
            candidate = parent / ".env"
            if candidate.exists():
                load_dotenv(dotenv_path=str(candidate), override=False)
                break
    except Exception:
        pass  # dotenv is optional; env vars may already be set

    _cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "")
    _api_key    = os.getenv("CLOUDINARY_API_KEY", "")
    _api_secret = os.getenv("CLOUDINARY_API_SECRET", "")

    if not _api_key:
        raise RuntimeError(
            "CLOUDINARY_API_KEY is not set. "
            "Ensure backend/.env contains CLOUDINARY_API_KEY."
        )

    cloudinary.config(
        cloud_name=_cloud_name,
        api_key=_api_key,
        api_secret=_api_secret,
        secure=True,
    )
    _configured = True


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def upload_excel(local_path: str, batch_id: str, folder_type: str, file_name: str) -> dict:
    """
    Upload an Excel file to Cloudinary.

    Args:
        local_path  : absolute or relative path to the .xlsx file on disk
        batch_id    : e.g. "batch_20260222_120533"
        folder_type : "mother" | "client_files" | "custom_files"
        file_name   : bare filename without extension, e.g. "PERKINS_INDIA"

    Returns:
        {"url": "<secure_url>", "public_id": "<public_id>"}

    Raises:
        RuntimeError on Cloudinary failure.
    """
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"File not found: {local_path}")

    _ensure_configured()
    public_id = f"kiirus/{batch_id}/{folder_type}/{file_name}"

    try:
        response = cloudinary.uploader.upload(
            local_path,
            resource_type="raw",
            public_id=public_id,
            overwrite=True,
            invalidate=True,
        )
        return {
            "url": response["secure_url"],
            "public_id": response["public_id"],
        }
    except Exception as e:
        raise RuntimeError(f"Cloudinary upload failed for '{file_name}': {e}") from e


# ---------------------------------------------------------------------------
# Download (used when attaching to SES email)
# ---------------------------------------------------------------------------

def download_from_cloudinary(url: str, local_path: str, timeout: int = 30) -> None:
    """
    Download a Cloudinary-hosted file to a local path.

    Args:
        url        : Cloudinary secure URL
        local_path : destination path on disk (parent dirs must exist)
        timeout    : request timeout in seconds

    Raises:
        RuntimeError on HTTP or IO failure.
    """
    try:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        with open(local_path, "wb") as f:
            f.write(response.content)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Timeout downloading from Cloudinary: {url}")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"HTTP error downloading from Cloudinary ({e.response.status_code}): {url}") from e
    except Exception as e:
        raise RuntimeError(f"Download failed: {e}") from e


# ---------------------------------------------------------------------------
# Delete  (for cleanup / batch expiry)
# ---------------------------------------------------------------------------

def delete_file(public_id: str) -> None:
    """
    Delete a file from Cloudinary by its public_id.
    Safe to call even if the file does not exist.
    """
    try:
        _ensure_configured()
        cloudinary.uploader.destroy(public_id, resource_type="raw", invalidate=True)
    except Exception as e:
        print(f"⚠️  Cloudinary delete failed for '{public_id}': {e}")
