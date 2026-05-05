---
name: better-auth-best-practices
description: Use when editing Sergeant auth — login, signup, session cookies, middleware, account lifecycle, Better Auth wiring; UA: правиш логін, реєстрацію, сесії, кукі, авторизацію в Sergeant.
---

# Better Auth in Sergeant

Better Auth is a high-risk integration surface in Sergeant. Keep auth changes narrow, verify cookies across Vercel -> Railway, and avoid duplicating rules already covered by `sergeant-server-api`.

## Use This Skill For

- `apps/server/src/auth.ts`, auth routes, session middleware, auth env vars
- `apps/web/src/core/auth/*`, auth client wiring, login/signup/reset flows
- cookie, session, redirect, account lifecycle, or plugin changes

Do not use this skill for generic API work that only happens to require a user id. Use `sergeant-server-api` first, then this skill if auth behavior changes.

## Hard Rules

- Keep Better Auth user ids opaque strings. Do not assume UUID shape.
- Prefer environment variables over hardcoded `baseURL` or `secret`.
- Verify both server and client wiring in the same change when auth behavior moves.
- Treat cross-site cookie behavior as a deploy concern. Vercel proxying through `/api/*` is part of the auth contract.

## Sergeant Checklist

- Server config lives in `apps/server/src/auth.ts` and shares the Postgres pool from `db.ts`.
- Web client lives in `apps/web/src/core/auth/authClient.ts` plus auth UI under `apps/web/src/core/auth/`.
- Required env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; often also `ALLOWED_ORIGINS`.
- If cookie/session behavior changes, re-check [docs/integrations/railway-vercel.md](../../../docs/integrations/railway-vercel.md).

## Verify Before Closing

- Login, logout, and session refresh still work through the Vercel frontend.
- Protected routes still read the same server session shape.
- Any schema or plugin change is paired with the needed migration or CLI step.
- Auth-related docs or env docs are updated if operator setup changed.

## Playbooks

- `docs/playbooks/access-governance.md` — canonical access governance playbook (grant, revoke, periodic review, suspected compromise) with decision tree.
- Catalog: `docs/agents/agent-skills-catalog.md`.
