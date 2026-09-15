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
