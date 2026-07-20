# Landing-page мокапи для бета-тесту та реклами

> **Файли переміщено** до `mockups/landing/campaigns/` (git history збережено через `git mv`). Посилання нижче оновлено.

> **Last validated:** 2026-05-14 by @Skords-01 / Devin. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/01-product/launch/landing-decision.md`.

> **Канон 2026-05-19:** поточна product-owned landing surface — shipped web-app `/` route (`apps/web/src/core/LandingPage.tsx`) + `WaitlistForm` + server `/api/waitlist`. Мокапи нижче лишаються корисними для campaign creative і майбутнього standalone marketing-domain exploration, але це не активний implementation tracker.

8 self-contained HTML-мокапів лендингу для збору waitlist-у закритої бети та паралельного запуску
рекламних креативів (Twitter/X, Meta Ads, Threads, DOU, Telegram-канали). Кожен файл —
статичний, без build-step, з Tailwind CDN — щоб дизайн-рев'ю проходив за 1 клік (open file у
Chrome) і preview-деплой був тривіальним (Vercel static / Netlify drop / `python -m http.server`).

## Як це лягає у roadmap

- **Контекст:** [`docs/01-product/launch/business/02-go-to-market.md § 2.2 Landing page`](../business/02-go-to-market.md) —
  T-25 днів до публічного запуску потрібен лендинг з email-збором + countdown.
- **Не торкаємось `apps/web`:** `apps/web/src/core/LandingPage.tsx` — це in-app маркетинг-сурфейс
  для non-auth юзерів (ADR-0051, Phase 6.1). Ці мокапи — окремий маркетинг-сайт під
  `sergeant.com.ua`, не `app.sergeant.com.ua`.
- **Lifecycle status:** `Scaffolded` — exploratory мокапи для вибору одного основного концепту +
  одного-двох ad-variant-ів. Після decision-у переможці переїжджають у фінальний marketing-build
  (Astro SSG або Vite static), а інші — у `_archive/`.

## Варіанти

| #   | Файл                                                                                                   | Концепт                 | Hero-CTA                       | Target traffic                                                |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------ | ------------------------------------------------------------- |
| 01  | [`campaigns/ai-coach.html`](../../../../mockups/landing/campaigns/ai-coach.html)                       | AI Coach hero           | «Хочу в бету» + email          | Twitter/X · DOU.ua · аудиторія, що любить AI                  |
| 02  | [`campaigns/five-in-one.html`](../../../../mockups/landing/campaigns/five-in-one.html)                 | 5-в-1 / Before-After    | «Хочу спробувати»              | Product Hunt · Threads · users з SaaS-fatigue                 |
| 03  | [`campaigns/local-first-privacy.html`](../../../../mockups/landing/campaigns/local-first-privacy.html) | Local-first manifesto   | «Запит на доступ»              | Hacker News · privacy-aware · Indie Hackers                   |
| 04  | [`campaigns/day-in-life.html`](../../../../mockups/landing/campaigns/day-in-life.html)                 | Day-in-the-life         | «Хочу в бету»                  | Instagram · Threads · аудиторія, що любить storytelling       |
| 05  | [`campaigns/beta-exclusive.html`](../../../../mockups/landing/campaigns/beta-exclusive.html)           | Closed-beta urgency     | «Забронювати спот» + countdown | Meta Ads · paid traffic · retargeting · founder-DM-кампанія   |
| 06  | [`campaigns/founder-letter.html`](../../../../mockups/landing/campaigns/founder-letter.html)           | Founder letter / IH     | «Запиши мене у бету»           | Substack · Telegram-канал · email-list · founder-friendly DOU |
| 07  | [`campaigns/roi-calculator.html`](../../../../mockups/landing/campaigns/roi-calculator.html)           | ROI / Savings calc      | «Хочу зекономити»              | Google Search · «alternatives to YNAB» queries · cost-aware   |
| 08  | [`campaigns/made-in-ukraine.html`](../../../../mockups/landing/campaigns/made-in-ukraine.html)         | Made in Ukraine (UA-UA) | «🇺🇦 Записатись у бету»         | DOU · Telegram-канали (укр-патріотичні) · локальні медіа      |

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
cd mockups/landing/campaigns
python3 -m http.server 8000
# відкрий http://localhost:8000/ai-coach.html
```

Або просто відкрий `*.html` напряму у браузері (`file://` працює — Google Fonts тягнуться з мережі, `tokens.css` — локальний).

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
   [`packages/shared/src/lib/analyticsEvents.ts § Landing page`](../../../../packages/shared/src/lib/analyticsEvents.ts).
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
