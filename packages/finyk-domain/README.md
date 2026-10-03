# @sergeant/finyk-domain

Доменна логіка модуля ФІНІК (фінанси) — pure TypeScript, без React. Імпортується `apps/web` і `apps/mobile`.

## Що всередині

- **Monobank sync** — нормалайзери для webhook-даних, категоризація транзакцій
- **Бюджети** — обчислення лімітів, залишків, відсотків використання
- **Cashflow** — тренди витрат/доходів, агрегація по періодах
- **Активи і борги** — CRUD-логіка, калькуляція загального балансу
- **Backup** — експорт/імпорт фінансових даних

## Використання

```ts
import { normalizeMono, calculateBudgetUsage } from "@sergeant/finyk-domain";
```

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/finyk-domain <script>`.

```bash
pnpm --filter @sergeant/finyk-domain typecheck      # TypeScript
pnpm --filter @sergeant/finyk-domain lint           # ESLint
pnpm --filter @sergeant/finyk-domain test           # Vitest
pnpm --filter @sergeant/finyk-domain test:watch     # Vitest у watch-режимі
pnpm --filter @sergeant/finyk-domain test:coverage  # Vitest з покриттям
pnpm --filter @sergeant/finyk-domain mutation:core  # Stryker mutation-тести core-логіки
```
