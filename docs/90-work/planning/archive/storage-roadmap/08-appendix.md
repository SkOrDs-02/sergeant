# Storage & Sync — Appendix (інфраструктура, ризики, метрики, тех-борг)

> **Last touched:** 2026-07-18 by @dimastahov16012003. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/planning/storage-roadmap/08-appendix.md`.

> **Частина** [storage-roadmap](../storage-roadmap.md) · [← Stage 13](./07-stage-13.md)

## 4. Зміни інфраструктури (cross-PR)

| Що                                                                                       | Де                                       | Коли                                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` | `vercel.json`                            | Stage 2, PR #016                              |
| Self-hosted fonts                                                                        | `apps/web`                               | Stage 2, PR #017                              |
| Expo dev-client rebuild (expo-sqlite native)                                             | EAS Build                                | Stage 2, PR #018                              |
| Capacitor mobile-shell — iOS WKWebView OPFS check (16.4+)                                | `apps/mobile-shell`                      | Stage 3 SPIKE, fallback на IDB-VFS для старих |
| Railway: Redis addon                                                                     | Railway dashboard                        | Stage 6, PR #045                              |
| Railway: pgBouncer service                                                               | Railway                                  | Stage 6, PR #046                              |
| Railway: read replica                                                                    | Railway production tier                  | Stage 6, PR #047                              |
| Sentry release tracking з sync-engine version                                            | `apps/web/src/core/sentry.ts`            | Stage 5, PR #040                              |
| GitHub Actions: weekly backup-verify cron                                                | `.github/workflows/db-backup-verify.yml` | Stage 6, PR #049                              |
| Bundle-budget bump для sqlite-chunk (lazy)                                               | `apps/web/package.json` `size-limit`     | Stage 2, PR #015                              |

---

## 5. Risk register

| Ризик                                                                                                    | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPFS не вмикається через CORP-проблеми (Google Fonts, OAuth popup, Vercel Analytics)                     | Medium     | High   | Self-host fonts (PR #017), test all 3rd-party під CORP заздалегідь, fallback на IDB-VFS                                                                                                                                                                                                                                                                                                                                                   |
| iOS WKWebView (Capacitor mobile-shell) на iOS<16.4 не підтримує OPFS                                     | High       | Medium | Fallback IDB-VFS; довгостроково — мігрувати mobile-shell users на native Expo app                                                                                                                                                                                                                                                                                                                                                         |
| `expo-sqlite` SDK 52 native rebuild ламає custom dev-client                                              | Medium     | High   | Rebuild dev-client на feature branch перед merge, test на TestFlight/internal track                                                                                                                                                                                                                                                                                                                                                       |
| Drizzle на mobile/SQLite має edge-case bugs                                                              | Low        | Medium | Fallback на raw SQL з типами через `@types`; Drizzle для server-only якщо що                                                                                                                                                                                                                                                                                                                                                              |
| Backfill з module_data в нормалізовані таблиці провалюється для деяких юзерів (corrupted JSONB)          | Medium     | High   | Idempotent backfill з lookup-by-user; fallback skip + log; manual fix per case                                                                                                                                                                                                                                                                                                                                                            |
| Bundle size growth ламає mobile WebView performance                                                      | Low        | Medium | Lazy chunk strategy (PR #015), bundle-budget CI gate                                                                                                                                                                                                                                                                                                                                                                                      |
| CRDT bugs у routine streak (PR #042) дають wrong-counter                                                 | Medium     | High   | Shadow mode 4 тижні: пишемо паралельно LWW і CRDT, порівнюємо в Sentry                                                                                                                                                                                                                                                                                                                                                                    |
| Vercel COEP ламає Better Auth Google OAuth popup                                                         | Medium     | High   | Test перед PR #016; fallback на same-tab redirect flow                                                                                                                                                                                                                                                                                                                                                                                    |
| Railway PG instance не витримує op-log throughput                                                        | Low        | High   | Stage 6 read-replica + partition                                                                                                                                                                                                                                                                                                                                                                                                          |
| Read-default-on PWA habit-input regression (installed PWA Routine users) — repeats on #055\*2 re-rollout | Medium     | High   | Pre-rollout PWA stability gate: 7 днів без Sentry events `routine.pwa.habit_input.*` after [#2181](https://github.com/Skords-01/Sergeant/pull/2181) (`2735fa75`); then re-flip via single-module slice (Routine first, hold 7 днів, then Fizruk/Nutrition/Finyk).                                                                                                                                                                         |
| Stage 9 boot-path partial migration (`sync_op_outbox` not found post-#063) → dual-write pipeline crashes | Medium     | High   | Self-heal `repairPartialOutboxMigration` ([#2199](https://github.com/Skords-01/Sergeant/pull/2199), `ba6cb113`) + run outbox migrations at sync engine boot ([#2192](https://github.com/Skords-01/Sergeant/pull/2192), `3f40a27e`) + Sentry boot-outcome tag (`ce4fb145`); audit hotfix bundle ([#2201](https://github.com/Skords-01/Sergeant/pull/2201), `316ef626`). Detail у §A `docs/90-work/audits/archive/2026-05-07-app-audit.md`. |

---

## 6. Decision gates / off-ramps

- **Після Stage 0 (тиждень 2):** review — security-debt closed. Можна
  зупинитись тут якщо команда має інші пріоритети. Архітектура не
  погіршилась.
- **Після Stage 1 (тиждень 6):** review — drift-баг закрито, KVStore єдиний,
  IDB-консолідовано, LS-burndown done. **Можна зупинитись на Stage 1**
  якщо ризик SQLite-міграції здається завеликим. Все ще приблизно 60% impact
  від повного roadmap.
- **Після Stage 2 (тиждень 9):** ✅ **PASSED (2026-05-02).** Drizzle працює,
  sqlite-wasm ленді, OPFS infra на Vercel налаштована, op-log sync v2
  ендпоінти задеплоєні. **Decision: чи йдемо у SPIKE — PENDING.**
- **Після Stage 3 SPIKE (тиждень 11):** **HARD GATE.** Якщо SPIKE fail-ить
  pass-criteria — STOP. Документуємо learnings, повертаємось до Stage 1+
  без SQLite. Якщо pass — full GO.
- **Після кожного модуля у Stage 4:** review conflict-rate, latency
  на проді. Якщо метрики деградують — паузу на наступному модулі.
- **Stage 5 (CRDT) — опційний.** Можна засіяти коли core міграція стабільна.

---

## 7. Метрики успіху (post-rollout)

| Метрика                               | Baseline (зараз)                  | Target                                              |
| ------------------------------------- | --------------------------------- | --------------------------------------------------- |
| Push p95 latency                      | ~800ms (LWW whole-blob)           | ≤ 250ms (per-row diff)                              |
| Conflict rate (per push)              | ~3-5% (whole-blob LWW collisions) | ≤ 0.5%                                              |
| Cold-start TTI (web installed PWA)    | ~1.2s                             | ≤ 0.5s (warm SQLite)                                |
| Storage cap encounter rate            | unknown, але >0 у power users     | 0 (нема cap)                                        |
| Cross-device toggle latency (routine) | до 60s (next sync cycle)          | ≤ 2s (SSE pull)                                     |
| LS-write count per user-session       | ~50                               | ≤ 5 (тільки Better Auth cookies + warm-cache flags) |
| Mono PAT plaintext leak risk          | high (LS+MMKV+server)             | 0 (server-only after PR #002)                       |
| Tech-debt items у `storage` категорії | ~12                               | 0                                                   |

---

## 8. Перші кроки (якщо approve)

Якщо план approve — починаємо так:

1. ~~**Тиждень 1:** PR #001 (MMKV encryption) + PR #002 (FINYK_TOKEN cleanup) +
   PR #004 (query-cache excludes). Це security-quick-wins, низький ризик.~~
2. ~~**Тиждень 2:** PR #003 (webhook rotation) + PR #005 (sync_audit) +
   review Stage 0.~~
3. ~~**Тиждень 3-6:** Stage 1 (Consolidation). PR #006 → #013.~~ ✅ COMPLETE — усі 8 PR-ів залендили: #006, #007, #008 (`ff217246`), #009, #010 ([#1543](https://github.com/Skords-01/Sergeant/pull/1543)), #011, #012, #013.
4. ~~**Тиждень 7:** Перший draft RFC у `docs/rfcs/2026-q3-sqlite-migration.md`
   з фіксованими decision criteria для SPIKE.~~
5. ~~**Тиждень 8-9:** Stage 2 (Foundation) — найризикованіша частина в плані
   bundle/CORP/iOS-compat.~~ ✅ **Stage 2 завершено (2026-05-02).** Усі 8 PR-ів (#014–#021) landed.
6. **Тиждень 10-11:** SPIKE. Hard decision gate. ← **ЗАКРИВАЄТЬСЯ ЗАРАЗ.**
   Library + dev panels + automated gates landed; залишився operator
   pass на real hardware (iOS Safari 16.4+, multi-device toggle vs
   staging) перед фінальним go/no-go. Деталі — у
   [`docs/02-engineering/notes/spikes/routine-sqlite-v2.md`](../../../../02-engineering/notes/spikes/routine-sqlite-v2.md).

---

## 9. Зв'язок з існуючим тех-боргом

| Існуючий debt-item                              | Закривається у         |
| ----------------------------------------------- | ---------------------- |
| `frontend.md §2 — localStorage burndown`        | Stage 1 (PR #006-#013) |
| `frontend.md §X — sync drift web vs mobile`     | Stage 1, PR #007       |
| `backend.md §Y — in-memory rate-limit`          | Stage 1, PR #011       |
| `backend.md §Z — module_data CHECK constraint`  | Stage 1, PR #012       |
| `frontend.md — IDB consolidation`               | Stage 1, PR #010       |
| `MMKV TODO(security)` (inline в коді)           | Stage 0, PR #001       |
| `whole-blob LWW не масштабується` (новий entry) | Stage 4                |
| `MAX_OFFLINE_QUEUE = 50 dropping payloads`      | Stage 1, PR #009       |
| `query-persister leak sensitive data`           | Stage 0, PR #004       |

Tech-debt docs оновлюються в кожному PR що закриває item — це вже в guardrail
(`scripts/check-tech-debt-freshness.mjs`).

---

## Підсумок

**Загальний effort: ~30-40 PR-ів, 7-8 місяців calendar з 0.5-1 FTE.**

Якщо команда хоче довести систему до prod-ready без SQLite-rewrite — **достатньо
Stage 0 + Stage 1 (6 тижнів)**. Це закриє security-debt і drift-баги, дасть ~60%
impact.

Якщо ціль — **повна довгострокова архітектура** (більше даних, multi-device без
collisions, scalability на N power-users) — Stage 2-7 у послідовному порядку
з hard-gate після SPIKE.

Я б порадив:

1. **Approve Stage 0 зараз** — починаємо з PR #001 на цьому тижні.
2. **Stage 1 в наступному циклі планування** — поки ще без commitment до SQLite.
3. **RFC + SPIKE як окрема ініціатива на Q3** — гейт через decision criteria.
