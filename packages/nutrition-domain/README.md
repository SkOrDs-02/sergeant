# @sergeant/nutrition-domain

Доменна логіка модуля Харчування — pure TypeScript, без React. Імпортується `apps/web` і `apps/mobile`.

## Що всередині

- **Нутрієнти** — калькуляція макросів (kcal, protein, fat, carbs), форматування
- **Лог їжі** — типи, валідація, денний план
- **Meal types** — категоризація прийомів їжі
- **Штрихкоди** — helpers для OpenFoodFacts / USDA / UPCitemdb
- **Комора і покупки** — pantry management, shopping list helpers
- **Рецепти** — типи і утиліти для рецептів

## Використання

```ts
import { formatNutrition, mealTypes } from "@sergeant/nutrition-domain";
```

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/nutrition-domain <script>`.

```bash
pnpm --filter @sergeant/nutrition-domain typecheck      # TypeScript
pnpm --filter @sergeant/nutrition-domain lint           # ESLint
pnpm --filter @sergeant/nutrition-domain test           # Vitest
pnpm --filter @sergeant/nutrition-domain test:watch     # Vitest у watch-режимі
pnpm --filter @sergeant/nutrition-domain test:coverage  # Vitest з покриттям
```
