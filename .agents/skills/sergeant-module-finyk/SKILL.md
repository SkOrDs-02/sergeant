---
name: sergeant-module-finyk
description: Use when the task touches the Finyk personal-finance module — budgets, transactions, receipts, cash on hand, analytics — on any surface; UA: задача про finyk/фінанси/бюджети/транзакції.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Finyk — власник модуля

Роутинг двовимірний: цей скіл дає **продуктовий контекст** модуля; технічні правила поверхні бере відповідний surface-скіл. Вантаж обидва.

## Канон і журнал (читати перед роботою)

- Канон: [docs/01-product/model/finyk.md](../../../docs/01-product/model/finyk.md), включно з **§ Журнал рішень** — рішення там уже ухвалені, не перепитуй maintainer-а.
- Розбіжності канон↔код: [docs/90-work/audits/product-knowledge-finyk.md](../../../docs/90-work/audits/product-knowledge-finyk.md).
- PR, що змінює продуктову поведінку finyk, оновлює канон (і журнал) **у тому ж PR** — правило `AGENTS.md § See also`.

## Мапа файлів

- Web: `apps/web/src/modules/finyk/` (RQ-ключі — лише `finykKeys` з `apps/web/src/shared/lib/api/queryKeys.ts`, Hard Rule #2).
- Server: `apps/server/src/modules/finyk/`.
- Domain: `packages/finyk-domain/`.

## Інваріанти модуля

- Гроші — копійки (minor units) як `number` (`AGENTS.md § Domain invariants`); Postgres `bigint` → `Number()` у серіалізаторах (Hard Rule #1).
- Фінансові періоди і серверні звіти — Europe/Kyiv; особиста доба користувача — за годинником пристрою ([ADR-0078](../../../docs/04-governance/adr/0078-day-boundary-device-local.md)).
- «Готівка на руках» — окрема сутність, не рахунок ([ADR-0076](../../../docs/04-governance/adr/0076-cash-on-hand-entity.md)).
- Минуле заморожене: закриті місяці не перераховуються, знаменник відсотка бюджету — канонічний ([ADR-0079](../../../docs/04-governance/adr/0079-frozen-past-and-canonical-denominator.md)).

## Роутинг далі

- Технічні правила поверхні: `sergeant-web-ui` / `sergeant-server-api` / `sergeant-data-and-migrations`.
- Делегування виконання: агент `finyk-owner` (`.claude/agents/finyk-owner.md`). Межа: owner працює **всередині одного модуля** на всіх його поверхнях; крос-поверхневу фічу по стадіях (migration→server→api-client→web/mobile) веде `sergeant-deliver-squad`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
