# 🏗️ Architecture

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

System architecture and runtime surface inventory for Sergeant.

---

## 📚 Документація по темах

### Огляд і топологія

| Document | Purpose | Last updated |
|----------|---------|--------------|
| [`service-catalog.md`](./service-catalog.md) | Runtime inventory: owners, targets, dependencies, healthchecks, rollback paths | 2026-05-06 ✅ |
| [`platforms.md`](./platforms.md) | Web / RN mobile / Capacitor shell — статус, feature-parity матриця, роадмап | 2026-05-06 ✅ |
| [`hosting-evolution.md`](./hosting-evolution.md) | Hosting evolution, infra phases, migration triggers | 2026-04-27 |

### Архітектурні діаграми та потоки

| Document | Purpose | Last updated |
|----------|---------|--------------|
| [`diagrams/`](./diagrams/README.md) | C4 model (System → Containers → Components) + sequence flows (Mermaid) | 2026-05-05 ✅ |
| [`diagrams/c1-system-context.md`](./diagrams/c1-system-context.md) | User ↔ Sergeant Web / Mobile / Shell ↔ external systems | 2026-05-05 |
| [`diagrams/c2-containers.md`](./diagrams/c2-containers.md) | Deployment topology: apps/web (Vercel), apps/server (Railway), apps/mobile | 2026-05-05 |
| [`diagrams/c3-cloudsync.md`](./diagrams/c3-cloudsync.md) | Internal CloudSync: dirtyMap → offlineQueue → sync → conflict resolution | 2026-05-05 |
| [`diagrams/c3-chat-tool-use.md`](./diagrams/c3-chat-tool-use.md) | HubChat tool-use loop with Anthropic streaming | 2026-05-05 |
| [`diagrams/flow-signin.md`](./diagrams/flow-signin.md) | Better Auth sign-in flow (email + password) | 2026-05-05 |
| [`diagrams/flow-cloudsync.md`](./diagrams/flow-cloudsync.md) | Push/pull sync between web ↔ `/api/sync` ↔ Postgres | 2026-05-05 |
| [`diagrams/flow-chat-tool-use.md`](./diagrams/flow-chat-tool-use.md) | Runtime tool-use cycle within a chat session | 2026-05-05 |
| [`diagrams/flow-reminder-fire.md`](./diagrams/flow-reminder-fire.md) | n8n cron → server push → APNs/FCM → device | 2026-05-05 |

### API, модулі, дані

| Document | Purpose | Last updated |
|----------|---------|--------------|
| [`api-v1.md`](./api-v1.md) | REST API v1 contract overview, versioning strategy | 2026-04-28 |
| [`module-structure.md`](./module-structure.md) | Canonical layout of `apps/{web,mobile}/src/modules/<domain>/` + deviations | 2026-05-03 |
| [`frontend-overview.md`](./frontend-overview.md) | React 18 + Vite frontend architecture | 2026-05-05 |
| [`data-exchange-storage-audit.md`](./data-exchange-storage-audit.md) | Current data exchange, storage, weak points, and roadmap | 2026-05-03 |
| [`apps-status-matrix.md`](./apps-status-matrix.md) | Status matrix for apps and packages (active/stabilize/migration/legacy) | 2026-05-04 |
| [`apps-web-exhaustive-deps.md`](./apps-web-exhaustive-deps.md) | Web hooks dependency guidance | 2026-05-03 |

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

- ✅ **Last validated дата ≤ 30 днів** — документ свіжий, довіряй йому
- ⚠️ **Last validated > 30 днів назад** — потребує ревалідації до наступного PR-а
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

- **Development процес:** [`docs/adr/`](../adr/) — architectural decision records
- **Operations & alerting:** [`docs/observability/`](../observability/) — SLO, metrics, runbooks
- **Product roadmap:** [`docs/initiatives/`](../initiatives/) — фази, блокери, timeline
- **Deployment & CI:** [`docs/deploy/`](../deploy/), [`docs/integrations/railway-vercel.md`](../integrations/railway-vercel.md)
- **Tech debt & planning:** [`docs/planning/`](../planning/), [`docs/tech-debt/`](../tech-debt/)
