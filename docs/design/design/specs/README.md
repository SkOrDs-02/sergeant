# Design specs

> **Last touched:** 2026-09-16 by @claude (усі вісім спек звірено з кодом; шість статусів були застарілі, два — самосуперечливі). **Next review:** 2027-03-22.
> **Status:** Active

Design-специ для нетривіальних product-side фіч (раніше `agents/specs/`).
Кожен спек живе як окремий markdown із freshness-шапкою; нові — додаються
в таблицю нижче.

## Як читати

- **Дата** — день, із якого починалася робота над спеком (префікс імені файлу).
- **Спек** — посилання на сам файл.
- **Статус** — поточний стан relative-до коду:
  - `Active` — продовжується робота / реалізація триває.
  - `Shipped` — реалізація приземлилася (PR-и в шапці спеку).
  - `Superseded by` — спек замінений новішим контрактом; зберігається як
    історичний контекст.
- **Successor** — посилання на спек, що його замінює (якщо є).

## Реєстр

| Дата       | Спек                                                                                                                                                                                                                                 | Статус                               | Successor |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | --------- |
| 2026-04-25 | [`2026-04-25-assistant-capability-catalogue-design.md`](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/specs/archive/2026-04-25-assistant-capability-catalogue-design.md) | Shipped — archived 2026-07-19        | —         |
| 2026-05-06 | [`2026-05-06-sync-engine-writer-wiring-design.md`](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/specs/archive/2026-05-06-sync-engine-writer-wiring-design.md)           | Shipped — archived 2026-07-19        | —         |
| 2026-07-13 | [`2026-07-13-hub-auth-nav-chat-regression.md`](./2026-07-13-hub-auth-nav-chat-regression.md)                                                                                                                                         | Shipped (звірено 2026-09-16)         | —         |
| 2026-07-13 | [`2026-07-13-routine-day-timeline-cross-module.md`](./2026-07-13-routine-day-timeline-cross-module.md)                                                                                                                               | Active — частково (~5/11 MVP)        | —         |
| 2026-07-13 | [`2026-07-13-pwa-usability-polish-design.md`](./2026-07-13-pwa-usability-polish-design.md)                                                                                                                                           | Shipped (~90 %; залишок «Тільки ти») | —         |
| 2026-07-16 | [`2026-07-16-founder-feedback-remediation-design.md`](./2026-07-16-founder-feedback-remediation-design.md)                                                                                                                           | Shipped (два дрібні залишки)         | —         |
| 2026-07-28 | [`2026-07-28-anonymous-profile-data-migration-design.md`](./2026-07-28-anonymous-profile-data-migration-design.md)                                                                                                                   | Shipped                              | —         |
| 2026-07-28 | [`2026-07-28-finyk-transaction-details-design.md`](./2026-07-28-finyk-transaction-details-design.md)                                                                                                                                 | Shipped                              | —         |
| 2026-07-29 | [`2026-07-29-finyk-daily-pulse-and-transfer-suggestions-design.md`](./2026-07-29-finyk-daily-pulse-and-transfer-suggestions-design.md)                                                                                               | Shipped                              | —         |
| 2026-08-25 | [`2026-08-25-finyk-multi-category-limit-design.md`](./2026-08-25-finyk-multi-category-limit-design.md)                                                                                                                               | Shipped                              | —         |
| 2026-09-16 | [`2026-09-16-pricing-paywall-design.md`](./2026-09-16-pricing-paywall-design.md)                                                                                                                                                     | Active — контракт as-built           | —         |
| 2026-09-16 | [`2026-09-16-onboarding-design.md`](./2026-09-16-onboarding-design.md)                                                                                                                                                               | Active — контракт as-built           | —         |
| 2026-09-17 | [`2026-09-17-auth-design.md`](./2026-09-17-auth-design.md)                                                                                                                                                                           | Active — контракт as-built           | —         |
| 2026-09-17 | [`2026-09-17-profile-design.md`](./2026-09-17-profile-design.md)                                                                                                                                                                     | Active — контракт as-built           | —         |
| 2026-09-17 | [`2026-09-17-hubchat-design.md`](./2026-09-17-hubchat-design.md)                                                                                                                                                                     | Active — контракт as-built           | —         |
| 2026-09-17 | [`2026-09-17-settings-design.md`](./2026-09-17-settings-design.md)                                                                                                                                                                   | Active — контракт as-built           | —         |
| 2026-09-17 | [`2026-09-17-landing-design.md`](./2026-09-17-landing-design.md)                                                                                                                                                                     | Active — контракт as-built           | —         |
| 2026-09-17 | [`2026-09-17-legal-design.md`](./2026-09-17-legal-design.md)                                                                                                                                                                         | Active — контракт as-built           | —         |

### Архів superseded спеків

Повний індекс — у [`archive/README.md`](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/specs/archive/README.md).

| Дата       | Спек                                                                                                                                                                                                                                 | Статус                         | Successor                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-24 | [`archive/2026-04-24-assistant-quick-actions-v1-design.md`](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/specs/archive/2026-04-24-assistant-quick-actions-v1-design.md) | Shipped (PR #743) → Superseded | [`2026-04-25-assistant-capability-catalogue-design.md`](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/specs/archive/2026-04-25-assistant-capability-catalogue-design.md) |

## Іменування нових спеків

`YYYY-MM-DD-<slug>-design.md` (kebab-case, без скорочень модулів).
Шапка має включати freshness-маркери (Hard-rule #15) і доказ реалізації в
`Status:`-полі — номер PR або, якщо історія недоступна (репозиторій
імпортовано снапшотом 2026-09-14), файли в коді, за якими наступний аудит
відтворить перевірку. Governance-sync-скрипт дивиться саме на
`Status:`-рядок. Статуси «implementation ready, PR pending» без дати —
заборонені: вони застарівають мовчки (шість із восьми записів цього реєстру
були такими до 2026-09-16).

Якщо новий спек замінює попередній — додай `**superseded by**` у шапку
старого і запис у колонку Successor вище.
