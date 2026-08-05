---
name: sergeant-monorepo-boundaries
description: Use when a Sergeant change spans multiple apps/packages, extracts shared logic, or import boundaries are unclear — even if the change seems isolated to one app; UA: межі між app/package, спільна логіка в монорепо.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Межі монорепо в Sergeant

Більшість поганих правок у Sergeant починаються з того, що код опиняється не у тому шарі. Спершу визнач власну межу — потім пиши файли.

## Правила меж

- App-specific UI лишається в app-і-власнику.
- Cross-platform бізнес-логіка йде у відповідний domain-package.
- Спільні схеми, wire-типи і cross-app утиліти живуть у `packages/shared` або `packages/api-client`, не дублюються в app-ах.
- `apps/mobile-shell` — це packaging-glue, а не feature-surface. Детальні правила розміщення для mobile/shell (і lint-правило `forbid-shell-only-feature`) — канонічно в [`sergeant-mobile-expo`](../sergeant-mobile-expo/SKILL.md) § Розміщення; тут лише межа, там — деталі.
- `apps/landing` — маркетинговий сайт: окремий Vite-застосунок, не місце для продуктових фіч і не імпортує з `apps/web`.
- Якщо хелпер використовується лише в одному модулі — тримай його co-located, поки повторне використання не доведено.

## Швидкі рішення

| Якщо зміна — це...                                       | Клади у...                  |
| -------------------------------------------------------- | --------------------------- |
| React-екран, sheet, сторінка чи shell-поведінка для веба | `apps/web/**`               |
| Express-роут або server-side domain-логіка               | `apps/server/**`            |
| Спільний API-клієнт або response-типізація               | `packages/api-client/**`    |
| Спільна domain-математика, селектори, нормалізація       | `packages/*-domain/**`      |
| Генерична схема чи утиліта, що використовується багатьма | `packages/shared/**`        |
| Expo-only UI або навігація                               | `apps/mobile/**`            |
| Capacitor packaging або native-shell config              | `apps/mobile-shell/**`      |
| Лендінг, маркетингова сторінка, публічний контент        | `apps/landing/**`           |

## Поширені помилки

- Класти reusable domain-логіку напряму в `apps/web`
- Переносити browser-API у `apps/mobile`
- Додавати спільний package заради коду, що використовується лише раз

## Playbooks

- `docs/00-start/playbooks/cleanup-dead-code.md` — коли витягуєш чи виводиш з обігу спільні модулі.
- Каталог: `docs/00-start/agents/agent-skills-catalog.md`.
