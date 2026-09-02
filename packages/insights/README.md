# @sergeant/insights

Pure-TypeScript engine для крос-модульної аналітики: weekly digest, coach insights, рекомендації. Працює однаково на сервері і клієнті (без DOM-залежностей).

## Що всередині

```
src/
├── index.ts            # Public barrel
├── recommendations/    # TodayFocusCard recommendations engine
└── search/             # Cross-module search helpers
```

## Використання

```ts
import { generateWeeklyDigest, getRecommendations } from "@sergeant/insights";
```

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/insights <script>`.

```bash
pnpm --filter @sergeant/insights typecheck      # TypeScript
pnpm --filter @sergeant/insights lint           # ESLint
pnpm --filter @sergeant/insights test           # Vitest
pnpm --filter @sergeant/insights test:watch     # Vitest у watch-режимі
pnpm --filter @sergeant/insights test:coverage  # Vitest з покриттям
```
