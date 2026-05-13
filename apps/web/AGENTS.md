# Agents in apps/web

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-08.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Цей файл — sub-tree quick reference для агентів, що працюють лише в `apps/web/`. Не дублюй repo policy: hard rules, ownership map, performance budgets і CI matrix живуть у корені.

## Specialist skill

[`.agents/skills/sergeant-web-ui/SKILL.md`](../../.agents/skills/sergeant-web-ui/SKILL.md) — apps/web, PWA, Tailwind, a11y, opacity scale, `-strong` fills, storage wrappers, query keys.

## Stack snapshot

React 18 + Vite 8 + Tailwind 4 + TanStack Query + Better Auth (cookie sessions) + Service Worker (`src/sw.ts`). Deploy: Vercel preview per PR + production on merge to `main`. Tests: Vitest + MSW + React Testing Library; a11y/E2E: Playwright + axe.

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
pnpm --filter @sergeant/web lighthouse          # Lighthouse CI (perf-budget gate)
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

**Lazy-by-default policy:** dynamic-import (через `lazyImport` / `lazyDefault`) для всіх great-effort surface-ів — onboarding splash (`WelcomeScreen` + `OnboardingWizard` + `seedDemoData/*`), кожен route-shell-модуль (`finyk`, `fizruk`, `routine`, `nutrition`), settings-page-и, marketing (`PricingPage`), barcode scanner (`vendor-zxing`). Тонкі еagerly-доступні гейти (як `shouldShowOnboarding()` у `App.tsx`/`HubHomeView.tsx`) імпортуємо з legkih helper-файлів (`onboarding/onboardingGate.ts`), а не з важких component-модулів — інакше Rollup тягне весь стек у entry chunk.

**Як читати `pnpm --filter @sergeant/web size`:** виводить дві лінії — `JS (усього)` (брутто-сума всіх `assets/*.js`, включно з lazy chunk-ами) і `CSS`. Real-world initial paint вимірюється `eager-only` під-сумою (chunks з `<link rel="modulepreload">` у `apps/server/dist/index.html`) — після T4 (PR `perf(web): T4`) це ~365 kB. Lighthouse LCP/FCP gate-и (див. секцію нижче) перевіряють user-felt impact, `size-limit` ловить total-regression.

**Якщо потрібно підняти ліміт:** у тому ж PR, що додає dep / feature; explicit обґрунтування у PR-description. Bypass: label `audit-exception` (як для всіх optional CI checks).

## Lighthouse CI (perf-budget gate)

T5 gate from [`docs/planning/sprint-roadmap-q2q3-2026.md`](../../docs/planning/sprint-roadmap-q2q3-2026.md) § 1.1 Тех-борг. Workflow: [`.github/workflows/lighthouse-ci.yml`](../../.github/workflows/lighthouse-ci.yml). Config: [`apps/web/lighthouserc.json`](./lighthouserc.json).

**Routes audited (3 runs each, median):** `/`, `/finyk`, `/fizruk`, `/routine`, `/nutrition`. `/` is the Hub root — there is no separate `/hub` path (see [`apps/web/src/core/app/router.tsx`](./src/core/app/router.tsx)).

**Budgets (median run):**

| Метрика                          | Поріг   | Рівень (first pass)                                              |
| -------------------------------- | ------- | ---------------------------------------------------------------- |
| `largest-contentful-paint` (LCP) | 2000 ms | `warn` (target — після baseline tightening → `error` на 3000 ms) |
| `first-contentful-paint` (FCP)   | 1500 ms | `warn`                                                           |
| `total-blocking-time` (TBT)      | 200 ms  | `warn`                                                           |

**Як читати reports:**

1. Відкрий job `Lighthouse CI (perf budgets)` у CI таб PR-а.
2. В кінці кроку `Run Lighthouse CI` LHCI друкує `Open the report at <url>` — клік → HTML-репорт на `storage.googleapis.com/lighthouse-infrastructure...`. Один URL на route.
3. Альтернативно: завантаж workflow-artifact `lighthouse-reports` (retention 14 днів) — містить `.lighthouseci/lhr-*.html` + `manifest.json` з тривалостями кожного run-у.
4. Зелений job без warn-ів означає, що **median LCP / FCP / TBT всіх 5 routes** під порогами.
5. `⚠ warning` біля метрики — поріг перевищено, але job-у не падає (поки first-pass `warn`).
6. `✗ error` (після tightening) — fail-stop; PR не мерджиться без зеленої метрики або temp-override.

**Temp-overrides (regression patch / urgent merge):**

Жорсткого override-механізму немає (на відміну від `size-limit` `audit-exception` label-а). Якщо потрібен hotfix-bypass:

1. **Preferred:** виправ regression перед merge — переглянь LHCI report → шукай `unused-javascript`, `largest-contentful-paint-element`, `render-blocking-resources`.
2. **Якщо incident-bypass необхідний:** додай у PR-description `[skip-lighthouse-ci]` + причину; в follow-up PR (≤24h) — fix regression АБО bump поріг у [`apps/web/lighthouserc.json`](./lighthouserc.json) з justification у commit message (e.g. «major dep upgrade adds 50 KB → tier-2 chunk → LCP +200 ms; budget bump узгоджено з owner»).
3. Workflow зараз `warn`-only — жодного hard-block-у не існує до tightening PR-а. Після нього: `pull_request` `lighthouse` job стане `required` через GitHub branch-protection rules (manual flip у settings).

**Локальний прогон:**

```bash
pnpm --filter @sergeant/web build   # без VERCEL=1: build кладеться у ../server/dist
VERCEL=1 pnpm --filter @sergeant/web build   # for `vite preview` to find dist
pnpm --filter @sergeant/web lighthouse       # boots vite preview + runs LHCI
```

Reports drop у `apps/web/.lighthouseci/` (gitignored).

## Deeper docs

- App README: [`apps/web/README.md`](./README.md)
- Routing catalog: [`docs/agents/agent-skills-catalog.md`](../../docs/agents/agent-skills-catalog.md)
- Module ownership: [`docs/architecture/module-ownership.md`](../../docs/architecture/module-ownership.md)
- Domain invariants (Kyiv time, kopiykas as `number`): [`docs/architecture/domain-invariants.md`](../../docs/architecture/domain-invariants.md)
