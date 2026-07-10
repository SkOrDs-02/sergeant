# Playbook: Sync client wiring — виконання фаз 0–4

> **Status:** Active
> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-03.
> **Trigger:** Потрібно wire-ити client pull + outbox enqueue після SQLite cut-over ([`sync-client-wiring.md`](./sync-client-wiring.md)). Цей playbook — **операційна інструкція** для кожної фази: дизайн роботи, правила, метрики, підтвердження, перепровірки, розподіл між агентами.

**Governing skills:** [`sergeant-feature-delivery`](../../../.agents/skills/sergeant-feature-delivery/SKILL.md) (координація) + [`sergeant-deliver-squad`](../../../.agents/skills/sergeant-deliver-squad/SKILL.md) (коли PR торкається ≥2 surfaces з contract deps).

**Canonical initiative doc:** [`sync-client-wiring.md`](./sync-client-wiring.md) — DoD, ризики, PR-розбивка.

---

## 1. Як оркеструвати (агенти vs послідовно)

### Режим A — один координатор (рекомендовано для Cursor Cloud Agent)

Один агент виконує PR-и **послідовно** PR-1 → PR-5, далі Phase 2 per-module. Між PR-ами — обов'язковий gate з §6 цього playbook.

| Крок          | Хто                                              | Що робить                                               |
| ------------- | ------------------------------------------------ | ------------------------------------------------------- |
| 0             | Координатор                                      | Inventory (§3) — один раз, зафіксувати в PR description |
| PR-1…PR-3     | `web-agent` або координатор + `sergeant-web-ui`  | Pull + enqueue web                                      |
| PR-4          | `mobile-agent` + `sergeant-mobile-expo`          | Mobile parity                                           |
| PR-5          | `sergeant-e2e-testing` + `qa-server` + `qa-web`  | Integration + runbook                                   |
| Phase 2 PR-6+ | `sergeant-deliver-squad` chain                   | migration → server → api-client → web ∥ mobile          |
| Phase 3       | `sergeant-deploy-and-observability` + web/mobile | SSE + retention                                         |
| Phase 4       | Surface owner per residue item                   | Parallel low-priority                                   |

### Режим B — deliver-squad (коли Phase 2+ чіпає PG schema)

```
migration-agent → server-agent → api-client-agent → web-agent ∥ mobile-agent → qa-squad
```

**Не паралелити** migration → server → api-client. Web і mobile — паралельно після api-client.

### Режим C — review boundary

PR, що торкає web + server + api-client + mobile → `sergeant-review-squad` перед merge.

---

## 2. Глобальні правила (не повторювати в кожному PR — перевіряти чеклистом)

| ID  | Правило                                 | Перевірка                                                   |
| --- | --------------------------------------- | ----------------------------------------------------------- |
| R1  | LWW-guard `>` строго (ADR-0004)         | Unit test: `client_ts` equal → reject/no-op                 |
| R2  | Outbox enqueue fire-and-forget          | `void enqueue…`; try/catch у adapter — local write не падає |
| R3  | Pull apply idempotent                   | Повторний pull того ж `op.id` — no-op                       |
| R4  | Contract triplet (Hard Rule #3)         | Зміна pull/push shape → server + api-client + contract test |
| R5  | Demo-seed не регресувати                | Manual: cold reload demo → habits visible                   |
| R6  | `origin_device_id` на кожному push/pull | `resolveOriginDeviceId` + header `X-Origin-Device-Id`       |
| R7  | Mono mirror поза op-log                 | Не enqueue `finyk_mono_*` tables                            |
| R8  | Migrations sequential (Hard Rule #4)    | Phase 2 only; two-phase DROP                                |

---

## 3. Фаза 0 — Inventory ✅ (baseline 2026-07-10)

**Мета:** зафіксувати as-is перед кодом. **Агент:** координатор / `sergeant-feature-delivery`. **PR не потрібен** — результат у initiative doc + цей §3.

### 3.1 Результати inventory

| Артефакт                                    | Значення                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `OP_LOG_TABLE_REGISTRY`                     | **27** таблиць (`syncV2.ts:112–140`)                                                |
| Client SQLite module tables                 | **45** (без sync infra: `sync_op_outbox`, `sync_op_cursor`, `kv_store`, …)          |
| Intersection (Phase 1 scope)                | **27** — усі registry tables є в SQLite                                             |
| SQLite-only (Phase 2 scope)                 | **18** — див. §3.3                                                                  |
| `enqueueOutboxUpsert` production call sites | **2** — `apps/web/.../routine/.../adapter.ts:357,391` (completion upsert/delete)    |
| Mobile outbox enqueue                       | **0** — коментар у mobile adapter: web-only                                         |
| `sync_op_cursor` schema                     | ✅ `001_routine_spike.sql` + drizzle `routine.ts`                                   |
| `originDeviceId`                            | ✅ `packages/shared/src/lib/originDeviceId.ts`; wired у web/mobile writer singleton |
| Client pull consumer                        | **0** — `pullV2` є в api-client, нема `syncEngineReader`                            |
| Client SSE consumer                         | **0**                                                                               |

### 3.2 Enqueue grep (перепровірка)

```bash
rg 'enqueueOutboxUpsert' apps/ packages/ --glob '*.{ts,tsx}' \
  --glob '!**/*.test.*' --glob '!**/__tests__/**'
# Очікування до Phase 1: лише adapter.ts (2 call sites) + helper definition
```

### 3.3 SQLite-only tables (Phase 2 backlog)

**Routine (7):** `routine_habits`, `routine_tags`, `routine_categories`, `routine_prefs`, `routine_pushups`, `routine_habit_order`, `routine_completion_notes`

**Fizruk (7):** `fizruk_daily_log`, `fizruk_monthly_plan`, `fizruk_plan_templates`, `fizruk_programs`, `fizruk_wellbeing`, `fizruk_workout_templates` (+ `fizruk_rest_settings_v1` — LS residue, Phase 4)

**Nutrition (2):** `nutrition_water_log`, `nutrition_shopping_list`

**Finyk mono mirror (3, R7 local-only):** `finyk_mono_transactions`, `finyk_mono_accounts`, `finyk_mono_account_snapshots`

### 3.4 Echo-suppression contract

- Server pull filter: `WHERE origin_device_id IS DISTINCT FROM $deviceId` (`syncV2.ts`).
- Client **must** send non-null `X-Origin-Device-Id` on push **and** pull.
- Pull apply на клієнті: **додатково** skip ops де `origin_device_id === localDeviceId` (defence in depth).

### 3.5 Gate Phase 0 → Phase 1

- [x] Inventory таблиць задокументовано (§3.1–3.3)
- [x] Enqueue call sites пораховано
- [x] `originDeviceId` підтверджено wired
- [ ] **Re-verify перед PR-1:** повторити §3.2 grep — baseline не змінився без PR

---

## 4. Фаза 1 — Sync MVP (registry tables only)

**Scope:** 27 таблиць з registry. **Не** розширювати registry. **Мета метрик:** pull consumer = 1 (web), enqueue sites > 2, E2E round-trip ✅.

### 4.1 PR-1 — Client pull loop (web)

|                |                                                                                         |
| -------------- | --------------------------------------------------------------------------------------- |
| **Агент**      | `web-agent` / `sergeant-web-ui`                                                         |
| **Surfaces**   | `apps/web`, можливо `packages/db-schema` (cursor helpers)                               |
| **Нові файли** | `apps/web/src/core/syncEngine/syncEngineReader.ts`, `applyPullOp.ts` (or inline), tests |

**Дизайн роботи**

1. **`syncEngineReader`** — симетрично до `syncEngineWriter`:
   - Read cursor з `sync_op_cursor` (per-user row або global — зіставити з server `since` semantics).
   - Loop: `apiClient.sync.pullV2(since, { originDeviceId, limit })` → apply each op → advance cursor to `next_cursor ?? last op id`.
   - Transactional apply per op (SQLite `BEGIN`/`COMMIT`); LWW `>` на `client_ts`.
2. **Apply mapping** — для кожної registry table: UPSERT/DELETE у відповідну SQLite table. Reuse server row shape (same JSON keys). Module-specific mappers можуть жити поруч з `sqliteWriter` adapters або centralized registry mirror.
3. **Overlay invalidation** — після successful apply batch: bump module overlay ticks (`sqliteTick`, `invalidateQueries` via existing patterns у `useSqliteTickOverlay`).
4. **Boot wiring** — `bootSyncEngineReader()` з `main.tsx` після auth session ready (не anon partition). Pull on: boot, foreground, post-push success callback.
5. **Echo skip** — ignore ops with matching `origin_device_id`.

**Підтвердження (must pass before PR merge)**

```bash
pnpm --filter @sergeant/web exec vitest run src/core/syncEngine
pnpm --filter @sergeant/web typecheck
```

**Manual smoke**

1. Two browser profiles, same user.
2. Profile A: create manual expense (finyk) — **поки без enqueue PR-2 дані не дійдуть до server**; для PR-1-only smoke використати server integration test або direct push via devtools.
3. Profile B: trigger pull → row appears in SQLite (DevTools → Application → OPFS) → UI refresh.

**Перепровірки**

- [ ] Cursor monotonic — pull `since` never decreases
- [ ] Idempotent re-pull (R3)
- [ ] `originDeviceId` header present (R6)
- [ ] Demo-seed cold reload (R5)
- [ ] No new raw LS module reads/writes

**Метрика PR-1:** `syncEngineReader` unit tests ≥ apply paths for 2+ table types (routine_entries + one finyk table).

---

### 4.2 PR-2 — Outbox enqueue web (finyk + nutrition)

|              |                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ |
| **Агент**    | `web-agent` / `sergeant-web-ui`                                                      |
| **Surfaces** | `apps/web/src/modules/finyk`, `apps/web/src/modules/nutrition` sqliteWriter adapters |
| **Pattern**  | Copy routine completion pattern: post-`client.run` → `void enqueueOutboxUpsert(...)` |

**Дизайн роботи**

1. **Shared helper** (optional refactor): `maybeEnqueueSyncOp(client, { table, op, row, userId })` wrapping idempotency key = stable row id + op kind or `crypto.randomUUID()` for inserts.
2. **Finyk (14 registry tables)** — hook у `apps/web/src/modules/finyk/lib/sqliteWriter/adapter.ts` (or per-entity writers) after each mutation path.
3. **Nutrition (5 tables)** — meals, pantries, pantry_items, prefs, recipes (SQLite path; IndexedDB recipes — out of scope R7/storage audit).
4. **Increment ops** — `routine_streaks` uses `increment` op kind; use `enqueueOutboxIncrement` from db-schema if applicable.
5. **userId** — from session at mutation time (same pattern as routine adapter).

**Tables to cover in PR-2**

`finyk_*` (14), `nutrition_meals`, `nutrition_pantries`, `nutrition_pantry_items`, `nutrition_prefs`, `nutrition_recipes`.

**Підтвердження**

```bash
pnpm --filter @sergeant/web exec vitest run src/modules/finyk/lib/sqliteWriter
pnpm --filter @sergeant/web exec vitest run src/modules/nutrition/lib/sqliteWriter
rg 'enqueueOutboxUpsert|enqueueOutboxIncrement' apps/web/src/modules/finyk apps/web/src/modules/nutrition \
  --glob '*.ts' --glob '!**/*.test.*' | wc -l
# Очікування: >> 2 call sites
```

**Integration assertion:** after mutation, `SELECT COUNT(*) FROM sync_op_outbox WHERE table_name='finyk_manual_expenses'` > 0.

**Перепровірки**

- [ ] Enqueue failure does not reject mutation (R2) — test like routine integration.test.ts:295
- [ ] No enqueue for `finyk_mono_*` (R7)
- [ ] Push scheduler drains outbox (`syncEngineWriter` existing tests green)

---

### 4.3 PR-3 — Outbox enqueue web (fizruk + routine rest)

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Агент**    | `web-agent` / `sergeant-web-ui`                               |
| **Surfaces** | `apps/web/src/modules/fizruk`, `apps/web/src/modules/routine` |

**Tables:** `fizruk_workouts`, `fizruk_workout_items`, `fizruk_workout_sets`, `fizruk_custom_exercises`, `fizruk_measurements`, `routine_entries`, `routine_streaks` (+ extend beyond completion-only if other routine registry ops exist).

**Підтвердження** — same pattern as PR-2 + existing routine adapter tests updated.

**Метрика Phase 1 web enqueue:** production `enqueueOutboxUpsert`/`Increment` call sites cover **all 27 registry table mutation paths** (grep audit in PR description).

---

### 4.4 PR-4 — Mobile parity

|               |                                                                             |
| ------------- | --------------------------------------------------------------------------- |
| **Агент**     | `mobile-agent` / `sergeant-mobile-expo`                                     |
| **Surfaces**  | `apps/mobile/src/core/syncEngine`, `apps/mobile/src/modules/*/sqliteWriter` |
| **Reference** | Web `syncEngineReader.ts`, web routine adapter enqueue                      |

**Дизайн**

1. Port or share `enqueueOutboxUpsert` — either duplicate in mobile (comment in web helper says "mobile can ship own variant") or extract to `@sergeant/shared` / `@sergeant/db-schema` if no circular deps.
2. `bootSyncEngineReader` in `apps/mobile/app/_layout.tsx` (mirror writer boot).
3. Enqueue on all registry mutations across 4 modules.

**Підтвердження**

```bash
pnpm --filter @sergeant/mobile typecheck
pnpm --filter @sergeant/mobile test
```

**Перепровірка:** `useSyncStatus` hook shows pending/outbox counts > 0 after mutation.

---

### 4.5 PR-5 — Integration test + E2E runbook

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Агент**    | `sergeant-e2e-testing` + `server-agent` (if extending integration)                                |
| **Surfaces** | `apps/server/src/modules/sync/syncV2.integration.test.ts`, optional `apps/web` vitest integration |

**Дизайн**

1. Extend server integration: push from device A → assert pull on device B (already exists — **add client-side apply test** if feasible in vitest with in-memory SQLite).
2. Document **Manual E2E Runbook** (§8 below) in PR description.
3. Optional Playwright: two contexts — out of scope unless `sergeant-e2e-testing` confirms harness ready.

**Gate Phase 1 complete**

| Метрика                      | Baseline | Target | Actual |
| ---------------------------- | -------- | ------ | ------ |
| Pull consumer (web)          | 0        | 1      | ☐      |
| Pull consumer (mobile)       | 0        | 1      | ☐      |
| Registry tables with enqueue | ~1       | 27     | ☐      |
| E2E habit/expense round-trip | ❌       | ✅     | ☐      |
| `pnpm check`                 | —        | green  | ☐      |

**QA squad (parallel, read-only):**

```bash
# Dispatch qa-web, qa-mobile, qa-server after PR-5
pnpm --filter @sergeant/web test
pnpm --filter @sergeant/mobile test
pnpm --filter @sergeant/server test:integration -- syncV2
```

---

## 5. Фаза 2 — Registry expansion (18 SQLite-only tables)

**Trigger:** Phase 1 gate closed. **Orchestration:** `sergeant-deliver-squad` **per module** (3 PR chains: routine, fizruk, nutrition).

### 5.1 PR chain template (repeat per module)

| Step | Agent                        | Deliverable                                                        |
| ---- | ---------------------------- | ------------------------------------------------------------------ |
| 2a   | `migration-agent`            | PG tables/columns if missing; report bigint columns                |
| 2b   | `server-agent`               | `apply*` functions + registry entries in `syncV2.ts`               |
| 2c   | `api-client-agent`           | Types unchanged unless push/pull row shape changes; contract tests |
| 2d   | `web-agent` ∥ `mobile-agent` | Enqueue + pull apply mappers for new tables                        |

**Routine PR-6 example tables:** habits, tags, categories, prefs, pushups, habit_order, completion_notes.

**Правила Phase 2**

- Registry keys must exist in PG **before** client enqueue ships (server rejects unknown tables).
- CI aspiration (future): script diff registry ↔ PG ↔ SQLite — track as follow-up if not in scope.
- Each module PR: update `sync-client-wiring.md` §8 checkbox for that module.

**Підтвердження per module PR**

```bash
pnpm --filter @sergeant/server test:integration -- syncV2
pnpm --filter @sergeant/api-client exec vitest run src/__tests__/contracts
pnpm check
```

**Manual E2E (routine module):** create habit on web → visible on mobile after pull.

**Метрика Phase 2 done:** 45 module tables classified — each either synced (registry + enqueue) or documented local-only in initiative §4.

---

## 6. Фаза 3 — Realtime + ops

|                     |                                                              |
| ------------------- | ------------------------------------------------------------ |
| **Агент primary**   | `sergeant-deploy-and-observability`                          |
| **Агент secondary** | `web-agent`, `mobile-agent` (SSE client)                     |
| **Prerequisite**    | Phase 1 pull loop stable (SSE is fast-path, not replacement) |

### 6.1 Work items

1. **SSE consumer** — `EventSource` → `/api/v2/sync/stream`; on event → trigger `syncEngineReader.pullOnce()`.
2. **ADR-0065** — `sync_op_log` retention job + PG NOTIFY multi-instance fan-out (migration-agent first).
3. **SLO** — wire `BackendHealthP95High` alert (design in SLO.md).

**Підтвердження**

- SSE reconnect with backoff; fallback to periodic pull unchanged.
- Load test: 2 Railway instances receive NOTIFY (after ADR-0065).

**Gate Phase 3:** SSE optional flag; pull-only path still passes E2E.

---

## 7. Фаза 4 — Residue (parallel, low priority)

Не блокує Phase 1 DoD. Окремі PR без deliver-squad unless schema change.

| Item                                       | Owner skill                    | Gate                              |
| ------------------------------------------ | ------------------------------ | --------------------------------- |
| `fizruk_rest_settings_v1` → SQLite         | `sergeant-web-ui` + mobile     | grep janitor clean                |
| Web nutrition recipes IDB → SQLite or sync | `sergeant-web-ui`              | R4 IndexedDB scope decision in PR |
| Mono multi-month backfill                  | `sergeant-server-api`          | Reports show history              |
| Nutrition backup `.data/`                  | `sergeant-data-and-migrations` | Backup restore drill              |
| Drop `billing_subscriptions` orphan        | `migration-agent`              | Two-phase DROP (R8)               |

---

## 8. Manual E2E Runbook (обов'язково для Phase 1 PR-5)

**Prerequisites:** local `pnpm dev:db`, `pnpm dev:server`, `pnpm dev:web`; two Chromium profiles OR web + Expo emulator; one test user (Better Auth).

### 8.1 Web ↔ Web (finyk manual expense)

1. Profile **A**: sign in → Finyk → add manual expense «Тест sync» 100 ₴.
2. Wait ≤60s (push scheduler interval) OR DevTools → Network → confirm `POST /api/v2/sync/push` 200.
3. Profile **B**: same user → open app → wait pull (or force reload).
4. **Pass:** expense visible in list; `sync_op_outbox` empty or drained on A.

### 8.2 Web → Mobile (routine completion)

1. Web: mark habit complete for today.
2. Mobile: pull on foreground.
3. **Pass:** completion visible in routine heatmap/calendar.

### 8.3 Echo suppression

1. Profile A: mutation → push.
2. Profile A: pull loop runs.
3. **Pass:** UI does not double-apply / flicker; no duplicate rows in SQLite.

### 8.4 Demo regression (R5)

1. Incognito → demo entry → habits render.
2. Hard reload → habits still render.
3. **Pass:** no console errors from sync engine boot.

---

## 9. Перепровірки на кожному PR (чеклист)

Скопіювати в PR description:

```markdown
## Sync wiring verification

- [ ] Scoped tests pass (see sync-client-wiring-playbook §4.x)
- [ ] R1–R8 rules checked
- [ ] No contract triplet drift OR triplet updated together
- [ ] Demo-seed smoke (if web touched)
- [ ] Enqueue grep audit attached (if adapter touched)
- [ ] Manual E2E steps N/A / completed (link or notes)
- [ ] Initiative doc checkbox updated (if phase gate)
```

**Pre-merge full matrix (Phase 1 final PR only):**

```bash
pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build
```

---

## 10. Abort / rollback criteria

| Symptom                    | Action                                                          |
| -------------------------- | --------------------------------------------------------------- |
| Pull apply corrupts SQLite | Revert PR; disable reader boot flag; user clears OPFS partition |
| Outbox flood (>10k rows)   | Stop scheduler; investigate bulk import missing batching        |
| LWW storm (flip-flop)      | Check `>` vs `>=`; compare client_ts timezone (Kyiv)            |
| Echo loop                  | Verify `originDeviceId` non-null on push                        |
| Contract CI red            | Fix triplet before any UI merge                                 |

---

## 11. Пов'язане

- [`sync-client-wiring.md`](./sync-client-wiring.md) — initiative DoD
- [`run-squad-deliver.md`](../../00-start/playbooks/run-squad-deliver.md) — deliver-squad recipe
- [`write-e2e-test.md`](../../00-start/playbooks/write-e2e-test.md) — Playwright
- [`data-exchange-storage-audit.md`](../../02-engineering/architecture/data-exchange-storage-audit.md)
- `apps/web/src/core/syncEngine/` — writer (reader TBD)
- `apps/server/src/modules/sync/syncV2.integration.test.ts` — server golden tests
