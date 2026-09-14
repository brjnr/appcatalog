# Enterprise Application Catalog — Living Spec

## What it is
A centralized web portal where employees find and open every enterprise application:
search → filter → sort → choose view → open. No login required.

## Stack
- Backend: FastAPI (`backend/server.py`, `backend/routers/apps.py`, `backend/models/catalog.py`), MongoDB collection `apps` (motor, string uuid4 ids). Seed: `cd /app/backend && python seed.py` (resets + reseeds 36 apps, idempotent).
- Frontend: React 19 + Vite + Tailwind v4 + shadcn (base-nova/base-ui). Fonts: Space Grotesk (headings), DM Sans (body), JetBrains Mono (URLs/numbers). Light default + dark toggle (next-themes).

## Data model (`CatalogApp`)
id, name, description, category (8 fixed values), environment (Production/Staging/Internal/Cloud/On-Premises), status (Active/Maintenance/Deprecated), url, icon (lucide name), usage_count, favorite_count, created_at, updated_at (aware UTC).

## API (all under /api, registered on api_router)
- `GET /apps` — optional `q` (name/description/category/environment), `category`, `environment`, `status`, `sort` (name_asc|name_desc|most_used|most_favorite|recently_added|recently_updated). Filtering server-side; the frontend fetches all and filters client-side for instant UX.
- `GET /apps/{id}` · `POST /apps` (201) · `PUT /apps/{id}` · `DELETE /apps/{id}` (204)
- `POST /apps/{id}/launch` — increments usage_count
- `POST /apps/{id}/favorite` — body `{favorite: bool}`, increments/clamps favorite_count

## Frontend structure
- `/` Home: AppNavbar (logo/title, search, favorites toggle, layout selector, theme, Add App, user dropdown) → HeroSearchSection (headline, big search, category pills, stats strip) → CatalogToolbar (count, environment/status/sort selects, reset) → 5 layouts.
- Layouts: grid (marketplace cards), list (dense rows), alphabetical (A–Z groups + sticky jump bar), category (grouped chips), compact (dense tiles). Layout + sort persist in localStorage (`catalog.layout`, `catalog.sort`); favorites too (`catalog.favorites`, array of app ids — counts sync to backend).
- `/app/:id` AppDetail: purpose description, badges, stats, **Open Application** (opens `app.url` in new tab + launch counter), favorite toggle, admin Edit/Delete (confirm dialog), related apps (same category).

## Roles / auth
No auth. Everyone is effectively a catalog editor (Add/Edit/Delete buttons visible); favorites are per-browser.

## Seed data
36 realistic enterprise apps (Jira, Grafana, Okta, Veeam, Workday, SAP, …) across all 8 categories, with usage/favorite counts, staggered created_at/updated_at, and 2 non-Active apps (Pure Storage = Maintenance, Zabbix = Deprecated) for status-filter testing.

## Notes
- Search matches name, description, category, environment (server regex escaped; client substring).
- Sorting is stable with name as tiebreaker; dates are ISO strings (UTC) — lexicographic sort is safe.
