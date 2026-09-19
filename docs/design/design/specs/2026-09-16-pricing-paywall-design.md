<!-- Lifecycle: Active | Owner: product | Added: 2026-09-16 | Next review: 2027-03-16 -->

# Дизайн-контракт: тарифи й paywall

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-04-05.
> **Status:** Active — контракт as-built: описує `PricingPage.tsx`, `core/billing/PaywallModal.tsx`, `useFeatureGate.ts`, `core/access/featureAccess.ts`, `core/settings/PlanSection.tsx` станом на 2026-09-16 (рішення власника по аудиту дизайн-доків, пункт 4, варіант A: повні контракти для pricing/paywall і onboarding). Усі розбіжності з кодом, які контракт вимагав закрити, закриті 2026-09-16; 2026-09-17 знайдено один новий **[борг]** — копі `PlanSection.tsx` (див. § Копі).

Поверхня, на якій продукт просить гроші: `/pricing` (окремий маршрут поза
оболонкою хаба, публічний), `PaywallModal` (перехоплює дотик до
Premium-функції, рішення D2), секція «Підписка та план» у Налаштуваннях.
До 2026-09-16 ця поверхня не мала дизайн-контракту: стиль тримався на
«зробити як на хабі». Документ фіксує, що саме тут канон, і чого робити
не можна.

## Проблема

Pricing і paywall вирішують конверсію Free → Premium, тобто гроші, а
дизайн-доки описували лише чотири модулі й хаб. Агент, який пише код за
доками, не мав правила ні для палітри (де бренд, де модульний акцент), ні
для примітивів, ні для тону. Наслідок уже видно в коді: Premium-картка
бере акцент Фініка, CTA тарифу сидить на легасі-варіантах кнопки, копі
paywall лежить у трьох різних місцях.

## Мета

Один документ, за яким (а) можна перевірити PR на `/pricing` і
`PaywallModal` на рев'ю, (б) агент може зверстати новий стан цієї
поверхні, не вигадуючи. Контракт as-built: кожне правило нижче або вже так
у коді, або позначене як **[борг]** із файлом. Станом на 2026-09-17 відкритий один борг — див. § Копі.

## Продуктові рішення, на які спирається контракт

- **D3 (2026-05-22): один платний план.** Free завжди доступний, Premium
  один, без рівнів, без довічної, **без trial-таймера**. Копі `/pricing`
  так і каже (`uk.pricing.ts` → `hero.subtitle`). `TrialBanner` схований
  за сплячим прапорцем `billing_trial_banner` (2026-09-16) і в
  контракті не фігурує.
- **D2: paywall через feature gate.** Модалка з'являється в момент дотику
  до Premium-функції, а не за порогом використання. Живих гейтів два:
  `ai-photo-analysis` (Харчування, `PhotoStep.tsx`) і
  `analytics-export-pdf` (`HubReports.tsx`); `HubChat` кличе
  `PaywallModal` напряму з `surface="ai_chat_limit"`.
- **Назва плану для людини — «Premium»**, серверний id — `pro`
  (`usePlan`: `Plan = "free" | "pro"`; `planName.contract.test.ts`).
  «Pro» в UI не пишемо.
- **Офлайн важливіший за вхід.** `featureAccess.ts` знає лише два факти
  (`online`, `hasAccount`) і саме в такому порядку; план і квоту каже
  сервер (402 `PLAN_REQUIRED`, 429 `AI_QUOTA`), клієнт їх не вгадує.

## Палітра і тон поверхні

| Елемент                 | Канон                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Оболонка `/pricing`     | `MeshBackground` (як auth), `main#main` із safe-area, stone-бренд. Модульного акценту на сторінці **немає**, крім однієї свідомої позики нижче.                                                                                                      |
| Картка Premium          | `Card as="article" module="finyk" prominence="hero" radius="xl" padding="lg"` + `ring-1 ring-brand-200/40`; текст `text-hero-ink` (`/70`, `/60` для muted / subtle). Позика teal Фініка — **свідома**: єдина «гаряча» поверхня на сторінці.          |
| Картка Free             | `Card prominence="default"`, `text-text` / `text-muted` / `text-subtle`, галочки `text-brand-strong`.                                                                                                                                                |
| Бейдж «Зараз твій план» | `Badge size="sm"`, на Premium `variant="neutral" tone="outline"`, на Free `variant="accent" tone="soft"`.                                                                                                                                            |
| `PaywallModal`          | `Modal size="md"` з `panelClassName="bg-gradient-to-b from-brand/8 to-surface border-brand/20"`; булети `text-style-label text-text` з крапкою `text-brand-strong`. **Лише бренд**, жодного модульного акценту, навіть коли гейт спрацював у модулі. |
| Типографіка             | `text-style-title` (h1), `text-style-headline` (hero, два рядки), `text-style-display` для ціни; решта — `body` / `label` / `caption`. Нижче 12px нічого.                                                                                            |
| Motion                  | `motion-safe:animate-stagger-in` по картках, крок `min(idx * 30, 150)` ms. Без конфеті, без пульсації ціни.                                                                                                                                          |
| Ілюстрації / емодзі     | Немає. Іконки — `Icon` з ручних path-ів, не Lucide, не емодзі.                                                                                                                                                                                       |

## Примітиви й кнопки

Канон кнопки — `(variant, tone)`, `variant ∈ solid | soft | outline | ghost`
([`04-components § Button`](../design-system/04-components.md)):

| Кнопка                      | Канон                                                                  | Стан у коді                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTA тарифу (один провайдер) | Premium `variant="solid"`, Free `variant="outline"`, `size="md"`       | так (2026-09-16: тернар `primary`/`secondary` переведено на канон; храповик `legacyButton` динамічного виразу не бачив, тож ловив його лише контракт) |
| CTA по провайдерах          | `variant="solid"`, лейбл `` `${tryPremium} · ${PROVIDER_LABELS[p]}` `` | так                                                                                                                                                   |
| «Назад» у шапці             | `variant="ghost" iconOnly` + `chevron-left`                            | так                                                                                                                                                   |
| Paywall: головна            | `variant="solid"`, «Перейти на Premium»                                | так                                                                                                                                                   |
| Paywall: відмова            | `variant="ghost"`, «Не зараз»                                          | так                                                                                                                                                   |

Touch targets ≥ 44px під `pointer: coarse` — тримає `Button`; окремих
`min-h` тут не пишемо.

## Стани, які поверхня зобов'язана мати

| Стан                  | `/pricing`                                                                                                              | `PaywallModal`                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Гість                 | Free CTA = «Увійти й почати», єдина активна дія; бейджа «Зараз твій план» немає (виправлено 2026-08-23)                 | Показується; CTA веде на `/pricing?source=paywall` |
| Free, увійшов         | Free CTA `disabled` + бейдж на Free                                                                                     | Показується                                        |
| Premium активний      | Бейдж на Premium, CTA = «Керувати підпискою»; Free CTA `disabled`                                                       | Не показується (`canAccess`)                       |
| Створюємо оплату      | CTA `checkoutPlan === tier.id` → «Відкриваю оплату…», `disabled`                                                        | —                                                  |
| Помилка оплати        | `p role="alert" text-danger-strong` під hero + автоскрол до `#waitlist-anchor` (`block: "nearest"`); waitlist як план Б | —                                                  |
| Помилка порталу       | Три гілки: 409 «Не знайдено платіжний профіль…», 503 «тимчасово недоступне», інше — «Перевір зв'язок…»                  | —                                                  |
| Кілька провайдерів    | По одному `solid` на провайдера (LiqPay / Plata by mono / Карткою)                                                      | —                                                  |
| Офлайн                | Сторінка не гейтить; відмову дає `featureAccess.ts` (`reason: "offline"` раніше за `sign-in-required`)                  | Не відкривається офлайн — спершу офлайн-відмова    |
| Повернення з checkout | `?checkout=success` → тост «Підписку активовано…» з CTA «Перейти у налаштування»; `cancel` → «Оплату скасовано.»        | —                                                  |

## Копі

- Джерело для `/pricing` — `apps/web/src/shared/i18n/uk.pricing.ts`
  (є `en.pricing.ts`, EN заморожено рішенням 2026-09-16). Ключі:
  `hero.*`, `tiers.*`, `features.*`, `limits.*`, `cta.*`, `errors.*`,
  `toast.*`, `waitlist.*`, `footer`.
- Копі paywall по функціях — `uk.ts` → `paywall.<featureId>.{name,title,description}`.
  Сироту `multi-currency` прибрано 2026-09-16 з обох каталогів разом із
  копією списку гейтів у контрактному тесті: тепер він деривує ids із
  `core/billing/premiumFeatures.ts`, тож розійтись удруге не може.
- Дефолти самої модалки — `uk.ts` → `paywallModal.*`: `cta`, `dismiss`,
  три булети (`featureAi`, `featureSync`, `featureExport`) і копі гейта
  ліміту AI-чату (`aiChatTitle`, `aiChatDescription` з `{limit}`,
  `aiChatDescriptionUnknownLimit`). Перенесено 2026-09-16; `eslint-disable
no-cyrillic-jsx-literal` у `HubChat.tsx` знято разом із приводом.
- **Чому окрема група, а не `paywall.defaults`:** `paywall` індексується
  рівно id-ями `PremiumFeatureId`, і контрактний тест
  `shared/i18n/index.test.ts` звіряє його ключі з реєстром
  `core/billing/premiumFeatures.ts` один-до-одного — зайвий ключ
  `defaults` зробив би цей гейт червоним. Гейт ліміту AI-чату там само не
  живе з тієї ж причини: він іде не через `useFeatureGate`, а через
  власний лічильник, тож `PremiumFeatureId` для нього немає.
- **Булети — три плоскі ключі, не масив:** `MessageCatalog` типізований
  як `string | MessageCatalog`, тобто дерево рядків без масивів і
  функцій. Порядок збирає `DEFAULT_FEATURES` у компоненті; підстановка
  `{limit}` — через `.replace()` на місці виклику (та сама конвенція, що
  `{n}` у гребені Фініка).
- Тон — за [`style-guide.uk.md`](../../../product/copy/style-guide.uk.md):
  «ти», перша особа для дій («Відкриваю оплату…»), помилка завжди з
  наступним кроком. Слів «втратити», «терміново», зворотного відліку на
  `/pricing` і в `PaywallModal` немає (це і була причина сховати
  `TrialBanner`). **[борг]** `core/settings/PlanSection.tsx:152-153` — два
  повідомлення про невдалий платіж закінчуються «…щоб не втратити доступ»;
  знайдено 2026-09-17 при написанні settings-контракту, попередня редакція
  цього пункту стверджувала відсутність слова на всій поверхні — це було
  неправдою. Переформулювати за style-guide (наступний крок без загрози).
- Ціна — «Скоро» / «Ціну оголошу на запуску», поки власник її не назвав;
  «€X/mo» з D3 у UI не показуємо.

## Аналітика

Івенти з `packages/shared/src/lib/analyticsEvents.ts`: `pricing_viewed
{source}` (`paywall | settings | trial_banner | direct`), `pricing_cta_clicked
{tier, cta}` (`checkout`, `checkout_<provider>`, `free`, `sign_in`,
`manage_subscription`), `checkout_opened {plan, mode}`, `paywall_viewed
{surface}` — рівно один раз на перехід `open: false → true`. Воронка:
`paywall_viewed → checkout_opened → subscription_started`. Новий стан
поверхні без івента — не приймається.

## Безпека

Redirect на оплату лише в `ALLOWED_CHECKOUT_HOSTS` (`checkout.stripe.com`,
`billing.stripe.com`, `www.liqpay.ua`, `pay.mbnk.biz`, `pay.monobank.ua`)
або same-origin. Нового провайдера додають у список, а не обходять його.

## Чого не робити

- Не тягнути модульний акцент у paywall, навіть якщо гейт спрацював у
  Харчуванні: paywall — про план, не про модуль.
- Не додавати третій тариф, «Lifetime», річну знижку чи trial-таймер без
  перегляду D3.
- Не вигадувати порогові тригери paywall («ти додав 30 витрат») — D2.
- Не показувати «Pro» людині.
- Не писати легасі `variant="primary"` / `"secondary"` — навіть у
  тернарному виразі, який храповик не бачить.
- Не гейтити функції на клієнті за планом — план знає лише сервер.

## Поза скоупом

- Ціна, ліміти Free, регіональні ціни, річна знижка — окрема pricing-спека
  з дослідженням ринку (D3 § Out of scope).
- Landing (`apps/landing`) — окрема Tailwind-4 поверхня з власним
  `@theme`; її контракт не тут (дрейф токенів тримає `tokens.drift.test.ts`).
- Мобільний застосунок — контур на паузі ([ADR-0094](../../../governance/adr/0094-mobile-web-first-freeze.md)).

## Верифікація

- `pnpm --filter @sergeant/web exec vitest run src/core/PricingPage src/core/billing`
  — стани з таблиці вище покриті `PricingPage.test.tsx`,
  `PaywallModal.test.tsx`, `useFeatureGate.test.tsx`, `usePlan.test.tsx`,
  `planName.contract.test.ts`.
- `pnpm lint:ui-canon` — `legacyButton` стоїть на 0, `cyrillicJsxAllowlist`
  на 299: нова кирилиця в JSX paywall-у означає новий рядок у allowlist,
  тобто червоний гейт.
- Рев'ю за цим документом: палітра (бренд, крім Premium-hero), стани з
  таблиці, копі з каталогу, івент на кожен новий стан.
