---
name: sergeant-backend-api
description: Backend API patterns for Sergeant — REST/GraphQL design, Clean Architecture, Hexagonal patterns, CQRS, event sourcing, Temporal workflows, saga orchestration. Covers service boundaries, testing, security, performance
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.)
---

# Backend API Development у Sergeant

Цей skill охоплює backend-архітектурні патерни з плагіну backend-development: Clean Architecture, Hexagonal, CQRS, Event Sourcing, Temporal, Saga.

## Коли використовувати

- Дизайн нових бекенд сервісів та API
- Рефакторинг моноліту на мікросервіси
- CQRS/Event Sourcing реалізація
- Temporal workflow orchestration
- Saga patterns для розподілених транзакцій
- Microservices архітектура

## Core Concepts

### Clean Architecture (Onion/Hexagonal)

**Шари (залежності лічаться від центру наовнолинь):**

- **Domain**: Бізнес-логіка, entities, value objects, domain events
- **Application**: Use cases, command/query handlers
- **Interface Adapters**: Controllers, presenters, repositories (абстракції)
- **Frameworks**: Express/Fastify, PostgreSQL, Redis, external APIs

### CQRS

Command Query Responsibility Segregation:

```
Client → Commands/Queries → Handlers → Write Model ↔ Event Store → Projector → Read Model
```

### Event Sourcing

- Events — незмінні факти, append-only
- Stream ID: `Order-{uuid}`
- Correlation/causation IDs для трассування
- Optimistic concurrency control

### Temporal Workflows

- Workflows = orchestration (детерміновані)
- Activities = external calls (ідемпотентні)
- Time-skipping testing з `WorkflowEnvironment`
- Heartbeat для довгих операцій

### Saga Orchestration

- Multi-step processes без 2PC
- Compensation actions на відміну
- Correlation ID через всі кроки
- Timeout кожного кроку окремо

## Existing Patterns в Sergeant

Sergeant вже має:

- `sergeant-server-api` skill — для API роутів, серіалізаторів
- Hard Rules #1, #2, #3 — для типів, RQ keys, API contracts
- `apps/server/` — backend код

## Best Practices

- Dependency rule: внутрішні шари не імпортують зовнішні
- Визначайте bounded contexts перед розбиттям на сервіси
- Тестуйте use cases з in-memory репозиторіями
- Events version from day one
- Idempotent activities для Temporal
- Use `workflow.now()` не `datetime.now()` в workflows
See [docs/00-start/agents/agent-skills-catalog.md](docs/00-start/agents/agent-skills-catalog.md) for Sergeant skill routing.
