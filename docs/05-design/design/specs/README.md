# Design specs

> **Last touched:** 2026-07-19 by @claude. **Next review:** 2026-10-17.
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

| Дата       | Спек                                                                                                                   | Статус                        | Successor |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| 2026-04-25 | [`2026-04-25-assistant-capability-catalogue-design.md`](./archive/2026-04-25-assistant-capability-catalogue-design.md) | Shipped — archived 2026-07-19 | —         |
| 2026-05-06 | [`2026-05-06-sync-engine-writer-wiring-design.md`](./archive/2026-05-06-sync-engine-writer-wiring-design.md)           | Shipped — archived 2026-07-19 | —         |
| 2026-07-13 | [`2026-07-13-pwa-usability-polish-design.md`](./2026-07-13-pwa-usability-polish-design.md)                             | Draft                         | —         |
| 2026-07-16 | [`2026-07-16-founder-feedback-remediation-design.md`](./2026-07-16-founder-feedback-remediation-design.md)             | Active                        | —         |

### Архів superseded спеків

Повний індекс — у [`archive/README.md`](./archive/README.md).

| Дата       | Спек                                                                                                                   | Статус                         | Successor                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-04-24 | [`archive/2026-04-24-assistant-quick-actions-v1-design.md`](./archive/2026-04-24-assistant-quick-actions-v1-design.md) | Shipped (PR #743) → Superseded | [`2026-04-25-assistant-capability-catalogue-design.md`](./archive/2026-04-25-assistant-capability-catalogue-design.md) |

## Іменування нових спеків

`YYYY-MM-DD-<slug>-design.md` (kebab-case, без скорочень модулів).
Шапка має включати freshness-маркери (Hard-rule #15) і посилання на
implementation-PR-и в `Status:`-полі (бо governance-sync-скрипт дивиться
саме на `Status:`-рядок).

Якщо новий спек замінює попередній — додай `**superseded by**` у шапку
старого і запис у колонку Successor вище.
