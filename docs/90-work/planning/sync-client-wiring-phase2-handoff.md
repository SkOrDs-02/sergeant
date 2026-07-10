# Sync client wiring — Phase 2 handoff (registry expansion)

> **Status:** Active
> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-03.
> Handoff для сесій у **іншому середовищі** (локальна машина з Docker, manual E2E, CI з Testcontainers).

---

## 1. Що зроблено в cloud-agent сесії

PR branch: `cursor/sync-phase2-registry-expansion-0eea`

| Surface    | Deliverable                                                                                            | Статус                |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------------- |
| **Server** | 15 `apply*` functions (`applySyncFullState.ts` ×3 modules) + `applySync-helpers.ts`                    | ✅                    |
| **Server** | `OP_LOG_TABLE_REGISTRY` розширено **27 → 42** таблиць (`syncV2.ts`)                                    | ✅                    |
| **Server** | Unit smoke `applySyncFullState.test.ts` (registry count + 3 apply paths)                               | ✅                    |
| **Web**    | `fireSyncOutboxUpsert` + enqueue у routine / nutrition water+shopping / fizruk daily+monthly+templates | ✅                    |
| **Web**    | `CLIENT_PULL_SUPPORTED_TABLES` + `refreshCachesAfterPull` оновлено                                     | ✅                    |
| **Mobile** | Те саме для routine / nutrition / fizruk (включно programs, wellbeing, plan_templates)                 | ✅ commit `287554033` |

**PG schema:** нових міграцій не потрібно — таблиці вже в `050_routine_full_state.sql`, `051_nutrition_full_state.sql`, `052_fizruk_full_state.sql`.

**api-client:** shape push/pull **не змінювався** — contract triplet drift немає.

---

## 2. Що НЕ зроблено (явні блокери cloud-середовища)

| Блокер                                                   | Симптом                                               | Хто закриває                                   | Команди / дії                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Testcontainers**                                       | `Could not find a working container runtime strategy` | Локальна сесія або CI                          | `pnpm --filter @sergeant/server test:integration -- syncV2`                                             |
| **Manual E2E**                                           | Два browser profiles / Expo emulator недоступні       | Founder / локальна сесія                       | [`sync-client-e2e.md`](../../03-operations/runbooks/sync-client-e2e.md) § A + **новий** § routine habit |
| **Full `pnpm check`**                                    | Cloud pod може не встигнути / без integration         | CI на PR merge                                 | `pnpm check`                                                                                            |
| **Web fizruk programs/wellbeing/plan_templates enqueue** | Web adapter не має op-kinds (mobile-only writers)     | Окремий PR якщо web UI почне писати ці таблиці | grep `programs-set` у `apps/web`                                                                        |

---

## 3. Перевірки для наступної сесії (copy-paste)

```bash
# Unit (має бути green без Docker)
pnpm --filter @sergeant/server exec vitest run src/modules/sync/applySyncFullState.test.ts
pnpm --filter @sergeant/server exec vitest run src/modules/sync/applySync.test.ts
pnpm --filter @sergeant/web exec vitest run src/core/syncEngine
pnpm --filter @sergeant/mobile test -- --testPathPattern="syncEngine|sqliteWriter"

# Integration (потребує Docker / CI)
pnpm --filter @sergeant/server test:integration -- syncV2

# Pre-merge
pnpm check
```

### Manual E2E — Phase 2 gate (routine habit)

1. **Web Profile A:** Routine → create habit «Sync Phase 2 test».
2. Push 200 → **Profile B** (same user) → pull ≤60s.
3. **Pass:** habit visible on Profile B.
4. Repeat **web → mobile** після Expo foreground.

---

## 4. Таблиці Phase 2 (15 synced)

| Module    | Tables                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Routine   | `routine_habits`, `routine_tags`, `routine_categories`, `routine_prefs`, `routine_pushups`, `routine_habit_order`, `routine_completion_notes` |
| Nutrition | `nutrition_water_log`, `nutrition_shopping_list`                                                                                              |
| Fizruk    | `fizruk_daily_log`, `fizruk_monthly_plan`, `fizruk_plan_templates`, `fizruk_programs`, `fizruk_wellbeing`, `fizruk_workout_templates`         |

**Свідомо поза scope (R7):** `finyk_mono_*` mirror (3 tables) — local-only.

---

## 5. Row shape convention

Client enqueue використовує **SQLite column names** (`tag_ids_json`, `data_json`, `order_json`, …). Server `apply*` приймає обидва аліаси через `readJsonbField()` у `applySync-helpers.ts`. Generic client pull apply (`applyGenericRegistryRow`) працює без додаткових mappers.

---

## 6. Phase 3+ (не почато)

- Client SSE consumer (`/api/v2/sync/stream`)
- ADR-0065 retention + PG NOTIFY
- Phase 4 residue (`fizruk_rest_settings_v1`, nutrition IDB recipes, …)

---

## 7. Пов'язане

- [`sync-client-wiring.md`](./sync-client-wiring.md) — initiative tracker
- [`sync-client-wiring-playbook.md`](./sync-client-wiring-playbook.md) §5 — Phase 2 template
- [`sync-client-e2e.md`](../../03-operations/runbooks/sync-client-e2e.md) — manual runbook
