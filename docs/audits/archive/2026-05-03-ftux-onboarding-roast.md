# Web FTUX onboarding roast (2026-05-03)

> **Last validated:** 2026-05-05 by @Skords-01 / Devin (consolidated into master tracker). **Next review:** 2026-08-03.
> **Status:** Frozen reference — see [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) for current state.

> ### 📦 Consolidated 2026-05-05
>
> Цей файл переміщено у режим **frozen reference**. Поточний стан FTUX (закриті/відкриті проблеми, sprint registry, PR plan, hero copy variants, outcome-card sketch, SLO, decisions log) живе в **[`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md)**.
>
> Для history-шукальника: вся оригінальна прожарка нижче — недоторкана. Цитати з неї у §8.1-8.3 master tracker-у.
>
> **Не редагуй цей файл** окрім: (а) `Last validated:` bump через `bump-last-validated.mjs`, (б) додавання нового errata-блоку з посиланням на master tracker. Усі змістовні оновлення статусів — у master tracker §2 (sprint registry) і §8 (findings registry).

> Критичний UX-аудит web-онбордингу очима користувача-новачка, який не знає продукт і дає продукту ≤30 секунд перш ніж піти.
> Перспектива: product-led growth, FTUX-оптимізація, behavioral design.
>
> **Cross-refs:**
> [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md) — план реалізації рекомендацій ·
> [`docs/audits/2026-04-28-ux-improvement-plan.md`](./2026-04-28-ux-improvement-plan.md) — попередній технічний UX-план ·
> [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md) — activation funnel & aha-moment hypotheses ·
> [`docs/design/empty-states.md`](../design/empty-states.md) — 3-tier empty states.

> ### Errata (2026-05-03 21:53 UTC)
>
> Початкова проджарка стверджувала, що «PostHog не підключений (analytics — stub з localStorage)». **Це неточно.** Перевірив код у `main` після спроби взяти S0.1 і виявив, що web-частину analytics уже зроблено: PostHog SDK lazy-mounted з [`apps/web/src/core/observability/posthog.ts`](../../apps/web/src/core/observability/posthog.ts), `initPostHog()` викликається з `main.tsx`, `identify`/`reset` з `AuthContext`, `<PageviewTracker />` змонтований у `App.tsx`, `posthog-js@^1.372.3` в deps. `.env.example` (root) уже має `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` коментовані; setup задокументований у [`docs/observability/frontend.md`](../observability/frontend.md). Реальні гепи лишаються: (а) mobile parity (apps/mobile = console-only stub без `posthog-js`), (б) ~9 канонічних подій з `ANALYTICS_EVENTS` визначені, але не fired у `trackEvent` call-sites — серед них `CELEBRATION_SHOWN`, `FIRST_REAL_ENTRY`, `FTUX_TIME_TO_VALUE`, `MODULE_CHECKLIST_*`, `ONBOARDING_STEP_VIEWED/COMPLETED/SKIPPED`, `BUDGET_SET`, `HINT_DISMISSED/COMPLETED`, `STREAK_MILESTONE_REACHED`, (в) PostHog FTUX dashboards docs не існує. Деталі — у [`ftux-sprint-plan.md` §2 «Status check»](../launch/product-os/ftux-sprint-plan.md#status-check-verified-2026-05-03). Висновки самої прожарки (P0–P3 рекомендації) лишаються в силі — вони про emotional design, не про transport.

> ### Errata v2 (2026-05-03 23:35 UTC) — Sprint 0 закрито
>
> Гепи (б) та (в) з попередньої errata **закрито**. Стан S0 на момент запису:
>
> - **S0.5 — dashboards runbook ✅** _shipped_ у [PR #1570](https://github.com/Skords-01/Sergeant/pull/1570) → [`docs/observability/posthog-ftux-dashboards.md`](../observability/posthog-ftux-dashboards.md) визначає 5 saved insights (activation funnel, TTV histogram, vibe→first-entry per module, D1/D7 retention by signup-cohort, celebration drop-off), alert thresholds для PostHog Alerts, runbook як додавати нові insights. Скріншоти live-tile-ів — окремий founder-task (placeholder лінки в §3 з поміткою «TBD»).
> - **S0.4 — 9 канонічних подій ✅** _shipped_ у [PR #1582](https://github.com/Skords-01/Sergeant/pull/1582). Wired call-sites: `celebration_shown` ([`CelebrationModal.tsx`](../../apps/web/src/core/onboarding/CelebrationModal.tsx)), `module_checklist_shown/_step_done/_dismissed` ([`ModuleChecklist.tsx`](../../apps/web/src/core/onboarding/ModuleChecklist.tsx)), `onboarding_step_viewed/_step_completed` ([`OnboardingWizard.tsx`](../../apps/web/src/core/onboarding/OnboardingWizard.tsx)), `hint_completed/_dismissed` ([`HintsOrchestrator.tsx`](../../apps/web/src/core/hints/HintsOrchestrator.tsx)), `streak_milestone_reached` ([`dashboardCards.tsx`](../../apps/web/src/core/hub/dashboard/dashboardCards.tsx) — `<StreakIndicator/>` у hub, бо `<StreakCelebration>`-модалка ще не змонтована в дашборд). `first_real_entry` + `ftux_time_to_value` уже стріляли до S0.4 з `firstRealEntry.ts`; `budget_set` — з [`Budgets.tsx`](../../apps/web/src/modules/finyk/pages/budgets/Budgets.tsx). Funnel `started → step_viewed → step_completed → vibe_picked → first_action_picked → ftux_preset_picked → first_real_entry → celebration_shown` без gap-ів.
> - **S0.3 — mobile parity ❌** лишається TODO ([`apps/mobile/src/lib/analytics.ts`](../../apps/mobile/src/lib/analytics.ts) = console-only stub, нема `posthog-react-native`). Web FTUX-funnel працює; mobile користувачі поки не входять у дашборди (`platform` super-property вже зареєстровано на web — як тільки mobile транспорт прийде, segmentation увімкнеться без правок dashboard-ів).
> - **`onboarding_skipped`** окремо: у поточному one-screen wizard-і (v3) skip-шляху немає, тож emiter не доданий. Якщо у S1 з'явиться явна «Skip» affordance — повертаємось до події; контракт `{ step: string }` уже зафіксовано у [`posthog-ftux-dashboards.md` §2](../observability/posthog-ftux-dashboards.md#2-canonical-events-consumed).
>
> Висновки прожарки (P0–P3 рекомендації) лишаються в силі — вони про emotional design, а тепер ще й мають реальні метрики, на які можна спертися при A/B.

---

## Bottom line

Технічно онбординг продуманий — модульний, з analytics-хуками, single-hero rule, TTV-метрикою, демо-режимом. **Емоційно — ні.** Він **обіцяє цінність до того як її даєш**, **святкує те, що не варто святкувати**, і **виштовхує користувача на порожній дашборд** з закликом «зроби ще одну річ». Це онбординг, який зробив би інженер для інженера. Споживач прочитає три рядки, тапне «Відкрити», подивиться на пустий хаб і зачинить вкладку.

---

## 1. Шість найбільших проблем

| #   | Проблема                                                                                                                                                                                                | Тяжкість | Де болить                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| 1   | **Hero copy продає features, не результат.** «Гроші, тіло, звички, їжа — все в одному місці. Офлайн. Приватно.» Це опис **як влаштовано**, не **що я отримаю**.                                         | P0       | `apps/web/src/core/onboarding/OnboardingWizard.tsx:237-264`          |
| 2   | **Confetti до першої цінності.** Wizard відстрілює full-throttle celebration за натискання чотирьох checkbox-ів. Коли користувач реально зробить перший запис — наступний confetti девальвований.       | P0       | `apps/web/src/core/onboarding/OnboardingWizard.tsx:388-401`          |
| 3   | **«Заповни мій хаб» / «Відкрити Sergeant» нічого не заповнює.** CTA wizard-а закидає на **порожній** dashboard з порожніми бенто-картками. Очікування ≠ реальність.                                     | P0       | `finish()` саме лише `markOnboardingDone` + `markFirstActionPending` |
| 4   | **Жорсткий пріоритет первинної дії = `routine`.** Користувач прийшов за грошима/їжею/тренуваннями — отримує «Створи першу звичку» як primary. Goals ігноруються при виборі primary.                     | P0       | `apps/web/src/core/onboarding/FirstActionSheet.tsx:59-75`            |
| 5   | **Peek backdrop із підставними цифрами без disclaimer.** −320 ₴, 7 днів стрік, 420 ккал — крізь blur все одно зчитуються. Через хвилину дашборд порожній. Resentment-момент.                            | P1       | `apps/web/src/core/app/WelcomeScreen.tsx:9-48`                       |
| 6   | **PresetSheet — bait-and-switch для 3/4 модулів.** Routine — справді one-tap. Finyk/nutrition/fizruk — це «one tap → форма → введи суму → save». Заголовок hero обіцяє «зроби одну річ» — реально це 4. | P0       | `apps/web/src/core/onboarding/PresetSheet.tsx:80-145`                |

---

## 2. Покрокова прожарка флоу

### 2.1. `/welcome` — landing screen

**Що користувач бачить:**

1. Розмитий 2×2 bento позаду з підставними числами (Фінік −320 ₴, Фізрук 5 трен., Рутина 7 днів стрік, Харчування 420 ккал).
2. Splash-карта з лого + рядок «Sergeant — твій хаб. Гроші, тіло, звички, їжа — все в одному місці. Офлайн. Приватно.»
3. Три бейджі: «Офлайн / Локально / ~10 сек».
4. Чотири картки модулів (всі вибрані за замовчуванням).
5. Прогрес-бар «4/4 модулів».
6. Primary CTA «Відкрити Sergeant».
7. Вторинний рядок «Налаштувати модулі» (хоча модулі **вже відображаються**).
8. Третинна кнопка «У мене вже є акаунт».

**Що тут поламано:**

- **Value-prop = features.** «Все в одному місці. Офлайн. Приватно.» — це причини **довіряти** продукту, не причини **використовувати** його. Користувач ще не знає що отримає. Класична feature-orientation: жоден benefit не озвучений.
- **«~10 сек» — обіцянка-капкан.** Якщо реально швидше — звучить підозріло. Якщо повільніше — користувач триматиме секундомір. Будь-який hard-coded час у hero copy це міна.
- **«Налаштувати модулі» називається не тим, чим є.** Тапаючи цю кнопку, користувач не «налаштовує» — він **читає опис того, що вже видно**. Реальний label мав би бути «Що це за модулі?» або «Дізнатися більше». Зараз ~90% людей не натиснуть, бо «налаштування — потім».
- **Усі 4 модулі on by default.** Pareto-помилка «всім потрібно все». Користувач, який прийшов за фінансами, отримує ще 3 модулі, які він не вибирав. Це починає його стосунки з продуктом з cognitive overhead замість фокуса. **Краще:** жоден не вибраний → користувач робить **активний вибір** → commitment вищий, defection менша.
- **Назви модулів незрозумілі без пояснень.** «Finyk» — це фініки чи фінанси? «Fizruk» — шкільний тренер чи серйозний фітнес-партнер? Сполучення двох україномовних і двох англомовних назв в одному списку — бренд-неконсистентність. (Так, є teaser-ряд, але люди читають заголовки, не teasers.)
- **CTA «Відкрити Sergeant» — це навігація, не value.** Хороші FTUX CTA обіцяють результат: «Зробити мій бюджет», «Запустити сьогоднішній план», «Показати мені мій хаб». Цей — рівнозначний «Click here».
- **«У мене вже є акаунт»** — для returning user **з акаунтом**. Користувача без акаунта, який хоче «just look around», ніщо не зустрічає. Demo-режим є (`?demo=1`), але прихований у URL-параметрах.
- **Peek backdrop — фейк без disclaimer.** Числа підставні, але очі їх все одно зчитують. На дашборді FirstActionHeroCard правильно каже «Цифри нижче — приклад. Твої з'являться, щойно щось додаси.» (`apps/web/src/core/onboarding/FirstActionSheet.tsx:209-211`) — а на welcome-екрані такого попередження **немає**.

### 2.2. Wizard → CTA

**Що відбувається технічно:**

1. `saveVibePicks(chosen)` → пишемо вибір.
2. `markFirstActionStartedAt()` → теж TTV.
3. `markFirstActionPending()` → прапор для FirstActionHeroCard.
4. `markOnboardingDone()` → закриваємо splash назавжди.
5. `confetti("Готово!", "Твій Sergeant налаштовано. Час діяти!", "high")` — повний exuberance.
6. `setTimeout(... 3500ms ...)` → onDone.

**Що тут поламано:**

- **Confetti high за натискання checkbox-ів.** Класичний антишаблон. Celebration має бути reward за **value-creation** (перший запис), не за **selection**. Зараз emotional peak витрачається на тривіальну дію, а потім CelebrationModal після першого реального запису фактично повторює confetti — і користувач сприймає це як «ну, окей, ще раз».
- **3.5-секундна затримка** — користувач, що вже клацнув CTA, чекає 3.5 секунди і дивиться на confetti. Він готовий до **наступного кроку**, а отримує **очікування**. Розчаровується.
- **Brand-promise зривається на наступному екрані.** Wizard каже «Готово!» / «Твій Sergeant налаштовано» / «Час діяти!» — а реальність: dashboard з 4 порожніми картками, один CTA-row зверху і один TODO-checklist знизу. **Це той самий момент, де новий користувач вирішує: повертатись чи ні.**

### 2.3. Hub dashboard, перший погляд

**Що користувач бачить (cold-start, без real entry):**

1. **FirstActionHeroCard** — заголовок «Зроби одну річ — і хаб твій», sub «Цифри нижче — приклад…», primary CTA = `routine` action («Створи першу звичку»). + дрібний хрестик «Сховати».
2. **ModuleChecklist** для primaryModule (першого активного), якщо `!hasRealEntry && !firstActionVisible && sessionDays <= 7` — тобто він **не показується одночасно з FirstActionHeroCard** через `!firstActionVisible` гард, але це означає: якщо користувач задисмісив hero, він отримає **інший** TODO-список. (`apps/web/src/core/hub/HubDashboard.tsx:409-416`)
3. **OnboardingProgress** «N/4 модулів» — лишається поверх bento до першого реального запису. (`apps/web/src/core/hub/HubDashboard.tsx:500-506`)
4. **Bento 2×2** — 4 модульні картки, всі без даних.
5. **Інсайти** (AI-порада + Аналітика + Дайджест) — повністю приховано до `hasRealEntry`.
6. **MotivationalFooter** — «продовжуй у тому ж дусі» (?) на пустоті.

**Що тут поламано:**

- **Card avalanche попри single-hero rule.** Hero + Checklist (по дисмісу) + Progress + 4 порожні bento-картки = візуальна перевантаженість. Single-hero rule говорить «тільки один primary», але **secondary-нагадування дублюють зміст**: «зроби перший запис» каже hero, той же месидж — у checklist'і, той же — у progress-бар «N/4», той же — навіть у MotivationalFooter.
- **Користувач бачить TODO-лист замість value.** Очікувана обіцянка: «дашборд = твоя картина». Реальність: «дашборд = TODO як заповнити дашборд». Це **onboarding tax**, не **value demonstration**.
- **`OnboardingProgress` вимірює не те.** «N/4 модулів» — прогрес **обсягу**, не **value**. Користувач дивиться на «1/4» і думає «ого скільки ще роботи» замість «ого, я вже отримую щось». **Краще:** прогрес у термінах outcome — «Твоя економія цього тижня», «Твоя серія днів», «Твій план на тиждень».
- **Insights розкриваються запізно.** Раніше від користувача очікують зробити запис, потім ще через 7 днів той collapsible auto-розкривається. Документ про «aha-moment» (`docs/launch/business/01-monetization-and-pricing.md:280-330`) каже, що **перший AI-insight — найсильніший корелят retention**. Зараз він захований за collapsible-у-collapsibl'i.
- **MotivationalFooter на пустому дашборді** — психологічно непрацюючий. «Молодець, продовжуй!» коли ти ще нічого не зробив = підозра у штучності.

### 2.4. FirstActionHeroCard primary

**Що користувач бачить:**

- Заголовок: «Зроби одну річ — і хаб твій».
- Primary CTA: derived from picks через `pickPrimary` → priority `routine > finyk > nutrition > fizruk`.
- «Інший модуль» — приховано за акордеоном.

**Що тут поламано:**

- **Жорсткий пріоритет** ігнорує `goals` і просто бере перший зі списку. Якщо користувач:
  - вибрав усі 4 (default!) → побачить routine-CTA. Але він міг прийти за фінансами.
  - вибрав лише `nutrition` + `fizruk` → побачить nutrition-CTA → але PresetSheet для nutrition **порожній** (!) → fallback-кнопка «Додати страву» → форма.
- **Коментар у коді чесний:** «Routine comes first because… the highest emotional payoff (7-day streak preview)» — це **гіпотеза розробника**. PostHog не підключений (analytics — stub з localStorage), тож **це гіпотеза непровірена**.
- **«Зроби одну річ — і хаб твій» лже** для не-routine модулів. Routine-preset = реально one-tap (пише `RoutineHabit` напряму через `applyRoutinePreset`). Finyk-preset = preset зберігає у sessionStorage prefill і відкриває add-sheet модуля → користувач має **ввести суму** і **зберегти**. Це 4 дії, не 1. Nutrition і fizruk — `items: []`, тобто FTUX presets там просто **немає** — лише fallback-CTA. (`apps/web/src/core/onboarding/PresetSheet.tsx:120-145`)
- **«Інший модуль» приховано** — це rational simplification, але ціною discoverability. Користувач, що бачить «Створи звичку» і не хотів звичку, не одразу зрозуміє куди тапнути. Більшість тапне «Х».

### 2.5. PresetSheet (Finyk)

**Що користувач бачить:**

- Sheet із заголовком «На що витратив?» + sub «Тицяй — відкриється форма з назвою. Суму введеш сам.»
- Три плитки: ☕ Кава · «їжа · введи суму», 🚕 Таксі · «транспорт · введи суму», 🥗 Обід · «їжа · введи суму».
- Fallback «Своя витрата».

**Що тут поламано:**

- **Заголовок передбачає швидку дію, sub-копія її ламає.** «На що витратив?» → user думає «зараз тапну і готово». Sub: «введеш суму» → ага, ні, ще форма.
- **Категорія в sub-tile-копії — нерелевантна користувачу.** «їжа · введи суму» — слово «їжа» не несе value, лише technicality (це internal taxonomy). Краще: «☕ Кава — типово 60-95 ₴» — і дати hint, скільки звичайно це коштує.
- **Передзаповнена назва — це 5% часу.** Інші 95% першого entry в Finyk — це сума і момент. Сума не передзаповнена. Тобто preset зекономив користувачу 2 секунди тайпінгу — на тлі обіцянки «one tap».
- **3 плитки обмежують уяву.** Реальна перша витрата може бути зовсім інша (продукти, аптека, парковка, кран чинити). Користувач, що клікає fallback «Своя витрата», отримує **той самий** add-sheet, що й після плитки, але вже без префіла → і все одно forms-flow.

### 2.6. PresetSheet (Routine)

- Three reasonable presets: «Випити воду», «Пройти 10 хв», «Прочитати 10 сторінок».
- Реально one-tap → `applyRoutinePreset` пише запис → sheet закривається → first-real-entry detected → CelebrationModal.

**Що тут добре:** routine-FTUX тут **дійсно** працює як обіцяно. Це best-in-class шлях.

**Що тут поламано:**

- **Три «small wins» — занадто схоже.** Pure-будні-добрі-дрібниці. Жодна не «жирна». Класичний motivational hook був би **«вибери одну річ що ти обіцяв собі в січні»** — це commitment, який дає сильніший emotional anchor.
- **Стрік починається сьогодні** — обіцянка з FirstActionHeroCard description. Але це формально-механіка, не цінність. «Серія днів» — це reward, не outcome. Користувач в ідеалі має бачити «через 30 днів — це автоматично». Зараз pure habit-tracker ergonomics.

### 2.7. PresetSheet (Nutrition / Fizruk) — items: []

**Що користувач бачить:**

- Sheet відкривається із заголовком «Що з'їв зараз?» + sub «Відкрию форму додавання страви — калорії підтвердиш у модулі.»
- Усередині: **нічого**. Тільки fallback «Додати страву».

**Що тут поламано:**

- **Це пустий sheet — UI-крок, що нічого не дає.** Один tap на FirstAction-hero → sheet → один tap на fallback → нарешті форма. Three-tap до точки де користувач реально починає вводити дані.
- **Comment у коді чесний:** «Три плитки давали різні дані — але без каналу прокидування `item.data` у AddMealSheet усі три тапи відкривали один і той самий порожній sheet. Три візуально-різні CTA з однаковим результатом — це міні-обман.» — Згоден з рішенням прибрати, але **не згоден з тим, що sheet залишився як порожній crumple-step**. Краще: для nutrition/fizruk **скіп PresetSheet** і прямо відкривай add-sheet модуля з FirstActionHeroCard.
- **Inconsistency UX:** routine — sheet з пресетами; finyk — sheet з пресетами + redirect; nutrition/fizruk — sheet без пресетів + redirect. Три різні UX за однаковим affordance. Користувач не знає чого очікувати.

### 2.8. ModuleFirstRunGoalSheet

**Коли стріляє:** перший раз, коли користувач відкриває модуль (через bento-картку чи деплінк з FirstAction).

**Що користувач бачить (приклад Finyk):**

- Title «Налаштуй Фінік», sub «Швидко вкажи бюджет — далі зможеш змінити в налаштуваннях.»
- Slider 5 000 — 100 000 ₴.
- Button row: «Пропустити» / «Зберегти».

**Що тут поламано:**

- **Wizard каже «Готово!», dashboard каже «Час діяти!», тут раптово — ще один Sheet з полями.** Користувач не очікував. Це порушує закінченість онбордингу. Ніби фільм закінчився, з'явилися credits, потім раптом ще одна сцена.
- **Користувач ще не побачив value модуля, але має визначити свій бюджет.** Сильна вимога: «довіряй мені, я тільки що тобі продав себе на одному екрані, а тепер скажи свою чутливу інформацію» (приватний бюджет — чутлива інформація).
- **«Пропустити» — гладкий шлях.** Дослідно більшість користувачів натисне саме «Пропустити» (це баланс-сейв, не offence). А далі goal-aware copy у FirstActionHeroCard деградує до дефолтного, тобто та частина персоналізації **тихо ламається** для більшості.
- **«Перенастроїти будь-коли»** — обіцянка, яку користувач не може перевірити в момент. Це звучить як «довіряй мені», що в FTUX = низька довіра.
- **Якщо користувач швидко тапає кілька карток** (нормальна explore-behavior), він отримає каскад goal-sheet'ів. Це **навіть гірше** ніж старий монолітний step.

### 2.9. CelebrationModal — wow-момент

**Що користувач бачить:**

- 30 confetti-частинок (5 кольорів).
- Headline: «Готово за N с!» (TTV<60s) або «Перший запис!»
- Sub: «Блискавично! Це вже твої дані.» / «Це вже твої дані. Sergeant працює для тебе.»
- «Що далі» tips.
- Auto-close через 10 сек.

**Що тут поламано:**

- **Те саме confetti, що було в wizard.** Brain учиться: «Sergeant святкує все. Confetti не означає нічого». Cry-wolf effect.
- **«Готово за N с!»** — TTV-метрика дзеркалить розробницьку «obsess з time-to-value». Користувач не дбає скільки секунд це зайняло. Він дбає чи це **варто було**. Краще: «У тебе вже є серія: 1 день» / «Перший запис у Фініку. Завтра я нагадаю» — щось, що **обіцяє наступну дію**.
- **«Це вже твої дані. Sergeant працює для тебе.»** — пасивний голос + filler. Що означає «Sergeant працює для тебе»? Незрозуміло.
- **«Що далі»** — фактично ще один TODO. Знову momentum-перерваний.

### 2.10. Soft-Auth, Daily Nudge, Re-engagement

Ці три surfaces — **найкращі частини** онбордингу. Тут реально видно, що людина думала про користувача.

**Soft-Auth (`SoftAuthPromptCard`):**

- Чекає 3+ session days або 2+ після першого entry. Не модальний. Entry-count-aware copy.
- **Слабе місце:** копія «У тебе N записів. Створи акаунт, щоб не втратити.» — це **fear-based**. Краще було б «Sync між браузером і телефоном — 20 секунд» і дати **позитивний value-prop**, не loss-aversion. Loss-aversion працює, але читається як шантаж від продукту, який ти лише почав використовувати.

**DailyNudge:**

- 7-day snooze, sessions-aware, dismissible.
- **Слабе місце:** «Спробувати» / «Зрозуміло» / «Нагадай за тиждень» — три кнопки одного рангу. Користувач не знає що primary. Сильніше було б 1 primary + dismiss-X.

**ReEngagement (`ReEngagementCard`):**

- Не показується раніше 7 днів — між 1 і 6 днем порожньо.
- **Слабе місце:** 7-day window — хто реально не повертається 7 днів, той може не повернутися ніколи. Active re-engagement (push, email) має бути на день 2-3, а не очікувати re-open. Push permission — є, але email drip (доку згадує day 0-7) **не реалізований** — тож re-engagement в цьому проміжку нульовий.

---

## 3. Класи проблем (узагальнення)

### 3.1. Cognitive load перед value

- Wizard просить вибрати модулі.
- ModuleFirstRunGoalSheet просить ввести бюджет / тижневу мету / тип харчування.
- PresetSheet просить вибрати тип запису.
- AddSheet модуля просить ввести суму / повну назву / решту полів.

**Сума:** 4 шари вибору **до того, як користувач отримає що-небудь корисне**. Це проти класичного правила «show value first, ask questions later».

### 3.2. Honesty / expectation-setting

- «Гроші, тіло, звички, їжа — все в одному місці» — обіцяє що **все** буде в одному місці. Реальність: дашборд з 4 порожніми картками **ти сам** маєш заповнити.
- «~10 сек» — фіксована обіцянка, що працює тільки для routine-preset.
- «Зроби одну річ — і хаб твій» — fact-true для routine, factually-false для finyk/nutrition/fizruk.
- «Готово!» (post-wizard confetti) — нічого «готового» немає, дашборд порожній.

### 3.3. Reward-misalignment

- Confetti × 2 (wizard + first entry).
- Celebration headline хвалить швидкість, не дію.
- Streak — pure mechanism, не outcome.
- Progress bar показує obsoleteness активних модулів, не value-progress.

### 3.4. Discoverability

- «Налаштувати модулі» — насправді «детальніше про модулі», ховає **причину** обирати.
- «Інший модуль» — за акордеоном.
- Goal-questions — у per-module sheet, який легко проскіпати.
- Demo mode — за URL-параметром.
- Onboarding replay — нема CTA, тільки в Settings → Reset.

### 3.5. Personalization не працює без аналітики

- `getGoalAwareDesc` — голос модуля персоналізується goal-ами.
- Goal-ів НЕ отримуєш якщо користувач натискає «Пропустити» в ModuleFirstRunGoalSheet.
- А «Пропустити» — найшвидший шлях, тож це default behavior.
- → персоналізація працює для меншості, копія для більшості — generic.

### 3.6. PostHog не підключений → онбординг сліпий

- Документ `docs/launch/business/01-monetization-and-pricing.md` визначає activation як «≥1 запис у ≥2 модулі за 72 години» і називає aha-moment hypotheses.
- В коді analytics — це stub, що пише в `localStorage`. Жодне з 14 запланованих events нікуди не йде.
- → **неможливо знати, де саме онбординг ламається**. Будь-яке твердження «routine має найвищий emotional payoff» — це гіпотеза, бо корелятів retention в реальних даних нема.

### 3.7. Cross-module USP не показано

- Sergeant продає «хаб», де модулі **взаємодіють**: гроші×звички, їжа×тренування. Перший entry → CelebrationModal → Insights collapsible. Cross-module insights з'являються пізніше, коли є 2+ modules і даних достатньо.
- → **USP «хабу» демонструється останнім**, після того як користувач вже міг вирішити, що це звичайний CRUD-tracker.

### 3.8. Fail-safety

- Permission denied → reminders не працюють → first entry може бути єдиним.
- Користувач, що відкрив модуль напряму (без FirstAction) — Finyk покаже Monobank-gate, бо `enableFinykManualOnly()` тригериться лише в preset-path. Self-directed user стикається з прихованим бар'єром.
- Між day-1 і day-7 жодного re-engagement (без email drip — а його нема).

---

## 4. Рекомендації (у порядку impact-friction)

> **План реалізації:** [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md) — кожна рекомендація розписана як user-story + PR з AC і метриками.

### P0 (зробити в першу чергу — 1-2 спринти)

1. **Замінити hero copy на benefit-driven.** Прибрати «Все в одному місці. Офлайн. Приватно.» Дати один outcome-based рядок: «Знай куди йдуть твої гроші, не злись на себе у вівторок» — конкретно, людською мовою, з emotional anchor. A/B-тестувати 2-3 варіанти, але **тільки після PostHog**.
2. **Додати disclaimer на peek backdrop.** Один рядок «Цифри — приклад. Твої з'являться тут» під blurred bento. Або зменшити opacity цифр настільки, що їх не зчитати.
3. **Прибрати wizard-confetti.** Залишити тільки celebration після **першого реального запису**. Заміна wizard-finish-effect: просто плавна transition і loading-skeleton дашборду.
4. **Замінити CTA «Відкрити Sergeant» / «Заповни мій хаб» на outcome-CTA.** «Зробити перший запис», «Налаштувати мій тиждень», «Подивитись як це виглядає» — щось, що обіцяє результат.
5. **Goals → primary action.** Якщо користувач у GoalSheet вказав фінансовий бюджет → primary FirstAction = `finyk`, а не `routine`. Жорсткий PRIORITY-array проти goal-aware-вибору — це anti-personalization.
6. **PresetSheet для nutrition/fizruk:** або прибрати sheet (відкривати add-sheet напряму з FirstActionHero), або додати реальні prefill-канали і тримати плитки. Поточний пустий sheet — best-of-both-worlds, but worst.
7. **PostHog (або еквівалент).** Без funnel-метрик усе вищезазначене — це гіпотези. Це **передумова** до будь-якого A/B. _Web-частина закрита станом на 2026-05-03 — див. errata v2 угорі та [`ftux-sprint-plan.md` §2](../launch/product-os/ftux-sprint-plan.md#2-sprint-0--analytics-live-1-тиждень) (S0.4 + S0.5 shipped). Mobile parity (S0.3) лишається._

### P1 (другий спринт)

8. **Demo-режим зробити first-class.** На welcome-екрані три CTA: «Відкрити Sergeant» / «У мене вже є акаунт» / **«Подивитись приклад» (= ?demo=1)**. Третій варіант розв'язує problem of «нічого не бачу до того як зроблю запис».
9. **OnboardingProgress перейменувати/перевигадати.** «N/4 модулів» → «Твій план: економія / звичка / план їжі — обери головну ціль». Або взагалі прибрати на користь Today/Week-картки після першого запису.
10. **MotivationalFooter на пустому дашборді — погано.** Або прибрати (поки `!hasRealEntry`), або замінити на «Ось що зміниться, коли ти зробиш перший запис: …» (preview наступного state).
11. **Soft-Auth копію переписати на gain.** «Sync між пристроями за 20 сек» з value-prop в title, а не «не втрать».
12. **CelebrationModal headline.** Замість «Готово за 8 с!» — «Перша звичка. Стрік пішов: 1 день» / «Перший запис у Фініку. Завтра запитаю про вечерю» — щось з обіцянкою наступного.
13. **Прибрати «Налаштувати модулі» toggle.** Додати **inline-описи на default-state** (можна меншим шрифтом). Discoverability через progressive disclosure тут шкодить більше ніж економить простір.

### P2 (третій спринт)

14. **Goal-step-як-окремий-screen у wizard, а не per-module sheet.** Так, це додає 1 крок, але зберігає expectation-of-completion і повертає persona-tailored copy для більшості користувачів. Compromise: дозволити «Пропустити, налаштую потім» з банерчиком на дашборді «Не бачили твоїх цілей — додай в Налаштування».
15. **Cross-module preview після першого entry.** На second-session: «Ось що Sergeant зробить, коли ти додаси ще одну категорію: гроші×їжа = реальна вартість тренувань / гроші×звички = ціна streak-у.» Демонструє USP хабу до того, як користувач сам це відкриє.
16. **Email drip + push retention для day 1-6.** Зараз re-engagement лише на ≥7 днів; до того часу багато churn'у.
17. **Onboarding replay** — Settings → «Подивитись tour» з іконкою компасу. Або контекстний replay через FeatureSpotlight.
18. **Fail-safety для finyk-gate.** Якщо користувач відкрив Finyk напряму (не через preset), показати **inline** опцію «продовжити без банку», не як кнопку на login-екрані, а як top-row на самому дашборді модуля.
19. **Notes consistency.** «Ти був відсутній N днів» → «Тебе не було N днів». Уніфікувати голос: imperative для CTA, neutral для статусу.

### P3 (далі)

20. **Social proof / testimonials** на welcome — не обов'язково, але якщо рости — потрібно.
21. **Onboarding video (15 сек screencast)** — окремий entry-point для skeptical users.
22. **A/B з goal-first wizard.** Перший крок — «Що тобі важливо зараз: економити, рухатись, харчуватись свідомо, не злити себе?» — і модулі вибираються ПІД ціль. Це обертає cognitive load з features → outcomes.

---

## 5. Маленький мисленнєвий експеримент: 30-секундний користувач

> Уявімо: новий користувач, нічого не знає, чула лише «друг показав». Тапає посилання, ось що бачить:

**0–3 сек.** Розмитий 2×2 з циферками. «−320 ₴, 7 днів стрік, 420 ккал». Думає: «У когось є дані, окей, гарно».

**3–8 сек.** Читає splash: «Sergeant — твій хаб. Гроші, тіло, звички, їжа — все в одному місці. Офлайн. Приватно.» Запам'ятовує: «multi-app, локально». **Ще не зрозумів навіщо ЙОМУ.**

**8–15 сек.** Дивиться на 4 картки. «Finyk — це фініки?» Все вже вибрано. Бачить «Налаштувати модулі» — пропускає, бо «налаштування — потім». Тапає «Відкрити Sergeant».

**15–18 сек.** Confetti. «Окей, готово, але я ж нічого не зробив?»

**18–25 сек.** Дашборд. 4 порожні картки. Заголовок «Зроби одну річ — і хаб твій». «Створи першу звичку». **«Стоп, я ж прийшов рахувати гроші, а не звичку».** Тапає Х.

**25–30 сек.** ModuleChecklist «Routine: 0/4 кроків». Прогрес «1/4 модулів». Bento. Не розуміє куди дивитись.

**30+ сек.** Закриває вкладку.

**Що пішло не так:**

- Не побачив **причину** використовувати Sergeant.
- Отримав reward (confetti) за нерелевантну дію.
- Перша CTA ігнорує його intent.
- Дашборд = TODO-лист, не картина його життя.

---

## 6. Висновок

Структурно онбординг **дуже хороший**: модульний, has analytics, single-hero rule, TTV, demo, KVStore-shared, A11y. Це **інженерно зріла** база.

Але **emotional design зрадливо слабкий**:

- продає features, не результати;
- святкує неправильні моменти;
- ігнорує intent для personalization;
- наобіцяє «one tap», коли реально 4;
- ховає **причини** обирати модуль за акордеоном;
- залишає користувача на порожньому дашборді з TODO-списком замість величі картини.

Це — типова продуктова дисфункція **«engineer-built FTUX without product/UX co-design»**. Виправляється не переробленим кодом, а **переписаним copy + перенастроюваним event-таймінгом + перевіреним event-data flow**. P0-список вище — приблизно 2 тижні роботи з результатом 2-3× в activation funnel.

> **Що далі:** [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md) розкладає всі 22 рекомендації по 5 спринтах із PR-розбивкою, AC, метриками і ризиками.
