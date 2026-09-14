"""Application catalog endpoints — RBAC-scoped reads, admin-only mutations."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.auth import allowed_category_ids, require_admin, require_user
from lib.db import db
from models.catalog import AppCreate, AppUpdate, CatalogApp, FavoriteUpdate, SortId

router = APIRouter()


def _build_query(
    q: str | None, category_id: str | None, environment: str | None, status: str | None
) -> dict:
    query: dict = {}
    if category_id and category_id != "All":
        query["category_id"] = category_id
    if environment and environment != "All":
        query["environment"] = environment
    if status and status != "All":
        query["status"] = status
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [
            {"name": rx},
            {"description": rx},
        ]
    return query


def _sort_apps(apps: list[CatalogApp], sort: str) -> list[CatalogApp]:
    if sort == "name_asc":
        return sorted(apps, key=lambda a: a.name.lower())
    if sort == "name_desc":
        return sorted(apps, key=lambda a: a.name.lower(), reverse=True)
    if sort == "most_used":
        return sorted(apps, key=lambda a: (a.usage_count, a.name.lower()), reverse=True)
    if sort == "most_favorite":
        return sorted(apps, key=lambda a: (a.favorite_count, a.name.lower()), reverse=True)
    if sort == "recently_added":
        return sorted(apps, key=lambda a: (a.created_at, a.name.lower()), reverse=True)
    if sort == "recently_updated":
        return sorted(apps, key=lambda a: (a.updated_at, a.name.lower()), reverse=True)
    return apps


async def _resolve_names(docs: list[dict]) -> list[CatalogApp]:
    """Attach resolved category_name to each app doc and build the response models."""
    ids = {d.get("category_id") for d in docs if d.get("category_id")}
    names: dict[str, str] = {}
    if ids:
        cats = await db.categories.find({"id": {"$in": list(ids)}}).to_list(500)
        names = {c["id"]: c["name"] for c in cats}
    out = []
    for d in docs:
        d = dict(d)
        d["category_name"] = names.get(d.get("category_id", ""), "Uncategorized")
        out.append(CatalogApp(**d))
    return out


def _scope_query(user: dict, base: dict) -> dict:
    """Enforce category visibility for normal users; admins see everything."""
    allowed = allowed_category_ids(user)
    if allowed is None:
        return base
    scoped = dict(base)
    scoped["category_id"] = {"$in": allowed}
    return scoped


async def _accessible_app(app_id: str, user: dict) -> dict:
    doc = await db.apps.find_one({"id": app_id})
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    allowed = allowed_category_ids(user)
    if allowed is not None and doc.get("category_id") not in allowed:
        raise HTTPException(
            status_code=403,
            detail="access denied: this application's category is not assigned to you",
        )
    return doc


async def _assert_category_exists(category_id: str) -> None:
    if not await db.categories.find_one({"id": category_id}):
        raise HTTPException(status_code=422, detail="unknown category")


@router.get("/apps", response_model=list[CatalogApp])
async def list_apps(
    q: str | None = None,
    category_id: str | None = None,
    environment: str | None = None,
    status: str | None = None,
    sort: SortId = "name_asc",
    user: dict = Depends(require_user),
):
    docs = await db.apps.find(_scope_query(user, _build_query(q, category_id, environment, status))).to_list(5000)
    return _sort_apps(await _resolve_names(docs), sort)


@router.get("/apps/{app_id}", response_model=CatalogApp)
async def get_app(app_id: str, user: dict = Depends(require_user)):
    doc = await _accessible_app(app_id, user)
    return (await _resolve_names([doc]))[0]


@router.post("/apps", response_model=CatalogApp, status_code=201)
async def create_app(input: AppCreate, _: dict = Depends(require_admin)):
    await _assert_category_exists(input.category_id)
    app_obj = CatalogApp(**input.model_dump())
    await db.apps.insert_one(app_obj.model_dump())
    return app_obj


@router.put("/apps/{app_id}", response_model=CatalogApp)
async def update_app(app_id: str, input: AppUpdate, _: dict = Depends(require_admin)):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if "category_id" in changes:
        await _assert_category_exists(changes["category_id"])
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.apps.find_one_and_update(
        {"id": app_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    return (await _resolve_names([doc]))[0]


@router.delete("/apps/{app_id}", status_code=204)
async def delete_app(app_id: str, _: dict = Depends(require_admin)):
    result = await db.apps.delete_one({"id": app_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="application not found")
    return None


@router.post("/apps/{app_id}/launch", response_model=CatalogApp)
async def launch_app(app_id: str, user: dict = Depends(require_user)):
    await _accessible_app(app_id, user)  # backend-enforced: no launching what you can't see
    doc = await db.apps.find_one_and_update(
        {"id": app_id}, {"$inc": {"usage_count": 1}}, return_document=ReturnDocument.AFTER
    )
    return (await _resolve_names([doc]))[0]


@router.post("/apps/{app_id}/favorite", response_model=CatalogApp)
async def toggle_favorite(app_id: str, input: FavoriteUpdate, user: dict = Depends(require_user)):
    doc = await _accessible_app(app_id, user)
    new_count = max(0, int(doc.get("favorite_count", 0)) + (1 if input.favorite else -1))
    updated = await db.apps.find_one_and_update(
        {"id": app_id},
        {"$set": {"favorite_count": new_count}},
        return_document=ReturnDocument.AFTER,
    )
    return (await _resolve_names([updated]))[0]
