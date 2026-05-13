# S3 — Reward у правильний момент · post-mortem (live)

> **Last validated:** 2026-05-13 by @Skords-01 (S3.4 + S3.5 + S3.1 + S3.2 виконані).
> **Status:** Active — спринт у роботі. Документ оновлюється після кожного S3.× merge-у.

> Зворотний зв'язок до [`docs/launch/ftux-sprint-plan.md` §5](../ftux-sprint-plan.md#5-sprint-3--reward-у-правильний-момент--value-progress-2-тижні).
>
> Мета спринту: кожен click точно reward'иться там, де є value, а не там, де є clicks. Прогрес-бари — про користувача, не про систему.

---

## 1. Шкала виконання

| PR-id     | Назва                                                        | Статус  | Дата       | Нотатка                                                                                                                                                                       |
| --------- | ------------------------------------------------------------ | ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S3.4**  | refactor(hub): MotivationalFooter conditional                | ✅ DONE | 2026-05-04 | [PR #1619](https://github.com/Skords-01/Sergeant/pull/1619). Cherry-pick через S1; також задокументований у [s1-honest-valueprop.md](./s1-honest-valueprop.md).               |
| **S3.5**  | refactor(hub): single-hero rule strengthening                | ✅ DONE | 2026-05-04 | [PR #1623](https://github.com/Skords-01/Sergeant/pull/1623). `showChecklist = primaryModule && hasRealEntry && !firstActionVisible && sessionDays <= 7` — flip умови.         |
| **S3.1**  | feat(onboarding): module-aware CelebrationModal headlines    | ✅ DONE | 2026-05-04 | [PR #1626](https://github.com/Skords-01/Sergeant/pull/1626). i18n-table `FIRST_ENTRY_CELEBRATIONS` + `getFirstRealEntryModule()` детермінований scan.                         |
| **S3.2**  | feat(softauth): gain-first copy + A/B fallback               | ✅ DONE | 2026-05-04 | [PR #1630](https://github.com/Skords-01/Sergeant/pull/1630). `SOFT_AUTH_COPY_EXPERIMENT` (weights `[1, 0]` за замовчуванням); fear-варіант збережений verbatim як `fear` arm. |
| **S3.3a** | feat(hub): OnboardingProgress as value-bar (finyk + routine) | ❌ TODO | —          | Залежить від S2.1 (goal-aware first action) → S1.1 (copy-reviewer).                                                                                                           |
| **S3.3b** | feat(hub): value-bar for fizruk + nutrition                  | ❌ TODO | —          | Залежить від S3.3a.                                                                                                                                                           |

**Виконано у S3:** 4/6 (включно з cherry-pick S3.4 у попередньому циклі). Залишок — S3.3a/b — гейтиться S2.1.

---

## 2. S3.5 — single-hero rule strengthening

### Що змінилось

- `apps/web/src/core/hub/HubDashboard.tsx:415-421`:
  - Було: `showChecklist = primaryModule && !hasRealEntry && !firstActionVisible && sessionDays <= 7` — checklist рендерився **до** першого entry, конкуруючи з FirstActionHeroCard / TodayFocusCard за «що робити далі».
  - Стало: `showChecklist = primaryModule && hasRealEntry && !firstActionVisible && sessionDays <= 7` — checklist рендериться **після** першого entry, як post-celebration guide до 2nd / 3rd запису.
- `apps/web/src/core/hub/HubDashboard.test.tsx`: ModuleChecklist замокано простим `data-testid` div-ом, щоб render-collision не псувала тести bento-grid; додано тест-кейс «keeps the pre-FTUX dashboard focused on first-entry guidance» (single-hero invariant) і «renders module checklist post-FTUX within first week».
- Додано inline-фікс `react-hooks/set-state-in-effect` для `setSessionDays(recordSessionDay() || getSessionDays())` (precedent: `apps/web/src/modules/routine/useRoutineAppState.ts:201`) — `recordSessionDay()` має side-effect на storage, тому effect-only.

### Чому

Pre-S3.5 dashboard стекав два module-specific «next-step» surfaces: FirstActionHeroCard (primary CTA) **і** ModuleChecklist (3-крокова progression). Це створювало competing-attention паттерн — типову «card avalanche» з audit-у.

Single-hero rule: одночасно лише одна module-aware next-step surface може бути hero-ю. До 1-го entry — FirstActionHeroCard. Після 1-го entry, у межах перших 7 session-days, — ModuleChecklist (FirstAction уже знятий). Після 7 днів обидва зникають, dashboard переходить у звичний режим bento-grid.

### Mobile parity

Web-only. Mobile dashboard має інший layout: ModuleChecklist там не render-ається в hero-position, а в окремому tab-i, тож single-hero collision відсутній за конструкцією. Якщо mobile колись підтягне аналогічний паттерн — flag цього треба буде дублювати, але зараз не applicable.

### Метрика

Очікуємо: `module-checklist-shown` events падають у пре-FTUX cohort на ~100%, при цьому `first-entry-rate` per active module не падає (якщо падає — single-hero rule був помилкою). Перевіримо у наступному PostHog cohort report.

---

## 3. S3.1 — module-aware CelebrationModal headlines

### Що змінилось

- `packages/shared/src/lib/onboardingCelebrations.ts` (новий): таблиця `FIRST_ENTRY_CELEBRATIONS<DashboardModuleId | "default", { headline, subtext }>`. 5 варіантів — finyk / fizruk / routine / nutrition + default fallback. Helper `getFirstEntryCelebrationCopy(moduleId)`.
- `packages/shared/src/lib/firstRealEntry.ts`: новий експорт `getFirstRealEntryModule(store)` — сканує ті ж 5 джерел що й `hasAnyRealEntry`, повертає moduleId першого hit-у. Детермінований scan order: **finyk → fizruk → routine → nutrition** для tie-break-у race-кейсів.
- `apps/web/src/core/onboarding/firstRealEntry.ts`: web-adapter `getFirstRealEntryModule()` над `webKVStore`.
- `apps/web/src/core/onboarding/useFirstEntryCelebration.ts`: hook повертає `moduleId: DashboardModuleId | null` разом з `open`/`ttvMs`/`close`. Snapshot на flip-edge.
- `apps/web/src/core/onboarding/CelebrationModal.tsx`: приймає `moduleId` props; hardcoded headline/subtext замінено на `getFirstEntryCelebrationCopy(moduleId)`. Аналітичний event `celebration_shown` розширено `{ moduleId }` для funnel-сегментації.

### Чому

Стара копія («Готово за {N} с!», «Блискавично!») reframe-ила момент: celebrate-the-app, а не celebrate-the-user. На повільних девайсах / noisy network вона деградувала до cringe-pull-у («Готово за 47 с!»). TTV — це engineering metric, не user-facing copy.

Module-aware варіант звертається до того, що користувач щойно зробив, і обіцяє наступний крок:

| Module    | Headline                      | Subtext                                                                 |
| --------- | ----------------------------- | ----------------------------------------------------------------------- |
| finyk     | Перша витрата записана        | Тепер бюджет — твій. Ще кілька записів, і Sergeant покаже тренди.       |
| fizruk    | Перше тренування у щоденнику  | Тепер це твоя історія. Стабільно 2-3 рази на тиждень — і прогрес видно. |
| routine   | Звичка стартувала             | Перший день рахується. Streak з'явиться після другого підряд.           |
| nutrition | Перший прийом їжі залогований | КБЖВ почав рахуватися. Кілька днів — і побачиш свій баланс.             |
| default   | Перший запис                  | Це вже твої дані. Sergeant працює для тебе.                             |

TTV-числа лишилися тільки в analytics payload-і (`celebration_shown { ttvMs, source, moduleId }`).

### Audit guard

`packages/shared/src/lib/onboardingCelebrations.test.ts` має banned-regex audit на копії (`/блискавично/i`, `/за\s*\d/i`, `/\d\s*сек/i`, `/швидко/i`). Якщо хтось спробує знов вставити speed-bragging — тест впаде на review.

### Mobile parity

Mobile celebration лишається inline-toast-ом без headline (per design audit для compact mobile FTUX). Mobile-зміни не потрібні зараз. `getFirstEntryCelebrationCopy` сам по собі DOM-free (живе у `@sergeant/shared`), тож порт у mobile буде тривіальним коли вирішимо.

### Метрика

Очікуємо: `celebration_shown` тепер має `moduleId` payload — буде сегмент-розріз CTR на наступний крок (наприклад, повторний запис у тому ж модулі) per moduleId. Якщо один модуль значно гірше convert-ається — повертатимемося до S2 audit-у для нього.

---

## 4. S3.2 — gain-first SoftAuth copy with fear A/B fallback

### Що змінилось

- `packages/shared/src/lib/softAuthCopy.ts` (новий):
  - `SOFT_AUTH_COPY_EXPERIMENT` — id `soft_auth_copy_v1`, варіанти `["gain", "fear"]`, ваги `[1, 0]` (100% gain за замовчуванням; PostHog flag може перерозподілити трафік без коду).
  - `getSoftAuthCopy(variant, ctx)` — pure copy resolver.
  - **Gain** має 3 яруси: heavy-user (5+ entries / 3+ session-days) → entry-only (1+) → neutral fallback.
  - **Fear** збережена verbatim як pre-S3.2 копія для A/B-чесності.
  - Українська плюралізація `записи/-ів`, `день/-ні/-ів` з 11-14 genitive special-case.
- `apps/web/src/core/onboarding/SoftAuthPromptCard.tsx`:
  - Приймає `sessionDays` props (`-1` = «не виміряно»).
  - `assignVariant(webKVStore, SOFT_AUTH_COPY_EXPERIMENT)` для стабільного per-device варіанта (deterministic via fingerprint).
  - Hardcoded title/body замінено на `getSoftAuthCopy(variant, ctx)`.
  - Analytics-події (`auth_prompt_shown/_dismissed`, `auth_after_value`) розширені `{ variant, entryCount, sessionDays }` для downstream funnel-розрізу.
  - `data-variant` атрибут на root для PostHog session recordings / e2e-снапшотів.
- `apps/web/src/core/hub/HubDashboard.tsx`: пробрасує `sessionDays` у `<SoftAuthPromptCard>`. Додано той же `react-hooks/set-state-in-effect` inline-фікс що і у S3.5.

### Чому

Pre-S3.2 копія: «У тебе {N} записів. **Створи акаунт, щоб не втратити.**» — strict fear framing якраз у момент, коли користувач щойно завершив value-action. Це anti-honest: ми тільки що показали, що Sergeant працює, і одразу шантажуємо.

Нова копія визнає те, що користувач **уже зробив**:

- 5+ entries за 3+ session-days: «Готовий брати з собою? Уже {N} записів за {D} днів. Акаунт відкриває доступ з телефона та браузера.»
- 1+ entries: «Хочеш ці записи в телефоні? {N} записів вже тут. Акаунт синхронізує їх між телефоном і браузером — 20 секунд.»
- Neutral fallback (захист, не очікується у нормі): «Хочеш на всіх пристроях? Акаунт відкриває доступ з телефона та браузера. 20 секунд.»

Fear-варіант **залишений у коді**: коли вирішимо тестувати, маємо гарантовану baseline-параметрію без потреби нового релізу.

### Audit guard

`packages/shared/src/lib/softAuthCopy.test.ts` має banned-regex audit на gain-копії (`/не втратити|небезпек|зник|пропад/i`). Якщо хтось ввімкне fear-фразу в gain-arm-і — тест впаде.

### Mobile parity

`apps/mobile/src/core/dashboard/SoftAuthPromptCard.tsx` (Expo) **не зачеплений у цьому PR** — на mobile pattern компактніший (toast-style без 3-tier ladder copy). Окремий port — наступний follow-up. `getSoftAuthCopy` живе у `@sergeant/shared`, тож mobile cherry-pick буде мінімальним.

### Метрика

Очікуємо:

- `auth_prompt_shown { variant: "gain" }` → CTR (`auth_after_value`) ↑ vs історичний baseline (де копія була `fear`).
- Сегмент-розріз `entryCount` / `sessionDays` усередині gain-arm — чи heavy-users реагують краще на heavy-tier-копію.
- Якщо PostHog flag перерозподілить трафік 50/50 для gain/fear — ABS-difference у CTR має бути візуальною.

---

## 5. Cross-cutting (S3.5 + S3.1 + S3.2)

### Спільне

- `react-hooks/set-state-in-effect` rule додано у недавньому eslint-апдейті. Усі три PR-и потребували inline-disable з обґрунтуванням, бо setState у effect-і — це навмисний паттерн для one-shot translation-ів (not render-derivation).
- `react-hooks/purity` rule конфліктує з `Math.random()` у `useMemo<ConfettiParticle[]>` (S3.1) — додано scoped block-disable з justification.
- Husky pre-commit hooks пройшли всі 3 рази без `--no-verify`.

### Філософія

S3.5 — single-hero rule (одна module-aware surface за раз). S3.1 — celebration копія акцентує користувача, не engineering. S3.2 — softauth копія акцентує продовжуваність, не loss-aversion. Усі три PR-и резонують з S1-філософією «чесні обіцянки, no fake-reassurance».

---

## 6. Open follow-ups

- [x] Відкрити PR-и для S3.5 ([#1623](https://github.com/Skords-01/Sergeant/pull/1623)), S3.1 ([#1626](https://github.com/Skords-01/Sergeant/pull/1626)), S3.2 ([#1630](https://github.com/Skords-01/Sergeant/pull/1630)).
- [ ] Дочекатися PostHog cohort report-у і додати before/after метрики на:
  - CTR `auth_prompt_shown → auth_after_value` per variant.
  - `module-checklist-shown` per cohort (pre-FTUX vs post-FTUX).
  - `celebration_shown` segment-розріз per `moduleId`.
- [ ] Mobile-port для S3.2 (compact toast-pattern над gain-first copy-table).
- [ ] Розблокувати S3.3 — це гейтиться S2.1 (goal-aware first action), яка чекає copy-reviewer-а через S1.1.

---

## 7. Reference

- Sprint plan: [`docs/launch/ftux-sprint-plan.md` §5](../ftux-sprint-plan.md#5-sprint-3--reward-у-правильний-момент--value-progress-2-тижні)
- S1 post-mortem (для S3.4 cherry-pick context-у): [`s1-honest-valueprop.md`](./s1-honest-valueprop.md)
- Audit джерело: [`docs/audits/archive/2026-05-03-ftux-onboarding-roast.md`](../../../audits/archive/2026-05-03-ftux-onboarding-roast.md) (S3 рекомендації)
- Funnel definitions: [`docs/launch/04-launch-readiness.md` §4.2](../../business/04-launch-readiness.md)
- A/B test infra: `packages/shared/src/lib/abTest.ts` (`assignVariant`, `overrideVariant`, `resetAllAssignments`)
