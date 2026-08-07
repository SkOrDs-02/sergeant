# Tech-debt assessment 2026-07-01 — групи, інструкції до фіксу, burndown-план

> **Last touched:** 2026-07-20 by @cursoragent (post-waves sync). **Next review:** 2026-10-18.
> **Status:** Active

> **Методологія (оригінал 2026-07-01):** повний прогін механічних гейтів + воркфло з підагентів. **Re-audit 2026-07-20:** повторне вимірювання на `main` — потім **agent waves** закрили actionable P1 (див. нижче). Цей файл = живий burndown після хвиль.

## Executive summary

Механічний стан репо здоровий. Re-audit виявив документальний drift + 2 max-lines leakers; **хвилі агентів закрили більшість actionable P1**:

| Зсув / задача                         | Було (re-audit)                     | Стало після waves (main)                                                                                                                 |
| ------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Web source / tests                    | 999 / 875                           | без змін (baseline)                                                                                                                      |
| Web coverage floor                    | 89                                  | 89                                                                                                                                       |
| Web max-lines leakers                 | ManualExpenseSheet ~607, TxRow ~605 | **Closed** [#348](https://github.com/SkOrDs-02/Sergeant/pull/348) / [#350](https://github.com/SkOrDs-02/Sergeant/pull/350) (~416 / ~270) |
| Mobile exhaustive-deps catalog        | drift vs web catalog                | **Closed** [#349](https://github.com/SkOrDs-02/Sergeant/pull/349)                                                                        |
| Privat upstream body → client         | P2 leak risk                        | **Closed** [#347](https://github.com/SkOrDs-02/Sergeant/pull/347)                                                                        |
| Storage-key WHY hygiene               | undocumented disables               | **Closed** [#351](https://github.com/SkOrDs-02/Sergeant/pull/351)                                                                        |
| Mobile Phase 6 NotificationsSection   | TODO wire `useMonthlyPlan`          | **Closed** [#352](https://github.com/SkOrDs-02/Sergeant/pull/352)                                                                        |
| `no-non-null-assertion` (перша хвиля) | 4 undocumented disables             | **Closed** [#353](https://github.com/SkOrDs-02/Sergeant/pull/353)                                                                        |

**Відкритий actionable backlog (переміряно 2026-08-07):**

1. Mobile coverage floor 30 → ratchet (P3). **Уточнення 2026-08-07: це не «чекає headroom», а не має вимірювання взагалі.** `test:coverage:ci` запускається з `--filter=!@sergeant/mobile`, тобто mobile-покриття в CI не рахується — ратчетити нема від чого. Спершу треба завести mobile у coverage-лейн (або окремим job-ом), і лише потім піднімати floor.
2. Подальший `!` / eslint burndown — опційно, P3. **Скоуп зменшився:** `AccentColorPicker` видалено як компонент-сироту ще 2026-08-04, тож із трійки лишились barcode і server sync. Загальна кількість production-`eslint-disable` — **158** рядків (у Групі 3 нижче записано ~195).
3. **Mobile 12px-floor — новий запис.** `apps/mobile/src`: 156 порушень (17 `text-2xs` + 139 `text-[<12px]`) при нулі `.text-style-*`. Gated на створення семантичної шкали для NativeWind (owner-decision) — деталі у `frontend.md` п.8.

**Закрито цим проходом (2026-08-07):**

- 44px-аудит промоутнуто у блокуючий CI-job (`frontend.md` п.7).
- Enforcement-вакуум дизайн-системи здебільшого закрито: гейт розширено на landing + mobile-shell, додано тести, showcase перестав рекламувати 13 неіснуючих лінтів і 8 ретайрнутих Hard Rules (`frontend.md` п.1).
- Увесь блок `backend.md` § «P1 (наступний спринт)» — був закритий, але не переміряний (CSP `report-uri`, `Permissions-Policy`, coverage у CI, 23 `@critical` E2E).

**Blocked (агент не закриє без власника / інфри / депів)** — простими словами див. [`README.md § Blocked простими словами`](./README.md#blocked-простими-словами).

---

## Група 1 — Server max-lines burndown (Hard Rule #18) — ✅ DONE (2026-07-10)

**Верифіковано 2026-07-10 / підтверджено 2026-07-20:** `apps/server/eslint.server-maxlines-allowlist.json` = `[]`.

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

## Група 3 — eslint-disable burndown — частково Closed у waves

Виміряно **~195** production-рядків з `eslint-disable` (web+server+mobile+packages, без тестів); ціль «<100» нереалістична — більшість by-design. **Переміряно 2026-08-07: 158** — хвилі та видалення мертвих компонентів зрізали ще ~37, окремої кампанії не потрібно.

| Ціль                                                      | Статус                                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `no-raw-storage-key` / `no-restricted-syntax` WHY         | ✅ [#351](https://github.com/SkOrDs-02/Sergeant/pull/351)                                                                          |
| `@typescript-eslint/no-non-null-assertion` (перша хвиля)  | ✅ [#353](https://github.com/SkOrDs-02/Sergeant/pull/353)                                                                          |
| `!` low-risk web batch                                    | ✅ (Avatar / FocusTrap / AnimatedList / KeyboardAccessory / accountVisual / DailyPlanMealRow / LogCardAnalytics / cleanupDemoData) |
| Mobile exhaustive-deps catalog                            | ✅ [#349](https://github.com/SkOrDs-02/Sergeant/pull/349)                                                                          |
| Подальший security-pass / `!` / FS (barcode, server sync) | Відкрито, P3 — opportunistic. `AccentColorPicker` відпав: компонент видалено 2026-08-04 як сироту                                  |
| Web exhaustive-deps catalog                               | ✅ Done (web=0)                                                                                                                    |

## Група 4 — Рекласифіковано: dualWrite/residualImport — НЕ дублікати

Без змін vs 2026-07-01: pairwise diff спростовує «dedup»; не брати як чистку дублікатів.

**Оновлення 2026-08-05:** 4 web-копії `residualImport.ts` (finyk/fizruk/nutrition/routine) видалено — це був окремий клас боргу від «dualWrite = дублікат» гіпотези: одноразовий pre-beta LS→SQLite дренаж для «наявних юзерів», яких у проді ніколи не було. Видалення — не dedup цього розділу, а закриття мертвого коду тепер, коли ризик для наявних тестерів відсутній. Mobile-копії (`apps/mobile/src/modules/*/lib/residualImport.ts`) лишаються — мобільний dual-write ще не має Stage 10 parity (completion-only), тож тамтешній tombstone поки передчасний (див. коментар у видалених web-файлах, збережений у git history).

## Група 5 — Дрібні + заблоковані (після waves)

| Пункт                                           | Статус                             | Дія                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat/tools.ts` console.log (F-008)             | ✅                                 | —                                                                                                                                             |
| Grafana Alloy Dockerfile digest-pin (INFRA-004) | ✅                                 | —                                                                                                                                             |
| `OptimizedImage.tsx` unused (UX-017)            | 🚫 Blocked-reason: by-design       | `@scaffolded` — НЕ видаляти                                                                                                                   |
| Lighthouse LCP warn→error (T5)                  | ✅                                 | `lighthouserc.json` LCP error @ 3000 ms                                                                                                       |
| Web max-lines: ManualExpenseSheet / TxRow       | ✅ Closed #348 / #350              | —                                                                                                                                             |
| Privat upstream body scrub                      | ✅ Closed #347                     | —                                                                                                                                             |
| Mobile Phase 6 NotificationsSection             | ✅ Closed #352                     | —                                                                                                                                             |
| Mobile coverage floor 30 (TC-03)                | Відкрито, P3                       | **Спершу вимір:** `test:coverage:ci` виключає `@sergeant/mobile`, тож ратчетити нема від чого. Потім floor у `coverage-thresholds.json`.      |
| UI-примітиви / overlay family (P4)              | ✅ Phase 1+2 done                  | Phase 1: `useFloatingPanelPosition`. Phase 2: ConfirmDialog/InputDialog — `bg-black/40`, `useBodyScrollLock`, portal. Not Radix (size-limit). |
| `sync_op_log` партиціювання                     | 🚫 Blocked: multi-instance trigger | ADR-0065                                                                                                                                      |
| Coolify env-var audit trail                     | 🚫 Blocked-reason: owner-decision  | `backend.md` § Operational visibility                                                                                                         |
| Push APNs/FCM credentials                       | 🚫 Blocked-reason: external-infra  | `backend.md` § Push credentials                                                                                                               |
| Mobile Sentry DSN (M7)                          | 🚫 Blocked-reason: external-infra  | `mobile.md` roadmap                                                                                                                           |
| Expo SDK 53 (M9)                                | 🚫 Blocked-reason: dep-blocked     | ADR-0063                                                                                                                                      |
| Mobile hub-context Phase 8 (`useChatSend`)      | 🚫 Blocked-reason: owner-decision  | `mobile.md` § TODO                                                                                                                            |
| HubReports billing / WeeklyDigestCard           | 🚫 Blocked-reason: owner-decision  | `mobile.md` § TODO                                                                                                                            |
| `exportReport` expo-print                       | 🚫 Blocked-reason: dep-blocked     | `mobile.md` § TODO                                                                                                                            |

## Довідка: що перевірено і чисте (не борг)

- Knip / janitors / AI-LEGACY: чисті на baseline 2026-07-01; entropy-janitor issues — none у snapshot 2026-07-20.
- Server + web `no-strict-bypass` allowlist порожній; mobile type-bypass allowlist порожній.
- Coverage floors: web **89**, mobile **30**, api-client 73, routine-domain 74.
- Production-`any` web = **2** by-design; Express **5.2**; TS **6.0.3** усі apps.
- Історичний assessment 2026-06-05 (md+json) — у [`archive/`](./archive/).
