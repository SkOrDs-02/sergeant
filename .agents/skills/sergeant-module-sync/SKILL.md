---
name: sergeant-module-sync
description: Use when the task touches the sync layer — sync endpoints, op-log, LWW conflict resolution, dualwrite pipelines, offline persistence; UA: задача про sync/оп-лог/дуалрайт/конфлікти.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Sync — власник інфра-модуля

Інфра-модуль без продуктового канону: контекст і журнал рішень живуть прямо тут (рішення 6 спеки `docs/90-work/planning/specs/agent-module-owners.md`). Роутинг двовимірний: технічні правила поверхні бере surface-скіл.

## Контекст

- Sync v2 — шлях даних client-local модулів (fizruk, routine, частини finyk/nutrition): клієнт шле операції, сервер застосовує їх per-row LWW (`applySync`), джерело істини для мультидевайсу.
- Ядро дуалрайту — `packages/dualwrite-core/` (generic framework на 4 модульні пайплайни, [ADR-0073](../../../docs/04-governance/adr/0073-dualwrite-generic-framework.md)).
- Оп-лог: retention/архівація і multi-instance fan-out — [ADR-0065](../../../docs/04-governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md); історія: cloudsync v1 виведено ([ADR-0043](../../../docs/04-governance/adr/0043-cloudsync-v1-sunset.md), 410 Gone — ADR-0047), LWW-семантика бере початок з ADR-0004.

## Мапа файлів

- Server: `apps/server/src/modules/sync/` (`applySync.ts`, `applySync-helpers.ts`, audit-тести поруч).
- Ядро: `packages/dualwrite-core/`.
- Web-клієнт: RQ-ключі `syncKeys` з `apps/web/src/shared/lib/api/queryKeys.ts` (Hard Rule #2).

## Інваріанти модуля

- Конфлікти — per-row LWW; не вигадуй мерж-стратегій поза `applySync`.
- День-ключ синхронізованих особистих сутностей — device-local ([ADR-0078](../../../docs/04-governance/adr/0078-day-boundary-device-local.md)); сервер НЕ перезаписує його своєю таймзоною.
- Зміна форми sync-відповіді — контрактна трійка server ↔ `packages/api-client` ↔ contract-тест (Hard Rule #3); `bigint` → `Number()` (Hard Rule #1).

## Журнал рішень

| Дата       | Рішення                                                                | Джерело/ADR                                                                                 |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 2026-07-03 | Дуалрайт — generic framework, спільний для 4 модульних пайплайнів      | [ADR-0073](../../../docs/04-governance/adr/0073-dualwrite-generic-framework.md)             |
| 2026-06-07 | Оп-лог: retention/архівація + multi-instance fan-out (план, Proposed)  | [ADR-0065](../../../docs/04-governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md) |

## Роутинг далі

- Технічні правила поверхні: `sergeant-server-api` / `sergeant-data-and-migrations`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
