---
name: sergeant-web-ui
description: Use when editing Sergeant web UI, PWA shell, React screens, Tailwind, accessibility, localStorage flows, or shared web interaction patterns; also for design tokens or theme; UA: правиш веб-UI/PWA/Tailwind.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Web UI у Sergeant

Web-робота в Sergeant — це React 18 + Vite PWA + Tailwind з репо-дизайн-конвенціями, які тримаються design tokens + review (ESLint-enforcement візуальних правил retired ADR-0081). Дотримуйся локальної design-system і shell-конвенцій, а не generic React- або Tailwind-дефолтів.

Задача в межах продуктового модуля (`apps/web/src/modules/*`)? Спершу завантаж його `sergeant-module-*` скіл — канон, § Журнал рішень і модульні інваріанти; цей скіл дає лише технічні правила поверхні (роутинг — `sergeant-start-here` § «Роутся одразу»).

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
- **Типографіка (дизайн-конвенція — tokens + review, ex-Hard Rules #11–13, retired ADR-0081):** використовуй виключно семантичні утиліти `.text-style-caption`, `.text-style-body`, `.text-style-headline` (мінімум 12px). `text-2xs` — deprecated у продуктовому UI (лишається для chart axis ticks), замінюй на `text-style-caption`. Raw palette hex в `className` — заборонено.

  BAD: `className="text-2xs text-gray-400"` → GOOD: `className="text-style-caption text-content-secondary"`

## Форма Sergeant

- Hub-shell і спільні flow-и живуть під `apps/web/src/core/**`.
- Module-specific UI лишається всередині `apps/web/src/modules/<domain>/**`.
- Спільні web-only утиліти живуть у `apps/web/src/shared/**`.
- Реюзай `@sergeant/design-tokens` замість raw color-рішень — кольорові конвенції тримаються tokens + design-review, без ESLint-enforcement (ADR-0081).

## Верифікація

- Прогон найближчого Vitest/RTL-покриття для зачепленого екрану чи hook-а.
- Якщо змінилися навігація, install-UX, offline-UX або layout — перевір desktop- і mobile-поведінку.
- Якщо змінилася query-поведінка — перевір правильну key-фабрику і шлях інвалідації.

## Playbooks

- `docs/00-start/playbooks/add-onboarding-step.md` — коли зміна торкається onboarding-у.
- `docs/00-start/playbooks/add-feature-flag.md` — коли rollout gated.
- `docs/00-start/playbooks/release.md` — canonical release-playbook (секція web + API).
- Каталог: `docs/00-start/agents/agent-skills-catalog.md`.
