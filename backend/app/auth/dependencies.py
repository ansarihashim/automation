"""
FastAPI dependencies for auth protection.

Usage in routes:
    from app.auth.dependencies import require_read_access, require_write_access, require_admin

    @router.get("/something")
    async def endpoint(current_user = Depends(require_read_access)):
        ...
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from app.auth.auth_utils import decode_access_token
from app.models.user_model import CurrentUser

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """
    Decode JWT and return CurrentUser.
    Raises 401 if token missing / invalid / expired.
    """
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = payload.get("email")
    role = payload.get("role")
    permission = payload.get("permission")

    if not email or not role or not permission:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload",
        )

    return CurrentUser(email=email, role=role, permission=permission)


async def require_read_access(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Any active user (read or write) can access."""
    return current_user


async def require_write_access(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Only users with write permission."""
    if current_user.permission not in ("write",):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write permission required",
        )
    return current_user


async def require_admin(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Admin-only access."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
