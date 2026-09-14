"""Notes / memo endpoints.

Every logged-in user sees all notes; only the author or an administrator may edit or
delete one. Notes are temporary: past `expires_at` they move to Trash automatically and
are purged after TRASH_RETENTION_DAYS.
"""

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require_user
from lib.dates import today_iso
from lib.db import db
from models.notes import (
    DEFAULT_VALID_DAYS,
    TRASH_RETENTION_DAYS,
    Note,
    NoteCreate,
    NoteLinkOut,
    NoteOut,
    NoteUpdate,
)

router = APIRouter()

_COLLECTIONS = {"application": "apps", "server": "servers", "pic": "pics"}


def _date_add(iso: str, days: int) -> str:
    return (datetime.strptime(iso, "%Y-%m-%d") + timedelta(days=days)).strftime("%Y-%m-%d")


def _days_between(start: str, end: str) -> int:
    return (datetime.strptime(end, "%Y-%m-%d") - datetime.strptime(start, "%Y-%m-%d")).days


async def _sweep() -> None:
    """Expire due notes into Trash, then purge Trash older than the retention window."""
    today = today_iso()
    now = datetime.now(timezone.utc)
    await db.notes.update_many(
        {"status": "active", "expires_at": {"$lt": today}},
        {"$set": {"status": "trashed", "trashed_at": now, "updated_at": now}},
    )
    await db.notes.delete_many(
        {"status": "trashed", "trashed_at": {"$lt": now - timedelta(days=TRASH_RETENTION_DAYS)}}
    )


async def _resolve_links(docs: list[dict]) -> dict[tuple[str, str], str]:
    """Resolve display names for every linked application / server / PIC in one pass."""
    wanted: dict[str, set[str]] = {"application": set(), "server": set(), "pic": set()}
    for doc in docs:
        for link in doc.get("links") or []:
            kind = link.get("kind")
            if kind in wanted:
                wanted[kind].add(link.get("id", ""))

    names: dict[tuple[str, str], str] = {}
    for kind, ids in wanted.items():
        if not ids:
            continue
        rows = await db[_COLLECTIONS[kind]].find(
            {"id": {"$in": list(ids)}}, {"id": 1, "name": 1}
        ).to_list(2000)
        for row in rows:
            names[(kind, row["id"])] = row["name"]
    return names


def _to_out(doc: dict, user: dict, names: dict[tuple[str, str], str]) -> NoteOut:
    today = today_iso()
    base = Note(**doc)
    trashed_at = base.trashed_at
    return NoteOut(
        **base.model_dump(),
        links_out=[
            NoteLinkOut(
                kind=link.kind, id=link.id, name=names.get((link.kind, link.id), "(removed)")
            )
            for link in base.links
        ],
        days_left=_days_between(today, base.expires_at),
        purge_on=(
            (trashed_at + timedelta(days=TRASH_RETENTION_DAYS)).strftime("%Y-%m-%d")
            if trashed_at
            else None
        ),
        can_edit=user["role"] == "administrator" or base.author_id == user["id"],
    )


async def _validate_links(links: list) -> None:
    for link in links or []:
        kind = link.kind if hasattr(link, "kind") else link["kind"]
        link_id = link.id if hasattr(link, "id") else link["id"]
        if not await db[_COLLECTIONS[kind]].find_one({"id": link_id}, {"id": 1}):
            raise HTTPException(status_code=422, detail=f"linked {kind} does not exist")


async def _load_editable(note_id: str, user: dict) -> dict:
    doc = await db.notes.find_one({"id": note_id})
    if not doc:
        raise HTTPException(status_code=404, detail="note not found")
    if user["role"] != "administrator" and doc["author_id"] != user["id"]:
        raise HTTPException(
            status_code=403, detail="only the author or an administrator can change this note"
        )
    return doc


@router.get("/notes", response_model=list[NoteOut])
async def list_notes(
    view: str = "active",
    q: str | None = None,
    user: dict = Depends(require_user),
):
    if view not in {"active", "trash"}:
        raise HTTPException(status_code=422, detail="view must be 'active' or 'trash'")
    await _sweep()

    query: dict = {"status": "trashed" if view == "trash" else "active"}
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"title": rx}, {"body": rx}, {"author_name": rx}]

    docs = await db.notes.find(query).sort("note_date", -1).to_list(1000)
    names = await _resolve_links(docs)
    return [_to_out(doc, user, names) for doc in docs]


@router.post("/notes", response_model=NoteOut, status_code=201)
async def create_note(input: NoteCreate, user: dict = Depends(require_user)):
    await _validate_links(input.links)
    today = today_iso()
    note_date = input.note_date or today
    expires_at = input.expires_at or _date_add(note_date, DEFAULT_VALID_DAYS)
    if _days_between(note_date, expires_at) < 0:
        raise HTTPException(status_code=422, detail="expiry date cannot precede the note date")

    note = Note(
        title=input.title.strip(),
        body=input.body,
        author_id=user["id"],
        author_name=user["name"],
        note_date=note_date,
        expires_at=expires_at,
        links=input.links,
    )
    await db.notes.insert_one(note.model_dump())
    names = await _resolve_links([note.model_dump()])
    return _to_out(note.model_dump(), user, names)


@router.put("/notes/{note_id}", response_model=NoteOut)
async def update_note(note_id: str, input: NoteUpdate, user: dict = Depends(require_user)):
    doc = await _load_editable(note_id, user)
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if input.links is not None:
        await _validate_links(input.links)

    note_date = changes.get("note_date") or doc["note_date"]
    expires_at = changes.get("expires_at") or doc["expires_at"]
    if _days_between(note_date, expires_at) < 0:
        raise HTTPException(status_code=422, detail="expiry date cannot precede the note date")

    changes["updated_at"] = datetime.now(timezone.utc)
    doc.update(changes)
    await db.notes.update_one({"id": note_id}, {"$set": changes})
    names = await _resolve_links([doc])
    return _to_out(doc, user, names)


@router.post("/notes/{note_id}/restore", response_model=NoteOut)
async def restore_note(note_id: str, user: dict = Depends(require_user)):
    """Pull a note back out of Trash; a lapsed retention date is pushed forward."""
    doc = await _load_editable(note_id, user)
    today = today_iso()
    expires_at = doc["expires_at"]
    if _days_between(today, expires_at) < 0:
        expires_at = _date_add(today, DEFAULT_VALID_DAYS)
    changes = {
        "status": "active",
        "trashed_at": None,
        "expires_at": expires_at,
        "updated_at": datetime.now(timezone.utc),
    }
    doc.update(changes)
    await db.notes.update_one({"id": note_id}, {"$set": changes})
    names = await _resolve_links([doc])
    return _to_out(doc, user, names)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, permanent: bool = False, user: dict = Depends(require_user)):
    """Soft-delete into Trash; `permanent=true` (or deleting from Trash) removes it for good."""
    doc = await _load_editable(note_id, user)
    if permanent or doc["status"] == "trashed":
        await db.notes.delete_one({"id": note_id})
    else:
        now = datetime.now(timezone.utc)
        await db.notes.update_one(
            {"id": note_id},
            {"$set": {"status": "trashed", "trashed_at": now, "updated_at": now}},
        )
    return None
