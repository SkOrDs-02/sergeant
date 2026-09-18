# 🏗️ Architecture

> **Last touched:** 2026-09-17 by @claude (колонку «Last updated» прибрано — дати живуть у шапках самих доків; лінк Deployment & CI → ADR-0074). **Next review:** 2026-12-16.
> **Status:** Active

System architecture and runtime surface inventory for Sergeant.

---

## 📚 Документація по темах

### Огляд і топологія

| Document                                         | Purpose                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`service-catalog.md`](./service-catalog.md)     | Runtime inventory: owners, targets, dependencies, healthchecks, rollback paths |
| [`platforms.md`](./platforms.md)                 | Web / RN mobile / Capacitor shell — статус, feature-parity матриця (ADR-0052)  |
| [`hosting-evolution.md`](./hosting-evolution.md) | Hosting evolution, infra phases, migration triggers                            |

### Архітектурні діаграми та потоки

| Document                                                             | Purpose                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`diagrams/`](./diagrams/README.md)                                  | C4 model (System → Containers → Components) + sequence flows (Mermaid)               |
| [`diagrams/c1-system-context.md`](./diagrams/c1-system-context.md)   | User ↔ Sergeant Web / Mobile / Shell ↔ external systems                              |
| [`diagrams/c2-containers.md`](./diagrams/c2-containers.md)           | Deployment topology: apps/web (Vercel), apps/server (Hetzner + Coolify), apps/mobile |
| [`diagrams/c3-cloudsync.md`](./diagrams/c3-cloudsync.md)             | Internal sync engine v2 (op-log outbox → `/api/v2/sync/push`); v1 retired            |
| [`diagrams/c3-chat-tool-use.md`](./diagrams/c3-chat-tool-use.md)     | HubChat tool-use loop with Anthropic streaming                                       |
| [`diagrams/flow-signin.md`](./diagrams/flow-signin.md)               | Better Auth sign-in flow (email + password)                                          |
| [`diagrams/flow-cloudsync.md`](./diagrams/flow-cloudsync.md)         | Sync v2 push/pull: web ↔ `/api/v2/sync/push` ↔ Postgres; v1 знято (тепер 404)        |
| [`diagrams/flow-chat-tool-use.md`](./diagrams/flow-chat-tool-use.md) | Runtime tool-use cycle within a chat session                                         |
| [`diagrams/flow-reminder-fire.md`](./diagrams/flow-reminder-fire.md) | cron → server push → APNs/FCM → device (історично n8n; ADR-0090)                     |

### API, модулі, дані

| Document                                                             | Purpose                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`api-v1.md`](./api-v1.md)                                           | REST API v1 contract overview, versioning strategy                                                            |
| [`api-contracts.md`](./api-contracts.md)                             | Pact-based runtime consumer-driven contract testing: `api-client ↔ server` (доповнює Hard Rule #3)            |
| [`module-structure.md`](./module-structure.md)                       | Canonical layout of `apps/{web,mobile}/src/modules/<domain>/` + deviations                                    |
| [`module-ownership.md`](./module-ownership.md)                       | Per-path ownership, test-стек, RQ-фабрика та конвенції; детальна таблиця до AGENTS.md                         |
| [`repo-map.md`](./repo-map.md)                                       | Повна матриця apps + packages: стек, призначення, деплой-вихід; compact summary — в AGENTS.md                 |
| [`domain-invariants.md`](./domain-invariants.md)                     | Глибокий розбір інваріантів (час/гроші/ID); compact pointer — в AGENTS.md                                     |
| [`state-write-paths.md`](./state-write-paths.md)                     | Дві writer-доріжки web-стану (`useMutation` vs HubChat tool-call) і де живуть інваріанти                      |
| [`notifications.md`](./notifications.md)                             | Канали пушів, серверний прохід нагадувань, дедуп через спільний `Notification.tag`, форма payload             |
| [`metric-registry.md`](./metric-registry.md)                         | Реєстр «метрика → канонічна функція → де рахується сьогодні → чи збігається» + план переведення               |
| [`ai-memory.md`](./ai-memory.md)                                     | Серверний episodic-memory store (`ai_memories`, migration 025): ingestion, recall (backfill знято 2026-08-29) |
| [`rag-eval.md`](./rag-eval.md)                                       | RAG eval pipeline: golden-set, P@1/MRR, weekly quality gate та auto-disable (PR-20/PR-22)                     |
| [`frontend-overview.md`](./frontend-overview.md)                     | React 18 + Vite frontend architecture                                                                         |
| [`data-exchange-storage-audit.md`](./data-exchange-storage-audit.md) | Current data exchange, storage, weak points, and roadmap                                                      |
| [`apps-status-matrix.md`](./apps-status-matrix.md)                   | Status matrix for apps and packages (active/stabilize/migration/legacy)                                       |
| [`apps-web-exhaustive-deps.md`](./apps-web-exhaustive-deps.md)       | Web: навмисні винятки `exhaustive-deps` (лічильник — `rg` у самому доку)                                      |
| [`apps-mobile-exhaustive-deps.md`](./apps-mobile-exhaustive-deps.md) | Mobile: навмисні винятки `exhaustive-deps` (лічильник — `rg` у самому доку)                                   |

---

## 🔑 Швидке навігування

**Новий інженер на onboarding?**

1. Почни з [`c1-system-context.md`](./diagrams/c1-system-context.md) — обзор цілої системи
2. Потім [`c2-containers.md`](./diagrams/c2-containers.md) — де хто живе
3. Далі [`module-structure.md`](./module-structure.md) — як писати код в модулях
4. [`service-catalog.md`](./service-catalog.md) — кого контактувати для кожної поверхні

**Розробляєш мобільний клієнт?**

- [`platforms.md`](./platforms.md) — поточний статус RN і Capacitor shell
- [`diagrams/c3-cloudsync.md`](./diagrams/c3-cloudsync.md) — як синхронізується стан
- [`module-structure.md`](./module-structure.md) § Per-module deviations — чому mobile ≠ web

**Планеш release або інцидент?**

- [`service-catalog.md`](./service-catalog.md) — що залежить від чого
- [`hosting-evolution.md`](./hosting-evolution.md) — infra phases і migration triggers
- [`data-exchange-storage-audit.md`](./data-exchange-storage-audit.md) — слабкі місця

**Грайш з API?**

- [`api-v1.md`](./api-v1.md) — версіонування стратегія і契約 гарантії
- [`diagrams/flow-signin.md`](./diagrams/flow-signin.md) — як auth працює
- [`diagrams/c3-chat-tool-use.md`](./diagrams/c3-chat-tool-use.md) — streaming + tool-use контракт

---

## 📊 Легенда статусів

- Свіжість (`Last touched` / `Next review`) — у шапці кожного доку; зведення — [`freshness-dashboard.html`](../../governance/governance/freshness-dashboard.html) (гейт `pnpm docs:check-freshness-cadence`). Колонку дат у таблицях вище прибрано 2026-09-17 — вона дублювала шапки й застарівала.
- 🔄 **Status = Active** — часто змінюється, перевіри з основним branch
- 🟡 **Status = Stabilize** — контракт більш-менш заморожений
- 📦 **Status = Migration** — в процесі переносу, очікується deadline

---

## 🤝 Як оновлювати цю папку

1. **Якщо чергова PR змінює architecture-surface** (напр., новий deploy-endpoint, змінена feature-parity):
   - Обнови відповідний файл в **тому ж PR**
   - Оновни `Last validated` дату і статус

2. **Діаграми в `diagrams/`:**
   - Усі діаграми — Mermaid у markdown-блоках (GitHub рендерить автоматично)
   - При зміні `service-catalog.md` — синхронізуй відповідні C1/C2-діаграми

3. **Quarterly review** (див. Next review дату у кожному файлі):
   - Переверни всі документи, перевір факти
   - Оновни `Last validated` дату, коли факти виконані

---

## 📌 Related docs

- **Development процес:** [`docs/governance/adr/`](../../governance/adr) — architectural decision records
- **Operations & alerting:** [`docs/operations/observability/`](../../operations/observability) — SLO, metrics, runbooks
- **Product roadmap:** [`docs/work/specs/initiatives/`](../../work/specs/initiatives) — фази, блокери, timeline
- **Deployment & CI:** [`docs/operations/deploy/`](../../operations/deploy), [ADR-0074](../../governance/adr/0074-hosting-hetzner-coolify.md) (Hetzner + Coolify; Railway виведено). Vercel-частина — [`integrations/railway-vercel.md`](../integrations/railway-vercel.md).
- **Tech debt & planning:** [`docs/work/specs/planning/`](../../work/specs/planning), [`docs/work/specs/tech-debt/`](../../work/specs/tech-debt)
