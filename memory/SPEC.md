# Enterprise Application Catalog + RBAC — Living Spec

## What it is
A centralized portal where employees find and open enterprise applications, with
role-based access control: normal users see only the app categories assigned to them,
administrators manage everything.

## Stack
- Backend: FastAPI. `backend/server.py` mounts routers on `api_router` (/api) and serves uploaded
  category icons from `/api/uploads` (StaticFiles over `backend/uploads/`).
  Routers: `routers/auth.py`, `routers/users.py`, `routers/categories.py`, `routers/apps.py`.
  Models: `models/users.py`, `models/categories.py`, `models/catalog.py`. Auth helpers: `lib/auth.py`.
- Frontend: React 19 + Vite + Tailwind v4 + shadcn (base-nova/base-ui). Fonts: Space Grotesk
  (headings), DM Sans (body), JetBrains Mono. Light default + dark toggle (next-themes).
- Mongo collections: `users`, `sessions`, `categories`, `apps`.

## Auth model
- Login sets an **httpOnly cookie** (`catalog_session`, 7-day TTL) backed by the `sessions`
  collection (TTL index on `expires_at`). Passwords hashed with passlib pbkdf2_sha256.
- `GET /api/auth/me` returns the user or **null with 200** when logged out (so the SPA redirects
  instead of erroring). `POST /api/auth/logout` clears the cookie + session row.
- Frontend routes through `lib/session.ts`: `beginSession()` after login, `endSession()` on sign-out.

## Roles
- `administrator` — unrestricted. Full CRUD on users/categories/apps, sees all applications.
- `normal_user` — sees only apps whose `category_id` is in `assigned_category_ids`.

## Backend enforcement (not just hidden UI)
- `require_user` (401 when no valid session), `require_admin` (403 for non-admins).
- `GET /api/apps` injects `category_id: {$in: allowed}` for normal users.
- `GET /api/apps/{id}`, `POST /apps/{id}/launch`, `POST /apps/{id}/favorite` → **403** if the app's
  category is not assigned. Typing an app URL directly does not bypass this.
- All mutations on `/apps`, `/users`, `/categories` are admin-only.
- Deactivated users (`is_active: false`) have their sessions rejected on the next request.
- Guards: cannot remove/deactivate the last administrator; cannot delete your own account;
  cannot delete a category that still has applications (409).

## Data model
- `AppCategory`: id, name (unique), description, icon (lucide name), icon_url (uploaded image or
  null), status (active|inactive), created_at, updated_at.
- `CatalogApp`: id, name, description, **category_id** (+ `category_name` resolved on read),
  environment, status, url, icon, usage_count, favorite_count, created_at, updated_at.
- `UserOut`: id, name, email, role, assigned_category_ids[], is_active. Password hash never leaves
  the backend.

## Category icons
`POST /api/categories/{id}/icon` (multipart, PNG/JPEG/WebP/SVG, ≤2 MB) → saves to
`backend/uploads/{id}.{ext}` and sets `icon_url`. `DELETE .../icon` removes it and falls back to the
lucide glyph. `CategoryIcon` component renders the uploaded image everywhere a category appears.

## Frontend routes
- `/login` — sign in (demo accounts listed on the page).
- `/` — catalog: navbar (search, favorites, layout selector, theme, admin link, profile menu),
  hero search + dynamic category pills, toolbar (count, environment/status/sort), 5 layouts
  (grid, list, alphabetical + A–Z jump bar, category, compact). Layout/sort/favorites persist in
  localStorage (`catalog.layout`, `catalog.sort`, `catalog.favorites`).
- `/app/:id` — detail: purpose, badges, stats, Open Application (new tab + launch counter),
  favorite, admin-only Edit/Delete, related apps. Shows an **Access denied** state on 403.
- `/admin` (administrator only, guarded in `AdminLayout`): `index` Dashboard, `users`, `roles`,
  `categories`, `applications`, `access` (user × category matrix).

## Seed data (`cd /app/backend && python seed.py`)
8 categories, 3 users, 36 applications. Idempotent (clears sessions/users/categories/apps first).
Credentials in `memory/test_credentials.md`.

## Notes
- base-ui gotchas hit here: `Menu.Item` fires **onClick** (not `onSelect`), and
  `DropdownMenuLabel` (GroupLabel) requires `Menu.Group` context — use a plain div instead.
- Session cookies are bound to the origin: browser tests must use the preview URL, not localhost.
