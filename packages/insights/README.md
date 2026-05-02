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

## Тести

```bash
pnpm --filter @sergeant/insights test       # Vitest
pnpm --filter @sergeant/insights typecheck
```
