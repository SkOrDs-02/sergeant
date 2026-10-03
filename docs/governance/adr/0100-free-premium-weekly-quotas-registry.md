# ADR-0100: Free і Premium: тижневі квоти, єдиний реєстр доступу, reverse trial за прапорцем

- **Status:** Proposed
- **Date:** 2026-09-28
- **Last validated:** 2026-09-28
- **Next review:** 2026-12-28
- **Deciders:** @Skords-01
- **Supersedes:** [ADR-0085](./0085-free-ai-quota-five-per-day.md)
- **Related:**
  - [ADR-0068](./0068-pricing-v4-uah-reverse-trial.md) (уточнюється: trial, grace)
  - [ADR-0086](./0086-no-anonymous-ai-sign-in-required.md)
  - [Спека `access-tiers`](../../work/specs/access-tiers.md)
  - [`packages/shared/src/billing/entitlements.ts`](../../../packages/shared/src/billing/entitlements.ts)
  - [`apps/server/src/modules/chat/aiQuota.ts`](../../../apps/server/src/modules/chat/aiQuota.ts)
  - [`apps/server/src/modules/billing/getUserPlan.ts`](../../../apps/server/src/modules/billing/getUserPlan.ts)

---

## Context and Problem Statement

Склад Free і Premium жив у трьох копіях, які розійшлися: сервер гейтив за
`effectiveLimits.ts` і `requirePlan`, web за `premiumFeatures.ts`, а `/pricing`
обіцяв третє. Ліміт «2 пристрої» для синку ніде не перевірявся, авто-синк Mono
на `/pricing` значився Premium, хоча код тримав його у Free. Колонки trial і
grace (міграція 073) ніхто не читав, reverse trial з ADR-0068 не був
реалізований. Денна квота 5 запитів (ADR-0085) погано лягала на реальний ритм:
людина заходить двічі на тиждень і впирається в стелю в один із цих днів.
Правило 8 канону («фото поза загальною квотою») було виконане частково, а
vision-сканування Фініка йшло взагалі без квоти.

## Considered Options

1. **Реєстр у `@sergeant/shared` плюс знімок доступу від сервера**: одне
   джерело фіч і лімітів, сервер гейтить і рахує, web лише читає.
2. **Лише нове пакетування без реєстру**: копії лишились би і розійшлися б
   знову.
3. **Web сам рахує доступ із `plan`**: під час trial і grace два місця
   обчислення розходяться.
4. **Ковзне вікно замість тижня**: складно пояснити, потрібен журнал подій
   замість лічильника.

## Decision

Обрано варіант 1.

- **Реєстр** `FEATURES` у `packages/shared/src/billing/entitlements.ts`:
  `Record<FeatureId, { free: Access; pro: Access; surface?; meter? }>`, де
  `Access = boolean | { perWeek: number }`. З нього читають сервер (гейти,
  квоти, знімок), web (через знімок) і таблиця `/pricing`.
- **Тижневі квоти Free, скидання в понеділок 00:00 Europe/Kyiv:** 20 дій
  (`week:ai`: чат, порада коуча, денний план, рецепти, покупки, комора), окремо
  3 фото їжі (`week:photo`) і 5 vision-сканів Фініка (`week:finyk-vision`, фото
  чека без QR і скрін банку). Ключ відра = понеділок ISO-тижня за Києвом у
  наявній колонці `ai_usage_daily.usage_day`; міграція 149 розширює CHECK на
  `week:_%`. 429 несе `resetsAt` і власний код (`AI_QUOTA`, `AI_PHOTO_QUOTA`,
  `AI_FINYK_VISION_QUOTA`). `refine-photo` того самого знімка не списує. «Той самий
  знімок» сервер визначає сам, без зміни API: за SHA-256 кадру, який
  `analyze-photo` успішно проаналізував для цього користувача за останні 24 год
  (таблиця `ai_photo_refine_grants`, міграція 153). Refine іншого кадру списує
  `week:photo`, як analyze (sec-14 аудиту 2026-10-01: без цього refine з
  довільним фото був безкоштовним vision-аналізом). QR-шлях ДПС лишається без
  ліміту.
- **Tool-виклики Free** зливаються в тижневі 20: денний бакет `tool:<name>` для
  Free не діє. Для Premium лишається як захист від зловживань.
- **Premium-only:** голос, recall памʼяті, PDF, тижневий план харчування.
  Mono-синк (включно з авто), хмарний синк без ліміту пристроїв і CSV-експорт
  лишаються у Free. Premium зберігає каскад моделей (20 premium → 80 standard →
  floor на добу) як стелю витрат.
- **Reverse trial 7 днів лише для нових акаунтів і лише за прапорцем**
  `BILLING_REVERSE_TRIAL_ENABLED` (серверний env, дефолт `false`). Рядок
  `subscriptions` (`trialing`, `manual`, `current_period_end = trial_ends_at`)
  пишеться з хука створення користувача; cron спливання не потрібен, бо
  `getUserPlan` віддає `trialing` лише до `current_period_end`. Наявні акаунти
  trial не отримують. Помилка вставки не валить реєстрацію.
- **Grace 3 дні:** `past_due` активний, доки
  `COALESCE(grace_period_ends_at, current_period_end + 3 days) > now()`.
- **Знімок** `access` у `GET /api/billing/status`: `state` (`free | trial | pro
| grace`), дати кінця trial і grace, `features` і тижневі `meters`. Стан
  обчислює одна функція `accessStateOf`, її ж читає `requirePlan`.

## Rationale

Тиждень краще лягає на ритм «двічі на тиждень», ніж доба, і лишається
простим лічильником в атомарному upsert (ADR-0022). Окремі відра для фото і
vision не дають імпорту скрінами зʼїсти чат і навпаки. Прапорець на trial
потрібен, бо AI-квоти діють у проді незалежно від `isBillingEnforced()`: trial
без прапорця одразу дав би кожному новому акаунту тиждень AI без ліміту, тобто
зміну витрат ще до запуску Premium.

## Consequences

### Positive

- Одне джерело пакетування; `/pricing` не може обіцяти те, чого немає в коді.
- Найдорожчий відкритий шлях (vision Фініка без квоти) закрито.
- Trial і grace мають робочу реалізацію.

### Negative

- У день деплою Free отримує повні 20 на поточний тиждень: старі денні
  `default`-рядки не переносяться, міграції даних немає.
- Поки `isBillingEnforced()` = false, Premium-гейти (голос, recall, тижневий
  план) відкриті, а квоти діють. Ця асиметрія свідома і вже існувала.

### Neutral

- Ціна, checkout і waitlist на `/pricing` не змінюються («Скоро»).
- Mobile UI пейволу не змінюється (пауза ADR-0094); сервер гейтить однаково.

## Уточнення до ADR-0068

- Рішення D3 («без trial-таймера») більше не діє для нових акаунтів з
  увімкненим прапорцем; копія `/pricing` не обіцяє «без trial».
- Trial лише для нових акаунтів, наявні його не отримують.
- Grace після невдалої оплати 3 дні.

## Compliance

- Grep-гейт: у `apps/**` немає імпортів `effectiveLimits` чи `premiumFeatures`
  і хардкоду `aiRequestsPerDay`.
- Тести: `packages/shared/src/billing/entitlements.test.ts` (межі тижня, DST),
  `apps/server/src/modules/chat/aiQuota.test.ts` (21-ша дія, 4-те фото, 6-й
  скан), `apps/server/src/modules/billing/*.test.ts` (trial, grace, знімок),
  контракт `packages/api-client/src/__tests__/contracts/billing.contract.test.ts`.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                              | Title                                                                                                             | Merged     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| [#92](https://bitbucket.org/skords01/sergeant/pull-requests/92) | fix(server,web): живий прогін AI-пайплайнів: обірвані відповіді OpenRouter, зламаний чат, дайджест і формат чисел | 2026-09-28 |
| [#89](https://bitbucket.org/skords01/sergeant/pull-requests/89) | feat(web): Free і Premium, тижневі квоти і єдиний реєстр доступу                                                  | 2026-09-28 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
