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

## Тести

```bash
pnpm --filter @sergeant/finyk-domain test       # Vitest
pnpm --filter @sergeant/finyk-domain typecheck
```
