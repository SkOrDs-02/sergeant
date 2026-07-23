# Тест-спостереження: фікси груп A і B

> **Last touched:** 2026-07-23 by Claude (Fable 5). **Next review:** 2026-08-23.
> **Status:** Active

Джерело: тест-сесія founder-а 2026-07-23. Це виконавча інструкція для груп A (баги) і B (дрібні UX-фікси). Групи C (спеки) і D (продуктові рішення) — окремо, після завершення цих задач.

Кожна задача самодостатня: root cause (де знайдений), файли, критерії приймання. Виконавець кожної задачі читає `.agents/skills/sergeant-start-here/SKILL.md` + `sergeant-web-ui` (або `sergeant-bugfix-and-regression` для розслідувань). Дизайн-правила обовʼязкові: без hex у className, `focus-visible:`, touch-targets ≥44px, opacity-scale, типографічна шкала.

---

## T1 — Hub quick-stats: продакшн-writer відсутній (A1) + drag виділяє текст (A4)

**Симптом:** картки модулів у хабі показують «Тут зʼявиться…» навіть після додавання реальних транзакцій (вручну і через Monobank).

**Root cause (підтверджений):** прев'ю хаба читає `localStorage["finyk_quick_stats"]` через `selectModulePreview("finyk", ...)` — `apps/web/src/core/hub/dashboard/moduleConfigs.tsx:87-91`, `packages/shared/src/lib/quickStats.ts:103-110` (поля `todaySpent`/`budgetLeft`). Єдиний write-шлях цього ключа — демо-сідер онбордингу `apps/web/src/core/onboarding/seedDemoData/seedHubQuickStats.ts:20`. Мутації фініка лише інвалідують RQ-кеш `hubKeys.preview("finyk")` (`apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:55-57`), але значення ніхто не переобчислює.

**Що зробити:**

1. Додати продакшн-writer: після зміни даних фініка (додавання/редагування/видалення ручної витрати, синк Monobank) переобчислювати `todaySpent`/`budgetLeft` і писати у `STORAGE_KEYS.FINYK_QUICK_STATS`, потім інвалідувати `hubKeys.preview("finyk")`. «Сьогодні» — межа доби **Europe/Kyiv** (доменний інваріант, не UTC).
2. Перевірити ІНШІ модулі (nutrition, fizruk, routine тощо): чи мають вони аналогічний quick-stats ключ без продакшн-writer-а. Якщо так — виправити тим самим патерном.
3. A4: grip-хендл drag-у модулів (`apps/web/src/core/hub/dashboard/BentoCard.tsx:285`) має `touch-none`, але при утриманні виділяється текст — додати `select-none` (перевір також, чи `nativeSortable.ts` робить `preventDefault` на потрібних подіях).

**Приймання:** unit-тест на переобчислення quick stats (з Kyiv-межею доби); ручна витрата → ключ у LS оновився; drag-хендл не виділяє текст.

## T2 — Nutrition: битий лінк «заповнити в профілі» (A2) + комора зливається (B7)

**A2 root cause (підтверджений):** `apps/web/src/modules/nutrition/.../DailyPlanGoalSelectors.tsx:271-279` — банер рендерить `<a href="#/profile">`. Роутер path-based (`createBrowserRouter`, `apps/web/src/core/app/router.tsx`); `HashRedirect.tsx` перетворює hash лише коли `pathname === "/"`. На `/nutrition/menu` клік дописує hash і нікуди не веде.
**Фікс:** замінити на навігацію роутером на реальний шлях профілю (знайди канонічний route профілю в router.tsx).

**B7:** елементи списку комори (pantry) візуально зливаються з фоном і між собою. Дати рядкам виразність найдешевшим способом у межах дизайн-системи: панельний фон рядка або розділювачі (подивись, як оформлені сусідні списки в nutrition, і повтори патерн).

**Приймання:** клік по лінку веде на профіль з `/nutrition/menu`; комора має видиму сепарацію рядків; typecheck/lint чисті.

## T3 — Pull-to-refresh зависає (A3) — розслідування

**Симптом:** pull-to-refresh «зависає» — індикатор лишається крутитись, оновлення не завершується. Відтворено founder-ом у хабі (ймовірно скрізь).

**Де шукати:** власна реалізація: `apps/web/src/shared/hooks/usePullToRefresh.ts` (threshold 80px) + `apps/web/src/shared/components/ui/PullToRefresh.tsx` + `PullToRefreshIndicator.tsx`. Споживачі: `HubMainContent.tsx`, `TransactionList.tsx` (finyk), `Workouts.tsx` (fizruk), `NutritionApp.tsx`, `RoutineTimeline.tsx`.

**Гіпотези для перевірки (у порядку):** (1) `onRefresh`-проміс у якогось споживача ніколи не резолвиться/реджектиться, а хук не має finally/таймаута для скидання стану; (2) стан хука не скидається на `touchcancel`; (3) reject не обробляється — індикатор лишається. Фікс — у спільному хуку (root cause для всіх споживачів), не в одному екрані: гарантоване скидання стану через `finally` + reasonable failsafe. Заодно прибери застарілий докблок «Scaffolded but not yet imported by any consumer» у `usePullToRefresh.ts:1-10`.

**Приймання:** unit-тест: onRefresh що реджектить/висне → індикатор скидається; докблок оновлено.

## T4 — Finik: пакет UI-фіксів списку транзакцій (A5, A6, B2, B3, B4, B6)

Всі зміни в межах `apps/web/src/modules/finyk/**`. Ключові файли: `TxRowAmountActions.tsx`, `TxListItem.tsx`, `TxRowMetaChips.tsx`, хедер модуля, банер вибору транзакцій.

1. **A5:** бейдж статусу (зелена крапка + «ок») перекриває назву модуля «Фінік» у хедері. Знайти хедер, виправити layout (без перекриття на вузьких екранах).
2. **A6 + B4:** режим вибору транзакцій: (а) банер-підказка «оберіть транзакції» висить у нижній третині екрана і перекриває контент — прибрати банер, підказку показувати інлайн біля кнопки входу в режим вибору; (б) панель дій з обраними транзакціями — зробити фіксованим toolbar-ом внизу над навбаром (не поверх контенту посеред екрана); (в) текст «не врахувати» під панеллю зливається з фоном — виправити контраст токенами дизайн-системи.
3. **B2 + B3:** іконки-кнопки «на голому фоні» — іконка редагування ліміту та кнопки редагувати/розділити/видалити/сховати в рядку транзакції. Дати їм єдиний ghost-icon-button стиль (видимий hover/active-фон, focus-visible, ≥44px touch target на coarse pointer). Якщо в shared/ui вже є відповідний варіант Button (`iconOnly`) — використати його, не винаходити.
4. **B6:** підпис дати всередині/внизу рядка транзакції — прибрати: список уже згрупований по днях, дата дублюється.

**Приймання:** скріншоти до/після не потрібні від виконавця (клік-тур зробить основна сесія); lint (дизайн-правила!) і typecheck чисті; наявні тести фініка проходять.

## T5 — Finik: банер фінплану не запамʼятовує dismiss (A7) + collapse картки Monobank (B1) + лейбли полів (B5)

1. **A7 (розслідування):** банер «Орієнтовний фінплан — постав і поправиш» (`MonthlyPlanCard.tsx:281-288`, `FirstRunHintBanner`) за кодом одноразовий: `useModuleFirstRun("finyk")` пише прапорець у LS-ключ `sergeant.onboarding.module_first_seen.finyk.v1` (`apps/web/src/core/onboarding/useModuleFirstRun.ts`, читання після `storageReady`). Founder бачить банер постійно ⇒ прапорець не переживає reload. Перевір клас багів із PR #419 (анонімні дані і reload): чи `safeWriteLS` пише до ініціалізації storage, чи ключ не мігрує між анонімним/авторизованим профілем, чи `markSeen` взагалі викликається з usage-шляху (можливо, викликається лише з explicit dismiss, а банер показується і без dismiss-кнопки на видноті). Виправити root cause.
2. **B1:** блок картки Monobank у фініку — зробити згортуваним через shared `apps/web/src/shared/components/ui/CollapsibleSection.tsx` (не inline-useState). Стан згорнутості можна не персистити.
3. **B5:** у формах фініка (мінімум `ManualExpenseSheet.tsx`) поля мають лише placeholder з назвою поля — при редагуванні юзер бачить тільки значення і втрачає контекст. Зробити: видимий label над полем + placeholder-приклад у полі. Використати існуючий патерн label-ів з shared/ui, якщо є.

**Приймання:** A7 — тест або відтворюваний доказ фіксу (прапорець переживає reload); B1/B5 — lint/typecheck чисті.

---

## Верифікація (після всіх задач)

З кореня worktree: `pnpm lint && pnpm check:typecheck-and-test`. Червоні результати — повернути задачі-власнику, не «пофіксити по дорозі» чужим виконавцем. Live клік-тур у браузері робить основна сесія після мержу задач.

## Межі

- Не комітити (рішення про коміт — за founder-ом).
- Не чіпати групи C/D (редизайн операцій, FAB/надходження, вода, цілі, аналітика, термінологія) — вони йдуть окремими спеками.
