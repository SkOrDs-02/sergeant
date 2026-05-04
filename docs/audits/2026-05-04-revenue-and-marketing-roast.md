# Sergeant — жорстка прожарка: маркетинг, монетизація, цінність продукту, growth

> **Last validated:** 2026-05-04 by @sonher468. **Next review:** 2026-11-03.
> **Status:** Active

> **Скоуп:** маркетинг · монетизація · цінність продукту · потенціал розвитку.
> **Перспектива:** product-led growth + indie / pre-seed reality check.
> **Сорс-комміт:** `f684d87e` (main, 2026-05-04).
>
> **Cross-refs:**
> [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md) — actionable PR-план, що виходить з цієї прожарки ·
> [`docs/launch/01-monetization-and-pricing.md`](../launch/01-monetization-and-pricing.md) — поточна модель ціноутворення (буде оновлена) ·
> [`docs/launch/02-go-to-market.md`](../launch/02-go-to-market.md) — поточний GTM (буде звужений) ·
> [`docs/launch/06-monetization-architecture.md`](../launch/06-monetization-architecture.md) — технічний skeleton білінгу (поки не реалізований) ·
> [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](./2026-05-03-ftux-onboarding-roast.md) — попередня FTUX-прожарка.

---

## TL;DR

Sergeant — **інженерний шедевр у пошуках продукту**. За 3 місяці влито 3 479 комітів, написано 56 466 рядків документації у 307 markdown-файлах, оформлено 44 ADR і 46 playbook-ів, розгорнуто 5 застосунків і 11 пакетів — і все це **до першого живого користувача, перших ₴1 виручки і навіть до зареєстрованого домену `sergeant.com.ua`**. Монетизація розписана на 7 467 рядків у 6 launch-документах, а в коді немає ні Stripe, ні LiqPay, ні таблиці `subscriptions`, ні єдиної функції `requirePlan`/`isPro`. Pricing-сторінка — статична декорація з waitlist-формою. Це не «pre-MVP» — це **doc-driven development, що пожирає шанс на launch**.

---

## 1. Що зараз є насправді (evidence-based)

| Шар                                                        | Стан у коді                                                                                                    | Стан у документації                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 4 продуктові модулі (Finyk, Fizruk, Routine, Nutrition)    | працюють локально, web + (частково) mobile                                                                     | детально описані                    |
| HubChat (Claude AI асистент)                               | 65 tools, prompt-cache                                                                                         | детально описаний                   |
| Better Auth + PostgreSQL + Railway/Vercel deploy           | працює                                                                                                         | детально описаний                   |
| CloudSync (LWW)                                            | працює                                                                                                         | детально описаний                   |
| Telegram-бот **OpenClaw** (AI-співзасновник для founder-а) | окремий бот                                                                                                    | 573 рядки roadmap-у                 |
| **Pricing page**                                           | статична декорація + waitlist-форма (`apps/web/src/core/PricingPage.tsx`, 237 рядків)                          | 508 рядків плану                    |
| **Subscriptions / billing / paywall / plan checks**        | **повністю відсутні** (0 згадок `requirePlan`/`isPro`/`getUserPlan` у коді; 0 SQL-міграцій із `subscriptions`) | 691 рядок ADR + 867 рядків ADR-0001 |
| **Landing page** на `sergeant.com.ua`                      | домен **не зареєстрований**                                                                                    | планується «T-28 днів до launch»    |
| **PostHog аналітика**                                      | web підключений, 9 канонічних подій fired після S0.4                                                           | детально описаний                   |
| **Stripe / LiqPay / Paddle webhook handlers**              | нічого                                                                                                         | 10 PR розписано наперед             |
| **Privacy Policy / ToS / Cookie / Публічна оферта**        | нічого                                                                                                         | 651 рядок чеклістів                 |
| **Реальні платні користувачі**                             | **0**                                                                                                          | план: 50 paid за місяць 3           |
| **Реальні живі користувачі**                               | **0** (закрита бета не запущена)                                                                               | план: 100–200 у ФАЗА 1              |
| **Виручка / MRR**                                          | **₴0**                                                                                                         | план: ₴5K MRR за 6 міс              |

**Кількісні факти:**

- 2 214 source-файлів (`.ts/.tsx/.js/.mjs`).
- ~144k LOC у `apps/web`, ~57k у `apps/server`, ~72k у `apps/mobile`.
- 38 SQL-міграцій (001–038).
- 192 web-тестових файли.
- 355 markdown-файлів (з них 277 — з freshness-блоком).
- 8 initiatives + 44 ADR + 46 playbooks + 23 superpowers/skills.
- Custom ESLint-плагін з 10+ правилами + Hard Rules registry з 18 правилами.
- 1 699 комітів від `Skords-01` + 1 420 від Devin AI за 3 місяці (≈40% коду генерує AI).

---

## 2. Прожарка по фронтах

### 2.1. Цінність продукту: «all-in-one» — це і фіча, і провал позиціонування

**Проблема №1: ти конкуруєш з кожним.** Ти позиціонуєшся одночасно проти MyFitnessPal ($19.99), YNAB ($14.99), Fabulous ($3.33), Streaks (one-time $5.99), Monobank-аналітик-каналів і п'ятьох all-in-one конкурентів які вже існують і бігають швидше за тебе:

- **personalEverything** — 6 модулів, «cross-module insights», live, ₹299/міс (≈$3.5).
- **LifeShift 360** — фітнес/фінанси/харчування, AI-coach (Coach Iron), live.
- **Phaseo** — money/calendar/health/sport/music dashboard, 14-day trial, live.
- **Subger** — privacy-first фінансовий трекер з email-import замість банк-API.

У launch-доку §3 ці продукти ВЗАГАЛІ НЕ ЗГАДУЮТЬСЯ. Конкурентний бенчмарк зведений виключно до single-module гравців (MFP, YNAB, Fabulous). Це самообман: ти змагаєшся не з MFP-Premium, а з гравцями які роблять **той самий ваш value-prop, але з 1+ роком фори, $X тисяч MRR і живими SEO-сторінками**.

**Проблема №2: 4 модулі × 0 інтеграційних use-case-ів = wide moat ілюзія.** Маркетингове обіцяння «AI бачить твої фінанси + тренування + харчування + звички разом і дає крос-інсайт» звучить круто. Але:

- У коді **немає жодного prod-ready cross-module insight**, який юзер бачить як окрему цінність. `packages/insights` існує як скелет.
- Сценарій з PH-демо («Сержанте, що мені порадиш?») — це театр: HubChat може формально сходити в кожен модуль через Claude tool-use, але це ≠ повноцінний cross-domain reasoning з actionable advice.
- Без cross-module інсайтів продукт = «MFP+YNAB+Fabulous in one wrapper за $2.25». Юзер на це не ведеться — він уже використовує одну з трьох безкоштовних альтернатив у кожній з вертикалей.

**Проблема №3: Monobank — твоя єдина реальна перевага, і вона captive.** Найсильніший wedge у Sergeant — це **Mono-інтеграція** (webhooks + AI-категоризація). Це справжня UA-локальна перевага, яку MFP/YNAB/Fabulous НЕ зроблять. Але вона:

- закопана в один з 4 модулів,
- не винесена як hero product,
- не використана в копірайтингу як головний хук,
- буде безкоштовною на Free тарифі (ручна) і доступною повністю тільки на Pro (₴99) — тобто єдиний реальний моат відданий за $2.25/міс.

> **Жорсткий висновок:** «Sergeant — все в одному» — це не продукт, а вміст моєї тумбочки. Якби це презентував YC-партнер, він би сказав: «Що з цього ти би вийняв і продав окремо?» — і ти б не зміг швидко відповісти. Це warning sign.

### 2.2. Назва, бренд і tone of voice

«Sergeant» — слабка назва для consumer wellness/finance продукту:

- **Емоційний регістр:** воєнно-командний. У 2026 році в UA-аудиторії «сержант» має тяжкі асоціації, а не «тренер по життю». Persona «тренер, що каже що робити» зараз втрачає аудиторію (Centennials/Gen Z віддають перевагу gentle/coaching tone — Calm, Headspace, Fabulous).
- **SEO-конфлікт:** «sergeant» — переповнений ключ (рангування, фільми, ігри, реальні поліцейські сайти). Маленький продукт не виб'ється з цього шуму ні в Google-UA, ні в App Store.
- **Локалізація навпіл:** в інтерфейсі — англійський бренд «Sergeant» + українські модулі «Фінік / Фізрук / Рутина / Харчування» + англійські суфікси (HubChat, OpenClaw, CloudSync). Це зоопарк нейминг-метафор — військова + дружні UA-кличеки + хмарно-технічні англійські суфікси. Жоден persona не пройде через цей tone-mix без dissonance.
- **Нейминг внутрішніх AI-агентів:** HubChat (для юзера) і OpenClaw (для founder-а) — два різні бренди для одного й того ж класу можливостей. Це додає cognitive overhead на нуль користі.

### 2.3. Pricing — занижений, неурівноважений, культовий

| Що зроблено                                     | Оцінка                       |
| ----------------------------------------------- | ---------------------------- |
| 3 тіри (Free / Plus ₴59 / Pro ₴99) з decoy      | занадто складно для pre-MVP  |
| Pro = ₴99/міс (~$2.25), Plus = ₴59/міс (~$1.34) | ціна **на порядок занижена** |
| Lifetime ₴2999 (~$68)                           | жертвуєш LTV без причини     |
| Юніт-економіка: LTV = ₴99×8=₴792, CAC = ₴20–40  | фантастика, не реальність    |

**Конкретні помилки:**

1. **₴99 — це не «психологічний хук», це «ця фігня нічого не варта».** Якщо ти продаєш фінансову + здоровʼєву + AI-помічнику аналітику за $2.25 — користувач читає це як «ну, мабуть, нічого там не працює». Anchor-ціна Anthropic Claude API **самого по собі** для 5 unlimited-tier юзерів з'їсть більше ніж ₴99×5. Ти буквально продаєш свою AI-маржу в мінус.
2. **avg_lifetime = 8 місяців** — це benchmark для **B2B SaaS**. Для B2C habit/finance апок медіана 3–4 місяці (8–12% monthly churn). LTV → ₴300–400, не ₴800.
3. **CAC ₴20–40** = $0.5–1. Це **нижче за CPM на Meta/Threads в UA**. Жоден реальний indie проєкт без бренду не отримує юзера дешевше ніж $3–10 у performance-ads. PH-launch + Telegram-канали 600K subs дадуть burst, не sustainable acquisition.
4. **LTV:CAC 20:1 → 40:1** — це не «good», це «твоя модель сламається при перших $500 ad-spend». Health/Healthy benchmarks 3:1–5:1.
5. **Pay-per-feature варіант (AI Pack ₴59 + CloudSync ₴39 + Analytics ₴29)** — це maintenance disaster для соло-фаундера. Stripe Customer Portal × 4 SKU × edge-кейси (downgrade одного modul-а × refund) вб'ють тебе за 2 квартали.
6. **Lifetime ₴2999** — видалити. Lifetime-deals роблять стартапи коли потрібен miss-it-or-miss-it cash. У тебе нема burn-rate, ти соло-фаундер. Ти просто скликаєш churn-резистентних power-users і втрачаєш їх LTV назавжди.
7. **Trial-конверсія 8–25% (Lenny's) ≠ Freemium 2–5% (FPS).** У плані `01-monetization-and-pricing.md` ти змішав benchmarks freemium і free-trial як взаємозамінні. Це різні воронки, дають різні цифри.

> **Жорсткий висновок:** ціни виглядають як індивідуальний creative-act, а не як ціни. Реальна стартова ціна для Sergeant Pro — **$5–9/міс або $39–59/рік**, з grandfathered $2.99 для перших 100 платників (тільки якщо реально треба соцдоказ).

### 2.4. Платіжна інфраструктура: 691 рядок плану, 0 рядків коду

`docs/launch/06-monetization-architecture.md` (691 рядків) — це enterprise-grade ADR з idempotency, NOTIFY-cache-invalidation, grandfather-rules, two-phase Stripe rollout. Ідеально для Stripe-инженера у Notion-у. Тільки от:

- `subscriptions` table — відсутня.
- Stripe webhook handler — відсутній.
- `requirePlan()` middleware — відсутній.
- `getUserPlan(userId)` — відсутній.
- `effectiveLimits()` — відсутній.
- `billingKeys` factory — відсутній.
- Білінг-сторінка / Customer Portal — відсутні.
- `legacy_pro_grace` flag — відсутній (а нащо grandfather, якщо нема юзерів?).

Це класичний випадок premature architecture. План з v1 → v2 рефакториться сам собою (5 red-flags fixed!) **до того, як хоча б один Stripe webhook прийшов у тестовому режимі**. Тут видно патерн: документ підмінює доставку.

**Реальний effort до першого ₴1 виручки:**

- Завести Stripe тестовий акаунт + LiqPay merchant: 1 день.
- 1 webhook + 1 `subscriptions` міграція + 1 `requirePlan` middleware + 1 paywall-modal + 1 Pricing CTA → Stripe Checkout: **5–7 днів роботи фокусованого фаундера**.

Замість цього написано 691 рядків плану і відкрито 8 PR-ів про hard-rules categorization. Це wrong-end-of-the-stick energy.

### 2.5. Маркетинг і GTM: план без виконавця

`02-go-to-market.md` (648 рядків) — детальніший за більшість YC pre-seed-подачок. Але:

- **Waitlist:** мета 500–1000 у «ФАЗА 0» (T-28 днів до launch). T = коли? Не визначено. Скільки на ній зібрано? Невідомо — нема публічної цифри.
- **DOU.ua / AIN.ua founder's story** — лежить як шаблон. **0 опублікованих статей.**
- **Build in Public** — Twitter/X акаунт сергеант? Threads UA акаунт? Не лінкується нікуди в репо.
- **Telegram-канал `@Sergeant 🎖️`** — згадується як план, не існує.
- **PH playbook** — 14-day prep розписаний, але немає demo-відео, немає assets, немає hunter-а.
- **Контент-блог на `sergeant.com.ua/blog`** — Astro SSG, репозиторію не існує (немає `apps/landing` або `apps/blog`).
- **OG-share-card генератор** — згадка «T-5 днів», в коді нічого.
- **DOU/AIN — фантазія про reach 5K–50K** — це аудиторія DOU за статтю взагалі, а не за статтею unknown indie founder-а без traction. Реальний reach першої статті: 800–2 000 переглядів, 50–150 кліків на лендинг.

**Telegram-канали в плані як «300K–700K subs»** (`@monobankukraine`, `@oaboronov`) — це B2B-style плани: «напишемо їм і запартнеримся». У реальності власник 700K-каналу не відповідає solo-фаундеру з нульовим soсial proof. Партнерства починаються з «у тебе вже є 1K paid». У тебе 0.

> **Жорсткий висновок:** GTM план описує growth-команду на 3–4 людини з $50K маркетинг-бюджетом. Реальність: 1 фаундер, $0 маркетинг-бюджет, 0 brand-equity. План реалістично виконається на 15–20%, інше залишиться «to-do для маркетолога, якого ще нема».

### 2.6. Onboarding / FTUX — найкраща частина, але…

`docs/audits/2026-05-03-ftux-onboarding-roast.md` + `docs/launch/ftux-sprint-plan.md` — це **єдиний документ у репо, який пише жорстко про продукт**. 90% згоди. Що залишається болючим:

1. **Activation = «≥2 модулі × ≥1 запис за 72 години»** — це benchmark, який сам по собі сумнівний. Якщо твій core-value — фінанси (Mono integration), то activation = «Mono підключений + 5 транзакцій категоризовано за 24 години». 2 модулі × 1 запис — це product manager fantasy, бо стимулює низькоякісний engagement.
2. **OnboardingWizard персистить тільки `picks`**. Goals, vibes, мотивація — губляться між сесіями. Це шкодить D7 retention.
3. **Mobile parity ще не зроблений** (S0.3) — а 60%+ B2C habit/finance юзерів на mobile.
4. **`shouldShowOnboarding()` не має сегментації по platform/locale/source** — немає A/B-готовності.

### 2.7. Можливості для розвитку — реалістичні vs фантазії

| Ідея у роадмепі                                | Чесна оцінка                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| **Monobank → мульти-банк (PrivatBank, Sense)** | **Так**, найбільший ROI. UA-fintech-wedge.                                      |
| **AI-фото їжі** (Anthropic vision)             | Працює, але дорого і унікальність=0 (MFP, Cal AI, Bite-buddy роблять це краще). |
| **Cross-module AI insights**                   | Якби дійсно працювало — це унікальний value. Поки що 0 prod-ready use-cases.    |
| **Mobile (Expo + Capacitor)**                  | **Потрібно вибрати один**. Тримати 2 mobile-стеки соло — death-march.           |
| **OpenClaw — AI-співзасновник для founder-а**  | **Видалити. Це luxury-fantasy.** Не приносить ні юзерів, ні доходу.             |
| **B2B / corporate wellness**                   | Цікаво, але через 18+ міс і з sales-командою. Не зараз.                         |
| **Marketplace/тренери**                        | **20% take-rate × 0 supply × 0 demand = 0.** Не зараз.                          |
| **B2B White-label / API**                      | Класична indie-distractor.                                                      |
| **Ads / data insights**                        | Абсолютно ні. Privacy-positioning важливіший.                                   |
| **Affiliate (Mono, Glovo, Silpo)**             | Може працювати, але тільки після 5K+ MAU.                                       |
| **Telegram-бот як distribution channel**       | UA-specific, але треба окремий продукт, не OpenClaw.                            |

### 2.8. Технічний борг ВЖЕ блокує speed-to-revenue

З `docs/audits/2026-04-28-sergeant-comprehensive-audit.md`:

- `apps/web` strict: false (закривається, але повільно).
- 52 файли на localStorage без safe wrappers.
- 2 mobile flaky tests.
- 0% test coverage на `apps/mobile-shell`.
- TypeScript 6.0.3 — bleeding edge.

Але є гірший борг, якого немає у плані:

- **20+ модулів і пакетів для соло-фаундера** — це organizational debt. Кожен новий feature торкає 2–4 пакетів (api-client + shared + домен + apps/web/server). Velocity ↓ exponentially.
- **Custom ESLint plugin + Hard Rules + freshness validator + skills lock** — це weeks of work на меті-роботу. Корисно у командах 10+. Соло — це самонакладений батіг.
- **38 SQL-міграцій до launch** — pace ~1 міграція на тиждень. Як тільки будуть paying users, two-phase migration policy x prod-data x rollback стане справжнім обмеженням швидкості.

---

## 3. Що прибрати, змінити, додати

### Прибрати (декомпозувати або вимкнути)

1. **OpenClaw (Telegram AI-співзасновник).** Поки немає paying users — це luxury self-talk. 573-рядковий roadmap = 1.5–2 місяці соло-роботи нуль revenue impact. Заморозити, видалити з docs/launch/, перенести в «post-launch nice-to-have».
2. **Один з двох mobile-стеків.** Або Capacitor (через `mobile-shell`), або Expo (через `apps/mobile`) — не обидва. Перетин 2 стеків з тестами = 2× maintenance × 0.5 quality.
3. **Pricing-варіант «pay-per-feature» (AI Pack / CloudSync / Analytics).** Видалити з плану. Single-SKU + Pro/Free достатньо для перших 1 000 платників.
4. **Lifetime deal ₴2999.** Видалити. Зашкодить LTV, не дасть burst-cash, який можна реально витратити.
5. **3-тірна модель (Free / Plus / Pro).** Замінити на 2 тіри (Free / Pro). Plus як decoy не дає переваги при <1K MAU.
6. **80% документації як «доставку».** Заморозити написання нових ADR/playbook на 90 днів. Тримати тільки 5 живих документів: README, AGENTS.md (тонкий), PRICING.md, GTM.md, ROADMAP.md.
7. **OnboardingWizard з «vibe picks».** Замінити на goal-first single screen.
8. **`apps/console` як окремий застосунок.** Internal tool, не «app». Перенести в `tools/console/` або в окремий repo.
9. **Демо-відео PH 2 хв з 4 модулями.** Якщо все ж запускаєш PH — демо має бути 1 модуль, 1 wow-moment, 30 секунд.

### Змінити

1. **Назва.** Серйозно. «Sergeant» не виживе в App Store SEO, не пасує до wellness/finance audience і ламає тон. Кандидати: однослівне UA з warm-tone (Pulse, Klyk, Skarb, Vatra), або англомовне (Onmly, Solo, Layka). Бренд-аудит з 5 user-interviews — 1 тиждень роботи, payoff на роки.
2. **Pricing:**
   - **Pro: $7/міс або $49/рік** (~₴300/міс або ~₴2 100/рік). Це 3× від поточного ₴99, але це межа viability для AI-heavy продукту з Anthropic costs.
   - Add EU/USD pricing з дня 1. Stripe price-localization робить це за 15 хв.
   - **Trial: 14 днів безкоштовно з картки**. Конверсує 2–3× краще ніж freemium.
   - Анкорна знижка: «$49/рік замість $84» — показує 41% знижку.
3. **Позиціонування з «all-in-one» → wedge:**
   - Hero: **«Український Mono + AI = персональний фінансовий сержант»**.
   - Module 1 (hook): Finyk + Mono + AI category enrichment.
   - Modules 2–4 (sticky cross-sell): Fizruk, Routine, Nutrition.
   - Cross-module AI — це не launch promise, а 6-місячний product roadmap.
4. **GTM-фази:**
   - Фаза 0 (наступні 2 тижні): зареєструвати домен, поставити landing з email-capture, написати 1 статтю на DOU.ua.
   - Фаза 1 (тижні 3–6): Stripe live + 50 paying бета з ₴-знижкою 50%. Не безкоштовний beta.
   - Фаза 2 (тижні 7–10): PH launch тільки після 200 paying users.
   - Видалити фазу «build in public» як окрему.
5. **OnboardingWizard:** goal-first single-screen + just-in-time permissions. Видалити `vibe_picks` UI.
6. **Activation metric:** «Mono connected + 5 transactions categorized + 1 budget set за 72 години». Це predicts paid conversion набагато сильніше.
7. **AI-ліміти:** перевести з «messages per day» на «AI-credits per month» (200/місяць Pro).
8. **Dependency на UA-only:** додати EN-локалізацію з дня 1.
9. **Public roadmap.** Прибрати з docs/ проєкт-планування і витягти на публічний Notion або Linear-public-board.

### Додати

1. **Реальний лендинг на `sergeant.<TLD>` з email-capture + 1 demo GIF (Mono → AI category) — за 2 тижні.** Не Astro/Vite SSG-фантазії, а Framer / Carrd / навіть GitHub Pages.
2. **Stripe Checkout + Customer Portal + 1 webhook + `subscriptions` table — за 7 робочих днів.** Skip LiqPay поки.
3. **3 cross-module AI-фічі, які реально працюють і wow-ять:**
   - «Як мої витрати корелюють зі сном/тренуваннями?»
   - «Куди мені зекономити ₴2K у наступному місяці?» (з конкретними категоріями).
   - «Що б я з'їв сьогодні щоб закрити білки і не вийти за бюджет?»
4. **Privacy-first позиціонування**, як в Subger/sBudget.
5. **3-tier referral з твердим cap:** «Привів 1 платного — місяць безкоштовно. 5 платних — рік. Все.».
6. **Single source-of-truth для «що зараз» (метрики):** Notion або Linear public-board з MRR / WAU / D7 / activation.
7. **Кваліфікаційний питальник на лендингу** («Скільки апок ти зараз використовуєш для трекінгу?»).
8. **Один цікавий annual content-piece**, що ранжується (UA-SEO): «Скільки український IT-фахівець реально витрачає у 2026 — аналіз 1 000 Mono-юзерів».
9. **Apple App Store + Play Store TestFlight з дня 1**. Не Capacitor wrapper — реальна Expo build.
10. **Soft auth → real auth з 2 кліків**. Apple/Google sign-in only для першого тижня.

---

## 4. Стратегічні висновки

1. **Тебе вбиває не код, а documentation perfectionism.** 56k LOC docs / 0 paying users — це симптом. Кожна година написання ADR — це година не написання Stripe webhook-у.
2. **«All-in-one» — це end-state, не launch-position.** Запускайся як «Mono + AI fin-coach», додавай модулі поступово як expansion-revenue для існуючих. Notion починався як wiki, а не як «Notion AI for everything».
3. **₴99/міс — це самосаботаж.** Якщо AI коштує ≥$5/міс на юзера в API costs, а ти продаєш за $2.25 — ти створюєш продукт, який треба буде в 3× закрити при 1K paying. Cap бізнесу прописаний в `01-monetization-and-pricing.md` зараз. Перепиши його, перш ніж писати ще один рядок коду.

---

## 5. 7 безжальних one-liner-ів

1. У тебе більше документів, ніж у тебе **юзерів × 1000**.
2. Pricing-сторінка має 237 рядків коду, а білінгу не існує — це скульптура двору, в який нікого не пускають.
3. «Sergeant» як бренд — це армійський сабреддіт, не personal life hub.
4. ₴99/міс при $5+ Anthropic-costs/user — це не freemium, це філантропія.
5. OpenClaw для founder-а — це найдорожчий спосіб уникати розмов з реальними юзерами.
6. 4 модулі × 0 cross-insights = 5 окремих apps в одному installer-і.
7. 3 479 комітів за квартал, 0 paying users — це не product velocity, це ескапізм у код.

---

> Прожарка зроблена з повагою до титанічного інженерного зусилля. Усі фактичні цифри взяті прямо з репо (`f684d87e`) і `docs/`. Actionable план роботи — у [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md).
