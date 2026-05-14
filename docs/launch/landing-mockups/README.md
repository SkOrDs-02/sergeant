# Landing-page мокапи для бета-тесту та реклами

> **Last validated:** 2026-05-14 by @Skords-01 / Devin. **Next review:** 2026-08-12.
> **Status:** Scaffolded

8 self-contained HTML-мокапів лендингу для збору waitlist-у закритої бети та паралельного запуску
рекламних креативів (Twitter/X, Meta Ads, Threads, DOU, Telegram-канали). Кожен файл —
статичний, без build-step, з Tailwind CDN — щоб дизайн-рев'ю проходив за 1 клік (open file у
Chrome) і preview-деплой був тривіальним (Vercel static / Netlify drop / `python -m http.server`).

## Як це лягає у roadmap

- **Контекст:** [`docs/launch/business/02-go-to-market.md § 2.2 Landing page`](../business/02-go-to-market.md) —
  T-25 днів до публічного запуску потрібен лендинг з email-збором + countdown.
- **Не торкаємось `apps/web`:** `apps/web/src/core/LandingPage.tsx` — це in-app маркетинг-сурфейс
  для non-auth юзерів (ADR-0051, Phase 6.1). Ці мокапи — окремий маркетинг-сайт під
  `sergeant.com.ua`, не `app.sergeant.com.ua`.
- **Lifecycle status:** `Scaffolded` — exploratory мокапи для вибору одного основного концепту +
  одного-двох ad-variant-ів. Після decision-у переможці переїжджають у фінальний marketing-build
  (Astro SSG або Vite static), а інші — у `_archive/`.

## Варіанти

| #   | Файл                                                                         | Концепт                 | Hero-CTA                       | Target traffic                                                |
| --- | ---------------------------------------------------------------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------- |
| 01  | [`mockup-01-ai-coach.html`](./mockup-01-ai-coach.html)                       | AI Coach hero           | «Хочу в бету» + email          | Twitter/X · DOU.ua · аудиторія, що любить AI                  |
| 02  | [`mockup-02-five-in-one.html`](./mockup-02-five-in-one.html)                 | 5-в-1 / Before-After    | «Хочу спробувати»              | Product Hunt · Threads · users з SaaS-fatigue                 |
| 03  | [`mockup-03-local-first-privacy.html`](./mockup-03-local-first-privacy.html) | Local-first manifesto   | «Запит на доступ»              | Hacker News · privacy-aware · Indie Hackers                   |
| 04  | [`mockup-04-day-in-life.html`](./mockup-04-day-in-life.html)                 | Day-in-the-life         | «Хочу в бету»                  | Instagram · Threads · аудиторія, що любить storytelling       |
| 05  | [`mockup-05-beta-exclusive.html`](./mockup-05-beta-exclusive.html)           | Closed-beta urgency     | «Забронювати спот» + countdown | Meta Ads · paid traffic · retargeting · founder-DM-кампанія   |
| 06  | [`mockup-06-founder-letter.html`](./mockup-06-founder-letter.html)           | Founder letter / IH     | «Запиши мене у бету»           | Substack · Telegram-канал · email-list · founder-friendly DOU |
| 07  | [`mockup-07-roi-calculator.html`](./mockup-07-roi-calculator.html)           | ROI / Savings calc      | «Хочу зекономити»              | Google Search · «alternatives to YNAB» queries · cost-aware   |
| 08  | [`mockup-08-made-in-ukraine.html`](./mockup-08-made-in-ukraine.html)         | Made in Ukraine (UA-UA) | «🇺🇦 Записатись у бету»         | DOU · Telegram-канали (укр-патріотичні) · локальні медіа      |

### Спільне для всіх

- UA-копірайт (Hard Rule #15 — внутрішні docs українською; маркетинг — теж UA для UA-аудиторії).
- Sergeant brand palette (`emerald-700` як primary, module accents `coral` / `lime` / `teal`).
- Email-форма (`onsubmit` — заглушка; під реальний Loops / ConvertKit / Mailchimp endpoint
  підставити перед deploy-ем).
- Responsive (sm / md / lg breakpoints).
- 7-day Pro trial без картки як trust-bullet.

### Швидкий перегляд

```bash
# з кореня репо
cd docs/launch/landing-mockups
python3 -m http.server 8000
# відкрий http://localhost:8000/mockup-01-ai-coach.html
```

Або просто відкрий `*.html` напряму у браузері (`file://` працює — Tailwind CDN і Google Fonts
тягнуться з мережі).

## Як вибрати переможця

1. **Якісне рев'ю:** open у Chrome desktop + DevTools mobile emulator (375 / 768 / 1280). Лови
   broken layout-и, перевір CTA-видимість above the fold, скрипти курсорних анімацій.
2. **A/B-кандидати:** для closed-beta period — рекомендую `01` (AI Coach) як primary і `05`
   (Beta exclusive) як paid-ads variant. `03` (privacy) — для HN/Indie Hackers лонч-постів,
   `06` (Founder letter) — для Telegram-каналу і Substack, `07` (ROI calc) — для Google Search
   ads на keyword-ах «alternative to YNAB / MyFitnessPal», `08` (Made in UA) — для локальних
   медіа і Telegram-каналів з патріотичним позиціонуванням. `02` і `04` — резервні для
   post-launch content marketing.
3. **Метрики, які треба ловити після deploy-у:** `LANDING_VIEWED` (см. `LandingPage.tsx`
   contract), email-submit rate, referrer split, scroll depth. PostHog event-схема —
   [`packages/shared/src/lib/analyticsEvents.ts § Landing page`](../../../packages/shared/src/lib/analyticsEvents.ts).
4. **Після decision-у** — створити PR з обраним variant-ом як основою фінального маркетинг-білду
   (Astro SSG, окремий `marketing/` workspace, або Vercel static), решту перенести у
   `_archive/` (Rule #10 lifecycle marker — `Archived`).

## Що НЕ є цими мокапами

- Не production-код. Не залежать від apps/web design tokens, ESLint-правил, hard rule #11–14.
- Не A/B-test infrastructure. Це креативи; A/B-розгалуження робиться вже на самому
  marketing-домені.
- Не повний content. Скриншоти продукту, social-proof testimonials, точні цифри — мокапи
  показують структуру; контент допиливається перед launch-ем за чек-листом
  [`02-go-to-market.md § 2.1`](../business/02-go-to-market.md).
