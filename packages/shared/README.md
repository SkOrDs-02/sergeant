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

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/shared <script>`.

```bash
pnpm --filter @sergeant/shared typecheck       # TypeScript
pnpm --filter @sergeant/shared lint            # ESLint
pnpm --filter @sergeant/shared test            # Vitest (`TZ=Europe/Kyiv`)
pnpm --filter @sergeant/shared test:watch      # Vitest у watch-режимі
pnpm --filter @sergeant/shared test:coverage   # Vitest з покриттям
pnpm --filter @sergeant/shared mutation:utils  # Stryker mutation-тести утиліт
```

## Глибше

- [`docs/02-engineering/api/README.md`](../../docs/02-engineering/api/README.md) — OpenAPI spec (генерується зі схем цього пакета)
- [`AGENTS.md` rule #3](../../AGENTS.md) — API contract: server ↔ api-client ↔ test
