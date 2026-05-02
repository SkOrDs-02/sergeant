# @sergeant/shared

Спільні Zod-схеми API, типи та DOM-free утиліти. Імпортується усіма apps і packages — змінюйте з обережністю.

## Що всередині

```
src/
├── schemas/        # Zod-схеми для HTTP request/response + domain об'єктів
├── utils/          # Pure утиліти: date, macros, speechParsers, ukrainianPlural
├── types/          # Спільні TypeScript-типи
├── lib/
│   ├── storageKeys.ts        # Константи ключів localStorage / MMKV
│   ├── dashboard.ts          # Hub dashboard module ordering
│   ├── assistantCatalogue.ts # Каталог AI-capabilities (single source of truth)
│   ├── kvStore.ts            # Platform-agnostic key/value store contract
│   ├── vibePicks.ts          # Onboarding vibe picks
│   └── activeModules.ts      # Active-modules helpers
└── openapi/        # OpenAPI route registry (для генерації openapi.json)
```

## Використання

```ts
import { ChatRequestSchema, MeResponseSchema } from "@sergeant/shared";
import { toKyivDate, macros } from "@sergeant/shared";
```

## Тести

```bash
pnpm --filter @sergeant/shared test       # Vitest
pnpm --filter @sergeant/shared typecheck
```

## Глибше

- [`docs/api/README.md`](../../docs/api/README.md) — OpenAPI spec (генерується зі схем цього пакета)
- [`AGENTS.md` rule #3](../../AGENTS.md) — API contract: server ↔ api-client ↔ test
