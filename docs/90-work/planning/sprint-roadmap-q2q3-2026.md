# Sergeant — Спринтовий роадмап Q2–Q3 2026

> **Last validated:** 2026-05-31 by Claude (child session — Спринт 8 close-out звірка: T4-B react-markdown swap підтверджено shipped; решта cuts (@dnd-kit / react-virtuoso / vendor-sqlite-lazy / drizzle tree-shake / replayIntegration drop) — досі open у коді; size gate дрейфнув 870→880 kB; T5 Lighthouse — досі warn-only. Раніше того ж дня — Спринт 6 close-out: O4 dedup + T1 HubDashboard зашиплені; O3 first-pass). Раніше: 2026-05-13 by Devin (T5 closed; T2/T3/T6/T10/O6/O7 закриті раніше). **Next review:** 2026-07-01.
> **Status:** Active — Спринти 6-7 реалізаційно закриті; Спринт 8 частковий (T4-A + T4-B react-markdown + T6 shipped; решта T4-B cuts + T5 tightening open); за календарем активне вікно — Спринт 7

> Єдиний спринтовий трекер платформи Sergeant: продуктові фічі + технічний борг.
> Джерела: [`docs/90-work/audits/archive/2026-04-28-implementation-roadmap.md`](../audits/archive/2026-04-28-implementation-roadmap.md),
> [`docs/01-product/launch/tech/openclaw-roadmap.md`](../../01-product/launch/tech/openclaw-roadmap.md),
> [`docs/01-product/launch/tech/telegram-improvements-roadmap.md`](../../01-product/launch/tech/telegram-improvements-roadmap.md).

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

Повний контекст і деталі реалізації — у [`2026-04-28-implementation-roadmap.md`](../audits/archive/2026-04-28-implementation-roadmap.md).

**Останнє оновлення:** 2026-05-13 — T5 closed (Lighthouse CI workflow shipped); раніше в цей день синхронізовано з main після T2/T3/T6/T10/O6/O7 close-out.

| ID  | Задача                             | Деталь                                                                                     | Статус                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | HubDashboard decomposition         | `HubDashboard.tsx` 837 → 115 LOC                                                           | ✅ Done ([`61e0093f`](https://github.com/Skords-01/Sergeant/commit/61e0093f), Sprint 5)                                                                                                                                                                                   |
| T2  | Capacitor boundary tests           | 0 тестів → 10+ у `apps/mobile-shell`                                                       | ✅ Done ([PR #2538](https://github.com/Skords-01/Sergeant/pull/2538), `c57fad3d`)                                                                                                                                                                                         |
| T3  | Великі файли (батч 3)              | `Workouts.tsx` 744→213, `LogCard.tsx` 736→216, `NutritionApp.tsx` 728→<250                 | ✅ Done ([`52624c67`](https://github.com/Skords-01/Sergeant/commit/52624c67) NutritionApp; [PR #2530](https://github.com/Skords-01/Sergeant/pull/2530) Workouts+LogCard)                                                                                                  |
| T4  | Bundle size                        | 856 KB (brotli) → 880 KB ceiling (виріс 870→880 post-T4-B); eager-only 374→342 kB (T4-A+B) | 🚧 T4-A shipped (lazy WelcomeScreen+OnboardingWizard, `onboardingGate` thin barrel). T4-B partial: react-markdown → inline parser (−30 kB total, verified 2026-05-31). Решта cuts (@dnd-kit / react-virtuoso / vendor-sqlite-lazy / drizzle / replay) — open → Sprint 10. |
| T5  | Lighthouse CI                      | LCP < 2.0s у CI, error на LCP > 3.0s                                                       | ✅ First pass shipped (warn-only) — [`.github/workflows/lighthouse-ci.yml`](../../../.github/workflows/lighthouse-ci.yml) (2026-05-13). Tightening LCP `warn` → `error` 3000 ms — baseline-gathered follow-up.                                                            |
| T6  | Backend dedup verification         | `pantry → prompt-builders.ts` consolidation                                                | ✅ Done ([PR #2542](https://github.com/Skords-01/Sergeant/pull/2542), `73edb9cf`)                                                                                                                                                                                         |
| T7  | Mobile flaky tests CI verification | `isReduceMotionEnabled` pattern fixed (PR #2453)                                           | 🚧 Verification job shipped — [`.github/workflows/mobile-flaky-verify.yml`](../../../.github/workflows/mobile-flaky-verify.yml). Baseline: чекає на перший 20-run pass.                                                                                                   |

### 1.2. Продуктові задачі (відкриті)

Повний контекст — у [`openclaw-roadmap.md`](../../01-product/launch/tech/openclaw-roadmap.md) та [`telegram-improvements-roadmap.md`](../../01-product/launch/tech/telegram-improvements-roadmap.md).

| ID  | Задача                                                        | Джерело                | Wave  | Effort | Статус                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------- | ---------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Phase 2.A: Ранкова повістка 08:30 Kyiv                        | openclaw §Phase 2      | W2    | M      | 🚧 Partial — cron live (Stage 5d, [`b187bfaf`](https://github.com/Skords-01/Sergeant/commit/b187bfaf)); повний LLM-ritual з MRR/signups/PR-queue/proposal — не зашиплено                                                                                                                                                                  |
| O2  | C.2: Sentry breadcrumbs у tool-calls                          | tg-improvements §4.3   | W2    | XS     | ✅ Done ([PR #2504](https://github.com/Skords-01/Sergeant/pull/2504), `284cf7cd`, Sprint 5)                                                                                                                                                                                                                                               |
| O3  | Phase 2.B: Friday weekly + monthly OKR                        | openclaw §Phase 2      | W3    | M      | 🚧 First pass shipped — endpoints + n8n WF-27/28 готові, активуй cron-и після OPENCLAW_BOT_TOKEN на n8n Railway                                                                                                                                                                                                                           |
| O4  | B.1: Alert dedup / occurrence-counter (10-min window)         | tg-improvements §4.2   | W3    | M      | ✅ Done — міграція [`060_tg_alert_acks_dedup_signature.sql`](../../../apps/server/src/migrations/060_tg_alert_acks_dedup_signature.sql) + dedup-логіка у [`telegramShipper.ts`](../../../apps/server/src/modules/alerts/telegramShipper.ts) (10-min sliding-window, `editMessageText` «🔁 N× за 10 хв»; escalation незалежна від dedup-у) |
| O5  | W3 PR-3: `/alerts pending` slash-команда                      | tg-improvements §3.2   | W3    | S      | ✅ Done ([PR #2507](https://github.com/Skords-01/Sergeant/pull/2507), `9ad0e272`, Sprint 5)                                                                                                                                                                                                                                               |
| O6  | W4.1: bootstrap setWebhook poll-and-retry hardening           | tg-improvements §3.5.1 | W4    | XS     | ✅ Done ([PR #2531](https://github.com/Skords-01/Sergeant/pull/2531), `49d5c846`)                                                                                                                                                                                                                                                         |
| O7  | A.6+A.7: `/help` discovery + persona quick-row                | tg-improvements §4.1   | W4    | S      | ✅ Done ([PR #2534](https://github.com/Skords-01/Sergeant/pull/2534), `6ee444d3`)                                                                                                                                                                                                                                                         |
| O8  | Phase 3: `/plan`, `/analyze`, `/okr`                          | openclaw §Phase 3      | Later | L      | ✅ Done за founder підтвердженням 2026-05-13 — Stage 5b PR-1..PR-4 + persona allowlist Stage 5a                                                                                                                                                                                                                                           |
| O9  | Alert-bot: 17 workflow ACK-wirings (W3 follow-up від W3 PR-2) | tg-improvements §3.2   | W3+   | M      | ✅ Done (W3 PR-4: 8 wirings — WF-08/15/16/30/60/63/98/99 — закривають 17-workflow set; routing map: `docs/03-operations/observability/alert-bot-routing.md`)                                                                                                                                                                              |

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
| O4 Alert dedup (10-min window) | ✅ Міграція `060_tg_alert_acks_dedup_signature` + `telegramShipper.ts` dedup/occurrence-counter; тести у `alerts/telegramShipper.test.ts` + `store.test.ts`             |
| T1 HubDashboard decomposition  | ✅ `HubDashboard.tsx` → 116 LOC; винесено `HubHeroBlock`/`HubInsightsBlock`/`HubModulesGrid` + `useHubDashboardState` hook + `hub.types.ts` + `dashboard/` subdir       |

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

**Пов'язане:** [openclaw-roadmap §Phase 2](../../01-product/launch/tech/openclaw-roadmap.md), [ADR-0033](../../04-governance/adr/0033-openclaw-multi-personas-and-council.md) + [ADR-0055](../../04-governance/adr/0055-openclaw-external-gateway.md)

---

#### O2: Sentry breadcrumbs у tool-calls `Tech` `XS` — ✅ Done

**Статус:** Shipped Sprint 5 — [PR #2504](https://github.com/Skords-01/Sergeant/pull/2504) `284cf7cd`.

**Що:** після кожного tool-call у OpenClaw agent-loop — додавати Sentry breadcrumb з `tool_name`, `latency_ms`, `status`.

**Файл:** `tools/openclaw/src/agents/openclaw.ts` — у `runAgentTurn` helper.

**Acceptance:**

- [x] Sentry event для помилки у tool-call містить breadcrumb з `tool_name` tag
- [x] Немає performance overhead > 1ms на tool-call

---

#### O5: `/alerts pending` slash-команда `Продукт` `S` — ✅ Done

**Статус:** Shipped Sprint 5 — [PR #2507](https://github.com/Skords-01/Sergeant/pull/2507) `9ad0e272`.

**Що:** нова slash-команда у `@OpenClaw_sergeant_bot` DM що показує unacked alerts з `tg_alert_acks`.

**Файл:** `tools/openclaw/src/openclaw/handler.ts`

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
- `docs/90-work/tech-debt/mobile.md § Tests — coverage & flakiness` ← T7 baseline tracker
- `apps/mobile/AGENTS.md § Surface-specific gotchas` ← flaky-mitigation pattern reference

**Acceptance:**

- [x] Verification CI job shipped ([`mobile-flaky-verify.yml`](../../../.github/workflows/mobile-flaky-verify.yml))
- [ ] 20/20 pass rate за останні 20 run-ів (запустити вручну через Actions → Run workflow)
- [ ] Якщо flaky — застосувати pattern з `OnboardingWizard` fix (commit [`53853e00`](https://github.com/Skords-01/Sergeant/commit/53853e00)) + лог fail-rate (X/20) у `docs/90-work/tech-debt/mobile.md`

---

## 3. Спринт 6 (2026-05-26 – 2026-06-06)

**Тема: Weekly rituals + Alert accountability**

**Мета:** Закрити Telegram Wave 3 повністю. OpenClaw Phase 2.B в production.
Продовжити розбивку великих компонентів — HubDashboard.

### Задачі

#### O3: Friday weekly review + monthly OKR (Phase 2.B) `Продукт` `M` 🚧 First pass shipped

**Що:**

- **Friday 18:00 Kyiv:** тиждень в цифрах vs. попередній + closed PRs + 2-3 priorities на наступний тиждень.
- **1-го числа місяця 09:00 Kyiv:** OKR progress з `docs/strategy/` + risks/blockers + recalibration suggestion.
- Broadcast у `📊 Дайджести` topic (per [ADR-0031 §6 resolved decision](../../01-product/launch/tech/openclaw-roadmap.md)).

**Acceptance:**

- [x] П'ятниця 18:00 — DM weekly review (endpoint `POST /api/internal/openclaw/ritual/weekly` + n8n WF-28 cron `0 18 * * 5 Europe/Kyiv`; markdown via LLMProvider claude-sonnet-4-6 з StubProvider fallback)
- [x] 1-го числа 09:00 — DM monthly OKR review (endpoint `POST /api/internal/openclaw/ritual/monthly` + n8n WF-27 cron `0 9 1 * * Europe/Kyiv`; INTERIM_OKRS hardcoded як fallback — PR-34 strategic_goals DB-table merged, follow-up може замінити на DB-query)
- [ ] Broadcast у `📊 Дайджести` topic (зараз — DM founder; topic broadcast — окремий follow-up)
- [ ] Активація на n8n Railway після `OPENCLAW_BOT_TOKEN` + `OPENCLAW_FOUNDER_TG_USER_ID` + `LLM_DIGEST_PROVIDER` сетапу

**Реалізація:**

- Server endpoints: `apps/server/src/modules/openclaw/weekly-review/` + `monthly-okr/`.
- n8n workflows: `ops/n8n-workflows/28-weekly-review-cron.json` + `27-monthly-okr-cron.json` (slot 26 зайняв PR-34 strategic_weekly cron).
- Hardcoded OKRs: `apps/server/src/modules/openclaw/monthly-okr/okrs.ts` (3 quarters: foundation-Q2-2026, reliability-Q2-2026, growth-Q3-2026). Treat as interim while PR-34 strategic_goals DB-table is in flight.
- Тести: weekly-review 21 unit tests (template + builder); monthly-okr 21 unit tests.

**Пов'язане:** [openclaw-roadmap §Phase 2](../../01-product/launch/tech/openclaw-roadmap.md), ADR-0039, PR-26 (morning briefing reference), PR-23 LLMProvider, PR-25 StubProvider fallback pattern

---

#### O4: Alert dedup / occurrence-counter (10-min window) `Продукт` `M` — ✅ Done

**Статус:** Shipped — міграція [`060_tg_alert_acks_dedup_signature.sql`](../../../apps/server/src/migrations/060_tg_alert_acks_dedup_signature.sql) (Created 2026-05-13) + dedup-логіка у [`telegramShipper.ts`](../../../apps/server/src/modules/alerts/telegramShipper.ts). Звірено з кодом у trunk 2026-05-31.

**Що:** перш ніж слати новий alert з того самого `workflow_id`, перевірити чи не було повідомлення за останні 10 хвилин. Якщо було — edit існуючого повідомлення: додати occurrence-counter `🔁 N×` замість нового.

**Реалізація:**

- Схема: `tg_alert_acks` розширено колонками `dedup_signature`, `occurrence_count` (DEFAULT 1), `last_occurrence_at`, `telegram_chat_id`, `telegram_message_id` (усі nullable/DEFAULT — Hard Rule #4-compatible; legacy writer без знання про dedup пише group-of-1).
- Shipper: `DEFAULT_DEDUP_WINDOW_MS = 10 хв`; при попаданні в `(topic, dedup_signature)` group у вікні — інкремент `occurrence_count` + `editMessageText` («🔁 N× за 10 хв:\n<text>»), інакше — новий post із seed-ом dedup-полів.
- Тести: `alerts/telegramShipper.test.ts` + `alerts/store.test.ts` (~1425 LOC сукупно).

**Acceptance:**

- [x] Не більше 1 нового повідомлення / 10 хв по одному `(topic, dedup_signature)` group
- [x] Occurrence counter видно у message-і (`🔁 N× за 10 хв`)
- [x] Dedup не блокує escalation — `findUnacked` (WF-103 cron) живе на `escalated_at IS NULL` і не залежить від dedup-вікна

---

#### O9: 17 workflow ACK-wirings `Продукт` `M` — ✅ Done (W3 PR-4)

**Що:** дотягнули pattern із WF-04 (reference wiring з W3 PR-2 [#1480](https://github.com/Skords-01/Sergeant/pull/1480)) до решти 16 broadcast workflows. Кожен WF що шле alert має:

1. Формувати payload через `POST /api/internal/alerts/post`
2. Отримувати inline-keyboard `[ ✅ Прочитав | 🔄 Розбираю | 🔕 Замутити 30хв ]`

**Послідовність wirings:**

1. W3 PR-2 [#1480](https://github.com/Skords-01/Sergeant/pull/1480) — WF-04 reference
2. W3 PR-3 batch 1 [#1503](https://github.com/Skords-01/Sergeant/pull/1503) — WF-03 (P0+P1), WF-18 (P1)
3. W3 PR-3 batch 2 — WF-01, WF-02, WF-05, WF-06, WF-17, WF-19
4. W3 PR-4 (O9) — WF-08, WF-15 (dynamic ops/incidents), WF-16, WF-30, WF-60, WF-63, WF-98 (alertId за `error_signature`), WF-99 (silent heartbeat)

**Acceptance:**

- [x] Всі 17 broadcast workflows мають 3-кнопковий row при нових alert-ах
- [x] WF-103 (escalation cron) коректно знаходить unacked-и від всіх wired workflows (uniform `alertId` shape per workflow)
- [x] `ops/n8n-workflows/` JSON оновлені у git (`"active": false` — staging → prod toggle лишається UI-only step)
- [x] Routing map зафіксована в `docs/03-operations/observability/alert-bot-routing.md` (workflow → topic/severity/alertId)

---

#### T1: HubDashboard decomposition `Tech` `M` — ✅ Done

**Статус:** Shipped — `HubDashboard.tsx` 116 LOC у trunk. Звірено з кодом 2026-05-31. (NB: рядок T1 у §1.1 вже позначав Sprint-5 close-out `61e0093f`; секцію Спринту 6 не було синхронізовано — виправлено цим оновленням.)

**Scope:** `apps/web/src/core/hub/HubDashboard.tsx` (837 → 116 LOC)

**Фактична структура** (відрізняється від попередньо запропонованої — мета < 150 LOC досягнута):

```
apps/web/src/core/hub/
├── HubDashboard.tsx          # Container (116 LOC)
├── HubHeroBlock.tsx          # Hero / greeting (141 LOC)
├── HubInsightsBlock.tsx      # Insights widget (141 LOC)
├── HubModulesGrid.tsx        # Module shortcuts grid (208 LOC)
├── useHubDashboardState.ts   # Data aggregation hook (533 LOC)
├── hub.types.ts              # TypeScript types (47 LOC)
└── dashboard/                # BentoCard + adaptiveSort + dashboardStore + moduleConfigs
```

**Acceptance:**

- [x] `HubDashboard.tsx` < 150 LOC (116)
- [x] Всі існуючі тести проходять (`HubDashboard.test.tsx` — мерджено через CI-gate)
- [x] Жодних circular dependencies (`pnpm lint` зелений у мердж-PR-ах)

---

## 4. Спринт 7 (2026-06-09 – 2026-06-20)

**Тема: Webhook hardening + великі файли**

**Мета:** W4 hardening items + залишки tech debt (великі компоненти + Capacitor).

### Задачі

#### O6: bootstrap setWebhook poll-and-retry hardening `Tech` `XS` — ✅ Done

**Статус:** Shipped — [PR #2531](https://github.com/Skords-01/Sergeant/pull/2531) `49d5c846`.

**Scope:** `tools/openclaw/src/openclaw/bootstrap.ts::registerOpenClawWebhook`

**Що:** після `bot.api.setWebhook(...)` — `getWebhookInfo`, перевірити `url === expected`, при mismatch → retry з backoff (max 3 спроби: 1s / 2s / 4s).

**Acceptance:**

- [x] Unit test: mismatch on first attempt → recovery on second
- [x] Sentry breadcrumb `[openclaw] webhook recovered after race` при retry-успіху
- [ ] Smoke: long-poll → webhook → long-poll → webhook redeploy без ручного curl-у

**Пов'язане:** [ADR-0041 §5](../../04-governance/adr/0041-openclaw-telegram-webhook.md), [tg-improvements §3.5.1](../../01-product/launch/tech/telegram-improvements-roadmap.md)

---

#### O7: `/help` discovery + persona quick-row `Продукт` `S` — ✅ Done

**Статус:** Shipped — [PR #2534](https://github.com/Skords-01/Sergeant/pull/2534) `6ee444d3`.

**Scope:** `tools/openclaw/src/openclaw/handler.ts`

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

#### T4: Bundle size 886 → 856 KB brotli; eager 374→342 kB (T4-A + T4-B partial) `Tech` `M` 🚧 In progress

> **Baseline correction (2026-05-13):** roadmap-цифра `615 KB` була застаріла — за ~10 PR після baseline-snapshot-у (Sentry SDK у [#2582](https://github.com/Skords-01/Sergeant/pull/2582), toast stacking [#2585](https://github.com/Skords-01/Sergeant/pull/2585), decomposition PR-и) `pnpm --filter @sergeant/web size` показував `878.55 kB` brotli (gate fail vs 820 KB old limit). Ціль 550 KB не досяжна без видалення фіч; нова реалістична ціль — eager-only chunks (`<link rel="modulepreload">` у `index.html`) ≤ 400 KB.

**T4-A (shipped) — `perf(web): T4` PR:**

- `WelcomeScreen` + `OnboardingWizard` + `seedDemoData/*` (~2k LOC) переведено у lazy chunk через `lazyImport(() => import("./WelcomeScreen"))` у `StandaloneRoutes.tsx`.
- Тонкий гейт `shouldShowOnboarding()` винесено у [`apps/web/src/core/onboarding/onboardingGate.ts`](../../../apps/web/src/core/onboarding/onboardingGate.ts); `App.tsx` і `HubHomeView.tsx` імпортують з gate-файлу замість `OnboardingWizard.tsx` — Rollup більше не тягне весь wizard у entry chunk.
- Eager bundle drop: `374 → 365 kB brotli` (−9 kB, або −2.4 % від entry preload-у).
- Total: `878.55 → 880.88 kB` (+2 kB через нові lazy chunk-runtime headers; trade-off виправданий — eager-load час важливіший за total для LCP).
- `size-limit` ceiling bumped `820 → 900 kB` (поточні 881 + ~19 kB headroom для природного росту до наступного перегляду).

**T4-B (Sprint 9, partial) — react-markdown swap shipped, more cuts queued:**

| Кандидат                                                | Статус                           | Економія |
| ------------------------------------------------------- | -------------------------------- | -------- |
| Replace `react-markdown` → inline MD parser             | ✅ зашиплено (`perf(web): T4-B`) | −30 kB   |
| Drop `@dnd-kit/*` → native HTML5 D&D (hub-edit)         | 🚧 open (M, feature refactor)    | ~20 kB   |
| Replace `react-virtuoso` → `@tanstack/react-virtual`    | 🚧 open (M)                      | ~10 kB   |
| Lazy `vendor-sqlite` → dynamic boot (kvStoreBoot split) | 🚧 open (L, ADR-grade)           | ~30 kB   |
| Tree-shake `drizzle-orm` legacy imports                 | 🚧 open (S)                      | ~10 kB   |
| `@sentry/react` integrations: drop `replayIntegration`  | 🚧 open (S)                      | ~15 kB   |

> **Звірка з кодом (2026-05-31):** react-markdown swap підтверджено — пакет відсутній у `apps/web/package.json`, `AssistantMessageBody.tsx` = inline-парсер. Решта 5 cuts **досі open** у trunk: `@dnd-kit/*` живе у `core/hub/{useHubDashboardState,HubModulesGrid,dashboard/BentoCard}.tsx`; `react-virtuoso` ще в deps, `@tanstack/react-virtual` не додано; `vendor-sqlite` boot не виокремлено (`core/db/{kvStoreBoot,sqlite}.ts`); `drizzle-orm` ще прямий web-dep; `replayIntegration` ще активний у `core/observability/sentry.ts`. Жоден cut не регресував і не зашиплений з 2026-05-13.

**T4-B shipped slice (2026-05-13):**

- `AssistantMessageBody.tsx` (HubChat) більше не залежить від `react-markdown` + всередини remark/mdast/hast/micromark/unified стеку. Замість нього — власний inline-парсер на ~250 LOC який покриває весь набір фічей (paragraphs, h3/h4 headings, ordered/unordered lists, blockquotes, bold/italic/code/safe links).
- 9 Vitest тестів припиняють граматику (включно з sandboxing-ом `javascript:` та unsafe-scheme link-ів).
- `vendor-markdown` chunk повністю зникає з `dist/assets/*.js`. Total brotli: `886.4 → 856.2 kB` (−30.2 kB / −3.4 %).
- `size-limit` ceiling: `900 → 870 kB` (14 kB headroom над поточним значенням — є простір для наступних дрібних додавань, але gate вже регресівно жорсткіший). **Update 2026-05-31:** фактичний gate у `apps/web/package.json` зараз `880 kB` (виріс +10 kB через природний ріст після T4-B; не +cut). При наступному T4-cut-у ceiling треба знову опускати.

**Команда:** `pnpm --filter @sergeant/web build && pnpm --filter @sergeant/web size`

**Acceptance (T4-A — closed):**

- [x] `pnpm size` проходить (новий ceiling 900 KB brotli)
- [x] Eager-only chunks (modulepreload з `index.html`) ≤ 400 KB brotli
- [x] Lazy WelcomeScreen відображається через Suspense fallback `<PageLoader />`
- [x] Тести `pnpm --filter @sergeant/web test` зеленим (2554 passed)

**Acceptance (T4-B — partial, Sprint 9):**

- [x] react-markdown swap зашиплено (`perf(web): T4-B aggressive bundle cuts`)
- [x] `pnpm size` проходить з новим лімітом 870 KB brotli (−1 step від 900)
- [x] Жодних регресій LCP — lazy boundary count не змінювався (HubChat вже була lazy, swap всередині chunk-у)
- [ ] Добити 750 KB target (потрібні рефактори sqlite-lazy-boot, @dnd-kit drop або drizzle-tree-shake — окремими PR-ами)
- [ ] Eager-only chunks ≤ 350 kB brotli (поточний ~342 kB, вже під цілью без додаткових кроків для первинного входу)
- [ ] Жодних регресій LCP > 2.5 s у Lighthouse

---

#### T5: Lighthouse CI `Tech` `S` ✅ First pass shipped

**Що:**

- Config: [`apps/web/lighthouserc.json`](../../../apps/web/lighthouserc.json)
- Workflow: [`.github/workflows/lighthouse-ci.yml`](../../../.github/workflows/lighthouse-ci.yml) (додано 2026-05-13 через follow-up child Devin session; без `treosh/lighthouse-ci-action`; прямо `@lhci/cli` як devDep в `apps/web` — уникаємо додаткового SHA-pin-у).
- Routes аудитуються: `/`, `/finyk`, `/fizruk`, `/routine`, `/nutrition` (`/` = Hub; окремого `/hub` немає).
- 3 runs/URL, median-run aggregation.

> **Звірка з кодом (2026-05-31):** `apps/web/lighthouserc.json` досі тримає LCP як `warn` (maxNumericValue 2000) — tightening до `error` 3000 ms і branch-protection flip **не зроблені**. Це ops-крок (потрібен baseline у CI + flip захисту гілки), не code-only; лишається open follow-up.

**Acceptance:**

- [x] First pass shipped: warn-only assertions (LCP ≤2000, FCP ≤1500, TBT ≤200).
- [x] Workflow-файл приземлений у `.github/workflows/lighthouse-ci.yml` (P1.2 з `docs/90-work/audits/2026-05-13-dead-code-hard-rules-roast.md`).
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

| Спринт   | Продуктові задачі | Tech задачі                                                                                   | Загальний effort |
| -------- | ----------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| Спринт 5 | O1, O2, O5        | T7                                                                                            | ~5–6 днів        |
| Спринт 6 | O3, O4, O9        | T1                                                                                            | ~8–10 днів       |
| Спринт 7 | O6, O7            | ~~T2~~ (done)                                                                                 | ~7–9 днів        |
| Спринт 8 | O8-start (done)   | T4 (T4-A + T4-B react-markdown done; 5 cuts + T5 tightening open), T5 (first-pass), T6 (done) | ~8–10 днів       |

---

**Документ оновлено 2026-05-31 — дві close-out звірки з trunk: (1) Спринт 6 — O4 + T1 позначено Done, O3 first-pass; (2) Спринт 8 — T4-B react-markdown swap підтверджено shipped, решта 5 bundle-cuts + T5 tightening лишаються open, виправлено дрейф size-gate 870→880 kB. За календарем активне вікно — Спринт 7 (2026-06-09 – 2026-06-20); продовження планування — [`sprint-9-10-plan-2026.md`](./sprint-9-10-plan-2026.md). Наступний review — 2026-07-01.**
