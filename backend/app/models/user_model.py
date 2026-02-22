"""
Pydantic models for User (request / response shapes).
The actual MongoDB document schema lives as plain dicts
in the users collection — this file is for API contracts only.
"""
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Literal
from datetime import datetime


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class ApproveUserRequest(BaseModel):
    email: EmailStr
    role: Literal["user", "admin"]
    permission: Literal["read", "write"]

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class RejectUserRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


# ---------------------------------------------------------------------------
# Response bodies
# ---------------------------------------------------------------------------

class UserOut(BaseModel):
    email: str
    role: str
    permission: str
    status: str
    created_at: datetime
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CurrentUser(BaseModel):
    email: str
    role: str
    permission: str
