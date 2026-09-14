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
- `Server` (`models/infra.py`): id, name, hostname, ip_address, vm_name, os, os_version,
  server_type, environment (Production|Staging|Development|DR|Internal), status
  (Active|Maintenance|Decommissioned), cpu, ram, storage, datacenter, cluster, virtualization,
  description, **application_ids[]**, **pic_ids[]**. `ServerOut` adds resolved `applications[]`
  and `pics[]` (RefSummary with initials) so the UI can link straight through.
- `Pic`: id, name, **initials** (manual, uppercase, 1–3 alphanumeric), employee_id, email, phone,
  department, position, status (Active|Inactive), application_ids[],
  standby_schedule[{date, application_id, notes}]. `PicOut` adds `applications[]`, `servers[]`, and
  `standby_schedule_out[]` (each row carries `application_name`).

## Application ↔ Server ↔ PIC relationships
- Application↔Server is **many-to-many** via `servers.application_ids`.
- Server↔PIC is stored **only** on `servers.pic_ids` (single source of truth). Editing a PIC's
  `server_ids` mirrors onto servers; deleting a PIC pulls its id from every server.
- PIC↔Application is stored on `pics.application_ids`.

## Servers & PIC API (all admin-only for writes)
- `GET /api/servers` (filters: `q`, `application_id`) · `GET /api/servers/{id}` ·
  POST/PUT/DELETE `/api/servers`. Registration requires only `name` — apps and PICs link later.
- `GET /api/pics` (filters: `q`, `application_id`) · `GET /api/pics/{id}` ·
  POST/PUT/DELETE `/api/pics`. Registration requires only `name` + `initials`.
- Visibility (`lib/visibility.py`): a normal user sees a **server** if it serves at least one app in
  their assigned categories, and a **PIC** if that PIC owns a visible app or a visible server.
  Unauthorized detail requests return **403**. Admins see everything.
- `POST /api/users/bulk-assign-category` — `{category_id, user_ids[], assign}` assigns/removes one
  category across many users in one request; administrators in the list are skipped.

## Category icons
`POST /api/categories/{id}/icon` (multipart, PNG/JPEG/WebP/SVG, ≤2 MB) → saves to
`backend/uploads/{id}.{ext}` and sets `icon_url`. `DELETE .../icon` removes it and falls back to the
lucide glyph. `CategoryIcon` renders uploaded images with `object-contain` (scaled proportionally,
never cropped/stretched); the upload dialog warns on non-square images and shows pixel dimensions.

## Frontend routes
- `/login` — sign in (demo accounts listed on the page).
- `/` — catalog: navbar (search, favorites, layout selector, theme, admin link, profile menu),
  hero search + dynamic category pills, toolbar (count, environment/status/sort), 5 layouts
  (grid, list, alphabetical + A–Z jump bar, category, compact). Layout/sort/favorites persist in
  localStorage (`catalog.layout`, `catalog.sort`, `catalog.favorites`).
- `/app/:id` — detail: purpose, badges, stats, Open Application (new tab + launch counter),
  favorite, admin-only Edit/Delete, related apps, plus an **Application Servers** section (clickable
  server chips) and a **Person in Charge** section (clickable `[JS] Jane Smith` badges).
  Shows an **Access denied** state on 403.
- Server/PIC details open as **deep-linkable side drawers** driven by `?server=<id>` / `?pic=<id>`
  (`lib/infraNav.tsx` → `InfraNavProvider` + `useInfraNav`). Navigation chains both ways:
  App → Server → Server PIC → PIC, and App → PIC → Assigned Server → Server.
- `/admin` (administrator only, guarded in `AdminLayout`): `index` Dashboard, `users`, `roles`,
  `categories`, `applications`, `servers`, `pics` (PIC Management), `access` (bulk assignment panel
  + user × category matrix).

## Seed data (`cd /app/backend && python seed.py`)
8 categories, 3 users, 36 applications, 14 servers, 6 PICs. Idempotent (clears
sessions/users/categories/apps/servers/pics first). `STG-TEST-01` is intentionally left with no
application and no PIC to exercise standalone registration. Credentials in
`memory/test_credentials.md`.

## Notes
- base-ui gotchas hit here: `Menu.Item` fires **onClick** (not `onSelect`), and
  `DropdownMenuLabel` (GroupLabel) requires `Menu.Group` context — use a plain div instead.
- Session cookies are bound to the origin: browser tests must use the preview URL, not localhost.
