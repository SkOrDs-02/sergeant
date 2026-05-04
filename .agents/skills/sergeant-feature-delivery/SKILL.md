---
name: sergeant-feature-delivery
description: Use when building a new Sergeant feature, screen, endpoint, workflow, or behavior change that needs design, implementation planning, tests, documentation, and repo-specific verification.
---

# Sergeant Feature Delivery

Feature work in Sergeant should move as a disciplined slice, not as scattered edits. Design first, then implement the smallest coherent change that respects repo rules.

## Flow

1. Read `AGENTS.md`, the relevant specialist skill, and any matching playbook in `docs/playbooks/`.
2. Write or update a design/spec in `docs/superpowers/specs/` when the change is non-trivial or product-facing.
3. Decide where code belongs with `sergeant-monorepo-boundaries` before adding files.
4. Add tests first where behavior changes: unit, contract, UI, or migration verification as appropriate.
5. Implement the minimum end-to-end slice.
6. Update docs only where operator or contributor behavior changed.
7. Run targeted verification before claiming done.

## Always Cover

- User-facing success path
- One failure or empty-state path
- Regression risk on the touched surface
- Docs or spec sync if the change introduces a new workflow, endpoint, or deployment requirement

## Route for Surface Rules

- Web/PWA: `sergeant-web-ui`
- Server/API: `sergeant-server-api`
- DB/migrations: `sergeant-data-and-migrations`
- Mobile/Expo: `sergeant-mobile-expo`
- HubChat: `sergeant-hubchat`
- Auth: `better-auth-best-practices`

## Common Mistakes

- Starting in `apps/web` or `apps/server` before deciding if logic belongs in a shared package
- Shipping behavior changes without touching the matching tests
- Updating docs as a changelog dump instead of only the affected canonical doc

## Playbooks

- `docs/playbooks/add-api-endpoint.md` — server contract + api-client + tests in lockstep.
- `docs/playbooks/add-feature-flag.md` — flag-gated rollout of new behavior.
- `docs/playbooks/add-onboarding-step.md` — when the feature touches onboarding.
- Catalog: `docs/superpowers/agent-skills-catalog.md`.
