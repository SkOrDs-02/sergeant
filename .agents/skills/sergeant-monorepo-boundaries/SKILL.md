---
name: sergeant-monorepo-boundaries
description: Use when a Sergeant change spans multiple apps/packages, extracts shared logic, or import boundaries are unclear; UA: межі між app/package, спільна логіка в монорепо.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Межі монорепо в Sergeant

Більшість поганих правок у Sergeant починаються з того, що код опиняється не у тому шарі. Спершу визнач власну межу — потім пиши файли.

## Правила меж

- App-specific UI лишається в app-і-власнику.
- Cross-platform бізнес-логіка йде у відповідний domain-package.
- Спільні схеми, wire-типи і cross-app утиліти живуть у `packages/shared` або `packages/api-client`, не дублюються в app-ах.
- `apps/mobile-shell` — це packaging-glue, а не feature-surface.
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

## Поширені помилки

- Класти reusable domain-логіку напряму в `apps/web`
- Переносити browser-API у `apps/mobile`
- Додавати спільний package заради коду, що використовується лише раз

## Playbooks

- `docs/playbooks/cleanup-dead-code.md` — коли витягуєш чи виводиш з обігу спільні модулі.
- Каталог: `docs/agents/agent-skills-catalog.md`.
