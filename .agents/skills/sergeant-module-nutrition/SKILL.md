---
name: sergeant-module-nutrition
description: Use when the task touches the Nutrition module — food log, meals, calories, pantry, recipes — on any surface; UA: задача про nutrition/їжу/калорії/комору/страви.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Nutrition — власник модуля

Роутинг двовимірний: цей скіл дає **продуктовий контекст** модуля; технічні правила поверхні бере відповідний surface-скіл. Вантаж обидва.

## Канон і журнал (читати перед роботою)

- Канон: [docs/01-product/model/nutrition.md](../../../docs/01-product/model/nutrition.md), включно з **§ Журнал рішень** — рішення там уже ухвалені, не перепитуй maintainer-а.
- Розбіжності канон↔код: [docs/90-work/audits/product-knowledge-nutrition.md](../../../docs/90-work/audits/product-knowledge-nutrition.md).
- PR, що змінює продуктову поведінку nutrition, оновлює канон (і журнал) **у тому ж PR** — правило `AGENTS.md § See also`.

## Мапа файлів

- Web: `apps/web/src/modules/nutrition/` (RQ-ключі — лише `nutritionKeys` з `apps/web/src/shared/lib/api/queryKeys.ts`, Hard Rule #2).
- Server: `apps/server/src/modules/nutrition/` (зовнішній імпорт чеків Silpo — окремий інфра-модуль `apps/server/src/modules/silpo/`).
- Domain: `packages/nutrition-domain/`.

## Інваріанти модуля

- Комора — append-only ledger: залишок **derived**, записи не мутуються ([ADR-0077](../../../docs/04-governance/adr/0077-pantry-append-only-ledger.md)).
- День-ключ логу їжі — за годинником пристрою, формат `YYYY-MM-DD` ([ADR-0078](../../../docs/04-governance/adr/0078-day-boundary-device-local.md)).
- Вага тіла НЕ живе в nutrition — єдине джерело істини fizruk ([ADR-0080](../../../docs/04-governance/adr/0080-body-weight-source-of-truth.md)).

## Роутинг далі

- Технічні правила поверхні: `sergeant-web-ui` / `sergeant-server-api` / `sergeant-data-and-migrations`.
- Делегування виконання: агент `nutrition-owner` (`.claude/agents/nutrition-owner.md`). Межа: owner працює **всередині одного модуля** на всіх його поверхнях; крос-поверхневу фічу по стадіях веде `sergeant-deliver-squad`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
