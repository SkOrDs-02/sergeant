---
name: sergeant-adr
description: Use when writing or updating an Architecture Decision Record or its index — new decision, supersede, status change, ADR references; UA: пишеш/оновлюєш ADR або індекс рішень.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# ADR у Sergeant

Архітектурні рішення живуть у `docs/04-governance/adr/` — нумеровані `NNNN-slug.md`. Індекс і життєвий цикл — у [docs/04-governance/adr/README.md](../../../docs/04-governance/adr/README.md); механічний гейт — `pnpm docs:check-adr-index` (статуси, supersede-ланцюги, таблиця індексу).

## Як створити новий ADR

1. Візьми наступний вільний номер (дивись індекс у `docs/04-governance/adr/README.md`) — без пропусків і дублікатів.
2. Копіюй [TEMPLATE.md](../../../docs/04-governance/adr/TEMPLATE.md); заповни Status/Date/Deciders/Related.
3. **Status: `Proposed` поки PR відкритий; `Accepted` — при мержі** (чек-ліст «Як створити новий ADR» у README). Не мержи ADR одразу як Accepted у гілці, що ще на ревʼю.
4. Додай рядок у таблицю «Поточні ADR» README у тому ж PR.
5. Якщо рішення замінює старе — у нового `Supersedes: ADR-NNNN`, у старого `Superseded by ADR-MMMM`; гейт перевіряє обидва кінці.
6. Прожени `pnpm docs:check-adr-index` перед PR.

## Звʼязок із журналами рішень

- «Дозріле» рішення з журналу модуля (`docs/01-product/model/<module>.md § Журнал рішень` або SKILL.md інфра-модуля) переїжджає в ADR; у журналі лишається рядок-лінк. Не тримай повний текст рішення у двох місцях (Hard Rule #15 — без паралельних source of truth).
- Продуктова поведінка описується в каноні модуля; ADR — про архітектурний вибір і його наслідки.

## Червоні прапорці

- ADR без розділу «Наслідки» — це не рішення, а нотатка.
- Правка historical/superseded ADR замість нового — історія рішень append-only.
- Номер «через пропуск» або паралельний той самий номер у двох гілках — звір індекс перед пушем.

## Роутинг далі

- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
