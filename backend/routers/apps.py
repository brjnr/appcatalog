"""CRUD + launch/favorite endpoints for the application catalog."""

import re
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException
from pymongo import ReturnDocument

from lib.db import db
from models.catalog import AppCreate, AppUpdate, CatalogApp, FavoriteUpdate, SortId

router = APIRouter()


def _build_query(
    q: str | None, category: str | None, environment: str | None, status: str | None
) -> dict:
    query: dict = {}
    if category and category != "All":
        query["category"] = category
    if environment and environment != "All":
        query["environment"] = environment
    if status and status != "All":
        query["status"] = status
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [
            {"name": rx},
            {"description": rx},
            {"category": rx},
            {"environment": rx},
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


@router.get("/apps", response_model=List[CatalogApp])
async def list_apps(
    q: str | None = None,
    category: str | None = None,
    environment: str | None = None,
    status: str | None = None,
    sort: SortId = "name_asc",
):
    docs = await db.apps.find(_build_query(q, category, environment, status)).to_list(5000)
    return _sort_apps([CatalogApp(**doc) for doc in docs], sort)


@router.get("/apps/{app_id}", response_model=CatalogApp)
async def get_app(app_id: str):
    doc = await db.apps.find_one({"id": app_id})
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    return CatalogApp(**doc)


@router.post("/apps", response_model=CatalogApp, status_code=201)
async def create_app(input: AppCreate):
    app_obj = CatalogApp(**input.model_dump())
    await db.apps.insert_one(app_obj.model_dump())
    return app_obj


@router.put("/apps/{app_id}", response_model=CatalogApp)
async def update_app(app_id: str, input: AppUpdate):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.apps.find_one_and_update(
        {"id": app_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    return CatalogApp(**doc)


@router.delete("/apps/{app_id}", status_code=204)
async def delete_app(app_id: str):
    result = await db.apps.delete_one({"id": app_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="application not found")
    return None


@router.post("/apps/{app_id}/launch", response_model=CatalogApp)
async def launch_app(app_id: str):
    doc = await db.apps.find_one_and_update(
        {"id": app_id}, {"$inc": {"usage_count": 1}}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    return CatalogApp(**doc)


@router.post("/apps/{app_id}/favorite", response_model=CatalogApp)
async def toggle_favorite(app_id: str, input: FavoriteUpdate):
    doc = await db.apps.find_one({"id": app_id})
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    new_count = max(0, int(doc.get("favorite_count", 0)) + (1 if input.favorite else -1))
    updated = await db.apps.find_one_and_update(
        {"id": app_id},
        {"$set": {"favorite_count": new_count}},
        return_document=ReturnDocument.AFTER,
    )
    return CatalogApp(**updated)
