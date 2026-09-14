"""Criterion: Admin can create a user with role + category assignments, and scoping applies."""
import uuid
import httpx
import os
API_URL = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"


def login(email, password):
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


def test_admin_creates_scoped_user():
    admin = login("admin@corp.com", "admin123")
    cats = admin.get("/categories").json()
    citems = cats if isinstance(cats, list) else cats.get("items", [])
    finance = next(c for c in citems if c.get("name") == "Finance")

    suffix = uuid.uuid4().hex[:8]
    email = f"tscheck-qa-{suffix}@corp.com"
    payload = {
        "name": f"tscheck-QA-{suffix}",
        "email": email,
        "password": "qa123456",
        "role": "normal_user",
        "assigned_category_ids": [finance["id"]],
    }
    r = admin.post("/users", json=payload)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created.get("role") == "normal_user"
    assert finance["id"] in created.get("assigned_category_ids", [])
    admin.close()

    qa = login(email, "qa123456")
    apps = qa.get("/apps")
    assert apps.status_code == 200
    items = apps.json()
    items = items if isinstance(items, list) else items.get("items", [])
    assert len(items) == 4, f"expected 4 Finance apps for new user, got {len(items)}"
    names = {a.get("category_name") for a in items}
    assert names == {"Finance"}, f"unexpected categories leaked: {names}"
    qa.close()
