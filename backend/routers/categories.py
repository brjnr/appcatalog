"""App category management (RBAC access units) with custom icon upload."""

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pymongo import ReturnDocument

from lib.auth import require_admin, require_user
from lib.db import db
from models.categories import AppCategory, CategoryCreate, CategoryUpdate

router = APIRouter()

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
ALLOWED_ICON_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}
MAX_ICON_BYTES = 2 * 1024 * 1024


def _unique_name_query(name: str, exclude_id: str | None = None) -> dict:
    query = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    return query


def _remove_icon_files(category_id: str) -> None:
    for old in UPLOADS_DIR.glob(f"{category_id}.*"):
        old.unlink(missing_ok=True)


@router.get("/categories", response_model=list[AppCategory])
async def list_categories(
    include_inactive: bool = False, user: dict = Depends(require_user)
):
    is_admin = user.get("role") == "administrator"
    query: dict = {} if (include_inactive and is_admin) else {"status": "active"}
    if not is_admin:
        # Normal users only ever see the categories assigned to them, so category
        # pills and filters never offer something the backend would refuse.
        query["id"] = {"$in": list(user.get("assigned_category_ids") or [])}
    docs = await db.categories.find(query).sort("name", 1).to_list(500)
    return [AppCategory(**d) for d in docs]


@router.post("/categories", response_model=AppCategory, status_code=201)
async def create_category(input: CategoryCreate, _: dict = Depends(require_admin)):
    name = input.name.strip()
    if await db.categories.find_one(_unique_name_query(name)):
        raise HTTPException(status_code=409, detail="a category with this name already exists")
    now = datetime.now(timezone.utc)
    doc = {
        **input.model_dump(),
        "name": name,
        "id": str(uuid.uuid4()),
        "icon_url": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.categories.insert_one(doc)
    return AppCategory(**doc)


@router.put("/categories/{category_id}", response_model=AppCategory)
async def update_category(category_id: str, input: CategoryUpdate, _: dict = Depends(require_admin)):
    target = await db.categories.find_one({"id": category_id})
    if not target:
        raise HTTPException(status_code=404, detail="category not found")
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if "name" in changes:
        changes["name"] = changes["name"].strip()
        if await db.categories.find_one(_unique_name_query(changes["name"], exclude_id=category_id)):
            raise HTTPException(status_code=409, detail="a category with this name already exists")
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.categories.find_one_and_update(
        {"id": category_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    return AppCategory(**doc)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str, _: dict = Depends(require_admin)):
    if not await db.categories.find_one({"id": category_id}):
        raise HTTPException(status_code=404, detail="category not found")
    used = await db.apps.count_documents({"category_id": category_id})
    if used:
        raise HTTPException(
            status_code=409,
            detail=f"{used} application(s) still use this category — move or delete them first",
        )
    await db.categories.delete_one({"id": category_id})
    _remove_icon_files(category_id)
    return None


@router.post("/categories/{category_id}/icon", response_model=AppCategory)
async def upload_icon(category_id: str, file: UploadFile, _: dict = Depends(require_admin)):
    if not await db.categories.find_one({"id": category_id}):
        raise HTTPException(status_code=404, detail="category not found")
    ext = ALLOWED_ICON_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(
            status_code=415, detail="unsupported image type — use PNG, JPEG, WebP, or SVG"
        )
    data = await file.read()
    if len(data) > MAX_ICON_BYTES:
        raise HTTPException(status_code=413, detail="icon image must be 2 MB or smaller")

    UPLOADS_DIR.mkdir(exist_ok=True)
    _remove_icon_files(category_id)
    (UPLOADS_DIR / f"{category_id}{ext}").write_bytes(data)

    doc = await db.categories.find_one_and_update(
        {"id": category_id},
        {"$set": {"icon_url": f"/api/uploads/{category_id}{ext}", "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    return AppCategory(**doc)


@router.delete("/categories/{category_id}/icon", response_model=AppCategory)
async def remove_icon(category_id: str, _: dict = Depends(require_admin)):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="category not found")
    _remove_icon_files(category_id)
    updated = await db.categories.find_one_and_update(
        {"id": category_id},
        {"$set": {"icon_url": None, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    return AppCategory(**updated)
