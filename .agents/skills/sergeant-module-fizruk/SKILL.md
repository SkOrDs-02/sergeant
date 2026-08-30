---
name: sergeant-module-fizruk
description: Use when the task touches the Fizruk fitness module — workouts, recovery, injuries, body weight, training streaks; UA: задача про fizruk/тренування/відновлення/травми/вагу.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Fizruk — власник модуля

Роутинг двовимірний: цей скіл дає **продуктовий контекст** модуля; технічні правила поверхні бере відповідний surface-скіл. Вантаж обидва.

## Канон і журнал (читати перед роботою)

- Канон: [docs/01-product/model/fizruk.md](../../../docs/01-product/model/fizruk.md), включно з **§ Журнал рішень** — рішення там уже ухвалені, не перепитуй maintainer-а.
- Розбіжності канон↔код: [docs/90-work/audits/product-knowledge-fizruk.md](../../../docs/90-work/audits/product-knowledge-fizruk.md).
- PR, що змінює продуктову поведінку fizruk, оновлює канон (і журнал) **у тому ж PR** — правило `AGENTS.md § See also`.

## Мапа файлів

- Web: `apps/web/src/modules/fizruk/`.
- Domain: `packages/fizruk-domain/`.
- **На сервері теки `fizruk/` НЕМАЄ** — модуль client-local, дані йдуть через sync-шар: `apps/server/src/modules/sync/`, ядро `packages/dualwrite-core/`. Не вигадуй серверну теку.

## Інваріанти модуля

- Травма-модель — на рівні **зони**, а не лише м'яза ([ADR-0083](../../../docs/04-governance/adr/0083-injury-model-zone-level.md)).
- Вага тіла: fizruk — єдине джерело істини для всього продукту ([ADR-0080](../../../docs/04-governance/adr/0080-body-weight-source-of-truth.md)).
- День-ключ тренування/відмітки — за годинником пристрою ([ADR-0078](../../../docs/04-governance/adr/0078-day-boundary-device-local.md)).

## Роутинг далі

- Технічні правила поверхні: `sergeant-web-ui`; зміни sync-шляху — `sergeant-module-sync` (з PR-B цієї ініціативи) або `sergeant-server-api`.
- Делегування виконання: агент `fizruk-owner` (`.claude/agents/fizruk-owner.md`). Межа: owner працює **всередині одного модуля**; крос-поверхневу фічу по стадіях веде `sergeant-deliver-squad`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
