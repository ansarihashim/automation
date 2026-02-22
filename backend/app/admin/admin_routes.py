"""
Admin-only user management routes.
All endpoints require admin role.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime, timezone
from app.database import get_db
from app.auth.dependencies import require_admin
from app.models.user_model import (
    ApproveUserRequest,
    RejectUserRequest,
    UserOut,
    CurrentUser,
)
from typing import List

router = APIRouter()


def _serialize_user(doc: dict) -> UserOut:
    return UserOut(
        email=doc["email"],
        role=doc["role"],
        permission=doc["permission"],
        status=doc["status"],
        created_at=doc["created_at"],
        approved_by=doc.get("approved_by"),
        approved_at=doc.get("approved_at"),
    )


@router.get("/pending", response_model=List[UserOut])
async def get_pending_users(admin: CurrentUser = Depends(require_admin)):
    """List all users with status = pending."""
    db = get_db()
    cursor = db["users"].find({"status": "pending"})
    results = []
    async for doc in cursor:
        results.append(_serialize_user(doc))
    return results


@router.get("/users", response_model=List[UserOut])
async def list_all_users(admin: CurrentUser = Depends(require_admin)):
    """List every user in the system."""
    db = get_db()
    cursor = db["users"].find({})
    results = []
    async for doc in cursor:
        results.append(_serialize_user(doc))
    return results


@router.post("/approve")
async def approve_user(
    body: ApproveUserRequest,
    admin: CurrentUser = Depends(require_admin),
):
    """Set a pending user to active, assign role + permission."""
    db = get_db()
    users_col = db["users"]

    user = await users_col.find_one({"email": body.email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user["status"] == "rejected":
        raise HTTPException(status_code=400, detail="Cannot approve a rejected user")

    await users_col.update_one(
        {"email": body.email},
        {
            "$set": {
                "status": "active",
                "role": body.role,
                "permission": body.permission,
                "approved_by": admin.email,
                "approved_at": datetime.now(timezone.utc),
            }
        },
    )
    return {"message": f"User {body.email} approved as {body.role} with {body.permission} permission"}


@router.post("/reject")
async def reject_user(
    body: RejectUserRequest,
    admin: CurrentUser = Depends(require_admin),
):
    """Set a user status to rejected."""
    db = get_db()
    users_col = db["users"]

    user = await users_col.find_one({"email": body.email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user["status"] == "active" and user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Cannot reject an active admin")

    await users_col.update_one(
        {"email": body.email},
        {"$set": {"status": "rejected"}},
    )
    return {"message": f"User {body.email} has been rejected"}


@router.delete("/user/{email}")
async def delete_user(
    email: str,
    admin: CurrentUser = Depends(require_admin),
):
    """
    Delete a user.
    Rules:
    - Cannot delete another admin.
    - Cannot delete yourself.
    """
    db = get_db()
    users_col = db["users"]

    email = email.strip().lower()

    if email == admin.email:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    user = await users_col.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete an admin account")

    await users_col.delete_one({"email": email})
    return {"message": f"User {email} deleted"}
