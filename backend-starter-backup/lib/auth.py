from datetime import datetime, timedelta, timezone
import hashlib
import os
import secrets
from typing import Optional

from fastapi import Depends, HTTPException, Request

SESSION_COOKIE = "appcatalog_session"
SESSION_TTL = timedelta(hours=8)


def session_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_session(db, user_id: str, email: str, role: str) -> str:
    raw_token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    await db.sessions.insert_one({
        "token_digest": session_digest(raw_token),
        "user_id": user_id,
        "email": email,
        "role": role,
        "created_at": now,
        "expires_at": now + SESSION_TTL,
    })
    return raw_token


async def get_current_user(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        authorization = request.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    record = await request.app.state.db.sessions.find_one({"token_digest": session_digest(token), "expires_at": {"$gt": datetime.now(timezone.utc)}}, {"_id": 0})
    if not record or not await request.app.state.db.users.find_one({"id": record["user_id"], "active": True}, {"_id": 0}):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"id": record["user_id"], "email": record["email"], "role": record["role"]}


async def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def get_session_cookie_options(request: Request) -> dict:
    secure = os.environ.get("COOKIE_SECURE", "").lower() == "true" or request.url.scheme == "https"
    return {"httponly": True, "secure": secure, "samesite": "lax", "max_age": int(SESSION_TTL.total_seconds()), "path": "/"}


async def delete_session(db, raw_token: str) -> None:
    await db.sessions.delete_one({"token_digest": session_digest(raw_token)})