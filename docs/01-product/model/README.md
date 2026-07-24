# Продуктові канони Sergeant

> **Last validated:** 2026-07-24 by @Skords-01 (product-knowledge-конвеєр завершено).
> **Next review:** 2026-10-22.
> **Status:** Active

Канонічні продуктові моделі Sergeant — джерело істини про те, для кого продукт,
що обіцяє й чого свідомо не робить. Кожен канон супроводжується diff-звітом
тріангуляції «founder ↔ доки ↔ код» у [`docs/90-work/audits/`](../../90-work/audits/).

## Структура

**Дах:**

- [**product-overview.md**](product-overview.md) — парасольковий канон: Sergeant
  як **одне ціле** (ідентичність, конституція крос-модульних правил,
  деградаційні контракти). Посилається на п'ять канонів нижче, не дублює їх.
  Diff-звіт: [`product-knowledge-overview.md`](../../90-work/audits/product-knowledge-overview.md).

**П'ять модульних канонів:**

| Канон                        | Предмет                                             | Diff-звіт                                                                             |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [finyk.md](finyk.md)         | Модуль особистих фінансів (PFM)                     | [product-knowledge-finyk.md](../../90-work/audits/product-knowledge-finyk.md)         |
| [hub-coach.md](hub-coach.md) | Крос-модульний AI-шар (hub, HubChat, coach, digest) | [product-knowledge-hub-coach.md](../../90-work/audits/product-knowledge-hub-coach.md) |
| [nutrition.md](nutrition.md) | Модуль харчування                                   | [product-knowledge-nutrition.md](../../90-work/audits/product-knowledge-nutrition.md) |
| [fizruk.md](fizruk.md)       | Модуль фітнесу/тренувань                            | [product-knowledge-fizruk.md](../../90-work/audits/product-knowledge-fizruk.md)       |
| [routine.md](routine.md)     | Модуль звичок                                       | [product-knowledge-routine.md](../../90-work/audits/product-knowledge-routine.md)     |

## Як читати

- **Зміна одного модуля** → його канон (і diff-звіт для розбіжностей код↔намір).
- **Зміна крос-модульної поведінки** (ідентичність, конституція, hub/digest/
  chat-context, деградаційні контракти) → спершу [product-overview.md](product-overview.md).
- **Секції [ІНТЕРВ'Ю]** у канонах — слова founder-а; код може з ними розійтись
  (це знахідка аудиту), але агент їх не редагує без явного рішення founder-а.
- PR, що змінює продуктову поведінку, оновлює відповідний канон **у тому ж PR**
  (правило `AGENTS.md § See also`).

## Джерела founder-колонки

- П'ять модульних спек-транскриптів (`docs/90-work/planning/specs/product-knowledge-audit-*.md`, Додатки А).
- [`product-brainstorm-2026-07.md`](../../90-work/planning/product-brainstorm-2026-07.md) — 16 продуктових рішень.
- Спека парасольки: [`product-knowledge-audit-overview.md`](../../90-work/planning/specs/product-knowledge-audit-overview.md).

**Наступний крок конвеєра — беклог** (окрема сесія): зведення всіх «фіксів»
шести diff-звітів + брейншторму в пріоритезовану чергу.
