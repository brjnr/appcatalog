"""User management + role/category assignment — administrator only."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.auth import hash_password, require_admin
from lib.db import db
from models.users import UserCreate, UserOut, UserUpdate

router = APIRouter()


def _out(doc: dict) -> UserOut:
    return UserOut(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        role=doc.get("role", "normal_user"),
        assigned_category_ids=list(doc.get("assigned_category_ids") or []),
        is_active=bool(doc.get("is_active", True)),
    )


async def _validate_category_ids(ids: list[str]) -> None:
    if not ids:
        return
    found = await db.categories.count_documents({"id": {"$in": list(set(ids))}})
    if found != len(set(ids)):
        raise HTTPException(status_code=422, detail="one or more assigned categories do not exist")


async def _guard_last_admin(target: dict, changes: dict) -> None:
    losing_admin = target.get("role") == "administrator" and (
        changes.get("role") == "normal_user" or changes.get("is_active") is False
    )
    if not losing_admin:
        return
    admins = await db.users.count_documents({"role": "administrator", "is_active": True})
    if admins <= 1:
        raise HTTPException(
            status_code=400, detail="cannot remove or deactivate the last administrator"
        )


@router.get("/users", response_model=list[UserOut])
async def list_users(_: dict = Depends(require_admin)):
    docs = await db.users.find().sort("name", 1).to_list(1000)
    return [_out(d) for d in docs]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(input: UserCreate, _: dict = Depends(require_admin)):
    email = input.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="a user with this email already exists")
    await _validate_category_ids(input.assigned_category_ids)
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "name": input.name.strip(),
        "email": email,
        "role": input.role,
        "assigned_category_ids": input.assigned_category_ids,
        "is_active": input.is_active,
        "password_hash": hash_password(input.password),
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(doc)
    return _out(doc)


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, input: UserUpdate, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="user not found")

    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")

    if "email" in changes:
        changes["email"] = changes["email"].lower()
        clash = await db.users.find_one({"email": changes["email"], "id": {"$ne": user_id}})
        if clash:
            raise HTTPException(status_code=409, detail="a user with this email already exists")
    if "password" in changes:
        changes["password_hash"] = hash_password(changes.pop("password"))
    if "assigned_category_ids" in changes:
        await _validate_category_ids(changes["assigned_category_ids"])
    if "name" in changes:
        changes["name"] = changes["name"].strip()

    await _guard_last_admin(target, changes)
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    return _out(doc)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="user not found")
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="you cannot delete your own account")
    await _guard_last_admin(target, {"role": "normal_user"})
    await db.users.delete_one({"id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    return None
