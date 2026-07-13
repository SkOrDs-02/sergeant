# ADR-0067: Standardize Hub engagement mechanisms (signals / reminders / dismiss-state)

> **Last touched:** 2026-06-20 by @github-actions[bot]. **Next review:** 2026-09-18.
> **Status:** Active

- **Status:** Proposed
- **Date:** 2026-06-20
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/02-engineering/architecture/domain-invariants.md`](../../02-engineering/architecture/domain-invariants.md) — Kyiv-time day-boundary інваріант, який частина reminder-хуків порушує
  - [`docs/04-governance/governance/rules/02-rq-keys-via-centralized-factories.md`](../governance/rules/02-rq-keys-via-centralized-factories.md) — прецедент «один централізований фабричний шар замість inline-копій» (RQ keys)
  - [`docs/04-governance/adr/0011-local-first-storage.md`](./0011-local-first-storage.md) — клієнт як primary-стор; warm-cache канонічні читачі
  - [`docs/04-governance/adr/0021-memory-bank.md`](./0021-memory-bank.md) — local-first engagement-state прецедент
  - [[project_tombstone_readside_regression]], [[project_ai_chat_dualwrite_bypass]] — memory: tombstone read-side регресія, що оголила фрагментацію compute-шару

---

## Context and Problem Statement

Hub має цілий клас «engagement-механізмів» — код, що **читає дані модулів → виводить сигнал → показує/нагадує/ховає**. Сьогодні цей клас реалізований **N разів вроздріб**, без спільного контракту. Це не косметична DRY-проблема: фрагментація вже спричинила живі продакшн-баги і порушення доменних інваріантів.

Розкладається на **три шари**, кожен зі своєю фрагментацією:

### Шар 1 — compute (engagement-сигнали)

Щонайменше **п'ять** файлів незалежно реалізують «прочитай дані всіх модулів і виведи сигнал», кожен зі **своєю** копією парсингу fizruk/nutrition/routine:

- `apps/web/src/core/lib/recommendationEngine.ts` — драйвить TodayFocusCard
- `apps/web/src/core/lib/insightsEngine.ts` — драйвить HubReports + hubChatContext
- `apps/web/src/core/lib/dailyFinykSummary.ts` — Finyk daily summary (зараз dead-for-UI)
- `apps/web/src/core/insights/useCoachInsight.ts` — coach-snapshot
- `apps/web/src/core/insights/useWeeklyDigest.ts` — weekly digest

**Спостережуваний наслідок (не гіпотеза):** коли Stage-8 «tombstone» переніс canonical-істину у SQLite warm-cache і почав видаляти legacy `*_v1` LS-ключі на boot, ці п'ять копій довелося мігрувати **поштучно**. На момент цього ADR на `main`: `recommendationEngine` (#3654), картки (#3653), search (#3655), coach (#3656) — мігровані; а `insightsEngine.ts` досі читає `STORAGE_KEYS.FIZRUK_WORKOUTS` (рядок ~55) і `STORAGE_KEYS.NUTRITION_LOG` (рядки ~284/337) — **тумбстоунлені ключі → порожні дані в проді**. Тобто один engagement-сигнал тихо зламаний прямо зараз, суто тому що «прочитати дані модуля» живе у 5 місцях, а не в одному. Один aggregator зробив би цей клас регресій **структурно неможливим**.

### Шар 2 — reminders (планування нотифікацій)

Три модулі мають **скопіпащені, але розбіжні** reminder-хуки:

| Хук                        | Файл                                               | Day-key / час                                             | Tick                                   | Permission-tracking                         |
| -------------------------- | -------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| `useRoutineReminders`      | `modules/routine/hooks/useRoutineReminders.ts`     | **Kyiv** (`getKyivDateParts`/`getKyivDayKey`) ✅          | self-rescheduling до наступної хвилини | повний (Permissions API + visibility/focus) |
| `useFizrukWorkoutReminder` | `modules/fizruk/hooks/useFizrukWorkoutReminder.ts` | **host-local** (`now.getHours()`, `now.getFullYear()`) ❌ | `setInterval(30s)`                     | відсутній                                   |
| `useNutritionReminders`    | `modules/nutrition/hooks/useNutritionReminders.ts` | **host-local** (`new Date().getHours()`) ❌               | `setInterval(45s)`                     | відсутній                                   |

Кожен робить те саме (dedup-key → перевір час → `showNotification` → postMessage у SW), але з трьома різними інтервалами, трьома схемами dedup-ключів і — **критично** — два з трьох порушують Kyiv-time доменний інваріант: користувач за кордоном отримає fizruk/nutrition-нагадування зсунуте на host-offset, тоді як routine спрацює коректно о київській «8:00». `useRoutineReminders` — це фактично еталон (вже пройшов page-audit-09 F21/F8 фікси), а інші два — його застарілі копії.

### Шар 3 — dismiss / snooze state

**Пʼять+ незалежних схем** «памʼятай, що я це вже показав / користувач сховав»:

- `hub_recs_dismissed_v1` — `core/insights/TodayFocusCard.tsx:18` (JSON-map)
- `hub_daily_finyk_dismissed_v1` — `core/lib/dailyFinykSummary.ts:42` (`{date}`-shape, dismiss-на-день)
- `finyk_rec_dismissed` — `modules/finyk/...` (масив ключів, finyk-domain)
- per-notification dedup keys — `routine_notify_*`, `fizruk_last_reminder_notif_day`, `nutrition_last_reminder_notif_key`
- **`dismissNudge` / `snoozeNudge`** (`@sergeant/shared`) поверх `webKVStore` — `core/onboarding/DailyNudge.tsx`

Ключове спостереження: **правильний примітив уже існує** — `dismissNudge`/`snoozeNudge` з TTL-snooze (`SNOOZE_DAYS`) у `@sergeant/shared`. Але ним користується **лише** DailyNudge; решта чотири схеми написані вручну, кожна зі своїм key-namespace і поведінкою.

### Чому це ADR, а не просто рефактор

Зміна торкається **живого** engagement-коду в усіх модулях, перетинається з паралельною tombstone-міграцією, і встановлює контракт, якого мають дотримуватись усі майбутні модулі. Це архітектурне рішення «де живе цей клас логіки», тому потребує зафіксованого «чому».

## Considered Options

1. **Трьохшарова стандартизація на наявних примітивах** — один `EngagementSignal`-aggregator (canonical readers) для compute; один `useModuleReminder(config)` (узагальнення еталонного routine-хука) для reminders; розширення наявного `dismissNudge`/`snoozeNudge` як єдиного dismiss-стору. Поетапно, кожен шар окремим PR.
2. **Полагодити лише симптом (tombstone) і нічого не уніфікувати** — домігрувати `insightsEngine`/`useWeeklyDigest` на canonical readers, лишити 5 копій compute + 3 reminder-хуки + 5 dismiss-схем.
3. **Велике переписування «engagement-движка»** — net-new підсистема (єдиний store + scheduler + rules-engine), яка поглинає всі три шари за один захід.
4. **Do nothing** — лишити як є; мігрувати/латати ad-hoc щоразу, коли черговий tombstone чи TZ-баг оголить розбіжність.

## Decision

Обираємо **Option 1 — трьохшарова стандартизація на наявних примітивах**, виконана поетапно. Net-new винаходів мінімум: кожен шар сходиться до вже-найкращого наявного зразка.

### Цільова архітектура (3 шари)

**Шар 1 — `EngagementSignal` + єдиний aggregator.**

- Спільний тип `EngagementSignal` (`{ module, kind, severity, title, body, action? }` — точна форма узгоджується в реалізації) у `core/insights/` (або `@sergeant/shared`, якщо знадобиться mobile).
- Один `collectEngagementSignals()`, що читає **виключно через canonical readers** (`loadRoutineState`, `loadNutritionLog`/`loadNutritionPrefs`, `getCachedFizrukSqliteState`) — нуль raw `safeReadStringLS("*_v1")`.
- `recommendationEngine` / `insightsEngine` / digest / summary стають **тонкими view-проєкціями** над цим aggregator-ом, а не власниками парсингу. Дедуплікує `parseFizrukWorkouts`×5.

**Шар 2 — `useModuleReminder(config)`.**

- Один хук, параметризований per-module config: `{ enabled, schedule, dedupKeyspace, content, swMessageType }`.
- Узагальнює **еталонний** `useRoutineReminders`: Kyiv-time day-boundary (закриває TZ-баг fizruk/nutrition), повний permission-tracking (Permissions API + visibility/focus), self-rescheduling tick (замість двох різних `setInterval`).
- `useRoutineReminders` / `useFizrukWorkoutReminder` / `useNutritionReminders` стають тонкими обгортками `useModuleReminder(<config>)`.

**Шар 3 — єдиний dismiss/snooze-стор.**

- Канонізуємо `dismissNudge`/`snoozeNudge` (`@sergeant/shared` + `webKVStore`) як **єдиний** примітив dismiss/snooze з уніфікованою key-схемою (namespace per surface).
- Мігруємо `hub_recs_dismissed_v1`, `hub_daily_finyk_dismissed_v1` на нього. `finyk_rec_dismissed` (finyk-domain dual-write) і per-notification dedup-ключі лишаємо поза скоупом (мають окрему семантику — див. нижче).

### Поетапність (4 кроки, кожен окремим PR)

1. **Видалити dead `dailyFinykSummary.ts` + тест** — мертвий для UI (жоден прод-консюмер не імпортує `computeDailyFinykSummary`). Прибирає одну копію compute + одну dismiss-схему «безкоштовно». **Передумова — підтвердити, що фіча не запланована.**
2. **Уніфікувати dismiss/snooze** на `dismissNudge`/`snoozeNudge` (найменший ризик, ізольований стор).
3. **Уніфікувати reminders** у `useModuleReminder` — попутно **фіксує Kyiv-time баг** fizruk/nutrition (доменний інваріант).
4. **Консолідувати compute** у `EngagementSignal`-aggregator — найбільший, **останній**, після того як tombstone-міграція повністю осіла (всі 5 файлів на canonical readers).

### Що НЕ чіпаємо (явні non-goals)

- **Finyk-специфічні dismiss-схеми** (`finyk_rec_dismissed`) — частина finyk dual-write контракту (Stage 13 / PR #075), окрема семантика, не engagement-nudge.
- **Per-notification dedup-ключі** (`routine_notify_*` тощо) — це dedup нотифікацій, не user-dismiss; лишаються в reminder-шарі.
- **Server-side push fan-out** (ADR-0019) — стандартизуємо лише **клієнтський** local-notification scheduling.
- **Канонічні warm-cache читачі** — лише **споживаємо** їх, не змінюємо.
- **RQ-keys, аналітика подій** — поза скоупом.

## Rationale

- **Чому стандартизувати, а не латати (vs Option 2):** Option 2 лишає причину живою — наступний tombstone, TZ-зміна чи новий модуль знову розбіжаться. Уніфікований compute-шар робить tombstone-клас регресій _структурно_ неможливим (один читач — нема чого забути мігрувати), а уніфікований reminder-хук робить Kyiv-time баг неможливим за побудовою.
- **Чому наявні примітиви, а не переписування (vs Option 3):** усі три цілі вже мають еталон у репо — `useRoutineReminders` (пройшов F21/F8), `dismissNudge`/`snoozeNudge` (TTL-snooze), canonical readers. Сходження-до-еталону має мінімальну площу й нульовий ризик «net-new движка», який треба наново тестувати й супроводжувати. Це той самий принцип, що ADR-0006 (RQ keys: один фабричний шар замість inline-копій).
- **Чому поетапно, а не одним PR:** шари незалежні; dead-code-видалення і dismiss-уніфікація дають ранню цінність з мінімальним ризиком, а найважчий compute-шар свідомо останній — щоб не конфліктувати з паралельною tombstone-міграцією (memory: [[project_tombstone_readside_regression]] фіксує split між сесіями).
- **Чому це ADR:** встановлює контракт для **майбутніх** модулів («новий модуль додає reminder через `useModuleReminder`, сигнал через aggregator, dismiss через nudge-store») — рішення про межі відповідальності, яке має пережити окремі PR-и.

## Consequences

### Positive

- Tombstone-клас регресій стає структурно неможливим: один canonical-читач замість пʼяти.
- Kyiv-time доменний інваріант виконується за побудовою для **всіх** reminders (фіксує наявний fizruk/nutrition баг).
- −4 копії `parseFizrukWorkouts`, −2 reminder-копії, −3 ad-hoc dismiss-схеми → менше площі для лінт-burndown і module-size (Rule #18) тиску.
- Новий модуль вмикається в engagement за конфігом, а не копіпастою.

### Negative

- Торкається живого коду в усіх модулях → потрібен повний surface-тест-сюїт перед кожним PR (memory: [[feedback_run_full_surface_test_suite]] — scoped-прогін пропускав integration-регресії).
- Тимчасова координація з паралельною tombstone-сесією, щоб шар 4 не наступив на незавершену міграцію `insightsEngine`/`useWeeklyDigest`.
- `useModuleReminder` має покрити edge-кейси всіх трьох (privacy-aware content routine, plan-based enabled fizruk, hour-only nutrition) — узагальнення нетривіальне.

### Neutral

- Не змінює user-visible поведінку (окрім фіксу TZ-багу — що є виправленням, не регресією).
- Не вводить нових залежностей; усе на наявних `@sergeant/shared` / canonical readers / `webKVStore`.
- Кількість PR-ів (4) і їх порядок можуть уточнитись при реалізації; ADR фіксує **напрям і межі**, не точний diff.

## Compliance

- **Hard Rule #2 (RQ keys)** — aggregator не вводить inline query-keys; будь-які RQ-споживачі сигналів — через фабрики.
- **Domain invariant (Kyiv-time)** — `useModuleReminder` зобовʼязаний рахувати day-key/час через `@shared/lib/time/kyivTime`; host-local `new Date().getHours()` для day-boundary заборонено (`sergeant-design/prefer-kyiv-time`).
- **Hard Rule #18 (module-size 600)** — консолідація має тримати aggregator/хук під лімітом; split за потреби.
- **Hard Rule #15 (docs у Ukrainian, sync з кодом)** — кожен крок оновлює відповідні surface-docs; цей ADR — Ukrainian-body.
- **Storage allowlist** (`pnpm lint:localstorage-allowlist`) — будь-які нові ключі реєструються; міграція ad-hoc ключів проходить через no-raw-storage-key політику.
- **Testing pyramid (ADR-0020)** — повний `pnpm --filter @sergeant/web test` перед кожним PR, не scoped-підпапка.

## Links

- [`docs/02-engineering/architecture/domain-invariants.md`](../../02-engineering/architecture/domain-invariants.md)
- [`docs/04-governance/adr/0006-rq-keys-factory.md`](./0006-rq-keys-factory.md) — прецедент централізованого фабричного шару
- [`docs/04-governance/adr/0011-local-first-storage.md`](./0011-local-first-storage.md)
- [`docs/04-governance/adr/0019-push-notifications.md`](./0019-push-notifications.md) — server push fan-out (поза скоупом цього ADR)

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                         | Merged     |
| -------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| [#292](https://github.com/Skords-01/Sergeant/pull/292)   | docs(docs): fix documentation drift found in 2026-07-13 audit | 2026-07-13 |
| [#3665](https://github.com/Skords-01/Sergeant/pull/3665) | docs(web): add ADR-0067 engagement mechanism standardization  | 2026-06-20 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
