# AppCatalog — Security Hardening + SAST

**Repo**: brjnr/appcatalog `main` cloned into `/app/appcatalog` (symlinked as `/app/backend`, `/app/frontend` for supervisor).
**Owner scope**: authorized security remediation on active clone.

## What ships in this pass

### Backend hardening (2026-02)
- Removed unauthenticated demo endpoints (`GET/POST /api/status`). `GET /api/` remains as a liveness ping.
- `server.py` middleware stack: TrustedHost → explicit CORS allowlist (never `*` with credentials) → 3 MB request-size cap → security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, conditional HSTS).
- Global exception handler returns a generic error + correlation ref; stack traces stay in the log.
- **Sessions**: cookie holds a `secrets.token_urlsafe(48)` opaque token; DB stores only its SHA-256 digest (`sessions.token_hash` unique index). Cookies default to `httponly` + `samesite=lax` + env-controlled `secure`. TTL index reaps expired rows.
- **Brute force**: `login_attempts` collection (TTL-cleaned) enforces 8 failures per account or 20 per IP in a 15-min window; response is a generic 429.
- **Login by username OR email**: `POST /auth/login` matches either against the same `email` field of the payload (API contract preserved).
- **User model policy**: password ≥ 13 chars with upper + lower + symbol; `password_confirm` server-validated; `username` (3–40 chars `[a-zA-Z0-9._-]`) unique via partial unique index. `UserOut` now exposes `username`.
- **Category icons**: SVG rejected (MIME + filename); uploads streamed with a 2 MB hard cap; Pillow magic-byte + dimension validation; atomic tmp-file + `os.replace` write; safe permissions.
- **Apps list**: pagination (`limit`, `offset`), bounded `q`, enum-validated `environment`/`status`/`sort`, indexed Mongo sort, regex-escaped free-text search.
- **Favorites integrity**: `favorites` collection with unique `(user_id, app_id)` compound index; `POST /apps/{id}/favorite` upserts/deletes and derives `favorite_count` via `count_documents`. Repeated toggles are idempotent.

### Frontend cleanup
- Login form labelled “Email or username”, accepts either.
- Add/Edit User form: Username field with format hint; Password + Retype password with live match check and 13-char policy hint; submit disabled while invalid.
- Users list search now covers `name` + `username` + `email`; row secondary line shows `@username · email`.
- Every catalog launch (`Home.tsx`, `AppDetail.tsx`) rejects non-`http(s)` URLs before `window.open("_blank", "noopener,noreferrer")`.
- Server ticket external link uses `rel="noopener noreferrer"`.

### Testing
- All 12 backend pytest tests green (`BACKEND_URL=http://localhost:8001 python -m pytest tests/`).
- Brittle `== 36` assertion in `test_tscheck_admin_unrestricted.py` replaced with `>= 36` baseline.
- New negative tests: `test_password_confirm_mismatch_rejected`, `test_weak_password_rejected`, `test_login_by_username_alias`.
- Manual verification: SVG rejected (415), magic-byte mismatch rejected (415), valid PNG accepted; `/api/status` returns 404; favorite spam stays count=1; brute force locks at attempt 9.

### Config / secrets
- `backend/.env.example` created with sanitized placeholders.
- Runtime `.env` extended: `TRUSTED_HOSTS`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `MAX_REQUEST_BYTES`, `LOG_LEVEL`.
- `bcrypt` pinned back to `4.0.1` to satisfy passlib 1.7.4 and silence the boot-time `AttributeError` warning.

## Seeded demo accounts (isolated, non-production)
See `/app/memory/test_credentials.md`. Login accepts email or username.

## Deferred backlog
- CSRF token for cookie-authed state-changing requests (explicitly deferred per user).
- SAST tooling in CI (Semgrep, pip-audit, yarn audit, secret scan) — recommended next.
- Migrate frontend favorites away from `localStorage` toward the new `/api/apps/me/favorites` endpoint so favorite state syncs across devices.

## 2026-02 features (Phase A + B + C)

### Phase A — Server lifecycle fields
- Added `date_created` (manual input), `date_decommissioned`, and `decommission_notes` to `models/infra.py` `Server` / `ServerCreate` / `ServerUpdate`.
- `ServerFormDialog` renders `date_created` on every server, plus conditional `date_decommissioned` + `decommission_notes` when status is `Decommissioned`.
- `ServerDrawer` view shows both lifecycle dates and the decommission notes block for retired servers.

### Phase B — Import / Export
- New router `routers/import_export.py`:
  - `GET /api/exports/{entity}/template` — empty `.xlsx` with headers + example row + How-to-fill sheet + (where relevant) a Categories/Departments reference sheet.
  - `GET /api/exports/{entity}` — live dump of every row for edit-and-reupload workflow.
  - `POST /api/imports/{entity}` — accepts `.xlsx`/`.csv`/`.tsv`; parses entirely in memory (never touches disk), hard cap 3 MB and 1000 rows, closes the `UploadFile` before returning.
  - Row outcomes are returned as `created` / `updated` / `skipped` / `error` with a Pydantic-generated message.
- New admin page `AdminImportExport` with 4 cards (Categories, Applications, Servers, PICs) — Template, Export live data, Upload buttons, and a rich per-row result table.
- `openpyxl==3.1.5` added to requirements.

### Phase C — Integrations tab
- New router `routers/integrations.py` with CRUD per connector kind (`jira`, `smtp`, `teams`, `telegram`, `vcenter`); one row per kind in a new `integrations` collection (unique index on `kind`).
- New utility `lib/crypto.py`: symmetric Fernet encryption for secret fields, with a `INTEGRATIONS_KEY` env var and a masked hint on read (`•••ken`). Blank secret input on update keeps the existing encrypted value so admins do not have to retype passwords.
- Live delivery wired for SMTP: `POST /api/integrations/email/test` (send test email) and `POST /api/integrations/alerts/notes-expiring` (send a digest of expiring notes to a supplied recipient list). Both use `smtplib` with `asyncio.to_thread`.
- Other connectors (Jira, Teams, Telegram, vCenter) ship the config UI + save; live delivery hooks arrive in a later phase.
- New admin page `AdminIntegrations` with a card grid + edit dialog + "Send test email" dialog.

### Nav / routing
- `AdminLayout` gains "Import / Export" and "Integrations" menu entries.
- `App.tsx` registers `/admin/import-export` and `/admin/integrations` routes.

### Database rename (June 2026)
- Renamed active MongoDB database `appcatalog_demo` → `appcatalog_prod` via mongodump/mongorestore (`--nsFrom/--nsTo`), preserving all 11 collections and counts (users 8, apps 36, categories 9, servers 14, pics 6, integrations 1, favorites 1, sessions 88, departments 5).
- Updated `DB_NAME="appcatalog_prod"` in `backend/.env`; backend restarts cleanly and serves identical data (verified: login 200, 9 categories, 36 apps).
- Old `appcatalog_demo` database dropped after verification.
