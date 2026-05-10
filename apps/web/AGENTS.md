# Agents in apps/web

> **Last validated:** 2026-05-10 by @Skords-01 / Devin. **Next review:** 2026-08-08.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Цей файл — sub-tree quick reference для агентів, що працюють лише в `apps/web/`. Не дублюй repo policy: hard rules, ownership map, performance budgets і CI matrix живуть у корені.

## Specialist skill

[`.agents/skills/sergeant-web-ui/SKILL.md`](../../.agents/skills/sergeant-web-ui/SKILL.md) — apps/web, PWA, Tailwind, a11y, opacity scale, `-strong` fills, storage wrappers, query keys.

## Stack snapshot

React 18 + Vite 6 + Tailwind 3 + TanStack React Query + Better Auth (cookie sessions) + Service Worker (`src/sw.ts`). Deploy: Vercel preview per PR + production on merge to `main`. Tests: Vitest + MSW + React Testing Library; a11y/E2E: Playwright + axe.

## Quick commands

```bash
pnpm dev:web                                   # http://localhost:5173 (proxies /api → :3000)
pnpm --filter @sergeant/web build              # production build
pnpm --filter @sergeant/web build:capacitor    # build for Capacitor shell
pnpm --filter @sergeant/web test               # Vitest
pnpm --filter @sergeant/web test:a11y          # Playwright + axe
pnpm --filter @sergeant/web test:coverage      # Vitest with coverage
pnpm --filter @sergeant/web typecheck
pnpm --filter @sergeant/web size               # size-limit (CI gate)
```

## Surface-specific gotchas

- **RQ keys (Hard Rule #2):** only via `apps/web/src/shared/lib/api/queryKeys.ts` factories (`finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `digestKeys`, `pushKeys`). No inline `queryKey: [...]`.
- **Tailwind colour-opacity (Hard Rule #8):** opacity steps must be on the registered scale; saturated brand fills behind `text-white` need the `-strong` companion (Rule #9). No arbitrary hex in `className` (Rule #11). Use `focus-visible:` not `focus:` (Rule #14).
- **Module accents (Rule #12):** module-accent containment — no foreign accents inside a module subtree.
- **Module size (Hard Rule #18):** `max-lines: 600` for web TS/TSX. Active initiative — split before crossing.
- **Storage:** wrapper from `@shared/storage`; allowlist enforced by `pnpm lint:localstorage-allowlist`.
- **Touch targets:** `Button` auto-applies `min-h-[44px] min-w-[44px]` for `xs`/`sm`/`iconOnly`; opt out with `data-compact` only for intentionally small cells (heatmaps).

## Bundle budget

CI gate via `size-limit`. Canonical numbers: root [`AGENTS.md § Performance budgets`](../../AGENTS.md#performance-budgets) and `apps/web/package.json` → `"size-limit"` (`../server/dist/assets/*` after Vite output is copied for unified-mode serving).

## Deeper docs

- App README: [`apps/web/README.md`](./README.md)
- Routing catalog: [`docs/agents/agent-skills-catalog.md`](../../docs/agents/agent-skills-catalog.md)
- Module ownership: [`docs/architecture/module-ownership.md`](../../docs/architecture/module-ownership.md)
- Domain invariants (Kyiv time, kopiykas as `number`): [`docs/architecture/domain-invariants.md`](../../docs/architecture/domain-invariants.md)
