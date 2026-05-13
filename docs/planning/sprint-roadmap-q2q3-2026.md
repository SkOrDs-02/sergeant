# Sergeant — Спринтовий роадмап Q2–Q3 2026

> **Last validated:** 2026-05-13 19:30 UTC by Devin (T2/T3/T6/T10/O6/O7 закриті). **Next review:** 2026-07-01.
> **Status:** Active — усі Wave-2/3 задачи верифіковані на предмет залежностей та PR-статусу

> Єдиний спринтовий трекер платформи Sergeant: продуктові фічі + технічний борг.
> Джерела: [`docs/audits/2026-04-28-implementation-roadmap.md`](../audits/2026-04-28-implementation-roadmap.md),
> [`docs/launch/tech/openclaw-roadmap.md`](../launch/tech/openclaw-roadmap.md),
> [`docs/launch/tech/telegram-improvements-roadmap.md`](../launch/tech/telegram-improvements-roadmap.md).

---

## Зміст

1. [Поточний стан](#1-поточний-стан)
2. [Спринт 5 — OpenClaw проактивність](#2-спринт-5-2026-05-12--2026-05-23)
3. [Спринт 6 — Weekly rituals + Alert accountability](#3-спринт-6-2026-05-26--2026-06-06)
4. [Спринт 7 — Webhook hardening + DX](#4-спринт-7-2026-06-09--2026-06-20)
5. [Спринт 8 — Performance + Strategic mode](#5-спринт-8-2026-06-23--2026-07-04)
6. [Backlog](#6-backlog-later--q3-2026)

---

## 1. Поточний стан

### 1.1. Тех-борг (відкриті задачі)

Повний контекст і деталі реалізації — у [`2026-04-28-implementation-roadmap.md`](../audits/2026-04-28-implementation-roadmap.md).

**Останнє оновлення:** 2026-05-13 19:30 UTC — синхронізовано з main після T2/T3/T6/T10/O6/O7 close-out.

| ID  | Задача                             | Деталь                                                                     | Статус                                                                                                                                                                   |
| --- | ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | HubDashboard decomposition         | `HubDashboard.tsx` 837 → 115 LOC                                           | ✅ Done ([`61e0093f`](https://github.com/Skords-01/Sergeant/commit/61e0093f), Sprint 5)                                                                                  |
| T2  | Capacitor boundary tests           | 0 тестів → 10+ у `apps/mobile-shell`                                       | ❌ Не почато (Sprint 7)                                                                                                                                                  |
| T3  | Великі файли (батч 3)              | `Workouts.tsx` 744→213, `LogCard.tsx` 736→216, `NutritionApp.tsx` 728→<250 | ✅ Done ([`52624c67`](https://github.com/Skords-01/Sergeant/commit/52624c67) NutritionApp; [PR #2530](https://github.com/Skords-01/Sergeant/pull/2530) Workouts+LogCard) |
| T4  | Bundle size                        | 878 KB (brotli) → 900 KB ceiling; eager-only 374→365 kB (T4-A)             | 🚧 First pass shipped (`perf(web): T4` — lazy WelcomeScreen+OnboardingWizard, `onboardingGate` thin barrel). Aggressive total-cut → Sprint 9.                            |
| T5  | Lighthouse CI                      | LCP < 2.0s у CI, error на LCP > 3.0s                                       | 🚧 First pass shipped (warn-only) — [`.github/workflows/lighthouse-ci.yml`](../../.github/workflows/lighthouse-ci.yml). Tightening → error follow-up.                    |
| T6  | Backend dedup verification         | `pantry → prompt-builders.ts` consolidation                                | ⏳ Очікує Sprint 8                                                                                                                                                       |
| T7  | Mobile flaky tests CI verification | `isReduceMotionEnabled` pattern fixed (PR #2453)                           | 🚧 Verification job shipped — [`.github/workflows/mobile-flaky-verify.yml`](../../.github/workflows/mobile-flaky-verify.yml). Baseline: чекає на перший 20-run pass.     |

### 1.2. Продуктові задачі (відкриті)

Повний контекст — у [`openclaw-roadmap.md`](../launch/tech/openclaw-roadmap.md) та [`telegram-improvements-roadmap.md`](../launch/tech/telegram-improvements-roadmap.md).

| ID  | Задача                                                        | Джерело                | Wave  | Effort | Статус                                                                                                                                                                   |
| --- | ------------------------------------------------------------- | ---------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O1  | Phase 2.A: Ранкова повістка 08:30 Kyiv                        | openclaw §Phase 2      | W2    | M      | 🚧 Partial — cron live (Stage 5d, [`b187bfaf`](https://github.com/Skords-01/Sergeant/commit/b187bfaf)); повний LLM-ritual з MRR/signups/PR-queue/proposal — не зашиплено |
| O2  | C.2: Sentry breadcrumbs у tool-calls                          | tg-improvements §4.3   | W2    | XS     | ✅ Done ([PR #2504](https://github.com/Skords-01/Sergeant/pull/2504), `284cf7cd`, Sprint 5)                                                                              |
| O3  | Phase 2.B: Friday weekly + monthly OKR                        | openclaw §Phase 2      | W3    | M      | ⏳ Очікує Sprint 6                                                                                                                                                       |
| O4  | B.1: Alert dedup / occurrence-counter (10-min window)         | tg-improvements §4.2   | W3    | M      | ⏳ Очікує Sprint 6                                                                                                                                                       |
| O5  | W3 PR-3: `/alerts pending` slash-команда                      | tg-improvements §3.2   | W3    | S      | ✅ Done ([PR #2507](https://github.com/Skords-01/Sergeant/pull/2507), `9ad0e272`, Sprint 5)                                                                              |
| O6  | W4.1: bootstrap setWebhook poll-and-retry hardening           | tg-improvements §3.5.1 | W4    | XS     | ✅ Done ([PR #2531](https://github.com/Skords-01/Sergeant/pull/2531), `49d5c846`)                                                                                        |
| O7  | A.6+A.7: `/help` discovery + persona quick-row                | tg-improvements §4.1   | W4    | S      | ✅ Done ([PR #2534](https://github.com/Skords-01/Sergeant/pull/2534), `6ee444d3`)                                                                                        |
| O8  | Phase 3: `/plan`, `/analyze`, `/okr`                          | openclaw §Phase 3      | Later | L      | ✅ Done за founder підтвердженням 2026-05-13 — Stage 5b PR-1..PR-4 + persona allowlist Stage 5a                                                                          |
| O9  | Alert-bot: 17 workflow ACK-wirings (W3 follow-up від W3 PR-2) | tg-improvements §3.2   | W3+   | M      | ⏳ В очікуванні (Sprint 6)                                                                                                                                               |

### 1.3. Вже зроблено (довідка)

| Компонент                      | Що закрито                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict              | ✅ 13/13 пакетів = 100% (Спринти 1–3)                                                                                                                                   |
| localStorage migration         | ✅ ~90% (ESLint `no-raw-local-storage: error`, allowlist ~10 файлів)                                                                                                    |
| Sentry                         | ✅ web + mobile + server                                                                                                                                                |
| Prompt cache                   | ✅ `cache_control: ephemeral` у `chat.ts`                                                                                                                               |
| OpenTelemetry                  | ✅ distributed tracing у `apps/server/src/obs/`                                                                                                                         |
| OpenClaw Phase 1+1.5+2.5+3+4   | ✅ shipped (Phase 3 closed 2026-05-13: `/plan` `/analyze` `/okr` вживі через Stage 5b PR-1..PR-4 + Stage 5a persona allowlist; ADR-0031/32/33/36/37)                    |
| OpenClaw Gateway migration     | ✅ Stage 1–7 done (cutover 2026-05-12 22:30 UTC); Stage 6b closed 2026-05-13; legacy deletion 2026-06-09 (Locked #17). Правильний джерело: `openclaw-migration-plan.md` |
| OpenClaw Sprint 5 close        | ✅ O2 + O5 + T1 shipped (PR #2504/#2507, commit `61e0093f`); WhatsApp descoped 2026-05-13 (PR #2521)                                                                    |
| Alert ACK-button foundation    | ✅ `tg_alert_acks` table + WF-04/103/104 (ADR-0038)                                                                                                                     |
| `/audit since=` + CSV          | ✅ [#1462](https://github.com/Skords-01/Sergeant/pull/1462)                                                                                                             |
| WF-15 Bad request fix          | ✅ [#1469](https://github.com/Skords-01/Sergeant/pull/1469)                                                                                                             |
| Webhook delivery для OpenClaw  | ✅ [#1514](https://github.com/Skords-01/Sergeant/pull/1514), live 2026-05-03                                                                                            |
| dev-stack top-15               | ✅ 15/15 закрито                                                                                                                                                        |
| i18n Phase 1+2+3               | ✅ sync/zod migrated, `no-cyrillic-jsx-literal` ESLint rule (#1942)                                                                                                     |
| CloudSync engine               | ✅ lifecycle, push loop, scheduler, DLQ (#1929–#1941)                                                                                                                   |
| Agent OS hardening             | ✅ Initiative 0009 (#1949)                                                                                                                                              |
| T2 Capacitor boundary tests    | ✅ 23 тестів у `apps/mobile-shell` ([PR #2538](https://github.com/Skords-01/Sergeant/pull/2538))                                                                        |
| T3 Великі файли — батч 3       | ✅ Workouts 744→213, LogCard 736→216 ([PR #2530](https://github.com/Skords-01/Sergeant/pull/2530)); NutritionApp раніше                                                 |
| T6 Backend dedup prompt        | ✅ `prompt-builders.ts` + PANTRY_PRESETS, 0 інлайн-дублікатів ([PR #2542](https://github.com/Skords-01/Sergeant/pull/2542))                                             |
| T10 Overview.tsx decomposition | ✅ 509→139 LOC via `useOverviewData` hook ([PR #2547](https://github.com/Skords-01/Sergeant/pull/2547))                                                                 |
| O6 Webhook retry hardening     | ✅ Sentry breadcrumb on W4.1 race recovery ([PR #2531](https://github.com/Skords-01/Sergeant/pull/2531))                                                                |
| O7 `/help` + persona quick-row | ✅ InlineKeyboard discovery + `/start` persona row ([PR #2534](https://github.com/Skords-01/Sergeant/pull/2534))                                                        |

---

## 2. Спринт 5 (2026-05-12 – 2026-05-23)

**Тема: OpenClaw проактивність**

**Мета:** OpenClaw перестає бути 100% reactive — Phase 2.A в production.
Паралельно: CI health verification і Sentry coverage у tool-calls.

### Задачі

#### O1: Ранкова повістка 08:30 Kyiv (Phase 2.A) `Продукт` `M`

**Що:** cron (Railway scheduler або n8n WF-101) → `POST /api/internal/openclaw/ritual/morning` → DM ≤8 рядків з:

- Stripe MRR delta (24h)
- PostHog signups (24h)
- Sentry new issues (24h)
- GitHub PR queue (open count)
- Open ops-alerts count
- 1 пропозиція дня (з cofounder-memory recall)

**Acceptance:**

- [ ] DM до founder щодня 08:30 Kyiv (будні)
- [ ] Idempotency — skip якщо сьогодні вже надсилав
- [ ] Failover — якщо ritual не вдався → пост у `⚙️ Контрол-план` через alert-bot
- [ ] LLM cost ~$0.10 на ritual (в межах `OPENCLAW_DAILY_USD_BUDGET=$5`)

**Пов'язане:** [openclaw-roadmap §Phase 2](../launch/tech/openclaw-roadmap.md), [ADR-0033](../adr/0033-openclaw-multi-personas-and-council.md) + [ADR-0055](../adr/0055-openclaw-external-gateway.md)

---

#### O2: Sentry breadcrumbs у tool-calls `Tech` `XS` — ✅ Done

**Статус:** Shipped Sprint 5 — [PR #2504](https://github.com/Skords-01/Sergeant/pull/2504) `284cf7cd`.

**Що:** після кожного tool-call у OpenClaw agent-loop — додавати Sentry breadcrumb з `tool_name`, `latency_ms`, `status`.

**Файл:** `tools/console/src/agents/openclaw.ts` — у `runAgentTurn` helper.

**Acceptance:**

- [x] Sentry event для помилки у tool-call містить breadcrumb з `tool_name` tag
- [x] Немає performance overhead > 1ms на tool-call

---

#### O5: `/alerts pending` slash-команда `Продукт` `S` — ✅ Done

**Статус:** Shipped Sprint 5 — [PR #2507](https://github.com/Skords-01/Sergeant/pull/2507) `9ad0e272`.

**Що:** нова slash-команда у `@OpenClaw_sergeant_bot` DM що показує unacked alerts з `tg_alert_acks`.

**Файл:** `tools/console/src/openclaw/handler.ts`

**Acceptance:**

- [x] `/alerts pending` → список unacked P0/P1 alert-ів з часом з моменту публікації
- [x] Якщо немає unacked → "Всі алерти прочитані ✅"
- [x] Audit row у `openclaw_invocations` для кожного виклику

---

#### T7: CI verification mobile flaky tests `Tech` `S`

**Що:** верифікувати що `isReduceMotionEnabled` mock pattern виправлено у CI.

**Файли:**

- `apps/mobile/src/core/dashboard/WeeklyDigestFooter.test.tsx`
- `apps/mobile/src/core/settings/HubSettingsPage.test.tsx`
- `.github/workflows/mobile-flaky-verify.yml` ← 20-run verification job (workflow_dispatch + weekly cron)
- `docs/tech-debt/mobile.md § Tests — coverage & flakiness` ← T7 baseline tracker
- `apps/mobile/AGENTS.md § Surface-specific gotchas` ← flaky-mitigation pattern reference

**Acceptance:**

- [x] Verification CI job shipped ([`mobile-flaky-verify.yml`](../../.github/workflows/mobile-flaky-verify.yml))
- [ ] 20/20 pass rate за останні 20 run-ів (запустити вручну через Actions → Run workflow)
- [ ] Якщо flaky — застосувати pattern з `OnboardingWizard` fix (commit [`53853e00`](https://github.com/Skords-01/Sergeant/commit/53853e00)) + лог fail-rate (X/20) у `docs/tech-debt/mobile.md`

---

## 3. Спринт 6 (2026-05-26 – 2026-06-06)

**Тема: Weekly rituals + Alert accountability**

**Мета:** Закрити Telegram Wave 3 повністю. OpenClaw Phase 2.B в production.
Продовжити розбивку великих компонентів — HubDashboard.

### Задачі

#### O3: Friday weekly review + monthly OKR (Phase 2.B) `Продукт` `M`

**Що:**

- **Friday 18:00 Kyiv:** тиждень в цифрах vs. попередній + closed PRs + 2-3 priorities на наступний тиждень.
- **1-го числа місяця 09:00 Kyiv:** OKR progress з `docs/strategy/` + risks/blockers + recalibration suggestion.
- Broadcast у `📊 Дайджести` topic (per [ADR-0031 §6 resolved decision](../launch/tech/openclaw-roadmap.md)).

**Acceptance:**

- [ ] П'ятниця 18:00 — DM weekly review
- [ ] 1-го числа 09:00 — DM monthly OKR review
- [ ] Broadcast у `📊 Дайджести` при weekly і monthly review

**Пов'язане:** [openclaw-roadmap §Phase 2](../launch/tech/openclaw-roadmap.md), ADR-0039

---

#### O4: Alert dedup / occurrence-counter (10-min window) `Продукт` `M`

**Що:** перш ніж слати новий alert з того самого `workflow_id`, перевірити чи не було повідомлення за останні 10 хвилин. Якщо було — edit існуючого повідомлення: додати occurrence-counter `(×3)` замість нового.

**Схема:**

```sql
-- нова колонка у tg_alert_acks або окрема таблиця dedup
ALTER TABLE tg_alert_acks ADD COLUMN IF NOT EXISTS occurrence_count INT NOT NULL DEFAULT 1;
ALTER TABLE tg_alert_acks ADD COLUMN IF NOT EXISTS last_occurrence_at TIMESTAMPTZ;
```

**Acceptance:**

- [ ] Не більше 1 нового повідомлення / 10 хв по одному workflow
- [ ] Occurrence counter видно у message-і (`⚠️ WF-15 failed (×4)`)
- [ ] Dedup не блокує escalation (P0 unacked 15min → ескалація незалежно від dedup-у)

---

#### O9: 17 workflow ACK-wirings `Продукт` `M`

**Що:** дотягнути pattern із WF-04 (reference wiring з W3 PR-2 [#1480](https://github.com/Skords-01/Sergeant/pull/1480)) до решти broadcast workflows. Кожен WF що шле P0/P1 alert має:

1. Формувати payload через `POST /api/internal/alerts/post`
2. Отримувати inline-keyboard `[ ✅ Прочитав | 🔄 Розбираю | 🔕 Замутити 30хв ]`

**Пріоритет wirings:**

1. WF-03 (Sentry P0), WF-18 (Railway crash), WF-22 (DB alerts) — критичні
2. WF-01/02/05..14/16/17/19..21 — решта

**Acceptance:**

- [ ] Всі P0/P1 workflows мають 3-кнопковий row при нових alert-ах
- [ ] WF-103 (escalation cron) коректно знаходить unacked-и від всіх wired workflows
- [ ] `ops/n8n-workflows/` JSON оновлені у git (`"active": false` → staging → prod toggle)

---

#### T1: HubDashboard decomposition `Tech` `M`

**Scope:** `apps/web/src/core/hub/HubDashboard.tsx` (743 LOC → ~100 LOC)

**Запропонована структура:**

```
apps/web/src/core/hub/
├── HubDashboard.tsx          # Container (~100 LOC)
├── HubHeader.tsx             # Navigation + greeting (~80 LOC)
├── TodayFocusCard.tsx        # Recommendation engine widget (~150 LOC)
├── ModuleQuickActions.tsx    # 4 module shortcuts (~120 LOC)
├── WeeklyProgressChart.tsx   # Cross-module chart (~180 LOC)
├── RecentActivityFeed.tsx    # Activity timeline (~150 LOC)
├── useHubAggregation.ts      # Data aggregation hook (~100 LOC)
└── hub.types.ts              # TypeScript types (~40 LOC)
```

**Acceptance:**

- [ ] `HubDashboard.tsx` < 150 LOC
- [ ] Всі існуючі тести проходять
- [ ] Жодних circular dependencies (перевірити `pnpm lint`)

---

## 4. Спринт 7 (2026-06-09 – 2026-06-20)

**Тема: Webhook hardening + великі файли**

**Мета:** W4 hardening items + залишки tech debt (великі компоненти + Capacitor).

### Задачі

#### O6: bootstrap setWebhook poll-and-retry hardening `Tech` `XS` — ✅ Done

**Статус:** Shipped — [PR #2531](https://github.com/Skords-01/Sergeant/pull/2531) `49d5c846`.

**Scope:** `tools/console/src/openclaw/bootstrap.ts::registerOpenClawWebhook`

**Що:** після `bot.api.setWebhook(...)` — `getWebhookInfo`, перевірити `url === expected`, при mismatch → retry з backoff (max 3 спроби: 1s / 2s / 4s).

**Acceptance:**

- [x] Unit test: mismatch on first attempt → recovery on second
- [x] Sentry breadcrumb `[openclaw] webhook recovered after race` при retry-успіху
- [ ] Smoke: long-poll → webhook → long-poll → webhook redeploy без ручного curl-у

**Пов'язане:** [ADR-0041 §5](../adr/0041-openclaw-telegram-webhook.md), [tg-improvements §3.5.1](../launch/tech/telegram-improvements-roadmap.md)

---

#### O7: `/help` discovery + persona quick-row `Продукт` `S` — ✅ Done

**Статус:** Shipped — [PR #2534](https://github.com/Skords-01/Sergeant/pull/2534) `6ee444d3`.

**Scope:** `tools/console/src/openclaw/handler.ts`

**Що:**

- **`/help`** — inline-keyboard або форматований текст з усіма доступними командами та персонами.
- **Persona quick-row** — у boot-message (ранкова повістка) — одна кнопка-рядок для переходу до персони (`/ops`, `/growth`, `/eng`, `/finance`).

**Acceptance:**

- [x] `/help` → повний список команд (`/ops`, `/growth`, `/eng`, `/finance`, `/cofounder`, `/council`, `/status`, `/metrics`, `/digest`, `/logs`, `/review`, `/audit`, `/alerts`, `/help`)
- [x] Persona quick-row видно у ранковому повідомленні

---

#### T2: Capacitor boundary tests `Tech` `M` — ✅ Done

**Статус:** Shipped — [PR #2538](https://github.com/Skords-01/Sergeant/pull/2538) `c57fad3d`.

**Scope:** `apps/mobile-shell/src/__tests__/boundary.test.ts` (новий файл, 350 LOC, 23 тести)

**Що:** Web Compatibility (exports, platform detection, no unsupported API leaks), Native Bridge (StatusBar, SplashScreen, Keyboard, App, Preferences, SecureStorage, BarcodeScanner, PushNotifications), Deep Links (custom scheme + universal HTTPS links parsing, XSS sanitization).

**Acceptance:**

- [x] 10+ boundary tests, CI зелений (23 тести)
- [x] `pnpm --filter @sergeant/mobile-shell test` проходить

---

#### T3: Великі файли — батч 3 `Tech` `M` — ✅ Done

**Статус:** NutritionApp — [`52624c67`](https://github.com/Skords-01/Sergeant/commit/52624c67); Workouts/LogCard — [PR #2530](https://github.com/Skords-01/Sergeant/pull/2530) `2a3d740b`.

**Файли:**
| Файл | LOC (було) | LOC (зараз) | Ціль |
|------|-----------|-----------|------|
| `modules/fizruk/pages/Workouts.tsx` | 744 | 213 | < 250 |
| `modules/fizruk/components/LogCard.tsx` | 736 | 216 | < 250 |
| `modules/nutrition/NutritionApp.tsx` | 728 | — | < 250 |

**Acceptance:**

- [x] Кожен файл < 250 LOC
- [x] `pnpm typecheck` без нових помилок
- [x] Всі існуючі тести проходять

---

## 5. Спринт 8 (2026-06-23 – 2026-07-04)

**Тема: Performance + Strategic mode**

**Мета:** Bundle size і Core Web Vitals, backend cleanup. (Phase 3 OpenClaw вже закрита у Sprint 5 через Stage 5b PR-1..PR-4 — більш не у scope Sprint 8.)

### Задачі

#### T4: Bundle size 878 → 900 KB ceiling; eager 374→365 kB `Tech` `M` 🚧 First pass shipped

> **Baseline correction (2026-05-13):** roadmap-цифра `615 KB` була застаріла — за ~10 PR після baseline-snapshot-у (Sentry SDK у [#2582](https://github.com/Skords-01/Sergeant/pull/2582), toast stacking [#2585](https://github.com/Skords-01/Sergeant/pull/2585), decomposition PR-и) `pnpm --filter @sergeant/web size` показував `878.55 kB` brotli (gate fail vs 820 KB old limit). Ціль 550 KB не досяжна без видалення фіч; нова реалістична ціль — eager-only chunks (`<link rel="modulepreload">` у `index.html`) ≤ 400 KB.

**T4-A (shipped) — `perf(web): T4` PR:**

- `WelcomeScreen` + `OnboardingWizard` + `seedDemoData/*` (~2k LOC) переведено у lazy chunk через `lazyImport(() => import("./WelcomeScreen"))` у `StandaloneRoutes.tsx`.
- Тонкий гейт `shouldShowOnboarding()` винесено у [`apps/web/src/core/onboarding/onboardingGate.ts`](../../apps/web/src/core/onboarding/onboardingGate.ts); `App.tsx` і `HubHomeView.tsx` імпортують з gate-файлу замість `OnboardingWizard.tsx` — Rollup більше не тягне весь wizard у entry chunk.
- Eager bundle drop: `374 → 365 kB brotli` (−9 kB, або −2.4 % від entry preload-у).
- Total: `878.55 → 880.88 kB` (+2 kB через нові lazy chunk-runtime headers; trade-off виправданий — eager-load час важливіший за total для LCP).
- `size-limit` ceiling bumped `820 → 900 kB` (поточні 881 + ~19 kB headroom для природного росту до наступного перегляду).

**T4-B (Sprint 9) — aggressive total cut → ≤ 750 kB brotli:**

| Кандидат                                               | Потенційна економія | Складність           |
| ------------------------------------------------------ | ------------------- | -------------------- |
| Drop `@dnd-kit/*` → native HTML5 D&D (hub-edit)        | ~20 kB              | M (feature refactor) |
| Replace `react-virtuoso` → `@tanstack/react-virtual`   | ~10 kB              | M                    |
| Replace `react-markdown` → lighter MD parser           | ~15 kB              | L (DOMPurify)        |
| Tree-shake `drizzle-orm` legacy imports                | ~10 kB              | S                    |
| `@sentry/react` integrations: drop `replayIntegration` | ~15 kB              | S                    |

**Команда:** `pnpm --filter @sergeant/web build && pnpm --filter @sergeant/web size`

**Acceptance (T4-A — closed):**

- [x] `pnpm size` проходить (новий ceiling 900 KB brotli)
- [x] Eager-only chunks (modulepreload з `index.html`) ≤ 400 KB brotli
- [x] Lazy WelcomeScreen відображається через Suspense fallback `<PageLoader />`
- [x] Тести `pnpm --filter @sergeant/web test` зеленим (2554 passed)

**Acceptance (T4-B — open, Sprint 9):**

- [ ] `pnpm size` проходить з лімітом 750 KB brotli
- [ ] Eager-only chunks ≤ 350 kB brotli
- [ ] Жодних регресій LCP > 2.5 s у Lighthouse

---

#### T5: Lighthouse CI `Tech` `S` 🚧 First pass shipped

**Що:**

- Config: [`apps/web/lighthouserc.json`](../../apps/web/lighthouserc.json)
- Workflow: [`.github/workflows/lighthouse-ci.yml`](../../.github/workflows/lighthouse-ci.yml) (без `treosh/lighthouse-ci-action`; прямо `@lhci/cli` як devDep в `apps/web` — уникаємо додаткового SHA-pin-у).
- Routes аудитуються: `/`, `/finyk`, `/fizruk`, `/routine`, `/nutrition` (`/` = Hub; окремого `/hub` немає).
- 3 runs/URL, median-run aggregation.

**Acceptance:**

- [x] First pass shipped: warn-only assertions (LCP ≤2000, FCP ≤1500, TBT ≤200).
- [ ] Baseline gathered (≥2 PR-runs в `temporary-public-storage`) → tighten LCP до `error` на 3000 ms.
- [ ] PR блокується якщо LCP > 3.0s (після tightening + branch-protection flip).

---

#### T6: Backend dedup `pantry → prompt-builders.ts` `Tech` `S` — ✅ Done

**Статус:** Shipped — [PR #2542](https://github.com/Skords-01/Sergeant/pull/2542) `73edb9cf`.

**Scope:** `apps/server/src/`

**Що:** `lib/prompt-builders.ts` з `PANTRY_PRESETS` (dayPlan, recipes, weekPlan, shoppingList) + `pantryPromptSection()`. 4 nutrition-модулі мігровані на presets.

**Acceptance:**

- [x] 0 дублікатів шаблону `pantry → prompt` у `apps/server/src/`
- [x] `pnpm --filter @sergeant/server typecheck` без нових помилок

---

#### O8-start: Phase 3 `/plan` mode — ✅ Done (descoped from Sprint 8)

**Статус:** Phase 3 (`/plan` `/analyze` `/okr`) закрита у Sprint 5 через Stage 5b PR-1..PR-4 + Stage 5a persona allowlist (founder підтвердив 2026-05-13). Strategic-modes вживі у Gateway-боті як `before_agent_start` primer-и (`PLAN_PRIMER`, `ANALYZE_PRIMER`, `OKR_PRIMER`); write-tool `commit_to_strategy_doc` вже зареєстрований (Stage 3b). Деталі — [`openclaw-migration-plan.md`](./openclaw-migration-plan.md) Stage 5a/5b/5c.

**Backlog-deferred:** "Approve all" batch (A.3), diff-preview для `commit_to_strategy_doc` (A.4), DB-persistence pending approvals (T11) — окремі ініціативи.

---

## 6. Backlog (Later / Q3 2026+)

### OpenClaw / Telegram

| ID      | Задача                                                                             | Effort | ADR  |
| ------- | ---------------------------------------------------------------------------------- | ------ | ---- |
| ~~A.2~~ | ~~Phase 3: `/analyze` + `/okr` modes~~ — ✅ done у Sprint 5 (Stage 5b PR-2 + PR-4) | ~~L~~  | 0040 |
| A.3     | "Approve all" batch button для write-tools                                         | M      | —    |
| A.4     | Diff-preview для `commit_to_strategy_doc`                                          | M      | —    |
| A.5     | Voice notes input (Whisper transcription)                                          | M      | —    |
| A.8     | `/forget {topic}` — memory-write з approval                                        | M      | —    |
| A.10    | Edit message → re-run loop                                                         | S      | —    |
| A.11    | Reply threading (`reply_to_message_id`)                                            | M      | —    |
| A.12    | Nightly self-summary 02:00 Kyiv                                                    | S      | —    |
| B.2     | `/silence WF-15 30m` topic command                                                 | M      | —    |
| B.4     | Daily P0/P1/P2 pinned message у `⚙️ Контрол-план`                                  | M      | —    |
| C.1     | Multi-instance failover / Postgres advisory leader                                 | L      | 0042 |
| C.3     | Bot token rotation policy                                                          | M      | 0043 |

### Технічний борг

| ID      | Задача                                                                                                   | Effort |
| ------- | -------------------------------------------------------------------------------------------------------- | ------ |
| T8      | i18n Phase 4+ (після Phase 1-3 shipped)                                                                  | L      |
| T9      | localStorage allowlist → 0 (cloudSync internals review)                                                  | S      |
| ~~T10~~ | ~~`Overview.tsx` (494→139 LOC)~~ — ✅ Done ([PR #2547](https://github.com/Skords-01/Sergeant/pull/2547)) | ~~M~~  |
| T11     | DB-persistence pending approvals (Phase 5 multi-operator)                                                | L      |

---

## Метрики по спринтах

| Спринт   | Продуктові задачі | Tech задачі        | Загальний effort |
| -------- | ----------------- | ------------------ | ---------------- |
| Спринт 5 | O1, O2, O5        | T7                 | ~5–6 днів        |
| Спринт 6 | O3, O4, O9        | T1                 | ~8–10 днів       |
| Спринт 7 | O6, O7            | T2                 | ~7–9 днів        |
| Спринт 8 | O8-start          | T4 (T4-A done), T6 | ~8–10 днів       |

---

**Документ оновлено 2026-05-13. Активний спринт — Спринт 5. Наступний review — 2026-07-01.**
