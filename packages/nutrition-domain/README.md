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

## Тести

```bash
pnpm --filter @sergeant/nutrition-domain test       # Vitest
pnpm --filter @sergeant/nutrition-domain typecheck
```
