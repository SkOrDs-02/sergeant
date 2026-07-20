# 2026-07-20 — Застосунок на телефоні: чистіше й розумніше

> **Last touched:** 2026-07-20 by @Skords-01. **Next review:** 2026-10-18.
> **Status:** Active

> **Modal id:** `2026-07-20-phone-polish` —
> [`apps/web/src/core/whatsNew/releases.ts`](../../../apps/web/src/core/whatsNew/releases.ts)

## TL;DR

Багато роботи над тим, як застосунок почувається на телефоні: правильні
відступи й безпечні зони на iOS, стабільна навігація та прокрутка,
причесані форми й картки у всіх модулях. А ще звіти стали кориснішими —
PDF з реальними інсайтами й хронологічна мапа звичок — і у Фізруку
з'явилася об'ємна 3D-мапа тіла.

## Items

- **Improvement** — На телефоні застосунок тримається екрана: правильні відступи, плавна навігація, прокрутка й безпечні зони на iOS.
- **Fix** — Причесали форми, картки й таблиці у Фінику, Фізруку, Раціоні та Рутині — менше збоїв на дотик.
- **Feature** — Експорт у PDF тепер містить твої справжні інсайти, а мапа звичок стала хронологічною стрічкою.
- **Feature** — У Фізруку з'явилася об'ємна 3D-мапа тіла — рельєфніша й наочніша.
- **Improvement** — Ручні транзакції тепер зв'язуються між собою, меню налаштувань стало чистішим, а чат прокручується рівно.

## Чому

Консолідований реліз за період 2026-07-12 → 2026-07-19 після кількох раундів
phone/feedback-аудиту застосунку на реальних пристроях.

- **Mobile viewport / navigation.** iOS standalone viewport ([#288](https://github.com/Skords-01/Sergeant/pull/288)),
  pin mobile shell to viewport ([#278](https://github.com/Skords-01/Sergeant/pull/278)),
  stabilize mobile hub navigation + chat layout ([#277](https://github.com/Skords-01/Sergeant/pull/277)),
  real visual-viewport height via `--app-dvh`, compact bottom nav, welcome auth
  gate + safe area, phone feedback regressions ([#306](https://github.com/Skords-01/Sergeant/pull/306)).
- **Per-module mobile audit.** round-2 Finyk/Fizruk/Nutrition module fixes
  M1-M6 ([#269](https://github.com/Skords-01/Sergeant/pull/269)), B-Fizruk (body
  form validation + tiles), B-Finyk (form/asset/privacy UI), B-Routine (day
  strip, accent), B-Nutrition (variant, water, card, tooltip).
- **Reports.** Real insights у експортованому PDF-звіті ([#315](https://github.com/Skords-01/Sergeant/pull/315)),
  habit heatmap → хронологічна стрічка ([#311](https://github.com/Skords-01/Sergeant/pull/311)).
- **Fizruk visual.** Sculpted 3D BodyAtlas rendering (design variant 2а).
- **Finance / settings / chat.** Link manual transactions + contain date field,
  finance & module UX feedback ([#297](https://github.com/Skords-01/Sergeant/pull/297)),
  settings-menu cleanup + calm mode to settings, scrollable assistant capability
  catalogue, unbreak hub-chat scroll.

## Метрики

- **Очікуємо (7 днів у PostHog):** `whats_new_shown → whats_new_cta_clicked`
  (тут CTA немає — читаємо scroll-to-end / dismiss-via close) і відсутність
  сплеску mobile-layout Sentry-issue після релізу.
- **Fail / rollback:** зростання скарг на «з'їхав viewport» / «не гортається»
  на iOS standalone, або падіння d7 returning-engagement нижче baseline.
