# Feedback loop — in-app widget + NPS через PostHog Surveys

> **Last touched:** 2026-07-10 by @claude. **Next review:** 2026-10-08.
> **Status:** Active

Операційна довідка feedback-loop-у з GTM § 3.2
([`02-go-to-market.md`](../../01-product/launch/business/02-go-to-market.md)):
in-app feedback widget («Є ідея / Знайшов баг») і NPS-опитування після
7 днів використання. Обидва закриті через уже підключений PostHog —
без нового вендора і без нового бекенда.

## 1. In-app feedback widget

**Де живе:** Settings → таб «Загальні» → секція «Фідбек»
([`apps/web/src/core/feedback/FeedbackSection.tsx`](../../../apps/web/src/core/feedback/FeedbackSection.tsx)).
Діалог — категорія (Ідея / Баг / Інше) + free-text + опціональний
контекст сторінки.

**Транспорт:** стандартний `trackEvent` sink → PostHog. Події (канонічні
імена й payload-контракти — у
[`packages/shared/src/lib/analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts)):

| Подія                    | Коли                       | Ключові поля payload                                                               |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| `feedback_widget_opened` | відкриття діалогу          | `source: "settings"`                                                               |
| `feedback_submitted`     | сабміт непорожнього тексту | `category`, `message` (≤ 2000), `length`, `has_page_context`, `page?`, `viewport?` |

**«Скріншот-контекст»** — свідомо НЕ реальний скріншот (pixel-и тягнуть
PII: баланси, назви транзакцій), а мінімальний відтворюваний опис:
`page` (href через `sanitizeUrl()` — той самий санітайзер, що
`$current_url` у `PageviewTracker`; auth-токени/OAuth-коди ніколи не
долітають) + `viewport` (`WxH`). Тумблер у діалозі default-on, юзер
може вимкнути.

**`message` — єдиний event з навмисним user-generated free-text.**
Виняток із «minimal, non-sensitive metadata» контракту `trackEvent`
задокументований у каталозі подій; `scrubPII` по payload проходить як
завжди.

### Feedback inbox у PostHog (разова настройка dashboard-а)

1. PostHog → **Activity** → фільтр за event `feedback_submitted`.
2. Для зручного «inbox»: **Product analytics → New insight → Events
   table**, event `feedback_submitted`, breakdown-колонки `category`,
   `message`, `page`. Зберегти insight як **Feedback inbox** у dashboard
   «Founder pulse» (див. [`posthog-founder-pulse.md`](./posthog-founder-pulse.md)).
3. Опційно — PostHog webhook/Slack destination на event
   `feedback_submitted`, щоб фідбек падав у месенджер одразу.

## 2. NPS через PostHog Surveys

**Клієнтський тригер:**
[`apps/web/src/core/feedback/useNpsSurveyTrigger.ts`](../../../apps/web/src/core/feedback/useNpsSurveyTrigger.ts)
(`NpsSurveyGate` у `AppShell`). Коли вік акаунта (цілі доби UTC від
`user.createdAt`) сягає **≥ 7 днів**, рівно один раз на browser profile
стріляє `nps_survey_eligible { account_age_days }`. Idempotency —
localStorage-флаг `sergeant.nps_survey_eligible_fired` (скинь у
devtools для dev-replay).

**Запасний шлях таргетингу:** person-property `account_age_days`
(знімок на момент identify) — додається у
[`identifyTraits.ts`](../../../apps/web/src/core/observability/identifyTraits.ts)
поруч із `signup_date`.

**Рендер опитування** — повністю на боці `posthog-js` (SDK уже
підключений lazy-init-ом у
[`posthog.ts`](../../../apps/web/src/core/observability/posthog.ts);
surveys у конфігу НЕ вимкнені — popover-опитування працюють з коробки,
щойно survey активний у dashboard). Відповіді збираються стандартними
подіями `survey shown` / `survey sent` / `survey dismissed` — власних
подій для цього не заводимо.

### Настройка survey у PostHog dashboard (разово)

1. PostHog → **Surveys → New survey → Net Promoter Score (NPS)**,
   presentation **Popover**.
2. Питання (UA-копія за style-guide — звертання «ти», без крапки в
   заголовку): «Наскільки ймовірно, що ти порадиш Sergeant другу?»;
   follow-up: «Що нам зробити, щоб оцінка стала вищою?».
3. **Display conditions → When user sends event** → `nps_survey_eligible`.
   (Fallback-варіант: person property `account_age_days` ≥ 7 — якщо
   event-based тригери недоступні на поточному плані.)
4. **Wait period:** «Do not display to users who saw a survey in the
   last **90** days» — щоб NPS не діставав тих, хто вже відповів.
5. Launch. Результати — вкладка survey → NPS score breakdown
   (promoters / passives / detractors); PostHog рахує score сам.

## 3. Верифікація без PostHog key

Без `VITE_POSTHOG_KEY` транспорт — no-op, але події детерміновано
видно у ring-buffer `window.__hubAnalytics` (див.
[`analytics.ts`](../../../apps/web/src/core/observability/analytics.ts))
— так їх читають smoke-тести. Unit-покриття:
`apps/web/src/core/feedback/*.test.{ts,tsx}`.

## See also

- [`posthog-founder-pulse.md`](./posthog-founder-pulse.md) — founder-дашборд, куди підключається Feedback inbox.
- [`posthog-ftux-dashboards.md`](./posthog-ftux-dashboards.md) — конвенції PostHog-дашбордів і подій.
- [`../../01-product/launch/business/02-go-to-market.md`](../../01-product/launch/business/02-go-to-market.md) — GTM-план, § 3.2 «Фідбек-лупи».
