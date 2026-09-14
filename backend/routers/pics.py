"""PIC (person in charge) endpoints — scoped reads, admin-only mutations."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument

from lib.auth import require_admin, require_user
from lib.dates import today_iso
from lib.db import db
from lib.visibility import app_name_map, pic_is_visible, visible_app_ids
from models.infra import (
    Pic,
    PicCreate,
    PicOut,
    PicUpdate,
    RefSummary,
    StandbyEntryOut,
)

router = APIRouter()


async def _to_out(doc: dict) -> PicOut:
    app_ids = list(doc.get("application_ids") or [])
    schedule = list(doc.get("standby_schedule") or [])
    # Resolve names for both assignments and standby rows in one lookup.
    names = await app_name_map({*app_ids, *[s.get("application_id", "") for s in schedule]})

    # Server links live on servers.pic_ids — single source of truth.
    server_docs = await db.servers.find({"pic_ids": doc["id"]}, {"id": 1, "name": 1}).to_list(500)

    base = Pic(**doc)
    return PicOut(
        **base.model_dump(),
        applications=[
            RefSummary(id=app_id, name=names[app_id])
            for app_id in sorted(app_ids, key=lambda i: names.get(i, "").lower())
            if app_id in names
        ],
        servers=[
            RefSummary(id=s["id"], name=s["name"])
            for s in sorted(server_docs, key=lambda s: s["name"].lower())
        ],
        standby_schedule_out=[
            StandbyEntryOut(
                date=entry["date"],
                application_id=entry.get("application_id", ""),
                notes=entry.get("notes", ""),
                application_name=names.get(entry.get("application_id", ""), "—"),
            )
            for entry in sorted(schedule, key=lambda e: e.get("date", ""))
        ],
    )


async def _validate_apps(app_ids: list[str] | None) -> None:
    if app_ids:
        found = await db.apps.count_documents({"id": {"$in": list(set(app_ids))}})
        if found != len(set(app_ids)):
            raise HTTPException(status_code=422, detail="one or more applications do not exist")


async def _sync_server_links(pic_id: str, server_ids: list[str]) -> None:
    """Server↔PIC is stored on the server; mirror the admin's PIC-side edit onto servers."""
    if server_ids:
        found = await db.servers.count_documents({"id": {"$in": list(set(server_ids))}})
        if found != len(set(server_ids)):
            raise HTTPException(status_code=422, detail="one or more servers do not exist")
    await db.servers.update_many({"pic_ids": pic_id}, {"$pull": {"pic_ids": pic_id}})
    if server_ids:
        await db.servers.update_many(
            {"id": {"$in": list(set(server_ids))}}, {"$addToSet": {"pic_ids": pic_id}}
        )


class StandbyCalendarEntry(BaseModel):
    """One standby shift flattened across all PICs, for the calendar view."""

    date: str
    pic_id: str
    pic_name: str
    pic_initials: str
    application_id: str
    application_name: str
    notes: str = ""


class StandbyCalendar(BaseModel):
    month: str  # YYYY-MM
    entries: list[StandbyCalendarEntry]


@router.get("/standby", response_model=StandbyCalendar)
async def standby_calendar(month: str | None = None, user: dict = Depends(require_user)):
    """On-call roster for a month (defaults to the current month, server-anchored).
    Scoped: a normal user only sees shifts for applications assigned to them."""
    target = month or today_iso()[:7]
    if len(target) != 7 or target[4] != "-":
        raise HTTPException(status_code=422, detail="month must be formatted YYYY-MM")

    allowed = await visible_app_ids(user)
    docs = await db.pics.find().sort("name", 1).to_list(1000)
    app_names = await app_name_map(
        {e.get("application_id", "") for d in docs for e in (d.get("standby_schedule") or [])}
    )

    entries: list[StandbyCalendarEntry] = []
    for pic in docs:
        for entry in pic.get("standby_schedule") or []:
            date = entry.get("date", "")
            app_id = entry.get("application_id", "")
            if not date.startswith(target):
                continue
            if allowed is not None and app_id not in allowed:
                continue
            entries.append(
                StandbyCalendarEntry(
                    date=date,
                    pic_id=pic["id"],
                    pic_name=pic["name"],
                    pic_initials=pic.get("initials", ""),
                    application_id=app_id,
                    application_name=app_names.get(app_id, "—"),
                    notes=entry.get("notes", ""),
                )
            )

    entries.sort(key=lambda e: (e.date, e.pic_name))
    return StandbyCalendar(month=target, entries=entries)


@router.get("/pics", response_model=list[PicOut])
async def list_pics(
    q: str | None = None,
    application_id: str | None = None,
    user: dict = Depends(require_user),
):
    query: dict = {}
    if application_id:
        query["application_ids"] = application_id
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"name": rx}, {"initials": rx}, {"email": rx}, {"employee_id": rx}]

    allowed = await visible_app_ids(user)
    docs = await db.pics.find(query).sort("name", 1).to_list(1000)
    out = []
    for doc in docs:
        if await pic_is_visible(doc, allowed):
            out.append(await _to_out(doc))
    return out


@router.get("/pics/{pic_id}", response_model=PicOut)
async def get_pic(pic_id: str, user: dict = Depends(require_user)):
    doc = await db.pics.find_one({"id": pic_id})
    if not doc:
        raise HTTPException(status_code=404, detail="PIC not found")
    allowed = await visible_app_ids(user)
    if not await pic_is_visible(doc, allowed):
        raise HTTPException(
            status_code=403,
            detail="access denied: this PIC is not linked to any application assigned to you",
        )
    return await _to_out(doc)


@router.post("/pics", response_model=PicOut, status_code=201)
async def create_pic(input: PicCreate, _: dict = Depends(require_admin)):
    await _validate_apps(input.application_ids)
    payload = input.model_dump()
    server_ids = payload.pop("server_ids", [])
    pic = Pic(**payload)
    await db.pics.insert_one(pic.model_dump())
    await _sync_server_links(pic.id, server_ids)
    return await _to_out(pic.model_dump())


@router.put("/pics/{pic_id}", response_model=PicOut)
async def update_pic(pic_id: str, input: PicUpdate, _: dict = Depends(require_admin)):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if not await db.pics.find_one({"id": pic_id}):
        raise HTTPException(status_code=404, detail="PIC not found")

    server_ids = changes.pop("server_ids", None)
    await _validate_apps(changes.get("application_ids"))
    if server_ids is not None:
        await _sync_server_links(pic_id, server_ids)

    if changes:
        changes["updated_at"] = datetime.now(timezone.utc)
        doc = await db.pics.find_one_and_update(
            {"id": pic_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
        )
    else:
        doc = await db.pics.find_one({"id": pic_id})
    return await _to_out(doc)


@router.delete("/pics/{pic_id}", status_code=204)
async def delete_pic(pic_id: str, _: dict = Depends(require_admin)):
    result = await db.pics.delete_one({"id": pic_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="PIC not found")
    await db.servers.update_many({"pic_ids": pic_id}, {"$pull": {"pic_ids": pic_id}})
    return None
