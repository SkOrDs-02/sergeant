# Продуктові канони Sergeant

> **Last touched:** 2026-09-17 by @claude («наступний крок — беклог» замінено посиланням на вже наявний `product-knowledge-backlog.md`; product-knowledge-конвеєр завершено 2026-07-24 by @Skords-01). **Next review:** 2026-12-16.
> **Status:** Active

Канонічні продуктові моделі Sergeant — джерело істини про те, для кого продукт,
що обіцяє й чого свідомо не робить. Кожен канон супроводжується diff-звітом
тріангуляції «founder ↔ доки ↔ код» у [`docs/work/specs/audits/`](../../work/specs/audits).

## Структура

**Дах:**

- [**product-overview.md**](product-overview.md) — парасольковий канон: Sergeant
  як **одне ціле** (ідентичність, конституція крос-модульних правил,
  деградаційні контракти). Посилається на п'ять канонів нижче, не дублює їх.
  Diff-звіт: [`product-knowledge-overview.md`](../../work/specs/audits/product-knowledge-overview.md).

**П'ять модульних канонів:**

| Канон                                   | Предмет                                             | Diff-звіт                                                                                |
| --------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [finyk.md](../modules/finyk.md)         | Модуль особистих фінансів (PFM)                     | [product-knowledge-finyk.md](../../work/specs/audits/product-knowledge-finyk.md)         |
| [hub-coach.md](../modules/hub-coach.md) | Крос-модульний AI-шар (hub, HubChat, coach, digest) | [product-knowledge-hub-coach.md](../../work/specs/audits/product-knowledge-hub-coach.md) |
| [nutrition.md](../modules/nutrition.md) | Модуль харчування                                   | [product-knowledge-nutrition.md](../../work/specs/audits/product-knowledge-nutrition.md) |
| [fizruk.md](../modules/fizruk.md)       | Модуль фітнесу/тренувань                            | [product-knowledge-fizruk.md](../../work/specs/audits/product-knowledge-fizruk.md)       |
| [routine.md](../modules/routine.md)     | Модуль звичок                                       | [product-knowledge-routine.md](../../work/specs/audits/product-knowledge-routine.md)     |

## Як читати

- **Зміна одного модуля** → його канон (і diff-звіт для розбіжностей код↔намір).
- **Зміна крос-модульної поведінки** (ідентичність, конституція, hub/digest/
  chat-context, деградаційні контракти) → спершу [product-overview.md](product-overview.md).
- **Секції [ІНТЕРВ'Ю]** у канонах — слова founder-а; код може з ними розійтись
  (це знахідка аудиту), але агент їх не редагує без явного рішення founder-а.
- PR, що змінює продуктову поведінку, оновлює відповідний канон **у тому ж PR**
  (правило `AGENTS.md § See also`).

## Джерела founder-колонки

- П'ять модульних спек-транскриптів (`docs/work/specs/product-knowledge-audit-*.md`, Додатки А).
- [`product-brainstorm-2026-07.md`](../../work/specs/planning/product-brainstorm-2026-07.md) — 16 продуктових рішень.
- Спека парасольки: [`product-knowledge-audit-overview.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/specs/product-knowledge-audit-overview.md).

**Беклог конвеєра вже існує** — [`product-knowledge-backlog.md`](../../work/specs/planning/product-knowledge-backlog.md):
зведення всіх «фіксів» шести diff-звітів + брейншторму в пріоритезовану чергу
(звірка з `main` — у його шапці). Формулювання «наступний крок — окрема сесія»
було чинним на 2026-07-24; беклог зроблено, звірено 2026-09-17.
