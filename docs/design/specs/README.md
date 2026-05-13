# Design specs

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
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

| Дата       | Спек                                                                                                           | Статус                                            | Successor                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 2026-04-24 | [`2026-04-24-assistant-quick-actions-v1-design.md`](./2026-04-24-assistant-quick-actions-v1-design.md)         | Shipped (PR #743) — superseded                    | [`2026-04-25-assistant-capability-catalogue-design.md`](./2026-04-25-assistant-capability-catalogue-design.md) |
| 2026-04-25 | [`2026-04-25-assistant-capability-catalogue-design.md`](./2026-04-25-assistant-capability-catalogue-design.md) | Shipped (PR #795 + #798/#799/#800/#805/#812/#839) | —                                                                                                              |
| 2026-05-06 | [`2026-05-06-sync-engine-writer-wiring-design.md`](./2026-05-06-sync-engine-writer-wiring-design.md)           | Active                                            | —                                                                                                              |

## Іменування нових спеків

`YYYY-MM-DD-<slug>-design.md` (kebab-case, без скорочень модулів).
Шапка має включати freshness-маркери (Hard-rule #15) і посилання на
implementation-PR-и в `Status:`-полі (бо governance-sync-скрипт дивиться
саме на `Status:`-рядок).

Якщо новий спек замінює попередній — додай `**superseded by**` у шапку
старого і запис у колонку Successor вище.
