# Рішення власника — відкриті й ухвалені

> **Last touched:** 2026-10-26 by @claude (створено тріажем документації: питання зібрано з тіл аудитів і спек; рев'ю: OD-4 розбито на OD-4a-g, відкликання ключів у операціях). **Next review:** 2026-11-26.
> **Status:** Active

Єдине місце, де лежать питання, які агент не вирішує сам. Раніше вони жили в тілах аудитів і спек, тож у [дашборді роботи](../open-work.md) їх не було видно. Правило: агент, що натрапив на рішення власника, додає рядок сюди з посиланням на джерело, а не лишає питання лише в документі. Після відповіді рядок переїжджає в § «Ухвалено» з датою, а джерело отримує позначку.

Формат відповіді: номер і варіант, напр. «OD-3: так» або «OD-4a: (а)». **Рекомендація** — пропозиція агента, не рішення.

## Відкриті

### Продукт

| #     | Питання                                                                                                              | Варіанти                                     | Рекомендація               | Джерело                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| OD-1  | Тижневий план меню: перевести на денні цілі чи лишити загальним інструментом натхнення?                              | денні цілі / загальний                       | —                          | [`founder-ux-review-round2`](./specs/audits/2026-09-11-founder-ux-review-round2.md)                       |
| OD-2  | N-11: ховати «Назад» на домівці модуля, лишивши лише «На хаб»?                                                       | так / ні                                     | так                        | [`product-noise-and-navigation`](./specs/audits/2026-09-16-product-noise-and-navigation.md)               |
| OD-3  | Сторінка `/hroshi`: «чотири входи» витрат лишаємо (скрін банкінгу не окремий вхід)?                                  | так / п'ять                                  | так                        | [`site-code-drift`](./specs/audits/2026-09-14-site-code-drift.md) п. 3                                    |
| OD-4a | AI-5: Free-квота 5/день, а хід з дією = 2 запити (перший + синтез), тож це 2 дії на день                             | (а) / (б) / (в) — у джерелі                  | —                          | [`product-audit/report.md`](./specs/audits/2026-09-01-product-audit/report.md) §4                         |
| OD-4b | AI-3: ліміт 6/хв на чат зачіпає Pro на 7-му повідомленні звичайного діалогу                                          | (а) / (б) / (в) — у джерелі                  | —                          | [`product-audit/report.md`](./specs/audits/2026-09-01-product-audit/report.md) §4                         |
| OD-4d | TXT-5: «ми» у drip-листах — додати виняток для голосу компанії в style guide §2?                                     | (а) / (б) / (в) — у джерелі                  | —                          | [`product-audit/report.md`](./specs/audits/2026-09-01-product-audit/report.md) §4                         |
| OD-4e | UX-4: Комора, голе число без одиниці при ≥ 100 — штуки чи грами                                                      | (а) / (б) / (в) — у джерелі                  | —                          | [`product-audit/report.md`](./specs/audits/2026-09-01-product-audit/report.md) §4                         |
| OD-4f | Перший хід чату не стрімиться (5-14 с очікування) — що робимо                                                        | (а) / (б) / (в) — у джерелі                  | —                          | [`product-audit/report.md`](./specs/audits/2026-09-01-product-audit/report.md) §4                         |
| OD-4g | CALC-3: Аналітика показує суми цілими, Операції — з копійками                                                        | (а) / (б) / (в) — у джерелі                  | —                          | [`product-audit/report.md`](./specs/audits/2026-09-01-product-audit/report.md) §4                         |
| OD-5  | Ідеї Фініка без трекера: прогноз балансу з регулярних, чужа валюта, повний експорт одним кроком, попередження ліміту | у продуктовий беклог / відкинути             | у беклог («Колись»)        | [`finyk-analytics-handson`](./specs/audits/2026-09-24-finyk-analytics-handson.md) пп. 5, 10-12            |
| OD-6  | Харчування, фаза Б категоризації комори (модель + кеш рішень на назву) і розкладання 34 колізій агентом              | робимо / відкладаємо (Frozen)                | —                          | [`pantry-categorization-ai`](./specs/pantry-categorization-ai.md)                                         |
| OD-7  | Сільпо, трек H (тижневий агент закупівлі): заморозити? Тоді спека закривається як Implemented                        | так / ні                                     | так                        | [`silpo-mcp-integration`](./specs/silpo-mcp-integration.md)                                               |
| OD-8  | Швидкий шлях міграції аноніма: прапорець «чисто/брудно» в `localStorage`, повільна розвідка лише на новому пристрої  | так / ні / відкласти (Frozen)                | —                          | [`anonymous-migration-fast-path`](./specs/anonymous-migration-fast-path.md)                               |
| OD-9  | Вмикати AI-пам'ять (`AI_MEMORY_ENABLED`) у проді найближчим часом?                                                   | так (pre-flight) / ні (Frozen)               | —                          | [`ai-memory-activation`](./specs/launch/tech/ai-memory-activation.md)                                     |
| OD-10 | A-3: сторінка `/data` обіцяє маскування пошти, телефону, картки й IBAN, а фото-канал його не має                     | звузити текст / будувати маскування / лишити | звузити текст (один рядок) | [`rada-skeptykiv`](./specs/audits/2026-09-20-rada-skeptykiv.md), `apps/landing/src/pages/DataPage.tsx:95` |

### AI і гроші

| #     | Питання                                                                                           | Варіанти                                | Рекомендація                  | Джерело                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-11 | A5: денний ліміт для Pro (запропоновано 300) і `ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=true` у проді   | так / інше число                        | так                           | [`ai-abuse`](./specs/audits/ai-abuse-2026-08-05.md)                                                                                             |
| OD-12 | Хто веде delivery-статус білінгу? `pr-plan-revenue-2026-05.md` лишився лише в архіві старого репо | канон модуля білінгу / окремий документ | канон модуля                  | [`launch/business/01`](./specs/launch/business/01-monetization-and-pricing.md), [`06`](./specs/launch/business/06-monetization-architecture.md) |
| OD-13 | Ідеї монетизації без трекера (A/B цін, social proof, progressive paywall, email drip)             | у чекліст запуску / відкинути           | відкинути до запуску платежів | [`launch/business/01`](./specs/launch/business/01-monetization-and-pricing.md)                                                                  |

### Юридичне і запуск

| #     | Питання                                                                         | Варіанти                                    | Рекомендація | Джерело                                                                                    |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| OD-14 | Реквізити ФОП і health-consent (§6 пп. 1-3): хто і коли дає юридичний висновок? | юрист зараз / до комерції                   | —            | [`legal-docs-beta-readiness`](./specs/audits/2026-07-31-legal-docs-beta-readiness.md)      |
| OD-15 | G-2 (юрособа) і G-4 (sunset): брати в роботу?                                   | коли / без строку                           | —            | [`rada-skeptykiv`](./specs/audits/2026-09-20-rada-skeptykiv.md)                            |
| OD-16 | Розсилка верифікації пошти для legacy-користувачів: Phase 0 не виконано         | Frozen до публічного запуску / вікно <дата> | Frozen       | [`email-verification-sweep`](./specs/launch/email-verification-sweep.md)                   |
| OD-17 | README-слоган «Local-first. Приватно.»: переписати зараз?                       | так / ні                                    | так          | [`external-critique-surface`](./specs/audits/2026-08-05-external-critique-surface.md)      |
| OD-18 | Ліцензія MIT лишається? (разом із ринком uk/en, ЄС, unit-economics з §7)        | так / змінити                               | —            | [`external-critique-surface`](./specs/audits/2026-08-05-external-critique-surface.md) §2.1 |

### Інфраструктура і репо

| #     | Питання                                                                                                                                                 | Варіанти                          | Рекомендація    | Джерело                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| OD-19 | Відкинути залишкові гілки старого репо (CMP-74 paywall, чотири coverage-хвилі ~43 тести, `spike/pro-monthly-cap`, `spec-fab`, PR #324)?                 | так / ні / частково               | так             | [`lost-commits-audit`](./specs/audits/2026-08-05-lost-commits-audit.md)       |
| OD-20 | Архівувати 547 локальних не-предків з `oldgh` / `deadgh-zaebal` у GitHub як `archive/<remote>/<гілка>`? Refs лежать лише в `D:\Sergeant`                | робимо / ні, ризик прийнято       | —               | [`dead-github-remotes`](./specs/audits/2026-09-23-dead-github-remotes.md)     |
| OD-21 | Ініціатива 0015: закрити як Implemented і відкинути критерій «5 з 7 днів», бо cron `docs-daily-brief.yml` знято (#1291)?                                | так / ні (повернути cron)         | так             | [`initiatives/0015`](./specs/initiatives/0015-docs-automation-daily-ops.md)   |
| OD-22 | Лендінг: F3 (бандл по маршрутах, −54% JS) і F7 (мобільний Lighthouse як warn)                                                                           | зараз / у беклог / не брати       | у беклог        | [`site-audit`](./specs/audits/2026-10-08-site-audit.md)                       |
| OD-23 | Governance: DG-4, DG-13, DG-14, DG-17 (переклад англомовних політик чи виняток з Rule #15), DG-23, DG-26, DG-30, ADR-0003/0044/0072, secondary reviewer | по кожному в джерелі §9           | —               | [`docs-governance-audit`](./specs/audits/2026-09-23-docs-governance-audit.md) |
| OD-24 | Дашборд `open-work.md` показує `Draft` як відкриту роботу. Виключити `Draft` чи вимагати `Frozen` для відкладених планів?                               | виключити Draft / вимагати Frozen | вимагати Frozen | [`generate-open-work.mjs`](../../scripts/docs/generate-open-work.mjs)         |
| OD-25 | Low-vision спека прив'язана до бета-тестерки. Після бети: лишити ручні 5 сценаріїв (прогін на власному телефоні) чи закрити?                            | лишити / закрити                  | лишити          | [`accessibility-low-vision-beta`](./specs/accessibility-low-vision-beta.md)   |

### Операції, які робить лише власник

Не питання, а дії з доступом до проду. Агент їх не виконає; кожна розблоковує документ із [`roadmap.md`](./roadmap.md).

- Перемкнути прод на роль `sergeant_app` за рунбуком → [`rls-ai-tables-and-isolation-gate`](./specs/rls-ai-tables-and-isolation-gate.md) стадія 4.
- Запустити `healthTextBackfill` у проді (dry-run, потім `--execute`) → [`health-text-encryption`](./specs/health-text-encryption.md).
- **Безпека, першим:** відкликати ключі, що світились у чаті 2026-09-13, якщо вони ще дійсні → [`voice-input-followups`](./specs/voice-input-followups.md).
- `VITE_ENABLE_VOICE_INPUT=1` у Vercel і `GROQ_API_KEY` у Coolify → [`voice-input-followups`](./specs/voice-input-followups.md).
- Дашборд cost/latency і anomaly alert у PostHog → [`initiatives/0025`](./specs/initiatives/0025-posthog-ai-observability.md).
- Разові перевірки безпеки після бети: F7 (IDOR-матриця на двох живих акаунтах) і F8 (`PUSH_INTERNAL_ALLOWED_IPS` / `API_SECRET` у прод-конфігу) → [`beta-security-readiness`](./specs/beta-security-readiness.md).
- Закрити форми бети в Tally (`Settings` → `Close form`) → [`beta-forms`](./specs/beta-forms.md).
- Click-through на живому стенді: тарифи ([`access-tiers`](./specs/access-tiers.md) § Верифікація п. 5) і Сільпо з живим акаунтом ([`silpo-pantry-auto-import`](./specs/silpo-pantry-auto-import.md)).

## Ухвалено

| Дата       | Рішення                                                                                                       | Наслідок                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-26 | Закрита бета завершена, прибираємо                                                                            | Бета-доки закрито; прибирання теки `beta-launch/` і бета-скриптів — окремий PR до 2026-10-31 (див. roadmap) |
| 2026-10-26 | Low/info знахідки повного аудиту 2026-10-01 опрацьовує окрема сесія                                           | Каталог `audits/2026-10-01-full-app-audit/` у тріажі не чіпали                                              |
| 2026-10-26 | Трекінг: [`roadmap.md`](./roadmap.md) (руками) + цей файл + автоматичний [`open-work.md`](../open-work.md)    | Аудит із виконаними хвилями одразу стає `Reference`, залишки — в один живий документ                        |
| 2026-10-26 | Реєстр [`verification/findings.json`](./specs/audits/verification/findings.json) ревалідувати окремим заходом | Пункт у roadmap «Далі»                                                                                      |
