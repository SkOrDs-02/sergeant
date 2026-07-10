# Sync client E2E — manual runbook (Phase 1 gate)

> **Status:** Active
> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-03.
> Ручний прогін multi-device sync після merge PR-1…PR-4 ([`sync-client-wiring-playbook.md`](../../90-work/planning/sync-client-wiring-playbook.md) §4.5, §8).

## Prerequisites

- Локально: `pnpm dev:db`, `pnpm dev:server`, `pnpm dev:web`
- Два signed-in профілі **або** web + Expo emulator з одним test user
- Test user з Better Auth (не demo-only — demo-seed не enqueue-ить sync ops)

## A. Web ↔ Web (routine completion)

1. **Profile A** (Chrome): sign in → Routine → mark habit complete for today.
2. DevTools → Network: дочекайся `POST /api/v2/sync/push` → **200**.
3. **Profile B** (інкognito / другий профіль): той самий user → Routine.
4. Дочекайся `GET /api/v2/sync/pull` (boot або ≤60s interval) **або** hard reload.
5. **Pass:** completion видимий у heatmap/calendar на Profile B.

## B. Web → Mobile (finyk manual expense)

1. **Web:** Finyk → add manual expense «Sync E2E test».
2. Push 200 на web.
3. **Mobile:** foreground app (pull on AppState active).
4. **Pass:** expense у списку на mobile.

## C. Echo suppression

1. Profile A: mutation → push success.
2. Profile A: pull tick (same device).
3. **Pass:** UI без double-apply / flicker; SQLite без duplicate rows.

## D. Demo regression (R5)

1. Incognito → demo entry URL → habits render.
2. Hard reload.
3. **Pass:** habits still visible; no sync-engine boot errors in console.

## Failure triage

| Symptom                   | Check                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| Push never fires          | `bootSyncEngineWriter` in `main.tsx`; user signed in; `sync_op_outbox` rows |
| Push 401                  | Session cookie / auth on API                                                |
| Pull empty but push ok    | `X-Origin-Device-Id` on both; server `sync_op_log.status=applied`           |
| Pull applies but UI stale | Module `notify*CacheRefresh` / routine `emitRoutineStorage`                 |
| Mobile only broken        | PR-4 merged; `bootSyncEngineReader` in `_layout.tsx`                        |

## Automated smoke (CI)

```bash
pnpm --filter @sergeant/web exec vitest run src/core/syncEngine/syncRoundTrip.test.ts
pnpm --filter @sergeant/server test:integration -- syncV2
```

## Related

- [`sync-client-wiring.md`](../../90-work/planning/sync-client-wiring.md)
- [`sync-client-wiring-playbook.md`](../../90-work/planning/sync-client-wiring-playbook.md)
