"""Auth primitives: password hashing, httpOnly cookie sessions, FastAPI dependencies."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from passlib.context import CryptContext

from lib.db import db

pwd_context = CryptContext(schemes=["pbkdf2_sha256"])
SESSION_COOKIE = "catalog_session"
SESSION_TTL = timedelta(days=7)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


async def create_session(response: Response, user_id: str) -> None:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await db.sessions.insert_one(
        {
            "token": token,
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + SESSION_TTL,
        }
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=int(SESSION_TTL.total_seconds()),
        path="/",
    )


async def load_user_from_request(request: Request) -> dict | None:
    """Resolve the session cookie to an active user, or None."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    session = await db.sessions.find_one({"token": token})
    if not session:
        return None
    expires = session.get("expires_at")
    if isinstance(expires, datetime):
        if expires.tzinfo is None:  # motor returns naive datetimes
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            await db.sessions.delete_one({"token": token})
            return None
    user = await db.users.find_one({"id": session["user_id"]})
    if not user or not user.get("is_active", True):
        return None
    return user


async def require_user(request: Request) -> dict:
    user = await load_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


async def require_admin(user: dict = Depends(require_user)) -> dict:
    if user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="administrator access required")
    return user


def allowed_category_ids(user: dict) -> list[str] | None:
    """None = unrestricted (administrator); otherwise the user's assigned category ids."""
    if user.get("role") == "administrator":
        return None
    return list(user.get("assigned_category_ids") or [])
