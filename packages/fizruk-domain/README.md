# @sergeant/fizruk-domain

Доменна логіка модуля ФІЗРУК (спорт) — pure TypeScript, без React. Імпортується `apps/web` і `apps/mobile`.

## Що всередині

- **Тренування** — моделі workout / exercise / set, таймер відпочинку
- **Програми** — тижневі програми тренувань, прогресія навантаження
- **Прогрес** — порівняння показників, графіки прогресу
- **Вимірювання** — body measurements, фото тіла
- **Довідники** — каталог вправ із muscle groups

## Використання

```ts
import { createWorkout, calculateProgress } from "@sergeant/fizruk-domain";
```

## Тести

```bash
pnpm --filter @sergeant/fizruk-domain test       # Vitest
pnpm --filter @sergeant/fizruk-domain typecheck
```
