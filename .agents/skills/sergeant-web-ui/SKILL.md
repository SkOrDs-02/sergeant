---
name: sergeant-web-ui
description: Use when editing Sergeant web UI, PWA shell, React screens, Tailwind classes, accessibility states, localStorage-backed flows, or shared web interaction patterns in apps/web.
---

# Sergeant Web UI

Sergeant web work is React 18 + Vite PWA + Tailwind with repo-enforced design rules. Follow the local design system and shell conventions instead of generic React or Tailwind defaults.

## Covers

- `apps/web/src/core/**`
- `apps/web/src/modules/**`
- `apps/web/src/shared/**` when the change is web-facing
- PWA shell, install/update UX, offline states, navigation, and query hooks

## Hard Rules

- Use only registered Tailwind opacity steps: `0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100`.
- Saturated fills behind `text-white` must use the `-strong` companion token.
- Do not write raw `localStorage` calls where project wrappers exist; use `ls`, `lsSet`, `safeReadLS`, or typed storage helpers.
- Do not invent inline React Query keys; use the central key factories.
- Keep accessibility and responsive behavior first-class, especially in the PWA shell.

## Sergeant Shape

- Hub shell and shared flows live under `apps/web/src/core/**`.
- Module-specific UI stays inside `apps/web/src/modules/<domain>/**`.
- Shared web-only utilities belong in `apps/web/src/shared/**`.
- Reuse `@sergeant/design-tokens` and the custom eslint rules instead of raw color decisions.

## Verify

- Run the closest Vitest/RTL coverage for the touched screen or hook.
- If navigation, install UX, offline UX, or layout changed, verify desktop and mobile behavior.
- If query behavior changed, verify the right key factory and invalidation path.

## Playbooks

- `docs/playbooks/add-onboarding-step.md` — when the change touches onboarding.
- `docs/playbooks/add-feature-flag.md` — when the rollout is gated.
- `docs/playbooks/release.md` — canonical release playbook (web + API section).
- Catalog: `docs/agents/agent-skills-catalog.md`.
