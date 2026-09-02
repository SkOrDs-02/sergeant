# Frontend Tech Debt — Sergeant Web

> **Last validated:** 2026-07-20 by @cursoragent (full reconcile vs HEAD). **Next review:** 2026-09-23.
> **Status:** Active

> **Оновлено 2026-08-25 (нова знахідка: відхилений sync-оп невидимий користувачу).**
> Push-оп, який сервер відхилив, у клієнта **термінальний** — движок його не
> ретраїть (`syncOpOutboxLifecycle` ставить `status='rejected'` + `reject_reason`
> «для тріажу»). Тобто запис назавжди лишається лише на пристрої й ніколи не
> доїжджає на сервер. Лічильник `rejected` у
> [`syncOpOutboxStatus`](../../../packages/db-schema/src/sqlite/syncOpOutboxStatus.ts)
> існує, але **жоден компонент у `apps/web` його не читає** (перевірено grep-ом
> по `apps/web/src`), тож користувач не має жодного сигналу: запис виглядає
> збереженим, бо локально він і справді є. Для замірів тіла це означає мовчазну
> втрату історії здоровʼя — тобто саме те, від чого модуль і потрібен.
>
> Знайдено при фіксі меж числових полів заміру (аудит 2026-08-04, побічна
> знахідка): фікс свідомо **відхиляє** позамежні значення замість обрізання, і
> це правильно — обрізання мовчки змінює чужі дані. Але половина «користувач
> бачить, що не синкнулось» не існує. **Це передумовна прогалина всіх причин
> відхилення** (`user_id_mismatch`, `lww_conflict`, `invalid_*`), а не наслідок
> того фіксу. Мінімальний обсяг робіт: прочитати `rejected`-лічильник у
> settings/sync-секції і показати банер зі списком проблемних записів.

> **Оновлено 2026-08-07 (tech-debt reconcile).** Переміряно бек-лог нижче на
> HEAD — три пункти виявились закритими або значно застарілими, і закривались
> вони не тим, що записано в плані:
>
> - **п.1 Enforcement-вакуум — здебільшого закритий.** `scripts/check-design-conventions.mjs`
>   уже в ланцюгу `pnpm lint` і гейтить чотири з шести конвенцій (hex-бан,
>   `focus:`, `text-2xs`, під-12px). Цим проходом скоуп розширено з
>   `apps/web/src` на `apps/landing/src` + `apps/mobile-shell/src` (обидві на
>   нулі) і додано 13 тестів на anti-false-positive контракт. **Відкритий
>   залишок — рівно три AST-рівневі конвенції** (opacity-шкала, `-strong`
>   companions, module-accent containment): вони свідомо review-only, і тепер
>   це записано чесно і в `docs/05-design/design/README.md`, і в самому
>   DesignShowcase. Заразом полагоджено гірший підвид цього ж боргу:
>   showcase рекламував **13 неіснуючих ESLint-правил і 8 ретайрнутих Hard
>   Rules** — тобто обіцяв enforcement, якого немає.
> - **п.7 44px-аудит у CI — закрито.** Лейн промоутнуто з nightly у блокуючий
>   job `Mobile UI audit (44px touch targets)` у `ci.yml`. Блокером був не
>   wiring, а краш `FINYK_ASSETS` (`(webhookAccounts ?? []).filter` проти
>   не-масиву) — фікс уже на main, лейн зелений у nightly 2026-08-06/08-07.
> - **п.9 Сира типографіка — цифри застаріли втричі.** Було записано «389
>   `text-xs` + 108 `text-sm` проти 1316 `text-style-*`»; факт на HEAD —
>   **111 + 84 проти 2011**. Ратчет фактично відпрацював (значною мірою у
>   PR #684), лишився довгий хвіст під правилом «торкнувся файлу — мігруй».
>   NB: сирий розмір лишається легітимним у двох випадках, і вони
>   задокументовані в `tailwind-preset.js` — розмір контрола та потреба саме в
>   `line-height` 1rem; сліпий sweep їх зламає.
>
> Заразом виявлено **новий** запис для mobile: `apps/mobile/src` має 156
> порушень 12px-floor (17 `text-2xs` + 139 `text-[<12px]`) і **нуль**
> `.text-style-*` — мігрувати немає куди, тож розширення гейта на mobile
> gated на створення семантичної шкали для NativeWind (див. п.8 нижче).
>
> **Оновлено 2026-08-04 (design-system deep audit).** Перенесений бек-лог із
> аудиту дизайн-системи (звіт `docs/90-work/audits/2026-08-04-design-system-deep-audit.md`
> видалено після фікс-хвилі за рішенням founder-а; історія — у merged PR #607).
> Автофіксабельне виправлено (dark/hc token-parity, a11y діалогів, text-2xs,
> mobile re-sync, docs↔ADR-0081). Невиправлений залишок — потребує рішень:
>
> 1. ~~**Enforcement-вакуум (high).**~~ — **здебільшого закрито** (див.
>    маркер 2026-08-07 вище). Застосовані обидва запропоновані рішення, не
>    одне з двох: grep-гейт `check-design-conventions.mjs` покриває hex-бан,
>    `focus:` і 12px-floor на трьох поверхнях, а opacity-шкала, `-strong` і
>    module-accent записані як review-only і в `docs/05-design/design/README.md`,
>    і в бейджах showcase. Механічного боргу тут більше немає — лишається
>    свідомий review-скоуп.
> 2. ~~**Тема-сліпі чарти (high).**~~ — **Done** (хвиля 3, `e6a01ce`, 2026-08-04).
>    `chartSeries.ts` / `statusColors.ts` більше не існують; у fizruk немає
>    статичних hex поза тестами, `BodyAtlas.tsx` перейшов на var-backed кольори.
> 3. ~~**Компоненти-сироти.**~~ — **Done.** AccentColorPicker, MacroBarRow,
>    Prose, PageTransition — видалено (0 споживачів, жодного активного
>    plan-посилання; MacroBarRow фактично замінений на MacroRings ще в
>    redesign-v2). Відновлення — з git-історії за потреби. OptimizedImage —
>    **збережено**: файл несе `@scaffolded`-маркер (Hard Rule #10) з явним
>    `Do NOT delete`, тож не кандидат на дедкод-прибирання. ProgressBar —
>    **адоптовано**: 3 ad-hoc `role="progressbar"` (OnboardingProgress,
>    ValueProgressBar, BackfillProgressPill) мігровано на shared
>    `<ProgressBar>` (додано `variant="neutral"` для ink-філла); MacroRings
>    (circular, `ProgressRing`) лишився bespoke — інша сімʼя компонента.
> 4. **Shared OverlayShell/Drawer.** ~14 файлів hand-roll `role="dialog"`
>    chrome — **переміряно 2026-08-07: 25** файлів, тобто борг ріс, поки його
>    трекали. Сама консолідація лишається P4 (ризик фокусних/візуальних
>    регресій по всьому застосунку, потрібен design-review зі скрінами).
>    **Два іменовані під-пункти закриті 2026-08-07** — це були не «стиль», а
>    справжні дефекти скрол-локу:
>    - `SettingsPrimitives.ConfirmModal` не мав скрол-локу взагалі
>      (`inertBackground` закриває фокус і a11y-дерево, але не скрол) →
>      підключено `useBodyScrollLock`.
>    - `DeleteAccountDialog` hand-roll-ив `document.body.style.overflow =
"hidden"` — патерн, який докстрінг `useBodyScrollLock` прямо називає
>      недостатнім на iOS Safari (visual viewport rubber-band-ить сторінку
>      під фіксованим оверлеєм) і який не має refcount-у → замінено спільним
>      хуком.
>
>    **Залишок для наступного проходу** (повноекранні `fixed inset-0` з
>    `role="dialog"` без `useBodyScrollLock`, 9 файлів — кожен потребує
>    рішення «модалка над сторінкою» vs «full-page takeover», тому sweep-ом
>    не закривається): `FinykApp.tsx`, `BarcodeScanner.tsx`,
>    `PdfPreviewModal.tsx`, `HubSearch.tsx`, `HubChatHistoryDrawer.tsx`,
>    `BentoCard.tsx`, `OnboardingWizard.tsx`, `FirstEntryCelebrationModal.tsx`,
>    `AppLock.tsx`.
>
> 5. **SubTabs → shared** як `bar`-варіант Segmented (зараз застряг у
>    modules/nutrition, активний таб 40px).
> 6. **DesignShowcase.** Покриває ~25/60 компонентів; proposal-демо — форки
>    шипнутих компонентів; 132 `text-2xs` + text-[9-10px] у showcase;
>    DynamicThemeColorDemo/ProposalsVisual — stale #fdf9f3.
> 7. ~~**44px-аудит у CI.**~~ — **закрито 2026-08-07.** Твердження «не
>    виконується жодним workflow» було неточним: лейн жив у nightly
>    `extended-e2e.yml`. Тепер це блокуючий job `Mobile UI audit (44px touch
targets)` у `ci.yml`; сам status check у branch protection вмикається
>    поза репо.
> 8. **Mobile теми (high).** mobile.js — статична dark-only палітра при
>    light+dark апці (23 споживачі); нема hc-режиму (web 3-mode, mobile
>    3-mode); типографіка без семантичної шкали (140 sub-12px arbitrary,
>    469 text-xs); mobile-shell: статус-бар темізується один раз на init,
>    Android-сплеш без values-night; ProgressRing.tsx — третя off-brand
>    макро-палітра; residual emerald у global.css (--c-ring/--c-selection-bg/
>    --c-caret .dark, finyk/routine module-primary блок, hero-gradient-brand).
>    **Уточнено 2026-08-07:** відсутність семантичної шкали — це не косметика,
>    а те, що блокує механічний гейт. `apps/mobile/src` дає **156** порушень
>    12px-floor (17 `text-2xs` + 139 `text-[<12px]`) при **нулі**
>    `.text-style-*` — тобто `check-design-conventions.mjs` не можна
>    розширити на mobile, бо мігрувати немає куди. Порядок робіт: спершу
>    шкала (owner-decision — які саме ролі й розміри), потім burndown, і лише
>    тоді `apps/mobile/src` у `SCAN_DIRS`.
> 9. **Сира типографіка ratchet** — цифри переміряні 2026-08-07: **111
>    text-xs + 84 text-sm проти 2011 text-style-\*** (записано було 389/108
>    проти 1316). Ратчет фактично відпрацював; nutrition-старт із 41 сайту
>    розібраний до ~20. Правило лишається «торкнувся файлу — мігруй», але
>    сліпий sweep заборонений: два легітимні випадки сирого розміру
>    задокументовані в `packages/design-tokens/tailwind-preset.js` (розмір
>    контрола; потреба саме в `line-height` 1rem).
> 10. **Дрібне.** ~~`no-legacy-telegram-parse-mode` — dead-weight правило
>     плагіна~~ (видалено 2026-08-06 разом із `sri-on-third-party-script`,
>     обидва enabled ніде); storybook.md VRT-згадки ADR-0034 (пост-0082 stale); native
>     `title=` ×24 на interactive елементах (інертні на touch); finyk
>     `--c-finyk-accent`-старт hero тепер на tier-800 — звірити з
>     «start stop matches accent» коментарем при наступному ретюні.

> **Оновлено 2026-07-20 (post-waves).** Hard Rule #18 leakers **закриті**: `ManualExpenseSheet.tsx` ~416 LOC ([#348](https://github.com/SkOrDs-02/Sergeant/pull/348)), `TxRow.tsx` ~270 LOC ([#350](https://github.com/SkOrDs-02/Sergeant/pull/350)). Storage-key WHY [#351](https://github.com/SkOrDs-02/Sergeant/pull/351); `no-non-null-assertion` burndown [#353](https://github.com/SkOrDs-02/Sergeant/pull/353). Re-audit baseline: **999** production sources / **875** tests; coverage floor **89**; allowlist порожній; `no-eyebrow-drift` 2 web / 1 mobile (станом на 2026-08-05; було 27/10) — **переміряно 2026-08-07: 0/0, правила більше не існує** (ретайрнуте ADR-0081); production `any` **2** by-design; web exhaustive-deps **0** — **переміряно 2026-08-07: 5**, mobile **10** (було записано 9); обидва каталоги: [`apps-web-exhaustive-deps.md`](../../02-engineering/architecture/apps-web-exhaustive-deps.md), [`apps-mobile-exhaustive-deps.md`](../../02-engineering/architecture/apps-mobile-exhaustive-deps.md). Initiative 0017 (§2.5) code-complete; RUM validation — окремий checkpoint.

> **Оновлено 2026-06-01.** §7 follow-up виконано: ESLint-правило `no-console: error` додано до `apps/web/src/**` (виключення — `*.test.*`, `__tests__/`, `*.stories.*`); три documented call-sites (`perf.ts`, `sw/debug.ts`, `analytics.ts`) отримали `eslint-disable-next-line no-console` з обґрунтуванням; `logger.ts` — disable для canonical transport; ще 5 call-сайтів (`CommandPalette.tsx`, `serverBuildIdBus.ts`, `StatusPage.tsx`, `useDemoCommands.ts` ×2) мігровані на `logger`. §9 follow-up виконано: `@typescript-eslint/no-explicit-any` підвищено до `error` для `apps/web/src/modules/**` і `apps/web/src/core/**` (виключення — тести та stories). §6 follow-up виконано: `HubReports` / `useCoachInsight` / `useWeeklyDigest` coverage.

Аналіз кодової бази `apps/web/src` (999 source файлів, ~161k рядків — без тестів, `__tests__/` і `.stories.*`; 2026-07-20 re-audit).

> **Оновлено 2026-07-01 (tech-debt reconcile).** Історичний зріз: `FinykApp.tsx` тоді 647/586; `dualWrite/adapter.ts` декомпозовано. **Перезаписано 2026-07-20** — §4: leakers `ManualExpenseSheet` / `TxRow` спочатку знову Active, потім **Closed** у wave PR #348 / #350.

> **Оновлено 2026-05-20.** Додано §2.5 «Hub Settings & Reports tab cold-mount cost» як новий critical item — user-facing 10+ s freeze при tab-switch, з відкритою [Initiative 0017](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0017-hub-tabs-mount-perf.md). Root cause не у chunk download (вже 31 ms cache-hit), а в синхронному mount-і 14 секцій у одному render burst. План — per-section `React.lazy()` + `useInView` gate на cross-module queries + Web Worker для Reports aggregation (stretch).

> **Оновлено 2026-05-22 (2nd pass).** ~~Web UI timeout magic-numbers~~ **Closed** — 6 inlined timeouts in `core/ErrorBoundary.tsx`, `core/app/useIosInstallBanner.ts`, `core/auth/ResetPasswordPage.tsx`, `modules/finyk/pages/budgets/Budgets.tsx`, `modules/nutrition/hooks/usePantryBarcodeScan.ts`, `shared/components/ui/SwipeToAction.tsx` migrated to named constants in new `apps/web/src/shared/lib/ui/timeouts.ts`. Three categories documented (transient-confirm / delayed-show / status-clear). Adding a new timeout call-site → pick the constant that matches UX intent, don't inline a fresh magic-number.
>
> **Оновлено 2026-05-22.** ~~(b) 2 SW smoke `test.skip(true, ...)`~~ **Closed as audit misclassification** — обидва skips НЕ є unconditional bypasses, а conditional graceful degradation у runtime-guard (`if (!result.ok)` після SW capability probe): браузер lane без SW (наприклад privacy mode або `--disable-features=ServiceWorker`) пропускає тест замість hard-fail. Це **інтенційно** і documented inline. Re-enable plan не потрібен — поведінка коректна.
>
> **Оновлено 2026-05-21.** ~~(c) `apps/web/src/core/NotFoundPage.tsx` shim~~ **Closed** — shim deleted, single callsite (`StandaloneRoutes.tsx:56`) migrated до `../errors/NotFoundPage`, i18n allowlist entry прибраний.
>
> **Оновлено 2026-05-15.** Code-debt audit annex (Claude Opus 4.7 external session, monorepo-wide scan, code-debt category only). **All 3 items closed by 2026-05-22:** ~~(a) AIPill voice wiring~~ (closed #3081), ~~(b) SW smoke skips~~ (closed #3080 misclassification), ~~(c) NotFoundPage shim~~ (closed #3078); ~~timeout magic-numbers~~ (closed in this update — 2026-05-22 2nd pass).

> **Оновлено 2026-05-13.** Sync з реальним станом коду після Stage 7 / 9 storage-roadmap-у та подальших decomposition-ів:
> Розділ 2 (localStorage burndown) — production-allowlist у `eslint.config.js` **обнулено**
> (PR #054 final, 2026-05-06). `webKVStore` фізично переключено на SQLite-backed
> `kv_store(key TEXT PK, value JSON)` через PR #063 (web swap із LS dual-write canary)
> → PR #064 (drop LS mirror, SQLite-only) → PR #065 (mobile `mobileKVStore` mirror).
> Двоступенева драбина у `apps/web/src/shared/lib/storage/storage.ts:resolveStore()`:
> SQLite warm-cache (bootstrap-resolved) → `localStorage`-fallback (pre-bootstrap / SSR /
> private mode). Out-of-scope follow-up з §2 закритий.
> Розділ 4 (великі файли) — у `apps/web/src` залишилось **6 файлів >600 LOC** (раніше 14 на 2026-05-04;
> lookup-таблиця нижче синхронізована з `wc -l` 2026-05-13). Додатково декомпозовано (після 2026-05-04):
> `RoutineApp.tsx`, `Progress.tsx` (fizruk), `useStorage.ts` (finyk), `HubDashboard.tsx` (676 → 115 LOC,
> stale entry в `max-lines` allowlist прибрано у цьому PR),
> `chatActions/types.ts`, `fizrukActions.ts`, `AssetsTable.tsx`, `Workouts.tsx` (fizruk),
> `DailyPlanCard.tsx`, `Icon.tsx`, `NutritionApp.tsx`, `sw.ts`, `Exercise.tsx`, `LogCard.tsx`.
> Нові leakers (раніше у doc не трекалися, тепер додані до таблиці §4):
> `core/auth/AuthPage.tsx` (694), `modules/fizruk/lib/dualWrite/adapter.ts` (641).
> `core/onboarding/OnboardingWizard.tsx` (691) декомпозовано в цьому ж циклі
> (див. лог нижче). Початково запланований carry-over
> з Initiative 0001: `RoutineCalendarPanel.tsx` декомпоновано 2026-05-22 (`useCompletionNoteDrafts` extraction, 645 → 589 effective LOC); `FinykApp.tsx` тримається у raw>600 але <600 effective, monitor-only.
> Розділ 9 (`any` типи) — таблиця з 10 файлів **повністю закрита**
> (Phase 5a finyk-pages [#1452](https://github.com/Skords-01/Sergeant/pull/1452) + закриття
> `useAnalytics.ts` / `usePrivatbank.ts` через PR #1475). `grep ': any\b|<any>'` на
> `apps/web/src/modules/{finyk,fizruk}` — 0 матчів. Залишається тільки **3** свідомо
> залишених `Record<string, …>` патерни з in-line обґрунтуваннями
> (`parseFizrukWorkouts.ts`, `searchCache.ts`, `lazyImport.ts ComponentType<any>`).
> `no-strict-bypass` — allowlist на 9 production-файлів **обнулено**: усі call-сайти мігровані,
> правило `error` тепер працює без винятків на `apps/server/src/**` + `apps/web/src/**`.

> **Як читати:** позначки в стовпчику «Статус» оновлюються в момент злиття PR.
> Це жива сторінка — не «звіт», а контроль міграцій. Кожен запис стандартизує:
> в чому проблема, як ловити нові випадки в CI, і де вже стоїть guardrail.

> **CI freshness gate (audit PR-3.E).** Маркер `**Оновлено YYYY-MM-DD.**`
> у заголовку (рядок ~5) перевіряє
> [`scripts/check-tech-debt-freshness.mjs`](../../../scripts/check-tech-debt-freshness.mjs)
> у складі `pnpm lint`. PR падає, якщо маркер старший за 60 днів
> (поріг — `FRESHNESS_THRESHOLD_DAYS`). Re-validate сторінку (статуси,
> цифри, нові пункти) і онови дату — будь-який інший edit без бампу
> маркера лічильник не скидає.

---

## 🔴 Критичне

### ~~Черга синку finyk не дренажиться~~ — діагностовано і закрито (2026-07-25)

**Симптом (як його побачили).** У локальному E2E-прогоні (Postgres 16 +
pgvector 0.8.0, `PW_SKIP_WEBSERVER=1`) finyk поставив **4 операції** в чергу
синку, і не вилетіло **жодного** запиту на `/api/sync`. Черга не спорожніла до
кінця прогону.

**Що з цього виявилось вимірювальним артефактом.** Smoke-тест
`deep-module-crud` бігає **неавтентифікованим** (`seedFTUX`, без
`auth.setup.ts`). Для такого прогону нуль запитів — це не баг, а контракт
T3#2: `createDefaultRuntime` не запускає дренаж, поки `getSession()` не дасть
юзера (`if (!userId) return []`), бо без автентифікації з пристрою нічого не
має летіти. До того ж бойовий шлях — `/api/v2/sync/push`, а не `/api/sync`.

**Що виявилось справжнім багом (два, обидва полагоджені).**

1. **Недренажні рядки в аутбоксі.** `useLocalUserId()` навмисно віддає
   синтетичний id (`local-anon` / `demo-local`), щоб анонім і демо писали в
   локальний SQLite. Дуал-райт клав під цим id рядки і в `sync_op_outbox`, а
   `drainSyncOpOutbox` фільтрує `WHERE status='pending' AND user_id = ?` по id
   сесії Better Auth. Збіг неможливий **ніколи**. Прибрати такий рядок теж
   нікому: `purgeStaleTerminalOutbox` за контрактом кидає помилку на статус
   `pending`, а `setSqliteUser()` після логіну ще й перемикає партицію на
   `sergeant-<id>.db`, лишаючи рядки в анонімній базі. Черга росла без межі,
   без видимості й без шансу поїхати.
   **Фікс:** гейт `isSyncableUserId()` у
   [`core/syncEngine/syncableUserId.ts`](../../../apps/web/src/core/syncEngine/syncableUserId.ts) —
   операції під синтетичним id взагалі не потрапляють у чергу. Локальний запис
   не страждає: дуал-райт у SQLite відбувається до і незалежно від enqueue.
2. **Мертвий нудж.** Writer-runtime із самого початку мав `notifyEnqueued()` —
   негайний flush замість очікування тіку, — але **жоден** дуал-райт його не
   викликав (нуль виробничих call-site-ів на web і mobile). Єдиними тригерами
   push-у лишались ~30-секундний інтервал і `online`/`visibilitychange`, тож
   кожен запис чекав до ~36 с (інтервал + джитер), а короткоживуча вкладка
   могла закритись, так нічого й не надіславши.
   **Фікс:** реєстр
   [`core/syncEngine/outboxNudge.ts`](../../../apps/web/src/core/syncEngine/outboxNudge.ts);
   `enqueueOutboxUpsert` смикає нудж після успішної вставки, `singleton.ts`
   реєструє його одразу після `start()`. Реєстр, а не прямий імпорт синглтона —
   щоб не зшити write-path з `authClient` в один chunk (та сама форма циклічної
   залежності, що вже валила прод TDZ-крашем).

**Чому CI цього не бачив і що змінилось.** Покриття синку обривалось на межі
SQLite: `syncRoundTrip.test.ts` доводить `enqueue → pull apply` (обидва боки
локальні), smoke — локальний стан. Ланцюга «локальний запис → HTTP-push» не
перевіряв ніхто. Тепер його тримає
[`core/syncEngine/outboxDrainChain.test.ts`](../../../apps/web/src/core/syncEngine/outboxDrainChain.test.ts):
реальний SQLite + реальні `enqueueOutboxUpsert` / `drainSyncOpOutbox` /
lifecycle + реальні scheduler і writer-runtime, підроблений лише HTTP-`push`.
Годинник у тесті **не рухається** — якщо ланцюг «enqueue → нудж → flush»
розірветься, тест не дочекається push-у і впаде, а не «пройде через 30 с».

**Свідомо НЕ зроблено:** не піднято таймаут очікування (сховало б симптом);
не чіпано mobile — там `useLocalUserId`-аналога і синтетичних id немає, усі
записи йдуть під реальним id.

**Закрито 2026-07-28:** міграція анонімних даних після логіну реалізована через
durable batch, LWW merge, детермінований Sync V2 outbox і блокувальний retry UI.

**Лишається відкритим.** Крос-девайсна збіжність усе ще не доведена живим
прогоном проти реального сервера — це окремий пункт і не блокує first-auth
handoff.

**Знайдено** під час Хвилі 2 канон-беклогу; контекст —
[`product-knowledge-backlog.md § Знахідки на винос`](../planning/product-knowledge-backlog.md#знахідки-на-винос-побічні-не-з-хвиль).

<details>
<summary>1. ~~Зламані тести~~ — Виконано (розгорнути)</summary>

### 1. ~~Зламані тести~~ — Виконано

Раніше виглядало як «141 failed test file / 29 unresolved imports». Зараз
`apps/web/vitest.config.js` має повний alias-блок (`@shared`, `@finyk`,
`@fizruk`, `@routine`, `@nutrition`), що збігається з `tsconfig.json paths`.
`pnpm --filter @sergeant/web test` дає 80 test files / 722 теста, всі
зелені.

</details>

---

<details>
<summary>2. ~~Прямі `localStorage` виклики~~ — Виконано (розгорнути)</summary>

### 2. ~~Прямі `localStorage` виклики~~ — Виконано

**Раніше:** 71 файл напряму звертався до `localStorage.getItem/setItem` без
error handling — будь-який `JSON.parse(localStorage.getItem(...))` без
try/catch крашить на quota exceeded, corrupted storage або private browsing.

**Closed (2026-05-06, PR #054 final).** ESLint-правило
[`sergeant-design/no-raw-local-storage`](../../../packages/eslint-plugin-sergeant-design/index.js)
тепер працює без production-allowlist-у — у
[`eslint.config.js`](../../../eslint.config.js) лишилися виключно
тестові ignore-ри (`**/*.test.{ts,tsx,js,jsx}`, `**/__tests__/**`).
Бюджет у
[`.tech-debt/localstorage-allowlist-budget.json`](../../../.tech-debt/localstorage-allowlist-budget.json)
зафіксовано на `production: 0` (раніше 15 → 6 → 0).

**Як ми сюди прийшли:** burndown пройшов хвилями
46 → 41 → 27 → 17 → 16 → 15 (routine / finyk / onboarding /
chatActions / insights / recommendations / `useDarkMode` / `perf` /
`useActiveFizrukWorkout`) → 6 (PR #054a — drop стейлових
cloudSync v1 entry-їв після PR #052b/#052c видалили engine tree;
PR #053a видалив `apps/web/src/core/cloudSync/enqueue` no-op shim

- web `syncedKV` фасад) → 0 (PR #054 final — переписали 6 storage-
  primitive файлів так, щоб делегували у `webKVStore` з
  `@sergeant/shared`).

**Архітектура після PR #054 final.** `webKVStore` — KVStore-адаптер
над `window.localStorage` з cross-tab `onChange`-у — створюється у
`apps/web/src/shared/lib/storage/storage.ts` і реекспортується.
Решта 5 storage-primitive файлів (`storageManager.ts`, `storageQuota.ts`,
`typedStore.ts`, `createModuleStorage.ts`,
`shared/hooks/useLocalStorageState.ts`) імпортує singleton і
делегує всі `getString` / `setString` / `remove` / `listKeys` / `onChange`
у нього. Єдина пряма `Storage` згадка лишилася у `storageQuota.ts` —
там через renamed local binding (`const storage = globalThis.localStorage`),
бо хелпер `safeSetItem` мусить пробрасувати `setItem`-виключення
калерові (детектуючи quota / private-mode), а `webKVStore.setString`
їх свідомо swallow-ить. Renamed binding eslint-rule не тригерить
(rule перевіряє лише `localStorage.x` / `window.localStorage.x` /
`globalThis.localStorage.x` member-access patterns).

**Fix recipes для нових call-сайтів** (рекомендований порядок):

- **`webKVStore`** з `@shared/lib/storage/storage` — прямий доступ до
  KVStore-адаптера: `getString` / `setString` / `remove` / `listKeys` /
  `onChange`. Тиха обробка quota / private-mode помилок.
- **`safeReadLS<T>(key, fallback)` / `safeWriteLS(key, value)`** з
  `@shared/lib/storage/storage` — JSON-обгортка з типами і `JSON.parse`
  catch-ом для legacy-сайтів.
- **`useLocalStorageState<T>(key, initial)`** з
  `@shared/hooks/useLocalStorageState` — реактивне джерело істини у
  компоненті з debounce / serialize / validate.
- **`createModuleStorage(prefix)`** — цілий модуль зі своїм префіксом
  ключів і debounced-write-ами.
- **`safeJsonSet(key, value)` / `safeSetItem(...)`** з
  `@shared/lib/storage/storageQuota` — коли потрібно знати, чи запис
  пройшов (повертає `{ ok, reason, error }`); usual call-site —
  storage manager-міграції, які мають перезапускатись на write
  failure.

**Closed (2026-05-07, PR-и #063 / #064 / #065).** Фізичний свап `webKVStore` з
`window.localStorage` на SQLite-backed `kv_store(key TEXT PK, value JSON)` —
виконано трьома хвилями:

- **PR #063 (web swap із dual-write canary).** `webKVStore` фасад тепер делегує
  через `apps/web/src/shared/lib/storage/storage.ts:resolveStore()` — двоступенева
  драбина: (1) SQLite warm-cache (`getActiveSqliteKvStore()` після
  `bootstrapKvStore()` із PR #062) → reads з in-memory `Map<string, string>`
  popul-нутою на boot, writes — fire-and-forget `INSERT … ON CONFLICT(key) DO
UPDATE` у `kv_store`; cross-tab `onChange` через `BroadcastChannel("kv-store")`.
  (2) `localStorage`-fallback — pre-bootstrap, на bootstrap failure, у SSR / private
  mode / very old iOS WebView. (3) In-memory fallback — SSR + private mode без
  DOM `Storage`. PR #063 запустив 4-тижневий dual-write canary (writes у LS
  паралельно для rollback safety).
- **PR #064 (drop LS mirror, SQLite-only).** Stage 9 storage-roadmap-у —
  прибрано dual-write mirror, тепер SQLite — primary store, LS — лише fallback
  rung. Stage 7 → 9 closure.
- **PR #065 (mobile mirror).** `apps/mobile/src/lib/storage.ts:mobileKVStore`
  переключено на той самий SQLite-backed `kv_store` (через op-sqlite RN bridge
  замість sqlite-wasm). MMKV-fallback для legacy reads збережено на період
  міграційного покриття.

Це закриває §2 повністю: eslint-боундарі unified, споживачі бачать ту саму
`KVStore`-сигнатуру, а бекенд — durable SQLite з cross-tab fanout.

</details>

---

### 2.5. ~~Hub Settings & Reports tab cold-mount cost — 10+ s tab freeze~~ — Виконано

> **Closed 2026-06-02 — Initiative 0017 code-complete.** Sprint 0 ([#3043](https://github.com/Skords-01/Sergeant/pull/3043) — RUM instrumentation `hub_tab_switch_perf`), Sprint 1 ([#3102](https://github.com/Skords-01/Sergeant/pull/3102) — per-section `React.lazy` + `FinykSection` viewport gating), and Sprint 2 ([#3094](https://github.com/Skords-01/Sergeant/pull/3094) — HubReports per-card lazy, `HubReports.tsx` 608 → **261 LOC**) all merged. Sprint 3 (Web Worker for `aggregateReport`) explicitly **skipped** at the [Sprint 3 decision](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0017-hub-tabs-mount-perf.md#sprint-3-decision-2026-06-01) — conditional on a post-merge 30-day RUM cut showing `aggregateReport` P95 > 50 ms; if the threshold trips, Sprint 3 re-opens as a discrete follow-up against the initiative rather than re-living here.
>
> Removed from the active watchlist because the engineering work is shipped. RUM-target verification (Settings P50 ≤ 2 s, Reports P50 ≤ 1.5 s, long-task P95 ≤ 5, main chunk −50 KB) continues to be tracked by Initiative 0017 — those are validation checkpoints, not unfinished mitigation work.
>
> Historical detail preserved below for the audit trail (root cause, guardrails, target metrics).

**Симптом (2026-05-20 prod audit):** клік на bottom-nav таб `?tab=settings` або `?tab=reports` показує `PageLoader` skeleton на 10+ секунд на desktop (mid-range mobile estimate: 25+ с). Chunk download уже **не** проблема — `prefetchHubNavigationPages` без зовнішньої idle-обгортки ([PR #3043](https://github.com/Skords-01/Sergeant/pull/3043)) дає chunks за 31 ms (cache-hit). Затримка — у JS execution та initial mount cost.

**Root cause:**

- [`apps/web/src/core/hub/HubSettingsPage.tsx`](../../../apps/web/src/core/hub/HubSettingsPage.tsx) (457 LOC) рендерить 14 секцій active-group одним render burst. Кожна секція (особливо `FinykSection` 635 LOC, `NutritionSection` 284 LOC) тягне свій `useQuery`, `useEffect`, cross-module hooks (`useFinykStorage`, `useMonoBackfillProgress`, `useNutritionDualWriteBoot` тощо). _(Sprint 1 уже зробив ці секції lazy + Suspense — див. Status вище.)_
- [`apps/web/src/core/hub/HubReports.tsx`](../../../apps/web/src/core/hub/HubReports.tsx) (608 → **261 LOC** після Sprint 2 per-card lazy) робив heavy `useMemo(aggregateReport)` over всі 4 localStorage shards (`fizruk_workouts_v1`, `finyk_tx_cache`, `hub_routine_v1`, `nutrition_log_v1`) + `generateInsights` рекомендації — синхронно на main thread; тепер розрізано на per-card lazy chunks.
- `<SuspenseWithMinDelay>` приховує цю роботу за skeleton, але не прискорює — лише робить flicker менш різким.

**Як ловити нові випадки в CI:**

- Bundle-size gates (`size-limit` + `check-eager-bundle.mjs`; легасі-скрипт `check-bundle-size.mjs` видалено 2026-08-06 — 0 каллерів) тримають розмір, але не ловлять mount cost. Треба додати окремий PostHog event `hub_tab_switch_perf` як RUM-metric (заплановано у Sprint 0).
- Lighthouse CI на `/?tab=settings` route — `Total Blocking Time` поріг ≤300 ms (наразі ~7000 ms estimate).

**Guardrail:**

- [`apps/web/src/shared/components/ui/SuspenseWithMinDelay.tsx`](../../../apps/web/src/shared/components/ui/SuspenseWithMinDelay.tsx) лишається для уникнення skeleton-flicker, але не плутаємо це з perf-fix-ом.
- Будь-яка нова Section у `apps/web/src/core/settings/` має `useInView` gate на heavy queries — додамо ESLint правило після Sprint 1 завершення.

**Open Initiative:** [0017 — Hub Settings & Reports mount perf](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0017-hub-tabs-mount-perf.md) — 5 PR-ів за 3 спринти:

1. **Sprint 0 (`feat/0017-hub-tab-perf-rum`) — shipped 2026-05-20**: PostHog `hub_tab_switch_perf` baseline, `PerformanceObserver({type:"longtask"})`. Runbook: [`docs/03-operations/observability/hub-perf-baseline.md`](../../03-operations/observability/hub-perf-baseline.md).
2. Sprint 1.1 (`feat/0017-settings-section-skeleton-primitive`): per-section `React.lazy()` + `SectionSkeleton` стабільної висоти.
3. Sprint 1.2 (`feat/0017-settings-cross-module-defer`): `useInView` gate на heavy queries у sections, dynamic `import()` для cleanup-handler-ів.
4. Sprint 2 (`feat/0017-reports-per-card-lazy`): HubReports → 5 lazy cards (ExpensesCard / FitnessCard / NutritionCard / RoutineCard / WeeklyDigestCard).
5. Sprint 3 stretch (`feat/0017-reports-worker-aggregate`): тільки якщо метрики Sprint 2 показують `aggregateReport` P95 > 50 ms — Web Worker для aggregate + generateInsights.

**Target metrics (з 0017 initiative):**

- Settings P50 tab-switch: 10 000 ms → ≤ 1 000 ms.
- Reports P50: 8 000 ms → ≤ 800 ms.
- Longtask count P95: невідомо → ≤ 2 per tab-switch.

**Статус:** ~~Active~~ **Closed 2026-06-02** (Initiative 0017 code-complete — Sprint 0–2 shipped; Sprint 3 skipped). RUM-target verification лишається checkpoint-ом ініціативи, не active debt у цьому реєстрі.

---

## 🟡 Бажане

### Залишки Спринту 10: `/app`-роутинг і контракт i18n

**Перенесено 2026-08-27** із [`planning/sprint-9-10-plan-2026.md`](../planning/sprint-9-10-plan-2026.md) при закритті того трекера: вікно спринту (2026-07-07 – 2026-08-01) завершилось, а два пункти лишились відкритими. Обидва звірені з HEAD у момент переносу — це не переписані з плану твердження, а заміряний стан.

1. **S10-R1 — Hub не перенесено на `/app/`.** У [`core/app/router.tsx`](../../../apps/web/src/core/app/router.tsx) верхній маршрут лишається `/`, під ним `finyk/*`, `fizruk/*`, `nutrition/*`, `routine/*`, `insights/*`, `settings/*`, `onboarding/*`. Auth-гейт тримається на conditional render у корені, а не на межі роуту. Решта S10-R1 (LandingPage, `LANDING_VIEWED`/`LANDING_EMAIL_CAPTURED`, WaitlistForm, OpenGraph/Twitter-мета в PR #505) відвантажена — лишився рівно цей шматок.

2. **S10-R2 — кастомний i18n as-built, контракт не ратифікований.** Живе рішення: `apps/web/src/shared/i18n/` + `en.ts` + `useLocale` + `?lang=en`. Original acceptance із плану **не приземлився і не спростований**: ADR-0056 у `docs/04-governance/adr/` немає, `i18next` у `pnpm-lock.yaml` немає, скрипта `lint:i18n-parity` немає. Це **needs-decision, не робота**: власник має або ратифікувати кастомне рішення окремим ADR, або дотягнути original acceptance. Поки рішення немає, EN-локаль не має механічної перевірки паритету — тобто розходження каталогів ніхто не ловить.

### Хвіст після кольорів категорій: доки дизайн-системи і паритет мобілки

**Заведено 2026-08-11** разом із родиною токенів `categoryColors` (репорт
тестера — «якби лейби категорій мали кольорову диференціацію, було б легше
зчитувати»). Сама фіча зроблена й загейчена: hue кожної категорії розведений
із модульними акцентами (`categoryColors.contract.test.js`), таблиця тирів
приїхала в `DESIGN.md` автогеном. Свідомо **не** зроблено в тому ж PR — за
рішенням власника винести в борг, щоб не роздувати діф:

1. **Доки дизайн-системи не знають про пʼяту родину.**
   `docs/05-design/design/README.md` і DesignShowcase описують палітру як
   «шість бренд-родин + статуси»; `categoryColors` там немає. Агент, який
   читає ці доки перед стилізацією, спробує пофарбувати категорію
   бренд-тиром — тобто рівно те, від чого пішли. Треба: секція в
   `README.md` + сторінка в showcase зі свотчами всіх 16 (звідти ж видно
   пари, які зливаються — див. п.3).
2. **Мобілка лишилась на старих кольорах.** `apps/mobile` бере
   `getCatColor()` (тобто вже нові `solid` — це приїхало безкоштовно), але
   чипів `tint`/`ink` там немає, а `CategoryDonut.tsx:138` досі має сирий
   `#94a3b8` під «Інше» замість `categoryColors.other.solid`. Паритет форми
   — окремим проходом під `sergeant-mobile-expo`.
3. **Сусідні hue зливаються, і це не баг, а ціна.** Після вирізання смуг
   teal/cyan/rose/lime і статус-червоного лишається ~232° дуги на 15
   хроматичних категорій, тож `travel` (53°) і `utilities` (66°) різняться
   на 13°. Колір тут ПІДСИЛЮЄ підпис, не замінює. Якщо після беж-тесту
   виявиться, що конкретна пара плутається, важіль є — рознести по
   світлоті/хромі в `CATEGORY_TIERS`, а не додавати нові hue.
4. **Кастомні категорії беруть колір за індексом.** `getCatTiers` свідомо
   ігнорує `custom.color` (один довільний hex не дає пари фон/чорнило).
   Тобто користувач, який обрав собі колір, бачить його в діаграмі, але не
   в чипі. Правильна відповідь — дати в UI вибір із тих самих 16 токенів
   замість вільної піпетки; це продуктова зміна, не рефактор.

### ~~Pro-гейт на підключенні Monobank стоїть лише на одному з двох входів~~ — закрито 2026-09-02

**Знайдено 2026-08-10** під час розбору питання «куди веде „Підключити банк“ з Фініка». Токен Monobank можна ввести з двох місць, і обидва йдуть в один і той самий `POST /api/mono/connect`:

| Вхід                                                               | Pro-гейт                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| Налаштування → `FinykWebhookServiceSection.connectWebhook`         | **є** — `if (!isPro) { setPaywallOpen(true); return; }` |
| Фінік → `NoBankBanner` → `FinykLoginScreen` → `useMonobankWebhook` | **немає** — токен летить на сервер одразу               |

Тобто Free-юзер, який зайшов через Фінік, підключає Monobank повз пейволл, а той самий юзер у Налаштуваннях бачить пропозицію купити Pro. Зараз не стріляє: `BILLING_ALL_PRO` роздав Pro усім на час бети.

**Розвʼязано зняттям гейта.** Рішення власника 2026-09-02: «Монобанк це фрі фіча». Воно збігається з тим, що канон казав увесь час — [`product-overview.md`](../../01-product/model/product-overview.md), рядок 7: «Ядро безкоштовне + **банк-sync Free назавжди**; AI — пейвол». Тобто розвилка «додати пейволл у Фінік vs прибрати з Налаштувань» була хибною з самого початку: код суперечив канону, а не чекав на продуктовий вибір.

Прибрано обидва гейти в `FinykWebhookServiceSection` (`connectWebhook` і `triggerBackfill`), разом із `PaywallModal` і копі «Авто-Mono sync доступний у Pro». Тепер обидва входи в `POST /api/mono/connect` поводяться однаково.

**Чому цього не помічали три тижні:** тести секції мокають `usePlan: () => ({ isPro: true })`, тож гілка пейволу не виконувалась жодного разу. Три тести, що її перевіряли, замінені на протилежні — Free-юзер підключається і робить backfill без перепони.

**`requirePlan` на сервер НЕ додано, і це не недогляд.** Порада з першої редакції цього пункту («гейт має жити на сервері») була слушна за умови, що фіча платна. Вона безкоштовна, тож гейтити нема чого.

> **Історія, не рекомендація.** Перша редакція наполягала: «гейт має жити на **сервері**», бо в UI він обходився і другим екраном, і звичайним `curl`. Логіка була правильна для платної фічі — і саме тому не застосовна тут: гейта не має бути ні на клієнті, ні на сервері. Факт про інфраструктуру лишається корисним для інших випадків: `requirePlan(pool, "pro")` уже працює на `routes/nutrition.ts` (`analyze-photo`, `refine-photo`) і `routes/ai-memory.ts` (два записувальні маршрути), тож для справді платного маршруту middleware готовий.

> **Виправлення 2026-08-10.** Перша редакція цього пункту стверджувала, що `requirePlan` «не використовується жодним маршрутом». Це неправда: висновок зроблено з grep-у, обрізаного `head -10` на тестових файлах. Чотири реальні виклики були на місці весь час. Формулювання звужено до того, що дійсно перевірено.

**Дотичне, вже зроблене:** компактну форму токена в Налаштуваннях витягнуто в `MonoTokenInlineForm` (потрібна у двох гілках після появи стану `invalid`). З `FinykLoginScreen` вона НЕ зливалась навмисно — то повноекранний онбординг із власною версткою, вставкою з буфера і RHF-валідацією; спільною має бути поведінка підключення, а не розмітка.

### ~~`text-subtle` у темній темі нижчий за AA на будь-якому 12px-тексті~~ — виконано 2026-08-21

> **Запис був застарілий і встиг ввести в оману.** Розвилку закрито ще
> 2026-08-21 першим варіантом («підняти значення»): `tokens.js` тепер несе
> `subtle: "#8a968e"` (5.84:1) і `muted: "#a3aea6"` (7.83:1), тест
> `contrast.test.js` перевіряє `≥ 4.5:1` з поясненням про хибне послаблення
> WCAG, `DESIGN.md` переписаний. Текст нижче лишено як історію рішення —
> він більше не є відкритим боргом.

**Знайдено 2026-08-09** — не аналізом, а падінням гейта: axe дав
`[serious] color-contrast` на чотирьох підписах `/settings [dark]`
(`3.22:1` при потрібних `4.5:1`, `#5f6b64` на `#1b1613`, 12px). Точково
полагоджено в `ToggleRow` переходом на `text-muted` (5.6:1) — див.
[аудит Профілю/Налаштувань §0.6](../audits/2026-08-08-profile-settings-deep-audit.md).

**Системна частина лишається.** Помилка не в одному місці використання, а в
припущенні, записаному одразу в трьох:

- `packages/design-tokens/tokens.js:251` — `subtle: "#5f6b64", // labels ≥12px only`
- `packages/design-tokens/contrast.test.js:202` — `it("subtle on surface ≥ 3:1 (AA large / ≥12px labels)")`
- `DESIGN.md` (рядок «Текст: … subtle `#5f6b64` (лише ≥12px)»)

Усі троє кажуть, що на 12px достатньо 3:1. Це не так: послаблення WCAG до
3:1 діє від **18.66px bold / 24px regular**, а 12px — звичайний текст із
порогом 4.5:1. Тобто тест зелений тому, що перевіряє не той поріг, а токен
підписаний правилом, якого не існує.

**Чому не правив тут.** Два взаємовиключні шляхи, і вибір — власника, не
рефакторинг: або підняти значення `subtle` у темній темі (міняє вигляд усюди,
де він застосований), або лишити значення й **звузити роль** токена до
справді великого/декоративного тексту, переписавши підпис, тест і всі
поточні 12px-використання. Другий шлях чесніший, але дорожчий: спершу
потрібен облік, скільки саме місць малюють `text-subtle` дрібним текстом.

**Ціна відкладання** — гейт ловить лише те, що потрапило на аудитований
екран у темній темі; решта таких місць невидима доти, доки хтось не додасть
екран у `tests/a11y/axe.spec.ts`.

> **Закрито 2026-08-21.** Розвилку розв'язав власник — репорт тестера
> «червоні літери в темній темі погано видно і важко читати, як і сірі
> літери». Обрано перший шлях: значення підняті, роль лишилась.
> `subtle` #5f6b64 → **#8a968e** (3.22 → 5.84 на картці), `muted` #8a968e →
> **#a3aea6** (5.84 → 7.83) — щоб драбина лишилась із трьома щаблями, а не
> двома. Разом із значеннями полагоджено те, що й тримало борг відкритим:
> поріг у `contrast.test.js` піднято з 3:1 до 4.5:1 (тест був зелений на
> зламаному значенні, бо перевіряв не той поріг), а `theme.softContrast.test.ts`
> дістав гейт на всю нейтральну драбину × три поверхні × дві теми. Тобто
> тепер це ловиться на юніт-рівні, а не лише axe-ом на тих екранах, які
> хтось не забув додати в `axe.spec.ts`.

### ~~`text-{module}-strong` у темній темі~~ — закрито 2026-09-02

**Знайдено 2026-08-21** під час розбору «червоні літери в темній темі».
Статусна половина (`text-danger-strong` і три сусіди) була полагоджена
тоді ж: тир розведено на заливку (`statusStrongHex`, -800, статичний) і
чорнило (`--c-{status}-ink`, у «Чорнилі» -400). Бренд-модульна половина
лишалася статичним тиром -800 у будь-якій темі — 1.11…2.74 : 1 на
ink-поверхнях.

**Закрито 2026-09-02** тією самою механікою: `textColor` у пресеті плюс
`--c-{accent}-ink` у чотирьох тема-блоках `theme.css` і в `:root`/`.dark`
мобільного `global.css`. Джерело значень — `accentInkHex` /
`accentStrongHex` (`tokens.js`); гейти — `contrast.test.js`,
`tailwind-preset.test.js`, `theme.softContrast.test.ts` і новий
`apps/mobile/src/globalCssInk.test.ts`.

**Оцінка розміру в цьому записі була неправильною — і повчально.** Тут
стояло «189 використань, з них 46 без ручної `dark:`-пари», і ці 46
вважалися повним обсягом дефекту. Насправді відсутність пари — не та
метрика: 33 місця бренду пару **мали** (`text-brand-strong
dark:text-brand`), але `dark:text-brand` віддає stone-700, тобто
**1.75 : 1** на картці. Тобто третина «полагоджених» місць була зламана
так само, як «не полагоджені», і жоден підрахунок «скільки лишилось без
пари» цього не побачив би. Ті пари знято, а не доповнено.

Той самий клас помилки знайшовся в `ModuleHeader.tsx`: `text-brand-700
dark:text-brand` — пара-нуль, обидва класи віддають stone-700.

**Чому відкладали й що з цього вийшло.** Аргумент був «модульні акценти
несуть ідентичність, тож потрібен окремий візуальний прохід зі
скріншот-ревʼю». Скріншот-ревʼю замінено програмним заміром: контраст —
величина, яку рахують, а не оцінюють оком, і саме око пропустило ті 33
пари під час першого підрахунку.

### Чотири копії локального `Delta` у картках Хабу

**Знайдено 2026-08-06** під час проходу П4 по Хабу.

`ExpensesCard`, `FitnessCard`, `NutritionCard` і `RoutineCard` кожна містить
власну локальну функцію `Delta({ cur, prev, higherIsBetter })` — чотири
майже ідентичні копії з тією самою логікою (нуль-кейси, знак, відсоток,
стрілка, вибір кольору за `higherIsBetter`). Це не той `Delta`, що в
`@shared/components/ui/Money`: спільний показує **абсолютну** зміну
типографікою, локальний — **відсоткову** зі стрілкою-іконкою.

**Чому не звів у цьому проході.** Це не механічне дублювання, а два різні
елементи з однаковим іменем. Зведення вимагає рішення: чи потрібен
відсоток-зі-стрілкою як окрема роль у дизайн-системі, чи він має стати
варіантом спільного `Delta`, чи взагалі зникнути на користь абсолютних
чисел (стрілка — теж елемент дашборд-медіани, анти-слоп §3.2). Це рішення
власника про мову інтерфейсу, не рефакторинг.

**Ціна відкладання** — будь-яка зміна семантики дельти в Хабі потребує
чотирьох однакових правок, і розсихання між картками нічим не ловиться.

### Типографіка тексту: кікери й поширення на решту екранів

**Заведено 2026-08-05** після PR «типографіка тексту» (Фінік → Огляд). Правила
й обґрунтування — `docs/05-design/design/anti-slop-strategy.md` §4, підрозділ
«Суміжне: типографіка тексту»; мокап —
[`mockups/product/text-typography.html`](../../../mockups/product/text-typography.html).

**Чому це борг.** Шкала з восьми ролей існує, але застосунок нею майже не
користується: **84% усього тексту в `apps/web` набрано двома найдрібнішими
ролями** (`caption` 882 вживання + `label` 436 проти 84 у `title` і 44 у
`headline`), плюс 574 сирих `text-xs` / `text-sm` в обхід семантичної шкали.
`caption` і `text-xs` при цьому дають однакові 12px — дві паралельні шкали, які
в одному місці означають те саме, і за такою «ієрархією» не може стежити лінт.
Коли все третього рівня, першого немає — це §3.2/5 «однорідна густина» в
типографічному вигляді.

**Зроблено.** Правила 1–3 і 5 на Фінік → Огляд (`HeroCard`, `MonthPulseCard`):
підпис під числом, один приглушений сірий на блок, ролі замість сирих розмірів.

**Лишається двома окремими проходами** — навмисно окремими, бо в них різна
природа:

1. **Кікери — колір і риска замість `uppercase`.** ✅ **Зроблено 2026-08-06**
   (рішення власника на [`mockups/product/kickers.html`](../../../mockups/product/kickers.html),
   варіант A: речення + колір + 2px смужка).

   Оцінка «92 незалежні вживання» була завищена так само, як колись оцінка
   по `routine`: кікери вже зведені в `SectionHeading`, тож змінилися
   `sizeTokens` примітива, роль `.text-style-overline` у пресеті й ~14
   ручних сайтів. Роль лишили під тим самим іменем — «overline» у
   типографіці означає рядок НАД заголовком, а не «великі літери»;
   перейменування коштувало б 15 call-site-ів заради синоніма.

   **Два нових борги, які створив цей прохід:**
   - **`SectionHeading` `2xs`/`xs`/`sm` стали синонімами.** ✅ **Закрито
     2026-08-06** на прохання власника. 73 виклики в 46 файлах переведені
     на `xs`, самі імена вилучені з `SectionHeadingSize`. Доти домовленість
     трималась на `@deprecated`, тобто на уважності; тепер `size="sm"` не
     компілюється. Рантайм-тест «три синоніми дають однаковий клас»
     видалено — перевірку виконує компілятор, а тест на неіснуючий варіант
     написати неможливо. `AI-DANGER` біля `sizeTokens` лишається: він
     забороняє «полагодити» кікер, вигадавши штучну різницю в кеглі (12px —
     підлога шкали, нижче не можна).
   - **`FormField` `normalCase` лишився з капсом.** Мітка поля, прив'язана
     `htmlFor` до інпута, — інший елемент, ніж кікер, і той самий вибір уже
     задокументовано в `Measurements.tsx`. Але головна причина не в цьому:
     знявши капс, доведеться відповісти, що взагалі означає проп — він
     стане перемикачем між двома майже однаковими станами. Це рішення про
     API компонента, а не заміна класів. Потребує рішення власника.

   Капс лишається ще в одному місці навмисно — дволітерні скорочення днів
   у `WeekDayStrip` (силуету немає в жодному регістрі, а капс тримає рівну
   висоту в сітці календаря). Позначено `AI-DANGER` у коді.

2. **Поширення правил 1–3 і 5 на решту екранів.** Механічно, але сотні
   call-site-ів, і кожен екран потребує окремого погляду на те, що там
   «перший рівень» — автозаміна класів дасть той самий плаский результат,
   тільки іншими іменами. Робити поекранно, у порядку частоти відкриття.

   ✅ **Закрито 2026-08-06** суцільним проходом на прохання власника —
   поекранний план скасовано ним же. Переведено 109 місць у 61 файлі;
   лишилось 116 сирих `text-xs`, і кожне за причиною: 86 — розмір
   контрола, 22 — текст коментаря, 5 — таблиця-дані в `Typography.tsx`
   (там `text-xs` це ПРЕДМЕТ), 3 — явна заборона `AI-DANGER` /
   `icon-size, not type` поруч. Розбір і межа — в
   `anti-slop-strategy.md` §4, правило 5.

   **Попередній «зроблено»-список** (Фінік → Огляд, Фізрук → Дашборд, Їжа →
   Меню, Рутина) поглинутий цим проходом.

   **Пастка, яку ПОТІМ зняли заміром.** Тут стояло, що заміна
   `text-xs` → `text-style-caption` небезпечна поруч із `font-semibold`,
   бо «результат залежить від порядку в CSS». Замір у зібраному
   `index-*.css` (2026-08-06, записаний у `tailwind-preset.js`) показав
   визначений результат: ролі реєструються через `addUtilities`, тобто
   лежать у тому самому шарі, що й core-утиліти, але ВИЩЕ за них —
   `.text-style-caption` на офсеті 177815, `.font-semibold` на 180546.
   Виграє той, що нижче, тобто явна вага. Конкуренція ваги більше НЕ є
   причиною лишати сирий розмір; причини рівно дві — розмір контрола або
   потрібен саме `line-height: 1rem`. Так
   само `text-sm` → `text-style-label` піднімає вагу 400 → 500, і якщо при
   цьому ще зняти приглушення (`/75`, `/85`), вторинний текст стає помітно
   активнішим — тобто правка «за правилами» дає ефект, протилежний до
   наміру. Перевіряти кожен сайт очима, не sed-ом.

   **Оцінка залишку була завищена — але лише в `routine`.** Там з 33
   знайдених `text-xs` **13 виявились `text-xs!`** — important-оверайди
   розміру на `Button` (`h-9! px-3! text-xs!`), а не текст. Роль-утиліта без
   `!` їх просто не перебила б, тож це взагалі не мішень проходу. Реальних
   текстових сайтів було 20, з них зроблено 17.

   Перерахунок по решті модулів (2026-08-06) показав, що узагальнювати цю
   поправку не можна: оверайди — локальна особливість `routine`, а не
   загальне спотворення `grep`. Фактичний стан:

   | Модуль      | `text-xs` усього | з них `text-xs!` | сирий текст | із утилітою ваги на тому ж вузлі | `text-sm` |
   | ----------- | ---------------: | ---------------: | ----------: | -------------------------------: | --------: |
   | `routine`   |               16 |               13 |           3 |                                2 |         — |
   | `fizruk`    |              121 |                1 |         120 |                                6 |        34 |
   | `nutrition` |               71 |                0 |          71 |                                5 |        22 |
   | `finyk`     |               94 |                0 |          94 |                                1 |        29 |

   Тобто залишок — **285 сирих `text-xs`** у трьох модулях (`finyk` у
   попередній редакції цього запису взагалі не фігурував, хоч має 94), і
   лише **12 із них** сидять поруч із `font-medium/semibold/bold`, тобто
   потрапляють у пастку ваги вище. Решта ~96% — механічні, але їх усе одно
   не можна робити sed-ом: пастка не в кількості, а в тому, що вона тиха.

   **Куди йти першим** (найгустіші файли): `fizruk` —
   `pages/Body/JournalEntryCard.tsx` і `components/WorkoutTemplatesSection.tsx`
   (по 8), `components/workouts/WorkoutCatalogSection.tsx` (7); `nutrition` —
   `components/ShoppingListCard.tsx`, `components/PhotoAnalyzeCard.tsx`,
   `components/LogCardAnalytics.tsx` (по 7).

   **Два сайти в `DailyPlanCard.tsx` лишені навмисно** і позначені
   `AI-DANGER` просто в коді, щоб їх не «полагодили» наосліп: мітка поля
   вводу (`text-xs … font-semibold` — заміна на роль дала б два правила ваги
   на одному вузлі) і кегль контейнера тижневого плану (`text-sm` — роль
   підняла б вагу всім дітям, включно з нотатками, які мають лишатись
   звичайними). Обидва — не недогляд, а межа того, що можна зробити без
   перебору дітей.

**Закрито окремо:** трекінг `text-style-display` −0.03em → −0.012em
(калібрування під кирилицю) — рішення власника 2026-08-05 на матеріалі
[`mockups/product/display-tracking.html`](../../../mockups/product/display-tracking.html),
застосовано в тому ж PR. З 19 місць із роллю `display` лише 4 містять слова,
решта — числа, тож глобальність зміни менша, ніж здавалась із формулювання.

### ~~Підняти `MIN_N` крос-модульних зв'язків з 5 до 10~~ — Закрито

**Закрито 2026-08-30.** Умовою підняття було закриття бети; воно сталося, і
`MIN_N` у `apps/web/src/core/insights/digestCorrelations.ts` тепер **10**. На
час бети поріг стояв на 5 (рішення власника 2026-08-05) — щоб на малих даних
продукт узагалі щось показував і ми побачили реакцію.

**Чому це борг.** На п'яти спільних днях `|r| = 0.4` трапляється на випадкових
даних приблизно в половині випадків — перший ступінь стоїть на доказі рівня
підкидання монети. Того самого дня набір курованих пар розширено з 9 до 15
(усі шість комбінацій модулів отримали покриття), а більше перевірених гіпотез
означає вищий шанс, що якась перетне поріг випадково.

**Що вже пом'якшує.** Перший ступінь названо «Поки що збіг» — він прямо каже не
робити висновків. Картка показує `n`, а доказову смугу можна розгорнути й
побачити самі дні. Тобто твердження перевірне, але поріг від цього не міцніє.

Пов'язаний, більший борг — «нулі проти пропусків», окремим пунктом нижче.

### ~~Крос-модульні зв'язки: відрізнити «нуль» від «не записано»~~ ✅ ЗАКРИТО

**Знайдено 2026-08-05, винесено в окрему задачу рішенням власника. Закрито
2026-08-05 у наступному PR** — `ABSENCE_MEANS` у
`apps/web/src/core/lib/chatActions/crossActions/dailySeries.ts`.

**Як зроблено.** Класів вийшло три, а не два: зовнішнє дзеркало Monobank
поводиться інакше за записи, які людина створює руками.

| `ABSENCE_MEANS`      | Метрики                                           | Що робимо з порожнім днем                          |
| -------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `zero`               | `workouts`, `workout_volume`, `habit_rate`        | 0 від першого запису метрики й до кінця вікна      |
| `zero-while-covered` | `spending`, `income`                              | 0 лише між першим і **останнім** побаченим записом |
| `unknown`            | `weight`, `wellbeing`, `kcal`, `protein`, `water` | лишається поза розрахунком                         |

`income` додано до першого рядка таблиці порівняно з початковим планом: день без
вхідної транзакції — це рівно такий самий виміряний нуль, як день без вихідної,
і лишати половину пари невиправленою означало б лагодити баг наполовину.

`zero-while-covered` — це та сама вимога «не вигадувати нулі до першого запису»,
але з другого боку теж: транзакції приходять із зовнішнього дзеркала, тож день
за останнім синком може означати як «не витрачав», так і «синк відстав».
Ставити там нуль — вигадувати дані, а не читати їх.

Фікс живе в `buildDailySeries`, тобто діє **однаково** на картках зв'язків і на
chat-тулі `get_daily_series`: два шляхи фізично не можуть розійтись у числах.

**Що змінилось у значенні чисел.** Для метрик першого й другого класу середнє на
полюсі картки тепер «за календарний день», а не «за день, коли ти це записував».
Копію в `uk.crossModuleLink.ts` переписано під це (`daysNote`, коментар до
`metricUnit`).

**Що лишилось відкритим після фіксу:**

- **`habit_rate` рахує історію за СЬОГОДНІШНІМ складом звичок.**
  `readHabitRate` ділить кількість виконань дня на `active.length` — число
  активних звичок на момент читання. Додав звичку — усі попередні дні
  заднім числом «просіли». Баг передує цьому фіксу і не загострюється ним, але
  структурні нулі роблять його помітнішим, бо днів у ряді стало більше.
- **Пороги ступенів (`MIN_N`, `REPEATING_N`, `STABLE_N`) калібрувались на
  розрідженому режимі.** Див. наступний пункт — на наскрізній перевірці
  виявилось, що це не «варто перевірити», а вже зламано.

### ~~Драбина ступенів зв'язку схлопнулась на щільних рядах~~ ✅ ЗАКРИТО

**Знайдено 2026-08-05 наскрізною перевіркою на синтетичному користувачі**
(`apps/web/src/core/insights/crossModuleLinks.integration.test.tsx`),
**закрито того ж дня** рішенням власника — драбину перебудовано на силу
зв'язку (`gradeCrossModuleLink` у `crossModuleLinkTiers.ts`, AI-DANGER там же).

**Перевірено в браузері на шести персонах** (0 днів, 4 дні, лише один модуль,
45 днів із шумом, 60 днів помірних, 60 днів виражених). Ключове підтвердження —
персона «45 днів, багато шуму»: усі три пари дають «Поки що збіг» при `n = 45`,
хоча за старим правилом кожна отримала б «Тримається стабільно». І персона
«помірні»: на однаковому `n = 59` пари розійшлись по різних ступенях
(«Тримається стабільно» / «Повторюється») — рівно те розрізнення, якого драбина
не давала.

**Опис дефекту — стан ДО фіксу.** `gradeCrossModuleLink` **ставив** третій
ступінь за умовою `observations >= STABLE_N (30) || absR >= STRONG_R (0.7)`.
Саме це «або» і було дефектом; у поточному коді там `&&` — див. таблицю нижче.

Поки в рядах були лише дні з реальним записом, `n` справді вимірювало доказ
конкретної пари. Після фіксу структурних нулів `n` вимірює **інше**: скільки
днів людина користується двома модулями. У синтетичного юзера з 60 днями життя
воно однакове — **59 для всіх пар без винятку**. Отже перша умова виконується
завжди, і будь-яка помічена пара одразу отримує «Тримається стабільно» —
включно з межовою `|r| = 0.41`.

Тобто слово впевненості більше не розрізняє сильний доказ і слабкий, а саме
заради цього розрізнення драбину й будували. Перші два ступені («Поки що збіг»,
«Повторюється») стали недосяжними для будь-кого, хто користується застосунком
довше за місяць.

**Ухвалений фікс:** градація за `|r|`, а `n` лишається гейтом мовчання.

| Ступінь                  | Було                       | Пропозиція                   |
| ------------------------ | -------------------------- | ---------------------------- |
| — (мовчання)             | `n < 5` або `\|r\| < 0.4`  | без змін                     |
| 1 «Поки що збіг»         | `n < 10`                   | `0.4 ≤ \|r\| < 0.55`         |
| 2 «Повторюється»         | інакше                     | `0.55 ≤ \|r\| < 0.7`         |
| 3 «Тримається стабільно» | `n ≥ 30` або `\|r\| ≥ 0.7` | `\|r\| ≥ 0.7` **і** `n ≥ 30` |

Третій ступінь при цьому вимагає обох умов, а не однієї: сильна кореляція на
шести днях — це ще не «стабільно», і тридцять днів слабкої — теж ні.

**Регресійні тести на місці** — у `crossModuleLinkTiers.test.ts`
(«багато днів САМІ ПО СОБІ третього ступеня не дають» і «сильна кореляція САМА
ПО СОБІ третього ступеня не дає»), у `CrossModuleLinkCard.test.tsx` (обидва
випадки на рівні рендеру) і в наскрізній перевірці («на однаковому n ступінь
розрізняє сильний зв'язок і слабкий»). Разом вони не дають повернути «або»
замість «і» непомітно.

**Знахідка, що лишилась відкритою.** Персона «лише Фінік, 60 днів» бачить те
саме мовчання, що й порожній застосунок: «просто даних ще замало». Для неї це
неточно — даних якраз багато, бракує ДРУГОГО МОДУЛЯ, і скільки б вона не
записувала витрат, повідомлення не зміниться. Потрібен окремий варіант копії
(«щоб побачити зв'язок, потрібні дані щонайменше з двох сфер»), і це рішення
власника щодо тексту, а не механічна правка.

<details>
<summary>Початковий опис проблеми (для контексту)</summary>

`buildDailySeries` кладе в ряд лише дні з реальним записом
(`readMetric` → `Map<dayKey, value>`), а `computePairwiseCorrelations` бере
перетин двох рядів. Тобто **день без тренування не має значення
`workout_volume` і випадає з вибірки цілком**.

Наслідок серйозніший за похибку в числі. Пара «у дні тренувань ти витрачаєш
менше» насправді рахується **тільки по тренувальних днях** і відповідає на
інше питання: «серед днів, коли ти тренувався, більший об'єм збігається з
меншими витратами?». Фраза обіцяє порівняння з нетренувальними днями, якого
математика ніколи не робить.

Той самий механізм робив майже безглуздою пару `workouts × habit_rate`
(`workouts` існує лише в дні з тренуванням і там майже завжди дорівнює 1 —
розкиду немає, кореляція шумова). Її вже замінено на `workout_volume ×
habit_rate`, але це обхід симптому, а не причини.

**Правильний фікс.** Розділити метрики на два класи:

| Відсутність = справжній нуль                           | Відсутність = не виміряно                         |
| ------------------------------------------------------ | ------------------------------------------------- |
| `workouts`, `workout_volume`, `spending`, `habit_rate` | `weight`, `wellbeing`, `kcal`, `protein`, `water` |

Перший клас заповнювати нулями в межах вікна, другий лишити як є (не залогував
їжу ≠ не їв). Обов'язкове обмеження: **не вигадувати нулі до дати першого
запису в модулі**, інакше в новачка з'явиться 60 днів фальшивих нулів і всі
кореляції поїдуть.

**Чому окремо:** зміна перераховує всі наявні числа на картках і в тижневому
звіті, тож потребує власної перевірки й власного PR.

</details>

### ~~Винести `vendor-sqlite` з критичного шляху~~ — виконано 2026-08-07 (eager-бюджет)

**ЗАКРИТО 2026-08-07: 264.6 kB із 280.0.** `vendor-sqlite` пішов з
критичного шляху, preload-чанків 111 → 73. Сумарно за день −207.7 kB
(472.3 → 264.6), два ратчети вниз: 470 → 430 → 280 kB.

**Що спрацювало — і чому не спрацювало тричі до того.** Ділити `db-schema`
(«напрямок 1») було марно: у чанку нуль модулів пакета. Гасити `kvStoreBoot`
окремо — теж, замір давав +2.3 kB, тобто гірше. Причина спільна:
`manualChunks` склеює весь `drizzle-orm` в ОДИН чанк, тож поки лишається
бодай одне eager-ребро, ті самі 69 kB нікуди не діваються, а нові динамічні
межі лише додають чанків. **Виграш дає зняття останнього ребра, не частини.**

Останніми ребрами виявились `RootLayout.tsx` (13 boot-хуків чотирьох
модулів, статично) і `syncOpCursor.ts`, який імпортував одну рядкову
константу з барелю `db-schema/sqlite`. Рішення: `React.lazy` на чотири
boot-кластери + перенос `SYNC_OP_CURSOR_PULL_SINCE` у вже наявний вхід
`@sergeant/db-schema/shared`.

**Наступний борг уже інший.** Ціль ≤170 kB не взята (264.6 проти 170), але
кандидати тепер не в drizzle: `vendor-react` (37.5 kB), `vendor-router`
(27.1), спільний `vendor` (24.6), `vendor-react-query` (17.8), `vendor-zod`
(17.5). Це вже не «випадково потрапило», а справжній кістяк застосунку —
тобто наступний крок коштуватиме дорожче за цей.

**Гард, якого немає.** `sqlite.lazy.test.ts` мав би ловити таку регресію,
але дивиться на глибину 1 і лише на WASM-пакет — тож пропустив її від
початку. Заміна потребує обходу графа імпортів, не точкового ассерту.

---

<details>
<summary>Історія до закриття (розгорнути)</summary>

**Стан 2026-08-07: 411.7 kB із 430.0 — борг НЕ закрито, але блокер знято.**
Ліміт уперше ратчетнуто **вниз** (470 → 430 kB) після того, як `posthog-js`
виїхав із критичного шляху: 472.3 → **411.7 kB**, тобто −60.6 kB від одного
правила в `manualChunks`.

Знахідка, важливіша за число: SDK **уже** тягнувся через `await import()` і
лише за `VITE_POSTHOG_KEY` — код був лінивий, бандл ні. Catch-all
`return "vendor"` у `manualChunks` перехоплював пакет раніше, ніж Rollup
доходив до графа імпортів, і клав його в жадібний спільний чанк. **Динамічний
`import()` не гарантує лінивості, доки в `manualChunks` є catch-all.** Той
самий catch-all уже двічі обходили точковими правилами (Capacitor, sqlite) —
решту `node_modules` просто ніхто не перевірив, тож там можуть бути ще такі.

`vendor-sqlite` (69.4 kB) лишається найбільшим eager-чанком і головним боргом
цієї секції — але його опис нижче теж потребував правки, і це вже ДРУГИЙ
хибний діагноз на цьому самому чанку (перший — про `kvStoreBoot.ts`).

**Замір сорсмапи 2026-08-07.** У чанку рівно **53 модулі: 52 з `drizzle-orm`
і один tree-shaken стаб `@sqlite.org/sqlite-wasm`**. Модулів
`@sergeant/db-schema` там **нуль** — усі `sqliteTable()`-визначення разом
важать ~6.5 kB і лежать в окремому чанку. Тобто твердження «вагу дають
табличні визначення» неточне: вагу дає **рантайм drizzle**, а визначення —
лише **міст** (вони імпортують `drizzle-orm/sqlite-core`, а `manualChunks`
склеює весь `drizzle-orm` в один чанк). Наслідок практичний: **один**
eager-імпорт будь-якого символу з барелю робить eager усі 69 kB — ось чому
спроби «зрізати частину мостів» давали мінус, платячи зайвими чанками без
жодного виграшу. **Ділити `db-schema` заради розміру defs сенсу не має.**

Ціль ≤170 kB (орієнтир індустрії для мобільного) як стояла, так і стоїть.

---

**Стан 2026-08-05.** Ліміт eager-бандла ратчетнуто вгору 450 → **470 kB**
(`scripts/ci/check-eager-bundle.mjs`), бо факт на `origin/main` — **467.7 kB**
у 111 preload-чанках. Це не був регрес конкретного PR: між ратчетом 2026-08-02
(факт 430 kB) і 2026-08-05 критичний шлях виріс на ~38 kB, і гейт падав на
кожному PR незалежно від змісту — тобто перестав бути сигналом. Підняття
відновило його здатність ловити НОВІ регресії; борг лишився тут.

**Що робити — ОПИС ВИЩЕ БУВ ХИБНИЙ, виправлено 2026-08-06 заміром.**

Тут стояло, що `vendor-sqlite` (69.4 kB brotli) сидить у критичному шляху
через `kvStoreBoot.ts` і що лікується це async-boot гейтом, бо «перший екран
не має чекати на SQLite-WASM». Обидва твердження неточні, і на них уже
згаяно одну спробу.

**Що показав розбір сорсмапи зібраного чанка:** усередині `vendor-sqlite`
лежить **52 модулі `drizzle-orm` і рівно ОДИН файл `@sqlite.org/sqlite-wasm`**
— лінивий стаб. Сам WASM (~700 kB) уже винесений: `core/db/sqlite.ts` тягне
його через `await import()`, і це стереже `sqlite.lazy.test.ts`. Тобто
чекати на SQLite-WASM перший екран НЕ мусить уже сьогодні.

Eager-вага — це **drizzle-orm**, і приходить він не з `kvStoreBoot`, а з
ТАБЛИЧНИХ ВИЗНАЧЕНЬ: `@sergeant/db-schema/sqlite` будує їх через
`sqliteTable()`, тож будь-який модуль, що імпортує звідти хоч одну таблицю,
затягує весь drizzle. У eager-графі таких споживачів багато, і всі вони
піднімаються на буті: `core/syncEngine/*` (`singleton`, `syncEngineWriter`,
`replicaFreshness`, `syncOpCursor`), `core/auth/localIdentity`,
`core/durability/anonymousDataMigration`, `outboxBoot`.

**Перевірена невдала спроба (2026-08-06).** Стан KV-store винесено в реєстр
без SQLite-залежностей, `storage.ts` і `purgeLocalData` переведені на нього,
`bootstrapKvStore` у `main.tsx` — на `await import()`. Результат заміряний:
**471.7 kB проти 469.5 kB базових**, тобто на 2.2 kB ГІРШЕ і +7 чанків —
розділення додало оверхеду, а drizzle лишився, бо його тягнуть інші гілки
eager-графа. Відкочено. Не повторюй цей шлях.

**Два реальні напрямки, обидва потребують рішення власника:**

1. **Розділити схему.** У пакета вже є підшлях `./shared` (константи, імена
   таблиць). Якщо boot-модулям потрібні лише вони, а не drizzle-обʼєкти —
   перевести їх туди. Дешевше, але треба аудит кожного споживача.
2. **Підняти sync-engine ліниво.** Він не потрібен до першого кадру, і саме
   він — головний eager-споживач схеми. Дорожче й чіпає порядок буту.

**Ціль.** ≤430 kB досягнуто 2026-08-07; наступна планка — винесення `vendor-sqlite`. Очікувану цифру «~398 kB» із попередньої редакції НЕ
приймай на віру — вона виводилась із хибної моделі; міряй після зміни.
Орієнтир індустрії — ≤170 kB до інтерактиву на мобільному.

**Історія.** На 2026-08-06 було 469.5 kB із 470.0 — запасу пів кілобайта, і
2026-08-07 `main` таки пробив ліміт (472.3 kB), заваливши гейт на PR-і, що
чіпав один серверний тест. Розв'язано винесенням `posthog-js` (див. початок
секції), а не черговим підняттям числа.

**Верифікація:** `pnpm --filter @sergeant/web build && pnpm --filter @sergeant/web size:eager`.

</details>

<details>
<summary>3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано (розгорнути)</summary>

### 3. ~~Import extensions (.js/.jsx) в TypeScript файлах~~ — Виконано

**Раніше:** 413 рядків з імпортами виду `from "./foo.js"` /
`from "./bar.jsx"` у `.ts`/`.tsx` файлах — працювало через Vite resolve, але
плутало IDE auto-imports і нових контриб'юторів.

**Зараз:** виконано codemod
[`scripts/codemods/strip-js-extensions/script.mjs`](../../../scripts/codemods/strip-js-extensions/script.mjs) —
видалив `.js`/`.jsx` з 436 first-party-імпортів у 180 файлах. Зачіпає тільки
шляхи, що починаються з `.`, `@shared/`, `@finyk/`, `@fizruk/`, `@routine/`,
`@nutrition/` або `@sergeant/`. Зовнішні пакети (`@zxing/...`) спеціально
не торкається — їхні subpath-імпорти можуть вимагати реальної `.js`.

Codemod ідемпотентний: повторний запуск дасть `would rewrite 0 import(s)`.

> **Доповнено [PR #1411](https://github.com/Skords-01/Sergeant/pull/1411):** додано
> `eslint-plugin-import@^2.32.0` + правило `import/extensions: never` для
> bundler-fed apps (`apps/web`, `apps/mobile`). Зовнішні `@zxing/*` subpath-імпорти
> у allowlist. Новий код тепер не може реінтродукувати `.js`/`.jsx` extensions.

</details>

---

### 4. Великі файли (>600 рядків) — allowlist порожній; **leakers Closed (post-waves 2026-07-20)**

> **Status (2026-07-20 post-waves):** [`Initiative 0001 — Module decomposition`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0001-module-decomposition.md)
> закрита як **Done**. Lint guard `max-lines: [error, 600]` (`skipBlankLines` +
> `skipComments`) для `apps/web/src/**/*.{ts,tsx}` активний; allowlist **порожній**.
>
> ~~Active leakers~~ **Closed:** `ManualExpenseSheet.tsx` (~416 raw, [#348](https://github.com/SkOrDs-02/Sergeant/pull/348))
> і `TxRow.tsx` (~270 raw, [#350](https://github.com/SkOrDs-02/Sergeant/pull/350)).
> Monitor-лист (raw >600, eff ≤600) — у таблиці нижче.
>
> Історичний лог декомпозицій (Assets / Profile / Voice / chatActions / …)
> збережено нижче як audit trail; свіжі цифри — лише в таблиці §4.

> `finyk/pages/Assets.tsx` (раніше 1147 рядків) декомпозовано на
> `useAssetsState.ts` (259), `AssetsForm.tsx` (376), `AssetsTable.tsx` (511),
> та `Assets.tsx` (40) — усі < 600 LOC. Див. PR-3.B з аудиту.
>
> `nutrition/lib/foodDb/seedFoodsUk.ts` (раніше 1614 рядків) розбито на
> 19 файлів по категоріях у `seeds/` + barrel re-export (~44 LOC).
> Див. PR-3.C з аудиту.
>
> **2026-05-01 sync:** додатково декомпозовано `finyk/pages/Transactions.tsx`
> (767 → multiple sub-pages під `pages/transactions/`), `core/hub/HubSearch.tsx`
> (610 → `hub/search/HubSearch.tsx`), `finyk/pages/Budgets.tsx`
> (727 → split на `BudgetsLimitsSection`, `BudgetsGoalsSection`, `budgetsLib`,
> `useProactiveAdvice`), `Overview.tsx` (split на `HeroCard`, `FlowRow`,
> `MonthPulseCard`, etc.). Загалом count для `apps/web/src` 24 → 22.
>
> `core/ProfilePage.tsx` (раніше 1060 рядків) декомпозовано на
> `core/profile/ProfilePage.tsx` (96 при декомпозиції, нині 145), `PersonalInfoSection.tsx` (383),
> `MemoryBankSection.tsx` (242), `SessionsSection.tsx` (134),
> `ChangePasswordSection.tsx` (122), `DeleteAccountDialog.tsx` (104),
> `DangerZoneSection.tsx` (97) + barrel re-export `index.ts`.
> Усі < 600 LOC.
>
> `core/App.tsx` (раніше 645 рядків) декомпозовано на
> `core/App.tsx` (224 — outer provider tree + AppInner shell), `app/appPaths.ts`
> (52 — URL constants + `KNOWN_PATHS`), `app/RedirectTo.tsx` (14),
> `app/useAppEffects.ts` (153 — idle-prefetch / SW message / cloud-pull /
> hub-bus / `HUB_OPEN_MODULE_EVENT` listeners), `app/StandaloneRoutes.tsx`
> (181 — `/sign-in`, `/reset-password`, `/profile`, `/design`, `/pricing`,
> `/assistant`, `/chat`, `/welcome`, 404 dispatch), `app/HubHomeView.tsx`
> (141 — no-active-module hub home surface), `app/ActiveModuleView.tsx`
> (132 — active-module shell з лінивими `FinykApp`/`FizrukApp`/`RoutineApp`/
> `NutritionApp`). Усі < 200 LOC. Count 22 → 21.
>
> `shared/components/ui/VoiceMicButton.tsx` (раніше 852 рядків) декомпозовано на
> `VoiceMicButton.tsx` (256 — публічний компонент + re-export `useVoiceInput`/
> `UseVoiceInputOptions`/`UseVoiceInputReturn` для backward-compat),
> `voice/useVoiceInput.ts` (139 — Web Speech API hook + типи),
> `voice/useGroqVoiceInput.ts` (270 — Groq Whisper recorder hook через
> `/api/transcribe` + утиліти `pickRecorderMimeType`/`isGroqSupported`),
> `voice/PendingVoiceChip.tsx` (188 — 3-сек preview/undo чип з countdown
> ring + portal-positioning), `voice/resolveVoiceProvider.ts` (12 — env-flag
> resolver `auto`/`groq`/`webspeech`). Count 21 → 20.
>
> `core/lib/chatActions/finykActions.ts` (раніше 758 рядків, 17 case-branchів)
> декомпозовано на thin dispatcher `finykActions.ts` (96 LOC) + 7 модулів у
> `finykActions/`: `search.ts` (248 — `change_category`/`find_transaction`/
> `batch_categorize` + helpers `toIsoDay`/`toDisplayAmount`/`readSearchTransactions`/
> `matchesFinykSearch`/`clampLimit`/`formatTxList` + тип `FinykSearchTx`),
> `transactions.ts` (134 — `create_transaction`/`hide_transaction`/
> `delete_transaction`/`split_transaction` з undo на manual-entries),
> `debts.ts` (112 — `create_debt`/`create_receivable`/`mark_debt_paid`),
> `budgets.ts` (114 — `set_budget_limit`/`set_monthly_plan`/`update_budget`
> з `limit`/`goal` scope), `assets.ts` (84 — `add_asset` з shape-equality
> undo + `recurring_expense`), `monobank.ts` (50 — `import_monobank_range`
> з cache-clear + `hub:finyk-mono-import-range` event), `report.ts` (53 —
> `export_report` для week/month/custom). Усі тести (68) зелені, публічний
> API (`handleFinykAction`) ідентичний. Count 20 → 19.
>
> `core/lib/chatActions/crossActions.ts` (раніше 788 рядків) декомпозовано на
> `crossActions.ts` (78 — thin dispatcher над `action.name` switch),
> `crossActions/helpers.ts` (68 — `weekLabelToMondayKey`/`previousWeekKey`/
> `formatWeekRangeLabel`/`diffLine`), `crossActions/briefingHandlers.ts` (159 —
> `morning_briefing` + `weekly_summary`), `crossActions/goalAndUtility.ts` (94 —
> `set_goal` + `convert_units`), `crossActions/financeAnalytics.ts` (173 —
> `spending_trend` + `category_breakdown` + `detect_anomalies`),
> `crossActions/noteHandlers.ts` (64 — `save_note` + `list_notes`),
> `crossActions/memoryHandlers.ts` (84 — `remember` + `forget` + `my_profile`),
> `crossActions/exportHandler.ts` (46 — `export_module_data` з вкладеним
> per-module switch), `crossActions/compareWeeksHandler.ts` (121 — `compare_weeks`
> з 4 module-секціями). Усі < 200 LOC. Count 19 → 18.
>
> `modules/fizruk/pages/Body.tsx` (раніше 774 рядків) декомпозовано на
> `Body.tsx` (414 — публічний `Body` компонент: форма + конфігурація графіків +
> композиція), `Body/storage.ts` (33 — `TREND_STORAGE_PREFIX`/
> `JOURNAL_OPEN_STORAGE_KEY`/`JOURNAL_ENTRY_OPEN_PREFIX` константи +
> `JournalEntry` тип + `readTrendOpen`/`readPersistedOpen`/
> `writePersistedOpen` обгортки), `Body/trendUtils.ts` (19 —
> `lastValidValue`/`firstValidValue` для даних графіків), `Body/ScoreButton.tsx`
> (45 — energy/mood 1–5 кнопки + `ENERGY_LABELS`/`MOOD_LABELS`),
> `Body/CollapsibleTrendCard.tsx` (95 — collapsible картка графіка зі
> збереженим станом відкриття), `Body/JournalEntryCard.tsx` (126 — окремий
> щоденниковий запис із міткою дати + підсумком + видаленням), `Body/JournalSection.tsx`
> (78 — обгортка для журналу зі згортанням верхнього рівня). Усі < 200 LOC. Count 19 → 18.
>
> `core/onboarding/seedDemoData.ts` (раніше 897 рядків) декомпозовано на
> `seedDemoData.ts` (131 — публічна обгортка: `SEEDED_KEYS` + `seedDemoData()` +
> `resetDemoData()` + `runDemoSeedFromUrl()`),
> `seedDemoData/keys.ts` (31 — всі localStorage-ключі),
> `seedDemoData/utils.ts` (100 — write/remove helpers + `dateKey`/`daysAgo`/
> `shortId`/`buildMonoTx` + типи `MonoTx`/`ManualExpense`),
> `seedDemoData/seedFinyk.ts` (282 — фікстура для Finyk: 23 Mono-транзакції + 4 ручні
> витрати + місячний план), `seedDemoData/seedFizruk.ts` (120 — 2 тренування +
> 1 вимір), `seedDemoData/seedRoutine.ts` (100 — 5 звичок + сітка
> виконань на 14 днів + план віджимань), `seedDemoData/seedNutrition.ts` (140 —
> прийоми їжі / вода / преференції за 2 дні), `seedDemoData/seedHubQuickStats.ts`
> (43 — попередній вміст рядка статусу хаба). Усі < 200 LOC. Серед seeded об'єктів всі
> промарковані `demo: true`, щоб `cleanupDemoData` коректно стрипнув їх на first-boot. Count 18 → 17.
>
> **Скоуп таблиці нижче** — лише `apps/web/src`. Mobile (CelebrationModal 671 LOC декомпозовано на оркестратор + confetti/hooks/types — max 297 LOC; раніше тут лідирував `TransactionsPage.tsx` 1215, теж декомпозовано на 14 модулів, max 523 LOC),
> packages (`packages/shared/src/lib/assistantCatalogue.ts` 1133, `schemas/api.ts` 986,
> `openapi/routes.ts` 837), server (`modules/chat/chat.ts` 783) — трекаються окремо
> (mobile tracker — `docs/90-work/tech-debt/mobile.md`).

| Рядків (raw / effective) | Файл                                                  | Категорія                                                                                          |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **~416 / ≤600**          | `modules/finyk/components/ManualExpenseSheet.tsx`     | **Closed** [#348](https://github.com/SkOrDs-02/Sergeant/pull/348) — sections + model extracted     |
| **~270 / ≤600**          | `modules/finyk/components/TxRow.tsx`                  | **Closed** [#350](https://github.com/SkOrDs-02/Sergeant/pull/350) — menu / edit / format extracted |
| 675 / ~568               | `modules/nutrition/NutritionApp.tsx`                  | Monitor (passes rule)                                                                              |
| 655 / ~598               | `modules/fizruk/pages/Body.tsx`                       | Monitor (headroom ~2)                                                                              |
| 646 / ~550               | `modules/nutrition/lib/sqliteWriter/adapter.ts`       | Monitor                                                                                            |
| 638 / ~525               | `shared/components/ui/CelebrationModal.tsx`           | Monitor                                                                                            |
| 634 / ~512               | `shared/components/layout/ModuleHeader.tsx`           | Monitor                                                                                            |
| 623 / ~586               | `modules/routine/components/RoutineCalendarPanel.tsx` | Monitor                                                                                            |
| 615 / ~558               | `modules/finyk/FinykApp.tsx`                          | Monitor                                                                                            |
| 606 / ~474               | `shared/components/ui/EmptyState.tsx`                 | Monitor                                                                                            |
| 912 / ~593               | `shared/i18n/uk.ts`                                   | Monitor (i18n catalog — не feature-моноліт)                                                        |
| 653 / ~551               | `shared/i18n/en.ts`                                   | Monitor                                                                                            |

**Імпакт (для monitor-ряду):** повільніший code review біля порогу 600;
Hard Rule #18 leakers з re-audit **закриті** (#348 / #350).

**Fix (якщо знову >600):** поступовий split — sub-components / hooks / utils;
окремі PR без feature-міксу.

---

<details>
<summary>5. ~~`eslint-disable react-hooks/exhaustive-deps`~~ — Виконано (розгорнути)</summary>

### 5. ~~`eslint-disable react-hooks/exhaustive-deps`~~ — Виконано (документація)

Web production disables знято (wave 4 → **0**); історія патернів —
[`apps-web-exhaustive-deps.md`](../../02-engineering/architecture/apps-web-exhaustive-deps.md).
Живі **9** сайтів — у mobile:
[`apps-mobile-exhaustive-deps.md`](../../02-engineering/architecture/apps-mobile-exhaustive-deps.md).
Новий disable без WHY-коментаря / без рядка в каталозі — рев'ю блокує.

</details>

---

### 6. Тестове покриття — 875 test файлів на 999 source; lines floor **89**

Coverage floor (`coverage-thresholds.json` → `apps/web`): **89** lines
(+ branches 75 / functions 82 / statements 87 у `vitest.config.js`).
Кількість test-файлів виросла органічно (re-audit 2026-07-20: 875 vs 999 source).
Критичні модулі без тестів / з тонким покриттям (історичний backlog — більшість закрита):

- ~~`HubReports.tsx` (608 → **261 LOC** після 0017 Sprint 2 per-card decomposition; важка агрегація винесена в per-card chunks) — покриття shell-у тонке~~ — 6 тестів додано (2026-06-01)
- ~~`TodayFocusCard.tsx` (recommendation engine інтеграція)~~ — `TodayFocusCard.test.tsx` додано
- ~~`ProfilePage.tsx` (1060 рядків)~~ — декомпозовано на `core/profile/` (max 383 LOC)

**Зроблено 2026-04-28:** додано focused coverage для `HubDashboard.tsx`
(`HubDashboard.test.tsx`: module previews / empty states, inactive modules,
quick actions, callback routing, weekly digest footer).

**Зроблено 2026-05-03:** додано unit-тести для cloud-sync pure utilities
(`errorNormalizer`, `conflict/parseDate`, `conflict/pushSuccess`,
`engine/buildPayload`, `engine/retryAsync`, `queue/collectQueued`,
`state/{versions,migration,events,moduleData}`) і для
`recommendations/financeContext` (LS shapes, `thisMonthTx` filtering,
`categorySpend` legacy + canonical, manual expenses, splits, budgets/limits).
+88 cloud-sync + 21 financeContext = +109 тестів у 11 нових файлах.

**Зроблено 2026-06-01 (§6 follow-up):** додано focused coverage для трьох поверхонь, що залишались без тестів:

- `HubReports.test.tsx` (6 тестів): render smoke на empty-insights path (F23), всі чотири lazy domain card stubs (FitnessCard / ExpensesCard / RoutineCard / NutritionCard) через `vi.mock()` + Suspense, WeeklyDigestCard у week-режимі та її відсутність у month-режимі, period navigation (Попередній/Наступний, disabled-стан при offset=0), Export PDF кнопка.
- `useCoachInsight.test.ts` (6 тестів): успішна відповідь API, помилка API, читання кешу з LS, запис інсайту у LS після успіху, refresh/refetch зростає кількість викликів `postInsight`, ненатальна помилка пам'яті не блокує hook.
- `useWeeklyDigest.test.ts` (14 тестів): `aggregateFizruk` (flat array / wrapped shape / порожні вправи), `aggregateNutrition` (базова агрегація / нуль даних), `aggregateRoutine` (звички з completion / без / нуль), `getWeekRange` (ISO week boundary), hook (початковий стан, успіх, помилка, refetch, мутація).

Cloud-sync v2 engine (`syncEngineWriter`, `singleton`, `outboxBoot`, `useSyncStatus`) вже мав достатнє покриття у відповідних `*.test.ts/tsx` файлах — нові тести не потрібні.

**Зроблено 2026-06-07 (Testing/DevX T-7 helper follow-up):** PR [#3413](https://github.com/Skords-01/Sergeant/pull/3413) додав focused coverage для helper-only поверхонь, які не потребували UI/MSW сценарію:

- `activeWorkoutLib.test.ts`: active-workout id extraction, `datetime-local` conversion і cardio pace/speed calculations.
- `requestId.test.ts`: stable sync request ids для deterministic retry/debug paths.
- `finykSubscriptionCalendar.test.ts`: storage fallback, primary-vs-last-good transaction cache selection і persisted subscription event generation.

Це не піднімає web coverage floor саме по собі, але прибирає дешеві pure-helper прогалини перед наступним T-7 кроком: selectors + wallet/scenario component/hook suites.

~~**Fix:** додати тести на reports aggregation (`HubReports.tsx` UI),
залишок recommendation engine (`useCoachInsight`, `useWeeklyDigest`),
а також engine/{pull,upload,replay} cloud-sync wrappers.~~ **Виконано 2026-06-01.**

---

## 🟢 Nice-to-have

### 7. `console.*` у production коді — 3 DEV-only / documented (purge 2026-05-13)

**Re-audit 2026-05-13 (post-purge).** Скан `apps/web/src/**` (без тестів і
`__tests__/`) дає **3 виклики у 3 файлах**, усі — DEV-gated або
physically-documented:

- `shared/lib/ui/perf.ts:35` — `console.debug` під `if (import.meta.env?.DEV)`,
  додатково сховано за `hub_perf=1` LS-toggle (опціональна dev-діагностика).
- `sw/debug.ts:30` — `console.log` під `if (debugEnabled && import.meta.env?.DEV)`;
  канонічний production-шлях для SW-snapshot — `buildSwSnapshot()` (postMessage
  → `PWASection`).
- `core/observability/analytics.ts:56` — `console.log("[analytics]", event)` —
  навмисна transport-фіча analytics-ring-buffer-у; описана в docstring
  (`devtools` taps + PostHog).

Перехід виконано в PR #2583 (`chore(web): purge console.* from production
code`) разом із sub-PR #2582 (`feat(web): add Sentry-backed logger helper in
shared/lib/log`). Усі решта `console.warn`/`console.error`/`console.log` —
~55 викликів у 28 файлах — переведено на новий `logger` helper з
`shared/lib/log/`, який у production проксіює у Sentry breadcrumb /
`captureException`, а у DEV пише в `console.*`.

| Категорія                                   | Файли (key examples)                                                                | К-сть |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ----- |
| DEV-only debug toggle                       | `shared/lib/ui/perf.ts` (1 — `hub_perf` LS-flag), `sw/debug.ts` (1 — SW debug-flag) | 2     |
| Documented analytics transport (ring + log) | `core/observability/analytics.ts` (1 — навмисно, devtools tap)                      | 1     |

**Trackable follow-up:** ~~немає. Як пастка для нових випадків — додати
ESLint-правило `no-console` з allowlist на ці три рядки (та `*.test.*` /
`__tests__/`) — окремий PR (Phase 6 candidate).~~ **Виконано 2026-06-01.** ESLint-правило `no-console: error` додано до `eslint.config.js` для `apps/web/src/**` (виключення — `*.test.*`, `__tests__/`, `*.stories.*`). Три documented call-sites та `logger.ts` отримали `eslint-disable-next-line no-console` з поясненнями; 5 решта call-сайтів мігровані на `@shared/lib/log/logger`. Нові виклики `console.*` у production-коді тепер ламають CI.

---

### 8. `eslint-disable no-eyebrow-drift` — 27 рядків у `apps/web/src` + 10 у `apps/mobile/src`

Custom DS-rule пригнічується **27** разів у `apps/web/src` і **10** у `apps/mobile/src`
(re-audit 2026-07-20; стабільно з 2026-07-01). Усі з обґрунтуваннями в коментарях
(кастомні hero kickers, calendar headers, pill-overlay typography, marketing eyebrow).

**Зроблено [PR #1414](https://github.com/Skords-01/Sergeant/pull/1414):** розширено
`SectionHeading` API новими слотами (`eyebrowTone` / `eyebrowAs` / `eyebrowId` /
`renderEyebrow`) і виведено 7 disable-сайтів з mobile primitive-owners + ключові
hub/settings/dashboard кейси (mobile 17 → 10). Залишок — legitimate overrides або
кандидати на нові slot-и в наступному API-розширенні.

---

### 9. `any` типи — ✅ 0 trackable production-`any` + 2 by-design loose

**Production:** trackable `: any` / `as any` у modules/core **закриті**
(Phase 5a finyk-pages [#1452](https://github.com/Skords-01/Sergeant/pull/1452)

- hooks [#1475](https://github.com/Skords-01/Sergeant/pull/1452)).
  `@typescript-eslint/no-explicit-any` = `error` для `apps/web/src/modules/**`
  і `apps/web/src/core/**` (тести/stories exempt).

> **2026-07-20:** `core/hub/search/searchCache.ts` більше **не** містить
> `LooseRecord` / `any` — залишились parse/score LRU над `unknown`.
> By-design таблиця скорочена до 2 сайтів.

**By-design loose (2 файли, з in-line обґрунтуваннями):**

| Файл                                     | Pattern                 | Обґрунтування                                                                                                                                                                           |
| ---------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/lib/ui/parseFizrukWorkouts.ts:8` | `Record<string, any>[]` | Парсер для обох legacy-форматів (`[{...}]` і `{ workouts: [...] }`) із fizruk localStorage. Свідомо loose, бо персистовані payload-и старіші за поточну shape; type-guard у consumer-і. |
| `core/lib/lazyImport.ts`                 | `ComponentType<any>`    | Свідомий вибір над `unknown`: callers мають точну сигнатуру через `(typeof import(...)).Foo`, тут `any` потрібен щоби вирівняти всі `lazy(() => …)`-callsites під один тип.             |

**Fix recipe для нових випадків:** замінити `: any` на explicit union, на
тип з `@sergeant/finyk-domain/domain/types` (`Transaction`, `TxSplitsMap`,
`Category`, …) або на `unknown` + type-guard. Якщо shape реально гібридний
(легасі-localStorage payload), додати `eslint-disable-next-line` з
обґрунтуванням і занести у by-design таблицю вище.

**Tests (без змін):**

| Файл                                               | Рядки                             |
| -------------------------------------------------- | --------------------------------- |
| `nutrition/hooks/usePhotoAnalysis.test.tsx`        | 1                                 |
| `nutrition/hooks/useNutritionCloudBackup.test.tsx` | 1                                 |
| `nutrition/hooks/useNutritionPantries.test.tsx`    | 4                                 |
| `nutrition/components/PantryCard.tsx`              | 1 (коментар про історичний `any`) |

---

### 10. `@ts-expect-error` — 2 рядки (тільки в тестах)

`hubNav.test.ts:28,59` — тестування runtime guard з навмисно невалідним
вводом. Обґрунтоване.

---

### 11. Strict TypeScript rollout — ✅ Phase 4 complete (full `strict: true`)

**Контекст (історія):** `apps/web/tsconfig.json` мав `strict: false` +
`allowJs: true`. Базовий `packages/config/tsconfig.base.json` — `strict: true`,
але web-app перевизначав його, що було regression risk на найбільшому
production surface. Phase 4 (PR4) флипнув `strict: true` і видалив
`allowJs` — апп тепер на повному strict-режимі без bypass-патернів.

**Триетапний план:**

| Phase | Прапор                                      | Скоуп                                                                                                         | Статус      |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | `strictNullChecks`                          | `src/shared/**`                                                                                               | ✅ Виконано |
| 2     | `strictNullChecks`                          | + `src/test/**`, `src/core/{auth,cloudSync,components,hints,hooks,observability,pricing,profile}/**` (10 дир) | ✅ Виконано |
| 3     | `strictNullChecks`                          | + `src/modules/{routine,nutrition,finyk,fizruk}/**`, `src/core/{app,hub,insights,onboarding,settings,lib}/**` | ✅ Виконано |
| 3.1   | `strictNullChecks`                          | + `src/core/designShowcase/**`, `src/core/stories/**`                                                         | ✅ Виконано |
| 4     | повний `strict: true` + видалення `allowJs` | всі файли                                                                                                     | ✅ Виконано |

**Phase 1 деталі (PR-6.A):**

- Додано `tsconfig.strict.json` у `apps/web/` — extends основний tsconfig,
  додає `strictNullChecks: true`, includes тільки `src/shared/**`.
- Typecheck script оновлено: `tsc -p tsconfig.strict.json --noEmit` додано
  до pipeline.
- **Baseline error count (з `strictNullChecks` на весь `apps/web`):** 518 помилок.
  - `src/shared/**` — 7 помилок → виправлено (non-null assertions у тестах).
  - `src/core/lib/**` — 16 помилок → TODO Phase 3 (було Phase 2 у первісному плані).
  - Інші модулі (`modules/`, `core/` без lib) — ~495 помилок → Phase 3+.
- Жодних `@ts-expect-error` або runtime-змін не додано.

**Phase 2 деталі (PR — audit high-priority #1 крок 1):**

- `tsconfig.strict.json` розширено до 10 директорій:
  `src/shared`, `src/test`, `src/core/{auth, cloudSync, components, hints, hooks, observability, pricing, profile}`.
- **Виправлено cross-file SpeechRecognition type-collision** між
  `useSpeech.ts` (`declare global Window`) і `VoiceMicButton.tsx` (локальна
  форма). Глобальну augmentation знято — `useSpeech.ts` читає `window`
  через приватний cast (`WindowWithSpeech`), що не навʼязує єдиної
  сигнатури іншим call-сайтам.
- **1 null-check error виправлено** у `useCloudSync.behavior.test.ts`
  (`localStorage.getItem(...)` → додано `expect(...).not.toBeNull()`
  - `as string` перед `JSON.parse`).
- Жодних змін у runtime-коді (лише типи + один тест assertion).

**Phase 2.1 деталі (audit high-priority #1, крок 2 — `core/hub` + `core/settings`):**

- `tsconfig.strict.json` розширено ще на 2 директорії: `src/core/hub/**`
  і `src/core/settings/**` (разом 12 директорій).
- Strict-null помилки в **імпортованих із цих директорій** файлах
  виправлені in-place (16 помилок у 5 файлах):
  - `core/lib/hubChatContext.ts` — guard на `x.startedAt` (optional) і
    `sorted[0]?.items` перед викликом `.length`.
  - `modules/finyk/hooks/useStorage.ts` — explicit `NetworthSnap` тип
    для `networthSnapshotRef`, щоб перестати інферити `value: null`
    літерально.
  - `modules/finyk/lib/lsStats.ts` — explicit generics
    `safeReadLS<string[]>` / `safeReadLS<Record<string,string>>` /
    `safeReadLS<Array<{linkedTxIds?: string[]}>>` замість inference
    від дефолта `[]`.
  - `modules/routine/components/HabitDetailSheet.tsx` — явний
    `habit.weekdays && habit.weekdays.length > 0` замість
    optional-chain + `> 0`.
  - `modules/routine/lib/finykSubscriptionCalendar.ts` — generic
    `safeReadLS<unknown[] | null>` замість дефолта `null`.
- Жодних `@ts-expect-error` і жодних runtime-змін — лише сигнатури
  `safeReadLS`/`readJSON` та null-guards.

**Phase 3 деталі (strict-null rollout — routine + nutrition + fizruk + finyk + core/lib):**

- `tsconfig.strict.json` розширено на всі 4 модулі та решту `src/core/`:
  `src/modules/{routine,nutrition,finyk,fizruk}/**`,
  `src/core/{app,hub,insights,onboarding,settings,lib}/**`.
- `src/modules/routine/**` та `src/modules/nutrition/**` — 0 strict-null
  помилок; модулі вже були clean завдяки null-guards доданим у Phase 2.1.
- `src/modules/fizruk/hooks/useRestSettings.ts` — `MergedSettings` тип
  змінено з `typeof REST_DEFAULTS` (literal `as const` types) на
  `Record<keyof typeof REST_DEFAULTS, number>`, оскільки user overrides
  повертають `number`, а не літеральні `90 | 60 | 30`.
- `src/core/lib/` тест-файли (4 файли, 8 помилок) — додано explicit
  array type annotations для `never[]` inference (`const txs: Array<...> = []`)
  та non-null assertions (`!`) після `expect(...).toBeDefined()` guards.
- Жодних `@ts-expect-error`, `as any`, або runtime-змін не додано.

**Phase 4 (✅ complete, PR4 merged):** увімкнено `strict: true` у
головному `apps/web/tsconfig.json`, видалено `allowJs`, виправлено всі
**419 помилок** strict-mode без `any`/`@ts-expect-error`/`as unknown as`.
Web-app тепер на повному strict-режимі — `pnpm --filter @sergeant/web
typecheck` зелений на чистому tsconfig (без діагностичних додатків).

- **Підсумок (2026-05-03):**
  Стартовий baseline — **419 помилок** (повний `strict: true` +
  `allowJs: false` без змін у коді, через діагностичний
  `tsconfig.strict-full.json`).
  - **PR1 [#1388](https://github.com/Skords-01/Sergeant/pull/1388)** —
    `sw.ts` (−27), `core/onboarding/presetApply.ts` (−23) = **−50**.
  - **PR2 [#1391](https://github.com/Skords-01/Sergeant/pull/1391)** —
    5 fizruk components (`AddExerciseSheet`, `WorkoutTemplatesSection`,
    `WorkoutItemCard`, `WorkoutCatalogSection`, `ExerciseDetailSheet`):
    **−99** на стартовому baseline (на чистому main −101 завдяки
    ripple-у з типізованих props у викликах).
  - **PR3 [#1402](https://github.com/Skords-01/Sergeant/pull/1402) /
    [#1404](https://github.com/Skords-01/Sergeant/pull/1404)** —
    `Workouts.tsx` (−19), `Exercise.tsx` (−18),
    `WeeklyDigestCard.tsx` (−15) + ripple = **−55**. Pre-PR4 baseline = 194.
  - **PR4 (final flip)** — добив усі **194 залишкові помилки** + flip
    `strict: true` + видалення `allowJs`. Топ-блокери цієї фази:
    `MiniLineChart.tsx` (13), `Programs.tsx` (11),
    `WorkoutFinishSheets.tsx` (9), `QuickStartSheet.tsx` (9),
    `PresetSheet.tsx` (9), `Body.tsx` (9, через локальне розширення
    `useDailyLog`), `AssetsTxPickerView.tsx` (8),
    `useWorkoutTemplates.test.tsx` (9), `useWorkouts.test.tsx` (8),
    `WarmupCooldownChecklist.tsx` (7), `insightsEngine.test.ts` (7),
    `Atlas.tsx` (6), `FirstActionSheet.tsx` (6), плюс ~30 файлів по
    1–5 помилок (`Measurements.tsx`, `Dashboard.tsx`, `AssetsTable.tsx`,
    `Overview.tsx`, `Transactions.tsx`/`useTransactionSelection.ts`,
    `FizrukApp.tsx`/`useFizrukProgramStart.ts`, `Progress.tsx`,
    `BodyAtlas.tsx`, `RestTimerOverlay.tsx`, `WellbeingChart.tsx`,
    `TodayPlanCard.tsx`, `fizrukStorage.ts`/`fizrukStorage.test.ts`,
    `activeWorkoutLib.ts`, `hubChatContext.ts`, `featureFlags.test.ts`,
    `dailyFinykSummary.test.ts`, `hasLiveWeeklyDigest.test.ts`,
    `WorkoutJournalSection.finish.test.tsx`, `syncEngine.test.ts`,
    `useFinykPersonalization.ts`, `AssetsForm.tsx`, `TxListItem.tsx`,
    `TransactionList.tsx`, `ResetPasswordPage.tsx`,
    `ActiveWorkoutPanel.tsx`, `WorkoutItemCard.tsx`).
- **Загальний підсумок:** **−419 помилок (100 % скоупу)** через 4 PR;
  жодного `any`/`@ts-expect-error`/`as unknown as` ні в production-коді,
  ні в нових патчах. Pre-existing `: any`-плями у `transactions/budgets`-
  decompositions залишаються в окремому борговому пункті § 9.
- **Закриті топ-блокери (історія Phase 4 progress):**
  PR1 [#1388](https://github.com/Skords-01/Sergeant/pull/1388) (merged):
  `sw.ts` (27), `core/onboarding/presetApply.ts` (23). PR2
  [#1391](https://github.com/Skords-01/Sergeant/pull/1391) (merged):
  `modules/fizruk/components/workouts/AddExerciseSheet.tsx` (21),
  `modules/fizruk/components/WorkoutTemplatesSection.tsx` (21),
  `modules/fizruk/components/workouts/WorkoutItemCard.tsx` (20),
  `modules/fizruk/components/workouts/WorkoutCatalogSection.tsx` (20),
  `modules/fizruk/components/workouts/ExerciseDetailSheet.tsx` (19).
  PR3 (in flight, fizruk pages + insights):
  `modules/fizruk/pages/Workouts.tsx` (19),
  `modules/fizruk/pages/Exercise.tsx` (18),
  `core/insights/WeeklyDigestCard.tsx` (15).
- **Закриті топ-блокери:**
  `modules/finyk/hooks/useStorage.ts` (було 71),
  `modules/finyk/pages/AssetsTxPickerView.tsx` (було 30),
  `modules/finyk/pages/AssetsTable.tsx` (було 26),
  `modules/finyk/hooks/usePrivatbank.ts` (було 26) — закриті у
  `b5e47360 fix(web): eliminate implicit-any in modules/finyk`;
  `modules/fizruk/hooks/useWorkouts.ts` (було 35) — закрито у
  `12fea1d5 fix(web): eliminate implicit-any in modules/fizruk/hooks/useWorkouts`;
  `modules/fizruk/components/workouts/WorkoutJournalSection.tsx` (було 31)
  — закрито у `e29b0ba4 fix(web): eliminate implicit-any in
modules/fizruk/components/workouts/WorkoutJournalSection`;
  `modules/fizruk/components/workouts/ActiveWorkoutPanel.tsx` (було 29)
  — закрито в поточному PR через `ActiveWorkoutPanelProps` interface +
  явні типи `Workout`/`WorkoutItem`/`WorkoutGroup`/`ChecklistItem` на
  destructure-binding-ах та callback-ах (плюс розширення `WorkoutGroup`
  у `@sergeant/fizruk-domain` опціональними `type`/`restSec`, що вже
  персистились UI-ом; canonical `RestTimerState` reused з
  `useFizrukRestSound`). Загальне зниження з 768 до 374 (-394) без
  жодних runtime-змін.
- **Чому Phase 4 не дробиться через `tsconfig.noimplicitany.json`-include:**
  TypeScript застосовує `noImplicitAny` ко всій програмі (всі transitively
  reached файли), не тільки до `include`-списку. Спроба додати
  `core/{lib,hub,insights,onboarding,settings,stories,designShowcase}` в
  `tsconfig.noimplicitany.json` дає **801 помилку**, бо ці директорії
  імпортують з `modules/finyk` та `modules/fizruk`, які тягнуть всі їхні
  implicit-any. Тобто **noImplicitAny scope-розширення без попереднього
  fix-у `modules/{finyk,fizruk}` не зменшує scope** — це була б та сама
  Phase 4. Висновок: рухатись треба per-file (починаючи з топ-блокерів),
  без проміжного "Phase 3.2".

**Phase 5 clean-up (2026-05-03, post-PR4):** додатковий strict-режим прапорів

- explicit `allowJs: false` на web/console — фінальний lock down strict TS
  у repo:

* `packages/config/tsconfig.base.json` — додано `noImplicitOverride: true`.
  Прапор тепер успадковується усіма app-/package-tsconfig-ами; нові
  override-методи без `override` keyword падають у typecheck.
  - `apps/web/src/core/ErrorBoundary.tsx`,
    `apps/web/src/core/ModuleErrorBoundary.tsx`,
    `apps/web/src/shared/components/ui/SectionErrorBoundary.tsx` —
    додано `override` до 5 React class methods (`componentDidCatch`,
    `render`).
  - `packages/db-schema/src/migrate/runner.ts` — `MigrationFailedError.cause`
    позначено `override` (наслідується з `Error.cause`).
* `apps/web/tsconfig.json` — додано explicit `"allowJs": false`
  (override наслідуваного `true` з base) і прибрано
  `vite.config.js`/`vitest.config.js` з `include` (build-config-и не
  type-check-аються разом з src).
* `tools/openclaw/tsconfig.json` — додано explicit `"allowJs": false`
  (у `tools/openclaw/src` немає JS-файлів, прапор виставлено на майбутнє
  без зміни поведінки).
* `apps/web/src/modules/fizruk/lib/dualWrite/__tests__/adapter.test.ts` —
  drive-by фікс 18 pre-existing TS7053 помилок, що були прихованими
  до увімкнення `noImplicitOverride` через свою власну природу
  (10 викликів `handle.client.all<…>()` обернуто в `await`, бо
  `SqliteMigrationClient.all()` має сигнатуру `R[] | Promise<R[]>`).
* ~~`apps/server/tsconfig.json` (`allowJs: true`) і
  `apps/mobile-shell/tsconfig.json` (наслідує `true`) залишено as-is —
  вони навмисно тримають JS-файли (`migrate.mjs`, build helpers).~~
  **Закрито у Phase 5c (PR #1454):** обидва тепер на `allowJs: false`.
  `apps/server/tsconfig.json` має `migrate.mjs` у `include`, але під
  `allowJs: false` `.mjs`-файли не обробляються `tsc` (тільки `.ts`),
  тож build-helper не ламається — `pnpm --filter @sergeant/server typecheck`
  зелений. Build-pipeline не торкається — `migrate.mjs` запускається
  напряму через node, без TS-toolchain-у.

**Phase 5c — `allowJs` workspace-wide flip ([PR #1454](https://github.com/Skords-01/Sergeant/pull/1454), 2026-05-03):**

- `packages/config/tsconfig.base.json` — `allowJs: true → false`
  (single source of truth). Раніше base дозволяв JS-файлам неявно
  потрапляти у TS-pipeline через успадкування — `pnpm strict:coverage`
  на цьому показував `allowJs: ⚠️` для всіх пакетів окрім `apps/web`
  / `tools/openclaw`. Тепер base стрімкий.
- Explicit `allowJs: false` + `checkJs: false` додано на всі 12
  app/package tsconfig-и (`apps/server`, `apps/mobile`, `apps/mobile-shell`,
  `packages/{api-client,shared,db-schema,insights,finyk-domain,fizruk-domain,
nutrition-domain,routine-domain}`). Для `apps/server` — це flip з
  `true → false`; для решти — додавання прапора, бо вони раніше
  наслідували `true` з base.
- `apps/mobile/tsconfig.json` — додано 2 нові `paths` mappings:
  `@sergeant/design-tokens/tokens` → `index.d.ts`, `@sergeant/design-tokens/mobile`
  → `mobile.d.ts`. Раніше legacy glob `@sergeant/design-tokens/*` мапив
  ці subpath-імпорти на runtime `tokens.js`/`mobile.js`-файли, які під
  `allowJs: true` мовчки типувалися як `any`. Під `allowJs: false`
  TS падав з TS7016 (Could not find a declaration file). Path-mapping
  на `.d.ts` дає типи без зайвої магії.
- Регресія unblocked: `pnpm strict:coverage` тепер показує колонку
  `allowJs: —` (тобто прапор не виставлений у `true`) для всіх 13
  пакетів. 100 % strict-coverage без жодного `⚠️`.

**Phase 5 cleanup — діагностичні tsconfig-и видалено (2026-05-03):**

- `tsconfig.strict.json` і `tsconfig.noimplicitany.json` (обидва у `apps/web/`) —
  обидва extends-или main `tsconfig.json` (який тепер уже `strict: true`)
  і додавали `strictNullChecks: true` / `noImplicitAny: true` лише на
  суб-набір директорій. Після Phase 4 ці прапори вже глобально активні
  через `strict: true`, тож scoped-конфіги стали no-op-обгортками над
  тим самим скоупом — клон, що сповільнював `pnpm typecheck` без
  додаткового сигналу.
- `apps/web/package.json` — `typecheck` скрипт скорочено з 4-х tsc-passes
  (`tsconfig.json` + `tsconfig.sw.json` + `tsconfig.strict.json`
  - `tsconfig.noimplicitany.json`) до 2-х (`tsconfig.json` + `tsconfig.sw.json`).
- `tools/tsconfig-guard/allowlist.json` — застарілий entry на
  `apps/web` зі `strict: false` / `expires: 2026-08-15` видалено
  (в реальності apps/web на `strict: true` від Phase 4; entry був
  hand-over із Phase 3.1 baseline і вже не відповідав стану).
- `apps/web/src/core/lib/intentPrefetch.ts` — docstring оновлено:
  посилання на `tsconfig.strict.json`-only-scope замінено на код-сплит
  motivation (єдина причина паттерна тепер — runtime registry для
  static-import-у з hub без тягнення модульного subgraph у hub-чанк).
- Регресійний guardrail тепер такий: (1) base `tsconfig.base.json` має
  `strict: true` + `noImplicitOverride: true`; (2) `tools/tsconfig-guard`
  блокує silent-drift апп-tsconfig-ів проти base; (3) `pnpm typecheck`
  у CI ганяє повний strict pass на всі 4 апи + 9 пакетів. Окремих
  scoped-діагностичних конфігів більше не потрібно.

**Strict-pipeline regression-фікси (2026-05-02):** Pull-to-refresh PR #1330
вніс 3 strict-помилки, що ламали `tsc -p tsconfig.strict.json`. Виправлено
in-place перед initiation Phase 4:

- `shared/components/ui/PullToRefresh.tsx` — `useRef<HTMLDivElement>(null)`
  робить `current` read-only; уточнено як `useRef<HTMLDivElement | null>(null)`.
- `core/auth/ResetPasswordPage.tsx` — `{...pwValidation.getFieldProps(...)}`
  після `className={INPUT_CLS}` клобрив `INPUT_CLS` (повертає `className:
"border-danger …"`). Дістаємо `passwordFieldProps` / `confirmFieldProps`
  явно, зливаємо через `cn()`, проброс `onBlur` окремо. Це і `TS2783`-фікс,
  і реальний стилевий регрес — інпути пароля втрачали базові стилі при
  validation-error.

---

### 11.1 Що ще лишилось до «ідеального» стрікту

> **Trekається у [Initiative 0012 — Perfect TS strictness rollout](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0012-perfect-strictness-rollout.md).** Ця секція = living-burndown (per-flag статус + per-workspace baseline). Ініціатива = roadmap (15-17 PR-ів, 6 фаз, ETA 4 sprints, criteria DONE). Зміни синхронізуйте обома місцями.

Канонічний `strict: true` + `noImplicitOverride` + `allowJs: false` —
13/13 (100 %), enforced. Але «ідеально» — ні. Backlog opt-in-прапорів
та залишкових `as unknown as`-каст:

| #   | Прапор / патерн                                                                                                        | Очікуваний impact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Статус     |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `noUncheckedIndexedAccess` (`arr[i]` стає `T \| undefined`)                                                            | **1225 baseline / 280 файлів** (виміряно 2026-05-03, PR § 6a) → 0. Flipped у base, **12 / 12 пакетів = 100%** (closure PR `0012-close-strictness-rollout` 2026-05-05 закрив `apps/web` + `apps/server` residual). Allowlist для `noUncheckedIndexedAccess` — порожній. Tracked у [Initiative 0012 § Phase 6a](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0012-perfect-strictness-rollout.md).                                                                                                                                                                                          | ✅ Done    |
| 2   | `exactOptionalPropertyTypes` (`?:` не дозволяє явний `\| undefined`)                                                   | **44 baseline для `apps/server` → 0** (closure PR `0012-close-strictness-rollout` 2026-05-05 — 8 інтерфейсів + 5 call-sites; patterns: bidirectional `\| undefined` propagation + spread-only conditional includes). 12 / 12 пакетів вмикнули flag. **`apps/web` closed 2026-06-01** — ~497 baseline errors → 0; override `false` removed, allowlist entry removed. Strategy: interface widening (`prop?: T \| undefined`) + conditional spreads at call sites. Tracked у [Initiative 0012 § Phase 6b](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0012-perfect-strictness-rollout.md). | ✅ Done    |
| 3   | `noImplicitReturns` + `noFallthroughCasesInSwitch`                                                                     | **8 baseline / 8 файлів** (виміряно 2026-05-04 — `apps/web` 6, `apps/server` 2, виключно у `useEffect`-cleanup-ах і `RequestHandler`-ах; 0 `noFallthroughCasesInSwitch` violations). Flipped у base 2026-05-04 ([Initiative 0012 § Phase 6c](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0012-perfect-strictness-rollout.md)) + extended `tools/tsconfig-guard` GUARDED_OPTIONS.                                                                                                                                                                                                        | ✅ Done    |
| 4   | `noPropertyAccessFromIndexSignature` (`.foo` на index-signature → `["foo"]`)                                           | **TS4111 errors у `apps/server` → 0** (codemod-based bracket-notation transform, closure PR `0012-close-strictness-rollout` 2026-05-05). 12 / 12 пакетів вмикнули flag. **`apps/web` closed 2026-06-01** — all TS4111 `.foo` → `["foo"]` bracket-notation fixes applied; override `false` removed, allowlist entry removed. Tracked у [Initiative 0012 § Phase 6d](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0012-perfect-strictness-rollout.md).                                                                                                                                     | ✅ Done    |
| 5   | `noUnusedLocals` / `noUnusedParameters` (зараз ESLint-enforced, не TS-enforced)                                        | **1 baseline / 1 файл** (виміряно 2026-05-04 — `apps/web/src/core/db/__tests__/sqlite-wasm-fake.ts` `cols` field, mortified як dead state). Flipped у base 2026-05-04 ([Initiative 0012 § Phase 6e](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0012-perfect-strictness-rollout.md)) + extended `tools/tsconfig-guard` GUARDED_OPTIONS. ESLint `@typescript-eslint/no-unused-vars` залишається активним як doubly-redundant safety net (немає вартості, але ловить runtime-cases типу JSX-imports краще, ніж TS).                                                                       | ✅ Done    |
| 6   | `as unknown as X` у тестах (~50 файлів — mock-каст `vi.fn()`, fake `PointerEvent`, тощо)                               | mid — нормально для test-коду, але формально strict-violation. Потенційно — типізовані mock-helper-и + `vitest-mock-extended`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ⏳ pending |
| 7   | `: any` в allowlisted файлах (e.g. `apps/web/src/core/lib/lazyImport.ts:33-39 type AnyComponent = ComponentType<any>`) | low — навмисно з коментарем, але формально lint-vio. NB: `lazyImport.ts` — runtime-інфра code-splitting-у, НЕ тест; «allowlisted» тут ≠ «тестовий»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ⏳ pending |

**Phase 6a baseline-experiment (PR 2026-05-03):**

`noUncheckedIndexedAccess: true` додано у [`packages/config/tsconfig.base.json`](../../../packages/config/tsconfig.base.json).
Кожен `arr[i]` стає `T | undefined`, що ловить безмовчні runtime-баги
де index access без range-check / membership-guard.

Baseline (виміряно через `npx tsc -p tsconfig.json --noEmit` per-workspace,
обходячи turbo cascade-cancel):

| Workspace                   |   Errors |   Files | Override |
| --------------------------- | -------: | ------: | :------- |
| `apps/web`                  |      625 |     147 | `false`  |
| `apps/server`               |      335 |      57 | `false`  |
| `packages/finyk-domain`     |       73 |      18 | `false`  |
| `packages/api-client`       |       45 |       9 | `false`  |
| `packages/insights`         |     ✅ 0 |       — | `true`   |
| `packages/fizruk-domain`    |     ✅ 0 |       — | `true`   |
| `packages/nutrition-domain` |       31 |       9 | `false`  |
| `packages/shared`           |       26 |       7 | `false`  |
| `apps/mobile`               |       25 |      14 | `false`  |
| `packages/routine-domain`   |     ✅ 0 |       — | inherit  |
| `packages/openclaw-plugin`  |     ✅ 0 |       — | inherit  |
| `packages/db-schema`        |     ✅ 0 |       — | inherit  |
| `apps/mobile-shell`         |     ✅ 0 |       — | inherit  |
| **Total**                   | **1225** | **280** |          |

`packages/routine-domain` мігровано in-PR (17 errors → 0): refactor
`maxStreakAllTime` під null-check loop, `Object.entries()` замість
`Object.keys()` для notes-prefix-filter, explicit array swap з
undefined-guard. Без `!` non-null assertions.

**Follow-up міграції (round 7+):**

- `packages/shared` — `noUncheckedIndexedAccess: true` (PR [#1635](https://github.com/Skords-01/Sergeant/pull/1635)).
- `packages/nutrition-domain` — `true` (PR [#1681](https://github.com/Skords-01/Sergeant/pull/1681)), 10 errors / 4 файли закрито через `!` після `findIndex >= 0` guard.
- `packages/insights` — `true` (Item 15 round-7 follow-up, PR [#1689](https://github.com/Skords-01/Sergeant/pull/1689)), 13 errors / 2 тестових файли закрито через `recs[0]?.x` після `expect(recs).toHaveLength(1)`.
- `packages/fizruk-domain` — `true` (PR [#1779](https://github.com/Skords-01/Sergeant/pull/1779), merged 2026-05-04), 31 errors / 12 файлів → 0. Оверрайд `false` знято з [`packages/fizruk-domain/tsconfig.json`](../../../packages/fizruk-domain/tsconfig.json); allowlist-ентрі в [`tools/tsconfig-guard/allowlist.json`](../../../tools/tsconfig-guard/allowlist.json) не залишилося.

[`tools/tsconfig-guard`](../../../tools/tsconfig-guard/check.mjs) розширено:
`noUncheckedIndexedAccess` додано у `GUARDED_OPTIONS`. Allowlist
([`tools/tsconfig-guard/allowlist.json`](../../../tools/tsconfig-guard/allowlist.json))
має entries для `apps/web` та `apps/server` з `expires: 2026-09-30`.
Гайд блокує будь-який нерегламентований regress override.

[`scripts/strict-coverage.mjs`](../../../scripts/strict-coverage.mjs)
розширено: новий column `noUncheckedIndexedAccess` + summary `Phase 6a:
N / 13 packages` у markdown-output (видно у `$GITHUB_STEP_SUMMARY`).

**Per-module rollout план (решта PR-ів — 2 апи):**

1. `apps/server` — 335 errors / 57 файлів. Server-side тести найбільш
   inhomogeneous; розбити на ~3 PR per route group (`auth/`,
   `modules/`, `routes/`).
2. `apps/web` — 625 errors / 147 файлів. Розбити по `core/`,
   `modules/finyk/`, `modules/fizruk/`, `modules/routine/`,
   `modules/nutrition/`, `shared/components/` (≥6 PR per module).

Спліт `apps/server` + `apps/web` бажано розводити в часі від великих
[`0010-revenue-first-launch`](../initiatives/0010-revenue-first-launch.md)
Stripe/auth/paywall PR-ів — конфлікти merge будуть болючі. Phase 6a
закінчується одночасно з або після 0010 Phase 4 (auth migration).

_Закриті міграції (2026-05-04 round-up):_ `packages/shared` (#1635),
`packages/api-client` (inherit), `packages/nutrition-domain` (#1681),
`packages/insights` (#1689), `packages/finyk-domain` (#1750),
`packages/fizruk-domain` (#1779), `apps/mobile` (`0012-phase6a-mobile`).
11 з 13 пакетів покрито.

Each rollout PR видаляє `noUncheckedIndexedAccess: false` override з
`{app}/tsconfig.json` (та відповідну entry з `allowlist.json` для
apps/web + apps/server) і фіксить помилки. Guard заблокує regress.

**Послідовність розгортання (статус):**

- **Phase 6a (✅ Done — 2026-05-05):** `noUncheckedIndexedAccess` enabled у base. **12 / 12 packages = 100%**. Closure PR `0012-close-strictness-rollout` закрив `apps/web` + `apps/server` residual.
- **Phase 6b (✅ Done — 2026-06-01):** `exactOptionalPropertyTypes` enabled у base. **12 / 12 packages = 100%**. `apps/web` closed — all ~497 baseline errors fixed; override removed, allowlist entry removed.
- **Phase 6c (✅ Done — 2026-05-04):** `noImplicitReturns` + `noFallthroughCasesInSwitch` enabled у base. **12 / 12 packages = 100%**.
- **Phase 6d (✅ Done — 2026-06-01):** `noPropertyAccessFromIndexSignature` enabled у base. **12 / 12 packages = 100%**. `apps/web` closed — all TS4111 `.foo` → `["foo"]` fixes applied; override removed, allowlist entry removed.
- **Phase 6e (✅ Done — 2026-05-04):** `noUnusedLocals` + `noUnusedParameters` enabled у base. **12 / 12 packages = 100%**.
- **Phase 6f (✅ Done — 2026-05-05):** Audit `as unknown as X` у production: 0 matches.
- **Phase 7 (опційно):** mock-helper-и + `vitest-mock-extended` для закриття `as unknown as` у тестах.

Кожна фаза = окремий PR з baseline-метрикою у описі.

---

### 12. Strict TS coverage tracking (CI)

**Скрипт:** [`scripts/strict-coverage.mjs`](../../../scripts/strict-coverage.mjs) —
сканує всі `tsconfig.json` у `apps/*/` та `packages/*/`, резолвить `extends`
ланцюги, виводить markdown-таблицю з прапорами `strict`, `strictNullChecks`,
`noImplicitAny`, `noUncheckedIndexedAccess`, `allowJs` для кожного пакету

- summary-row `Phase 6a: N / 13 packages have noUncheckedIndexedAccess: true`.

**CI:** job `strict-coverage` у `.github/workflows/ci.yml` — інформативний
(не блокує CI), пише результат у `$GITHUB_STEP_SUMMARY`. Видно на вкладці
Summary кожного workflow run.

**Локально:** `pnpm strict:coverage` або `node scripts/strict-coverage.mjs --json`.

**Тести:** `node --test scripts/__tests__/strict-coverage.test.mjs`.

Ref: PR-6.F (sergeant-audit-devin.md).

---

### 13. Ілюстрації до вправ Фізрука (закрито частково 2026-09-01)

> **Статус:** основну частину закрито спекою
> [`fizruk-exercise-illustrations.md`](../planning/specs/fizruk-exercise-illustrations.md):
> 139 із 199 вправ дістали по два кадри з Free Exercise DB (5.6 МБ WebP у
> `apps/web/public/exercises/`), решта показує кнопку зовнішнього пошуку.
> Відкритим лишається саме те, що радила розвідка нижче: **власні SVG-схеми
> на ~60 непокритих вправ** (переважно кардіо й сідничні ізоляції) — вони, на
> відміну від пошуку, закрили б ще й власні вправи користувача. Розвідку нижче
> лишено як є, бо вона обґрунтовує вибір джерела.

Каталог має опис техніки на кожну з 199 вправ
([`exercises.gymup.json`](../../../packages/fizruk-domain/src/data/exercises.gymup.json)),
але жодного зображення: гілка `images` в
[`ExerciseDetailSheet`](../../../apps/web/src/modules/fizruk/components/workouts/ExerciseDetailSheet.tsx)
рендериться вхолосту, бо поле порожнє в усіх записах. Спека каталогу свідомо
винесла картинки за скоуп v1
([`fizruk-catalog-programs-navigation.md`](../planning/specs/archive/fizruk-catalog-programs-navigation.md)),
цей пункт тримає результати розвідки, щоб наступний захід не починався з нуля.

**Три джерела, перевірені 2026-08-31 (завантажено по зразку, оцінено якість):**

| Джерело                                       | Ліцензія                       | Атрибуція                           | Кадр   | Що з ним не так                                     |
| --------------------------------------------- | ------------------------------ | ----------------------------------- | ------ | --------------------------------------------------- |
| Free Exercise DB (`yuhonas/free-exercise-db`) | Unlicense (суспільне надбання) | не потрібна, ре-хостинг дозволений  | ~72 кБ | фон гучний, ракурс згори, id треба мапити на наші   |
| wger (`wger.de`, автори Everkinetic)          | здебільшого CC BY-SA 3.0       | обовʼязкова + share-alike на правки | ~86 кБ | покриття нерівне: під «жим лежачи» дає вузький хват |
| Власні SVG-схеми                              | наша                           | не потрібна                         | ~2 кБ  | треба намалювати 199 штук                           |

**Чому це не поле в JSON.** 199 вправ по два кадри це 398 файлів: растр дає
29-34 МБ, тобто зображення живуть статикою поруч і вантажаться лениво при
відкритті картки. У бандл вони не лізуть у принципі: `size-limit` показує
1.41 МБ при стелі 1.42 МБ (див. `AGENTS.md § Performance budgets`).

**Рекомендований порядок:** Free Exercise DB на базові рухи (нуль юридичних
зобовʼязань), дірки закриваються власними схемами (вони ще й показують
траєкторію краще за фото), wger лишається третім запасом саме через кредити.
Генеративні зображення тут не варіант: анатомічна помилка в ілюстрації до
вправи це порада тілу, а канон fizruk §5 тримає межу «не медицина».

**Обсяг роботи:** мапінг id, реєстр ліцензій і атрибуцій, lazy-завантаження,
рядок кредитів у картці для CC-BY-SA. Це окрема спека, не правка поля.

---

## Recently completed

- ✅ Vitest path aliases — 80/80 файлів зелені
- ✅ Codemod `.js`/`.jsx` extensions — 436 імпортів очищено
- ✅ ESLint guardrail для прямих `localStorage.*` (нові виклики блокуються)
- ✅ `react-hooks/exhaustive-deps` disable-сайти — задокументовано
- ✅ `no-raw-local-storage` top-3 міграція (55 → 52 файли):
  - `core/settings/FinykSection.tsx` — 20 raw calls → `safeReadStringLS`/`safeWriteLS`/`safeRemoveLS`
  - `core/lib/chatActions/fizrukActions.ts` — 7 raw calls → `safeReadLS` + `readWorkouts()` helper
  - `core/hub/HubDashboard.tsx` — вже використовував `localStorageStore` (KVStore adapter), прибрано з allowlist
- ✅ `no-raw-local-storage` fizruk burndown (49 → 41 файлів, Phase 2.2):
  - `useTrainingProgram.ts` — `safeReadStringLS`/`safeWriteLS`/`safeRemoveLS`
  - `useFizrukWorkoutReminder.ts` — `safeReadStringLS`/`safeWriteLS` + typed params
  - `useMonthlyPlan.ts` — `safeReadLS<Partial<MonthlyPlanState>>`/`safeWriteLS`
  - `useExerciseCatalog.ts` — `safeReadStringLS`/`safeWriteLS`
  - `useFizrukProgramStart.ts` — `safeWriteLS`
  - `TodayPlanCard.tsx`, `Body.tsx`, `Dashboard.tsx`, `Progress.tsx`, `Workouts.tsx` — safe helpers
  - `useWorkouts.ts` залишився в allowlist (використовує CustomEvent для quota UX)
- ✅ Mobile APM: `tracesSampleRate` підвищено з 0 до 0.05 в продакшн Sentry RN
- ✅ `no-raw-local-storage` PWA + Finyk-hub burndown (52 → 49 файлів):
  - `core/app/pwaAction.ts` — `localStorage.getItem`/`removeItem` → `safeReadStringLS` + `safeRemoveLS`
  - `core/hooks/usePwaActions.ts` — `localStorage.setItem` у `useState` lazy-initializer → `safeWriteLS`
  - `core/hub/useFinykHubPreview.ts` — `localStorage.getItem` + `JSON.parse` у `readHasMonoData()` → типізований `safeReadLS<{ txs?: unknown[] }>`
- ✅ `no-raw-local-storage` Hub-search burndown (−4 entries в allowlist):
  - `core/hub/search/searchCache.ts` — `localStorage.getItem(key)` всередині `safeParseLS()` → `safeReadStringLS(key, null)`. Кеш `cachedParse` лишається без змін (ключ ↔ raw-string invalidation).
  - `core/hub/search/searchSources.ts` — `localStorage.getItem("fizruk_workouts_v1")` та `localStorage.getItem("fizruk_custom_exercises_v1")`, що передавалися як raw у `parseFizrukWorkouts`/`parseFizrukCustomExercises`, тепер `safeReadStringLS(...)`.
  - `core/hub/hubBackup.ts`, `core/hub/hubSearchEngine.ts` — вже не мали raw `localStorage.*`-викликів; стейл-записи прибрані з allowlist.
- ✅ `no-raw-local-storage` Modules burndown (−4 entries в allowlist):
  - `shared/lib/storage.ts` — додано `safeListLSKeys()`: безпечний `try/catch`-обгорток над `localStorage.length` + `localStorage.key(i)` для prefix-based GC-проходів (private-mode Safari → `[]`).
  - `modules/finyk/pages/Overview.tsx` — `finyk_first_insight_seen_v1` flag: `localStorage.getItem` у `useState`-lazy-initializer → `safeReadStringLS(_, null) === null`; `localStorage.setItem(_, "1")` у `useEffect` → `safeWriteLS(_, "1")` (string passthrough).
  - `modules/nutrition/hooks/useNutritionReminders.ts` — `nutrition_last_reminder_notif_key`: `readLastNotifyKey()`/`writeLastNotifyKey()` тепер делегують у `safeReadStringLS`/`safeWriteLS`.
  - `modules/routine/hooks/useRoutineReminders.ts` — `cleanupStaleRoutineNotifyKeys` GC-loop переписано на `safeListLSKeys() + safeRemoveLS()`; per-habit `routine_notify_*` flag (`getItem`+`setItem`) → `safeReadStringLS`/`safeWriteLS`. SW-postMessage side-effect збережено.
  - `modules/routine/components/RoutineCalendarPanel.tsx` — стейл-запис в allowlist (мав лише `localStorage.setItem` у коментарі, без реальних `MemberExpression`-викликів) — прибрано.
- ✅ `no-raw-local-storage` Onboarding-preset burndown (−1 entry в allowlist):
  - `core/onboarding/presetApply.ts` — прибрано локальні `safeReadJSON`/`safeWriteJSON` дублікати; усі чотири `applyXPreset()` (Finyk, Routine, Fizruk, Nutrition) переведено на `safeReadLS`/`safeWriteLS` з `@shared/lib/storage`. `safeWriteLS(FINYK_MANUAL_ONLY_KEY, "1")` зберігає попередню raw-string-семантику (string passthrough без `JSON.stringify`).

---

### `no-strict-bypass` — TODO files

**PR-6.E:** додано ESLint-правило
[`sergeant-design/no-strict-bypass`](../../../packages/eslint-plugin-sergeant-design/index.js)
зі scope `apps/web/src/**` + `apps/server/src/**`. Ловить 4 патерни:
`// @ts-expect-error`, `// @ts-ignore`, `as any`, `as unknown as X`.

Тести (`**/*.test.*`, `**/__tests__/**`, `**/*.spec.*`) — повний opt-out.

На момент введення правила (2026-04-26) в production-коді знайдено
**11 файлів** з `as unknown as X` (інших патернів — 0). Файли додані
до allowlist у `eslint.config.js`. Міграція файла = видалення рядка
з allowlist.

**2026-05-01 — allowlist обнулено.** Усі 9 файлів, що залишались на
2026-04-28, мігровані; `grep -E 'as\s+unknown\s+as|@ts-(ignore|expect-error)|\bas\s+any\b'`
на `apps/web/src/**` та `apps/server/src/**` (без тестів) повертає 0
матчів. Allowlist у `eslint.config.js` скорочено до самих лише
test-file glob-ів — правило `sergeant-design/no-strict-bypass` тепер
заblock-ить будь-яке нове введення цих патернів у production.

| Файл (мігровано)                                                    | Патерн                  |
| ------------------------------------------------------------------- | ----------------------- |
| `apps/web/src/shared/components/ui/VoiceMicButton.tsx`              | `as unknown as` (2 → 0) |
| `apps/web/src/modules/nutrition/hooks/useNutritionRemoteActions.ts` | `as unknown as` (1 → 0) |
| `apps/web/src/modules/finyk/hooks/useFinykPersonalization.ts`       | `as unknown as` (6 → 0) |
| `apps/web/src/core/lib/hubChatUtils.ts`                             | `as unknown as` (2 → 0) |
| `apps/web/src/core/App.tsx`                                         | `as unknown as` (3 → 0) |
| `apps/server/src/modules/chat/chat.ts`                              | `as unknown as` (1 → 0) |
| `apps/server/src/lib/anthropic.ts`                                  | `as unknown as` (1 → 0) |
| `apps/server/src/lib/bankProxy.ts`                                  | `as unknown as` (1 → 0) |
| `apps/server/src/lib/webpushSend.ts`                                | `as unknown as` (1 → 0) |

**Fix recipe (для майбутніх кейсів):** більшість `as unknown as X` замінюються
правильним generic type parameter, type guard (`if ('prop' in obj)`), або
`satisfies` + explicit return type.

---

## Recommended next steps

1. ~~**Декомпозиція Hard Rule #18 leakers**~~ — **Done** [#348](https://github.com/SkOrDs-02/Sergeant/pull/348) / [#350](https://github.com/SkOrDs-02/Sergeant/pull/350).
2. ~~**Storage-key / restricted-syntax WHY**~~ — **Done** [#351](https://github.com/SkOrDs-02/Sergeant/pull/351).
3. ~~**`no-non-null-assertion` burndown (перша хвиля)**~~ — **Done** [#353](https://github.com/SkOrDs-02/Sergeant/pull/353).
4. ~~**`!` burndown batch (web low-risk)**~~ — **Done** (Avatar, FocusTrap, AnimatedList, KeyboardAccessory, accountVisual, DailyPlanMealRow, LogCardAnalytics, cleanupDemoData + prefer-kyiv-time WHY). Подальший — opportunistic; AccentColorPicker / barcode / server sync — окремі PR.
5. ~~**Overlay positioning (P4 Phase 1)**~~ — **Done**: shared `useFloatingPanelPosition` for Popover / Tooltip / DropdownMenu (geometry in `floatingPosition.ts`; no Radix — size-limit).
6. ~~**Overlay shell (P4 Phase 2)**~~ — **Done**: `ConfirmDialog` / `InputDialog` — `bg-black/40` scrim, `useBodyScrollLock`, InputDialog portaled; kept `alertdialog` / form semantics.
7. **Coverage ratchet (опційно)** — floor уже **89**; наступний крок лише після headroom у CI.
8. ~~**Catalog-sync** `apps-web-exhaustive-deps.md`~~ — **Done**, але «web=0» більше не так: після хвилі 4 з'явилось 5 нових свідомих винятків, каталог їх фіксує. 2026-08-07 закрито хвіст: 4 з 5 директив не несли inline-WHY (каталог стверджував протилежне) — інваріанти перенесені в код поруч із директивою.
9. ~~**Міграція `no-raw-local-storage`**~~ — **Done** (production allowlist = 0).
10. ~~**`import/extensions: never`**~~ — **Done** ([PR #1411](https://github.com/Skords-01/Sergeant/pull/1411)).
