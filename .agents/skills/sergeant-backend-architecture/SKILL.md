---
name: sergeant-backend-architecture
description: Backend architecture patterns — Clean Architecture, Hexagonal, CQRS, Event Sourcing, Temporal, Saga, microservices. UA: архітектура бекенду, мікросервіси, event sourcing.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` so UA-only chat routing still resolves the right SKILL.
---

# Backend Architecture у Sergeant

Архітектурні патерни для бекенду: Clean Architecture, CQRS, Event Sourcing, Temporal workflows, Saga orchestration.

## Коли використовувати

- Дизайн нових бекенд сервісів
- CQRS/Event Sourcing реалізація
- Temporal workflow orchestration
- Saga patterns для розподілених транзакцій
- Microservices дизайн
- Clean/Hexagonal Architecture

## Core Patterns

### Clean Architecture (Onion)

Шари (залежності від центру наовнолинь):

- **Domain** (`apps/server/src/modules/**/domain/`): Entities, value objects, domain events
- **Application** (`apps/server/src/modules/**/use-cases/`): Use cases, command/query handlers
- **Interface Adapters** (`apps/server/src/modules/**/adapters/`): Controllers, presenters
- **Frameworks** (`apps/server/src/modules/**/infrastructure/`): Express, PostgreSQL, Redis

### CQRS

```
Client → Commands/Queries → Handlers → Write Model → Events → Projector → Read Model
```

### Event Sourcing

- Events — незмінні факти, append-only
- Stream ID: `Order-{uuid}`
- Correlation IDs для трассування
- Optimistic concurrency control

### Temporal Workflows

- Workflows = orchestration (детерміновані)
- Activities = external calls (ідемпотентні)
- Use `workflow.now()` не `datetime.now()`
- Time-skipping testing з `WorkflowEnvironment`

### Saga Orchestration

- Multi-step processes без 2PC
- Compensation actions на відміну
- Per-step timeouts
- Correlation ID через всі кроки

## Existing Sergeant Patterns

- `sergeant-server-api` — API роутери, серіалізатори
- `sergeant-data-and-migrations` — SQL schema, міграції
- `sergeant-hubchat` — HubChat tool-defs, executors, prompt cache

## Hard Rules в Sergeant

- #1: bigint → number coercion в серіалізаторах
- #2: RQ keys тільки через centralized factories
- #3: API contract sync server-client-tests
- #21: Pino redaction policy

## Best Practices

- Діаграми: Mermaid в ADR-ах
- Тести: use cases з in-memory репозиторіями
- Events version from day one
- Idempotent activities для Temporal
- Use `finykKeys`, `nutritionKeys` для RQ hooks
- Bounded contexts перед мікросервісами
See [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md) for Sergeant skill routing.
