# @sergeant/routine-domain

Доменна логіка модуля Рутина (звички, календар) — pure TypeScript, без React. Імпортується `apps/web` і `apps/mobile`.

## Що всередині

- **Звички і стріки** — обчислення streak, heatmap, лідери/аутсайдери
- **Календар** — calendar grid helpers, event моделі
- **Date keys** — Kyiv-timezone day boundaries (доменний інваріант)
- **Drafts** — чернетки для звичок і подій
- **Completion notes** — нотатки до виконання звичок

## Використання

```ts
import { calculateStreak, buildCalendarGrid } from "@sergeant/routine-domain";
```

## Тести

```bash
pnpm --filter @sergeant/routine-domain test       # Vitest
pnpm --filter @sergeant/routine-domain typecheck
```

## Доменний інваріант

День визначається за **Kyiv timezone** (`Europe/Kyiv`). Звичка «виконана сьогодні» = виконана до 00:00 наступного дня за Kyiv. Див. [AGENTS.md § Domain invariants](../../AGENTS.md).
