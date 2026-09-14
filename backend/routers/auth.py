"""Authentication endpoints — httpOnly cookie sessions under /api/auth/*."""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from lib.auth import (
    SESSION_COOKIE,
    create_session,
    load_user_from_request,
    verify_password,
)
from lib.db import db
from models.users import LoginRequest, UserOut

router = APIRouter()


class MeResponse(BaseModel):
    user: UserOut | None = None


async def _user_out(doc: dict) -> UserOut:
    department_id = doc.get("department_id", "") or ""
    department = (
        await db.departments.find_one({"id": department_id}, {"name": 1}) if department_id else None
    )
    return UserOut(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        role=doc.get("role", "normal_user"),
        assigned_category_ids=list(doc.get("assigned_category_ids") or []),
        department_id=department_id,
        department_name=department["name"] if department else "",
        is_active=bool(doc.get("is_active", True)),
    )


@router.post("/auth/login", response_model=UserOut)
async def login(input: LoginRequest, response: Response):
    user = await db.users.find_one({"email": input.email.lower()})
    if not user or not verify_password(input.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="this account has been deactivated")
    await create_session(response, user["id"])
    return await _user_out(user)


@router.get("/auth/me", response_model=UserOut | None)
async def me(request: Request):
    """Who am I — returns the session user, or null when logged out (200, so the
    frontend can redirect without treating it as an error)."""
    user = await load_user_from_request(request)
    return await _user_out(user) if user else None


@router.post("/auth/logout", status_code=204)
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.sessions.delete_one({"token": token})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return None
