---
name: sergeant-deliver-squad
description: Use when implementing a Sergeant feature across 2+ surfaces with contract dependencies (DB + server + api-client + web/mobile) — sequential subagent handoffs prevent bigint and triplet gaps; UA: фіча через 2+ surfaces.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Deliver squad для крос-surface фіч

Цей skill координує послідовну команду агентів для реалізації фічі через кілька surfaces. Порядок handoff-ів критичний — кожен наступний агент будує на результаті попереднього і отримує його звіт як контекст.

## Коли завантажувати

Завантажуй коли фіча:
- Торкається ≥2 surfaces з явними contract dependencies: DB → server → api-client → web/mobile
- Включає schema change (нова колонка, таблиця, або зміна існуючого типу)
- Потребує нових HubChat tool-ів разом з новими DB даними
- Повна фіча розбита на кілька незалежних задач по surfaces

**Не завантажуй** якщо фіча торкається тільки однієї surface — там достатньо відповідного specialist skill.

## Канонічний порядок handoff-ів

```
1. migration-agent      ← ОБОВ'ЯЗКОВИЙ якщо є schema change
      ↓ передає: які bigint колонки додано, яка нова схема
2. server-agent         ← отримує звіт migration-agent як контекст
      ↓ передає: HTTP method + path, JSON response shape
3. api-client-agent     ← отримує response shape від server-agent
      ↓ передає: import paths, type names, breaking changes
4a. web-agent    ──╮   ← ПАРАЛЕЛЬНО після api-client-agent
4b. mobile-agent ──╯   ← обидва незалежні consumer-и api-client
```

Крок 4 можна запускати паралельно як Agent Team — `web-agent` і `mobile-agent` не залежать одне від одного.

## Handoff protocol

Кожен subagent отримує у prompt:
1. Опис фічі (що будуємо?)
2. Звіт попереднього агента (що вже зроблено?)
3. Своє завдання (що конкретно зробити на цій surface?)

Запускай subagent через subagent-механізм твого харнесу (Claude Code: `Agent` tool; або як Agent Team teammate). **Не запускай наступний subagent до отримання звіту попереднього** — за винятком паралельного web/mobile кроку.

## Stage 5 — фінальна верифікація (обов'язкова, не опційна)

Ланцюжок **не завершено** після того, як web/mobile-агенти відзвітували. Per-stage `pnpm typecheck` доводить лише те, що кожна поверхня компілюється окремо — а сенс цього squad-у саме в крос-поверхневій інтеграції, яку жоден із цих typecheck-ів не перевіряє. Тому після stage 4:

1. **`sergeant-qa-squad`** — 4 паралельні runner-и; `qa-packages` тут критичний: він виконує contract-тести `api-client`, тобто рантайм-доказ, що триплет Hard Rule #3 справді зійшовся.
2. **`sergeant-verify-before-done`** — фінальний гейт перед заявою «готово»: свіжий повний `pnpm check`, повний scope, цитований exit code.

Пропуск stage 5 — найчастіший спосіб віддати «готову» фічу з розсинхроненим контрактом: кожна поверхня зелена окремо, разом — ні.

## Завжди покривай

- `pnpm typecheck` після кожного surface-агента (проміжна перевірка, **не** заміна stage 5)
- Якщо migration-agent повідомив про нові `bigint` колонки — переконайся, що server-agent їх coerce-ить із `Number()`
- api-client-agent отримує фінальний serializer від server-agent, а не draft
- Якщо фіча торкається HubChat — після web/mobile додай `sergeant-module-ai` skill для tool def і executor
- Звіти самих агентів (їхні секції «Report to …») — канонічне джерело handoff-даних; цей skill задає **порядок** і межі, не переказує зміст звітів

## Червоні прапорці

- «Фіча в одній теці модуля, хай і на 2-3 його поверхнях» → не squad-кейс: віддай module-owner агенту (`finyk-owner` тощо) через відповідний `sergeant-module-*` скіл. Squad — коли зʼявляється **нова контрактна залежність** server↔client через `packages/api-client` (межа — `docs/00-start/agents/agent-workflows.md` § 0)
- «Запущу web-agent до завершення api-client-agent» → типи ще не готові, web-agent напише проти stale interface
- «Пропущу migration-agent, зроблю ALTER TABLE в коді» → порушення Hard Rule #4, немає sequential migration файлу
- «api-client-agent не потрібен, web-agent прочитає типи з server прямо» → заборонено, cross-app imports порушують monorepo boundaries
- «Всі агенти запущу паралельно» → migration → server → api-client є sequential chain; тільки web + mobile можуть бути паралельними
- «Кожна поверхня зелена — фіча готова» → per-stage typecheck не перевіряє контракт між поверхнями; без stage 5 (qa-squad + verify-before-done) це не «готово», а «скомпілювалось»
- «Фіча торкається landing» → landing не має власного stage-агента; веди зміну через web-agent і переконайся, що `qa-web` покрив обидва застосунки

## Playbooks

- [`docs/00-start/playbooks/run-squad-deliver.md`](../../../docs/00-start/playbooks/run-squad-deliver.md) — step-by-step рецепт
- [`docs/00-start/playbooks/add-api-endpoint.md`](../../../docs/00-start/playbooks/add-api-endpoint.md) — reference для single-surface server endpoint
- [`docs/00-start/playbooks/add-sql-migration.md`](../../../docs/00-start/playbooks/add-sql-migration.md) — reference для migration rules
- [`docs/00-start/agents/agent-skills-catalog.md`](../../../docs/00-start/agents/agent-skills-catalog.md) — каталог всіх skills
