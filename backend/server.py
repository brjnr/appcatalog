from datetime import datetime, timedelta, timezone
from pathlib import Path
import logging
import os
import secrets
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field, field_validator

from lib.auth import (
    SESSION_COOKIE,
    create_session,
    delete_session,
    get_current_user,
    get_session_cookie_options,
    require_admin,
    session_digest,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(message)s")
logger = logging.getLogger("appcatalog.security")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="AppCatalog API", docs_url=None, redoc_url=None)
app.state.db = db

cors_origins = [item.strip() for item in os.environ.get("CORS_ORIGINS", "").split(",") if item.strip() and item.strip() != "*"]
trusted_hosts = [item.strip() for item in os.environ.get("TRUSTED_HOSTS", "localhost,127.0.0.1").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or "\n" in value or "\r" in value:
            raise ValueError("Invalid credentials")
        return value


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    client_name: str
    timestamp: datetime


class StatusCheckCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_name: str = Field(min_length=1, max_length=120)


async def ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index("token_digest", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("expires_at", expireAfterSeconds=0)
    await db.status_checks.create_index("timestamp")


@app.on_event("startup")
async def startup() -> None:
    await ensure_indexes()


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 1_048_576:
            return Response("Request too large", status_code=413)
        if request.url.path != "/api/auth/login":
            origin = request.headers.get("origin")
            if origin and origin not in cors_origins:
                return Response("Forbidden", status_code=403)
            if request.cookies.get(SESSION_COOKIE):
                csrf = request.headers.get("X-CSRF-Token")
                csrf_cookie = request.cookies.get("csrf_token")
                if not csrf or not csrf_cookie or not secrets.compare_digest(csrf, csrf_cookie):
                    return Response("CSRF validation failed", status_code=403)
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("unhandled_request path=%s", request.url.path)
        return Response("Internal server error", status_code=500)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "no-cache"
    return response


async def enforce_login_limits(request: Request, email: str) -> None:
    now = datetime.now(timezone.utc)
    identifiers = [f"ip:{request.client.host if request.client else 'unknown'}", f"account:{email}"]
    blocked = await db.login_attempts.find_one({"identifier": {"$in": identifiers}, "blocked_until": {"$gt": now}})
    if blocked:
        raise HTTPException(status_code=429, detail="Unable to authenticate at this time")


async def record_login_failure(request: Request, email: str) -> None:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=15)
    for identifier in (f"ip:{request.client.host if request.client else 'unknown'}", f"account:{email}"):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"failures": 1}, "$set": {"expires_at": expires, "last_attempt": now}, "$setOnInsert": {"identifier": identifier}},
            upsert=True,
        )
        await db.login_attempts.update_one({"identifier": identifier, "failures": {"$gte": 5}}, {"$set": {"blocked_until": expires}})


@app.get("/api/", include_in_schema=False)
async def root():
    return {"message": "AppCatalog API"}


@app.post("/api/auth/login")
async def login(payload: LoginInput, request: Request, response: Response):
    await enforce_login_limits(request, payload.email)
    user = await db.users.find_one({"email": payload.email, "active": True}, {"_id": 0})
    try:
        valid = bool(user and bcrypt.checkpw(payload.password.encode(), user.get("password_hash", "").encode()))
    except (ValueError, TypeError):
        valid = False
    if not valid:
        await record_login_failure(request, payload.email)
        raise HTTPException(status_code=401, detail="Unable to authenticate")
    await db.login_attempts.delete_many({"identifier": {"$in": [f"ip:{request.client.host if request.client else 'unknown'}", f"account:{payload.email}"]}})
    raw_token = await create_session(db, user["id"], user["email"], user.get("role", "user"))
    csrf = secrets.token_urlsafe(32)
    options = get_session_cookie_options(request)
    response.set_cookie(SESSION_COOKIE, raw_token, **options)
    response.set_cookie("csrf_token", csrf, httponly=False, **options)
    return {"id": user["id"], "email": user["email"], "role": user.get("role", "user")}


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token:
        await delete_session(db, raw_token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@app.post("/api/status", response_model=StatusCheck)
async def create_status_check(payload: StatusCheckCreate, user: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    doc = {"id": secrets.token_urlsafe(16), "client_name": payload.client_name, "timestamp": now}
    await db.status_checks.insert_one(doc)
    return doc


@app.get("/api/status", response_model=list[StatusCheck])
async def get_status_checks(user: dict = Depends(require_admin)):
    return await db.status_checks.find({}, {"_id": 0}).sort("timestamp", -1).to_list(100)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()