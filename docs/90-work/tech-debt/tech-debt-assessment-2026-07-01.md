# Tech-debt assessment 2026-07-01 — групи, інструкції до фіксу, burndown-план

> **Last touched:** 2026-07-20 by @cursoragent (full reconcile vs HEAD). **Next review:** 2026-10-18.
> **Status:** Active

> **Методологія (оригінал 2026-07-01):** повний прогін механічних гейтів + воркфло з підагентів. **Re-audit 2026-07-20:** повторне вимірювання ключових метрик на `main` (`a7a2814`) — LOC, allowlists, migrations, coverage floors, eslint-disable counts, hosting refs — без повторного повного lint/knip прогону (node_modules у cloud env може бути неповним; цифри з файлової системи + `coverage-thresholds.json` + eslint config).

## Executive summary

Механічний стан репо загалом здоровий: **Knip/janitors/AI-LEGACY** на 2026-07-01 були чисті; Hard Rule #18 server allowlist **порожній**; Initiative **0021** (react-hooks v7) **закрита**; Express 5 + `asyncHandler` cleanup **done**. Re-audit 2026-07-20 виявив **документальний drift**, не новий критичний борг:

| Зсув                            | Було в доках      | Стало в коді (2026-07-20)                           |
| ------------------------------- | ----------------- | --------------------------------------------------- |
| Web source / tests              | 790 / 243         | **999** / **875**                                   |
| Web coverage floor              | 85                | **89**                                              |
| Web max-lines leakers           | 0 (claim)         | **2** (`ManualExpenseSheet` ~607, `TxRow` ~605 eff) |
| Migrations                      | 73                | **82** (`082_plata_*`)                              |
| Server max-lines allowlist      | 6 → [] (Jul 10)   | **[]** (підтверджено)                               |
| `asyncHandler`                  | «opt-in leftover» | **видалено** (PR #134)                              |
| Hosting ops copy                | Railway           | **Coolify/Hetzner** (ADR-0074)                      |
| Mobile type-bypass allowlist    | 5–7 files         | **[]** / 0 casts                                    |
| Mobile tests / shell tests      | 111 / 5–8         | **148** / **11**                                    |
| eslint-disable production lines | 215               | **~195**                                            |
| By-design `any` (web)           | 3                 | **2** (`searchCache` cleaned)                       |

**Відкритий actionable backlog (пріоритет):**

1. Web Hard Rule #18 — декомпозиція `ManualExpenseSheet.tsx` + `TxRow.tsx` (окремі PR).
2. Group 3 — eslint-disable / exhaustive-deps catalog sync.
3. Mobile coverage floor 30 → ratchet; M7 Sentry DSN / M9 Expo 53 — blocked.
4. Coolify env-var audit trail — owner-decision.
5. Push APNs/FCM credentials — external-infra.

---

## Група 1 — Server max-lines burndown (Hard Rule #18) — ✅ DONE (2026-07-10)

**Верифіковано 2026-07-10 / підтверджено 2026-07-20:** `apps/server/eslint.server-maxlines-allowlist.json` = `[]`. Усі колишні allowlist-файли під 600 effective LOC (raw може бути вищим через коментарі/`env.ts` schema docs).

| Файл                               | raw (до → після / now) | Результат                                   |
| ---------------------------------- | ---------------------- | ------------------------------------------- |
| `routes/internal/openclaw.ts`      | 1819 → **73**          | барель; каталог `routes/internal/openclaw/` |
| `modules/openclaw/tools.ts`        | 1373 → **81**          | барель                                      |
| `modules/billing/stripe.ts`        | 1013 → **293**         | ✅ під 600                                  |
| `obs/metrics.ts`                   | 1301 → **~557 raw**    | ✅ під 600 eff                              |
| `modules/sync/fizruk/applySync.ts` | 654 → **414**          | ✅ під 600                                  |
| `modules/chat/chat.ts`             | 887 → **~547**         | ✅ під 600                                  |

## Група 2 — react-hooks v7: 5 вимкнених правил — ✅ DONE (Initiative 0021, PR #177, 2026-07-10)

Усі цільові `react-hooks/*` правила в `eslint.baseline.js` уже `"error"`. **Не брати як відкритий backlog.**

<details><summary>Архівний план burndown (2026-07-01 measurement)</summary>

Виміряні кількості порушень (web / mobile+shell / разом), проти стейлового scoreboard у `eslint.baseline.js:163-171`:

| Правило                       | web | mobile | разом   | scoreboard каже                                |
| ----------------------------- | --- | ------ | ------- | ---------------------------------------------- |
| `immutability`                | 3   | 4      | **7**   | 7 ✅ точний                                    |
| `preserve-manual-memoization` | 9   | 4      | **13**  | 9 (стейл)                                      |
| `purity`                      | 13  | 2      | **15**  | 17 (web покращився органічно)                  |
| `set-state-in-effect`         | 77  | 44     | **121** | 78 (без mobile)                                |
| `refs`                        | 59  | 322    | **381** | 37 (~10× недооблік; mobile взагалі не мірявся) |

Порядок і verification-рецепти — без змін від 2026-07-01; історичний playbook.

</details>

## Група 3 — eslint-disable burndown — P2-P3, 4-5 PR (оновлено 2026-07-20)

Виміряно **~195** production-рядків з `eslint-disable` (web+server+mobile+packages, без тестів); ціль «<100» нереалістична — більшість by-design (`no-eyebrow-drift` ~37, `prefer-kyiv-time` ~22+, `no-restricted-syntax`, `no-raw-storage-key`, `no-cyrillic-jsx-literal`, `exhaustive-deps` **9**).

Реальні цілі фіксу:

1. **P1:** недокументовані `security/detect-non-literal-fs-filename` / non-null assertion без WHY — security-pass.
2. `@typescript-eslint/no-non-null-assertion` — недокументовані сайти → guard / `?.`.
3. `no-restricted-syntax` + `no-raw-storage-key` — міграція на дозволений API або WHY-коментар.
4. **Catalog-sync (docs-only):** `docs/02-engineering/architecture/apps-web-exhaustive-deps.md` vs **9** live disable-сайтів — синхронізувати каталог.

## Група 4 — Рекласифіковано: dualWrite/residualImport — НЕ дублікати

Без змін vs 2026-07-01: pairwise diff спростовує «dedup»; не брати як чистку дублікатів.

## Група 5 — Дрібні self-contained + заблоковані (+ нові з reconcile)

| Пункт                                               | Статус                             | Дія                                              |
| --------------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `chat/tools.ts` console.log (F-008)                 | ✅                                 | —                                                |
| Grafana Alloy Dockerfile digest-pin (INFRA-004)     | ✅                                 | —                                                |
| `OptimizedImage.tsx` unused (UX-017)                | 🚫 Blocked-reason: by-design       | `@scaffolded` — НЕ видаляти                      |
| Lighthouse LCP warn→error (T5)                      | ✅                                 | `lighthouserc.json` LCP error @ 3000 ms          |
| Web max-lines: ManualExpenseSheet / TxRow           | **Відкрито, P1**                   | Декомпозиція (окремі PR) — див. `frontend.md` §4 |
| Mobile coverage floor 30 (TC-03)                    | Відкрито, P3                       | Ratchet у `coverage-thresholds.json`             |
| UI-примітиви (~138 файлів у `shared/components/ui`) | Відкрито, P4                       | Консолідація — design-цикл                       |
| `sync_op_log` партиціювання                         | 🚫 Blocked: multi-instance trigger | ADR-0065                                         |
| Coolify env-var audit trail                         | 🚫 Blocked-reason: owner-decision  | `backend.md` § Operational visibility            |
| Push APNs/FCM credentials                           | 🚫 Blocked-reason: external-infra  | `backend.md` § Push credentials                  |
| Mobile Sentry DSN (M7)                              | 🚫 Blocked-reason: external-infra  | `mobile.md` roadmap                              |
| Expo SDK 53 (M9)                                    | 🚫 Blocked-reason: dep-blocked     | ADR-0063                                         |

## Довідка: що перевірено і чисте (не борг)

- Knip / janitors / AI-LEGACY: чисті на baseline 2026-07-01; entropy-janitor issues — none у snapshot 2026-07-20.
- Server + web `no-strict-bypass` allowlist порожній; mobile type-bypass allowlist порожній.
- Coverage floors: web **89**, mobile **30**, api-client 73, routine-domain 74.
- Production-`any` web = **2** by-design; Express **5.2**; TS **6.0.3** усі apps.
- Історичний assessment 2026-06-05 (md+json) — у [`archive/`](./archive/).
