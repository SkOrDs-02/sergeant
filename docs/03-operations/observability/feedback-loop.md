# Feedback loop — in-app widget + NPS через PostHog Surveys

> **Last touched:** 2026-08-16 by @claude. **Next review:** 2026-11-24.
> **Status:** Active

Операційна довідка feedback-loop-у з GTM § 3.2
([`02-go-to-market.md`](../../01-product/launch/business/02-go-to-market.md)):
in-app feedback widget («Є ідея / Знайшов баг») і NPS-опитування після
7 днів використання. NPS закритий через уже підключений PostHog; у
віджета фідбеку з 2026-07-31 є **власний серверний sink** — причина в § 2a.

## 1. In-app feedback widget

**Де живе:** Settings → таб «Загальні» → секція «Фідбек»
([`apps/web/src/core/feedback/FeedbackSection.tsx`](../../../apps/web/src/core/feedback/FeedbackSection.tsx)).
Діалог — категорія (Ідея / Баг / Інше) + free-text + опціональний
контекст сторінки.

**Транспорт — два різні синки з різними ролями:**

1. **`POST /api/v1/feedback` — джерело істини для тексту.** Пише в
   `feedback_entries` (міграція 093). Клієнт **дочікується 200** і лише тоді
   показує «надіслано». Роут:
   [`apps/server/src/routes/feedback.ts`](../../../apps/server/src/routes/feedback.ts),
   сервіс: [`feedbackService.ts`](../../../apps/server/src/modules/feedback/feedbackService.ts),
   клієнт: [`packages/api-client/src/endpoints/feedback.ts`](../../../packages/api-client/src/endpoints/feedback.ts).
   Анонімний (сесія опційна, підвʼязується якщо є), rate-limit 20/IP/год.
2. **PostHog через `trackEvent` — аналітика воронки.** Стріляє **після**
   успішного POST, тож `feedback_submitted` тепер означає «відгук
   доставлено», а не «кнопку натиснуто».

Події (канонічні імена й payload-контракти — у
[`packages/shared/src/lib/analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts)):

| Подія                    | Коли                    | Ключові поля payload                                                               |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| `feedback_widget_opened` | відкриття діалогу       | `source: "settings"`                                                               |
| `feedback_submitted`     | **успішний** POST (200) | `category`, `message` (≤ 2000), `length`, `has_page_context`, `page?`, `viewport?` |

> **Наслідок для читання дашборда:** розрив `opened − submitted` тепер
> включає не лише «передумав», а й «спробував, але не долетіло». Реальний
> обсяг зібраного фідбеку рахуй по `SELECT count(*) FROM feedback_entries`,
> а не по PostHog — БД бачить те, чого PostHog під блокувальником не бачить.

**«Скріншот-контекст»** — свідомо НЕ реальний скріншот (pixel-и тягнуть
PII: баланси, назви транзакцій), а мінімальний відтворюваний опис:
`page` (href через `sanitizeUrl()` — той самий санітайзер, що
`$current_url` у `PageviewTracker`; auth-токени/OAuth-коди ніколи не
долітають) + `viewport` (`WxH`). Контекст додається **завжди й без
тумблера**: діалог відкривається лише з Settings, тож просити юзера
підтвердити «це сторінка налаштувань» не мало сенсу. `has_page_context`
відображає те, що РЕАЛЬНО приземлилось — `buildPageContext()` повертає
`null` поза DOM, і тоді прапорець `false`, а `page`/`viewport` відсутні.

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
3. Не пересилай `feedback_submitted` у Slack/webhook без окремо
   затверджених правил доступу, retention і обробки PII — event містить
   raw user-generated `message`, і `scrubPII` НЕ гарантує вичищення
   довільного PII зі свобідного тексту. За потреби пересилай лише
   allowlist-ований санітайзований payload у restricted destination.

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

## 2a. Статус у проді (2026-07-31)

Прямий запит до `sergeant-prod` (id `167740`) за 180 днів:

| Подія                    | Подій | Людей |
| ------------------------ | ----- | ----- |
| `feedback_widget_opened` | 7     | 1     |
| `feedback_submitted`     | **0** | 0     |

`feedback_submitted` немає навіть у переліку event definitions проєкту —
тобто PostHog не приймав його ЖОДНОГО разу.

**Це не баг коду.** Шлях сабміту перевірений end-to-end:

- імʼя події збігається в `analyticsEvents.ts`, у таблиці §1 вище і в
  специфікації інсайту «Feedback inbox» — розходження немає;
- `trackEvent(FEEDBACK_SUBMITTED, …)` викликається безумовно на кожен
  непорожній сабміт ([`FeedbackDialog.tsx`](../../../apps/web/src/core/feedback/FeedbackDialog.tsx)),
  без гейтів на consent / sampling;
- транспорт **той самий**, яким `feedback_widget_opened` успішно долітає
  в прод — тобто sink живий, і це доводять реальні прод-дані, а не тест;
- `message` не входить у `REDACT_KEY_NAMES`, тож `scrubPII` його не ріже;
- футер із кнопкою рендериться в обох розкладках діалогу (`Modal` на
  desktop, `Sheet` на touch), а swipe-to-dismiss у `Sheet` привʼязаний
  лише до ручки й хедера — кнопку сабміту він не перехоплює;
- юніт-тести на call-site зелені (`FeedbackDialog.test.tsx`).

Реальна причина нуля: **7 відкриттів однією людиною й жодного
надсилання** — віджет відкривали, але фідбек не писали. Порожня панель
тут означає «ніхто ще не скористався», а не «пайплайн зламаний».

> ✅ **Ризик тихої втрати — закрито 2026-07-31.** Раніше сабміт був
> fire-and-forget: тост «дякуємо» показувався ще до будь-якого підтвердження
> від PostHog, і власного бекенда у віджета не було. Тестер із блокувальником
> реклами (`eu.i.posthog.com` є у типових блоклистах) або без мережі втрачав
> повідомлення назавжди, будучи впевненим, що надіслав.
>
> Полагоджено власним endpoint-ом (§ 1): текст іде в `feedback_entries`,
> «надіслано» кажемо лише після 200, а на збої діалог **не закривається** —
> показує причину (окремо офлайн, окремо решта) і дає кнопку «скопіювати
> текст», щоб праця людини не пропала навіть коли мережа проти нас.
> Регресію стереже тест «на збої НЕ каже "надіслано"» у
> [`FeedbackDialog.test.tsx`](../../../apps/web/src/core/feedback/FeedbackDialog.test.tsx).
>
> **Лишається відкритим (окреме рішення):** reverse-proxy для PostHog на
> власному домені. Він полагодив би блокувальники для **всієї** телеметрії, а
> не лише для фідбеку — зараз у заблокованого тестера фідбек долітає, але
> решта подій (воронка HubChat, FTUX) усе одно ні. Варіанти й ціна —
> [`posthog-founder-pulse.md` § 10](./posthog-founder-pulse.md) сусідить із
> таким же інфраструктурним рішенням про часовий пояс.

## 3. Верифікація без PostHog key

Без `VITE_POSTHOG_KEY` транспорт — no-op, але події детерміновано
видно у ring-buffer `window.__hubAnalytics` (див.
[`analytics.ts`](../../../apps/web/src/core/observability/analytics.ts))
— так їх читають smoke-тести. Unit-покриття:
`apps/web/src/core/feedback/*.test.{ts,tsx}`.

**Чи дійшов текст — питання до БД, не до PostHog:**

```sql
SELECT id, created_at, category, left(message, 80) AS preview, user_id
  FROM feedback_entries
 ORDER BY created_at DESC
 LIMIT 20;
```

Це і є інбокс бети. PostHog-інсайт нижче лишається зручним переглядом, але
при розбіжності **правий той, що в БД**: подія в PostHog могла не долетіти,
рядок у таблиці — вже ні.

## See also

- [`posthog-founder-pulse.md`](./posthog-founder-pulse.md) — founder-дашборд, куди підключається Feedback inbox.
- [`posthog-ftux-dashboards.md`](./posthog-ftux-dashboards.md) — конвенції PostHog-дашбордів і подій.
- [`../../01-product/launch/business/02-go-to-market.md`](../../01-product/launch/business/02-go-to-market.md) — GTM-план, § 3.2 «Фідбек-лупи».
