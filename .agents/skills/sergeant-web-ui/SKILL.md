---
name: sergeant-web-ui
description: Use when editing Sergeant web UI, PWA shell, React screens, Tailwind, accessibility, localStorage flows, or shared web interaction patterns; also for design tokens or theme; UA: правиш веб-UI/PWA/Tailwind.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Web UI у Sergeant

Web-робота в Sergeant — це React 18 + Vite PWA + Tailwind з ензорсеними репо-правилами дизайну. Дотримуйся локальної design-system і shell-конвенцій, а не generic React- або Tailwind-дефолтів.

## Що покриває

- `apps/web/src/core/**`
- `apps/web/src/modules/**`
- `apps/web/src/shared/**`, коли зміна web-facing
- PWA-shell, install/update-UX, offline-states, навігація і query-hook-и

## Жорсткі правила

- Використовуй лише зареєстровані Tailwind opacity-кроки: `0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100`.
- Насичені заливки під `text-white` мають використовувати `-strong` companion-токен.
- Не пиши raw `localStorage`-виклики там, де є проєктні врапери; використовуй `ls`, `lsSet`, `safeReadLS` або типовані storage-хелпери.
- Не вигадуй inline React Query-ключі; використовуй центральні key-фабрики.
- Тримай accessibility і responsive-поведінку як first-class, особливо в PWA-shell.

## Форма Sergeant

- Hub-shell і спільні flow-и живуть під `apps/web/src/core/**`.
- Module-specific UI лишається всередині `apps/web/src/modules/<domain>/**`.
- Спільні web-only утиліти живуть у `apps/web/src/shared/**`.
- Реюзай `@sergeant/design-tokens` і кастомні eslint-правила замість raw color-рішень.

## Верифікація

- Прогон найближчого Vitest/RTL-покриття для зачепленого екрану чи hook-а.
- Якщо змінилися навігація, install-UX, offline-UX або layout — перевір desktop- і mobile-поведінку.
- Якщо змінилася query-поведінка — перевір правильну key-фабрику і шлях інвалідації.

## Playbooks

- `docs/playbooks/add-onboarding-step.md` — коли зміна торкається onboarding-у.
- `docs/playbooks/add-feature-flag.md` — коли rollout gated.
- `docs/playbooks/release.md` — canonical release-playbook (секція web + API).
- Каталог: `docs/agents/agent-skills-catalog.md`.
