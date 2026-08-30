---
name: sergeant-module-routine
description: Use when the task touches the Routine habits module — habits, daily check-ins, streaks, skips, reminders, capacity; UA: задача про routine/звички/стріки/щоденні відмітки.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Routine — власник модуля

Роутинг двовимірний: цей скіл дає **продуктовий контекст** модуля; технічні правила поверхні бере відповідний surface-скіл. Вантаж обидва.

## Канон і журнал (читати перед роботою)

- Канон: [docs/01-product/model/routine.md](../../../docs/01-product/model/routine.md), включно з **§ Журнал рішень** — рішення там уже ухвалені, не перепитуй maintainer-а. Особливо § Стрік-філософія і § Модель пропуску — найчастіші місця самодіяльності.
- Розбіжності канон↔код: [docs/90-work/audits/product-knowledge-routine.md](../../../docs/90-work/audits/product-knowledge-routine.md).
- PR, що змінює продуктову поведінку routine, оновлює канон (і журнал) **у тому ж PR** — правило `AGENTS.md § See also`.

## Мапа файлів

- Web: `apps/web/src/modules/routine/`.
- Domain: `packages/routine-domain/`.
- **На сервері теки `routine/` НЕМАЄ** — модуль client-local, дані йдуть через sync-шар: `apps/server/src/modules/sync/`, ядро `packages/dualwrite-core/`. Не вигадуй серверну теку.

## Інваріанти модуля

- День-ключ відмітки звички — за годинником **пристрою**, формат `YYYY-MM-DD`; тиждень з понеділка ([ADR-0078](../../../docs/04-governance/adr/0078-day-boundary-device-local.md)).
- Модель пропуску і стрік-філософія — за каноном (§ 4–5), не за generic-уявленням про habit-трекери.
- Нагадування — через стандартизовані Hub-механізми engagement (signals / reminders / dismiss-state, [ADR-0067](../../../docs/04-governance/adr/0067-engagement-mechanism-standardization.md)), не ad-hoc.

## Роутинг далі

- Технічні правила поверхні: `sergeant-web-ui`; зміни sync-шляху — `sergeant-module-sync` (з PR-B цієї ініціативи) або `sergeant-server-api`.
- Делегування виконання: агент `routine-owner` (`.claude/agents/routine-owner.md`). Межа: owner працює **всередині одного модуля**; крос-поверхневу фічу по стадіях веде `sergeant-deliver-squad`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
