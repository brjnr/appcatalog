# AppCatalog Security Hardening PRD

## Original problem statement
Harden the React/Vite + FastAPI + MongoDB enterprise application catalog against the listed SAST findings, preserving secure behavior and adding verification.

## Architecture decisions
- FastAPI remains bound by the existing supervisor configuration and uses only `MONGO_URL` and `DB_NAME`.
- Sessions use cryptographically random opaque tokens; MongoDB stores only SHA-256 digests with TTL expiry.
- Cookie-authenticated state changes use a double-submit CSRF token.
- Production CORS and trusted hosts fail closed unless explicit allowlists are configured.
- Legacy status endpoints remain available only to authenticated administrators.

## Personas
- Catalog user: signs in and views permitted catalog data.
- Administrator: manages protected operational status data.
- Security reviewer: verifies negative paths, headers, throttling, and configuration safety.

## Core requirements
- Prevent unauthenticated status access and unrestricted writes.
- Prevent token theft impact, brute-force abuse, CSRF, oversized requests, host-header abuse, and verbose errors.
- Preserve existing APIs where secure; avoid production credentials in source control.

## Implemented
- 2026-09-15: Replaced starter status API with admin-gated endpoints and bounded Pydantic inputs.
- 2026-09-15: Added opaque SHA-256-digested sessions, expiry checks, secure cookie options, logout, and active-user validation.
- 2026-09-15: Added login throttling, CSRF checks, explicit CORS handling, trusted-host middleware, security headers, generic errors, and bounded streamed request bodies.
- 2026-09-15: Added sanitized `.env.example`, baseline security tests, and authentication testing playbook.

## Prioritized backlog
- P0: Restore the full catalog domain routers in the writable repository and apply object-level authorization to each.
- P0: Add isolated test fixtures for authenticated admin/user sessions and run CSRF, expiry, IDOR, and last-admin tests.
- P1: Implement bounded Pillow-validated non-SVG uploads with atomic replacement and safe response headers.
- P1: Implement per-user favorites with a unique compound index, atomic counts, pagination, and indexed filters.
- P2: Add CI jobs for pip-audit, yarn audit, Semgrep, secret scanning, and dependency pin review.

## Remaining P0/P1/P2 tasks
- P0: Configure explicit `CORS_ORIGINS` and `TRUSTED_HOSTS` in each production runtime secret configuration.
- P1: Replace the starter splash with the catalog UI once the catalog source routers are restored.
- P2: Document accepted medium/low findings after the complete catalog verification gate.