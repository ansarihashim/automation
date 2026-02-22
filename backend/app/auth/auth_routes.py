"""
Authentication routes.
POST /api/auth/login  — register-or-login combined endpoint.
GET  /api/auth/me     — returns current user info from token.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime, timezone
from app.database import get_db
from app.auth.auth_utils import hash_password, verify_password, create_access_token
from app.auth.dependencies import get_current_user
from app.models.user_model import LoginRequest, TokenResponse, UserOut, CurrentUser

router = APIRouter()


@router.post("/login", response_model=TokenResponse | dict)
async def login_or_register(body: LoginRequest):
    """
    Combined register-or-login endpoint.

    • If the email is new  → create account (first user = admin+active, others = pending).
    • If the email exists  → verify password, check status.
    • Returns JWT if active; validation message otherwise.
    """
    db = get_db()
    users_col = db["users"]
    email = body.email  # already normalised by validator

    existing = await users_col.find_one({"email": email})

    # ------------------------------------------------------------------ LOGIN
    if existing:
        if not verify_password(body.password, existing["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password",
            )

        if existing["status"] == "pending":
            return {"message": "Your account is pending admin approval."}

        if existing["status"] == "rejected":
            return {"message": "Your account request was rejected. Contact an admin."}

        # active → issue token
        token = create_access_token({
            "email": existing["email"],
            "role": existing["role"],
            "permission": existing["permission"],
        })

        user_out = UserOut(
            email=existing["email"],
            role=existing["role"],
            permission=existing["permission"],
            status=existing["status"],
            created_at=existing["created_at"],
            approved_by=existing.get("approved_by"),
            approved_at=existing.get("approved_at"),
        )

        return TokenResponse(access_token=token, user=user_out)

    # ---------------------------------------------------------------- REGISTER
    # Check if this is the very first user
    total_users = await users_col.count_documents({})

    if total_users == 0:
        # First user → admin, active
        role = "admin"
        permission = "write"
        user_status = "active"
    else:
        role = "user"
        permission = "read"
        user_status = "pending"

    new_user = {
        "email": email,
        "password_hash": hash_password(body.password),
        "role": role,
        "permission": permission,
        "status": user_status,
        "created_at": datetime.now(timezone.utc),
        "approved_by": None,
        "approved_at": None,
    }

    await users_col.insert_one(new_user)

    if user_status == "pending":
        return {"message": "Account created. Your request has been sent for admin approval."}

    # First user → issue token immediately
    token = create_access_token({
        "email": email,
        "role": role,
        "permission": permission,
    })

    user_out = UserOut(
        email=email,
        role=role,
        permission=permission,
        status=user_status,
        created_at=new_user["created_at"],
    )

    return TokenResponse(access_token=token, user=user_out)


@router.get("/me", response_model=CurrentUser)
async def get_me(current_user: CurrentUser = Depends(get_current_user)):
    """Return the currently authenticated user's info."""
    return current_user
