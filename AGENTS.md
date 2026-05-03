# Agents in Sergeant

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

> **If you are an agent:** start with `.agents/skills/sergeant-start-here/SKILL.md`, then load exactly one Sergeant specialist skill for the touched surface. The routing catalog lives in `docs/superpowers/agent-skills-catalog.md`.

## Agent operating system

- Start here: `.agents/skills/sergeant-start-here/SKILL.md`
- Skill routing catalog: `docs/superpowers/agent-skills-catalog.md`
- Workflow decision trees: `docs/superpowers/agent-workflows.md`
- Execution recipes: `docs/playbooks/README.md`
- Playbook lookup: `docs/playbooks/playbook-catalog.md`

Repo policy lives here in `AGENTS.md`. Platform-specific wrappers such as `CLAUDE.md` and `DEVIN.md` only add runtime/tool notes and must not become parallel sources of truth.

## Repo overview

- **pnpm 9** + **Turborepo** monorepo, **Node 20**, **TypeScript 6**.
- **Apps** (5):
  - `apps/web` — Vite + React 18 SPA (frontend).
  - `apps/server` — Express + PostgreSQL (`pg`) + Better Auth (API).
  - `apps/mobile` — Expo 52 + React Native 0.76.
  - `apps/mobile-shell` — Capacitor wrapper for the web app.
  - `apps/console` — Telegram bot (grammy + Anthropic), internal ops/marketing.
- **Packages** (11): `@sergeant/shared`, `@sergeant/api-client`, `@sergeant/config`, `@sergeant/db-schema`, `@sergeant/design-tokens`, `@sergeant/insights`, `eslint-plugin-sergeant-design`, and 4 domain packages (`@sergeant/finyk-domain`, `@sergeant/fizruk-domain`, `@sergeant/nutrition-domain`, `@sergeant/routine-domain`).
- Pre-commit: **Husky** runs `lint-staged` (ESLint --fix + Prettier).

## Module ownership map

Quick lookup before editing: which path uses which test stack and which conventions are mandatory.

| Path                                                  | Owner        | Test stack                              | RQ keys factory                       | Notes                                                                                                                                                                  |
| ----------------------------------------------------- | ------------ | --------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/modules/finyk/**`                       | `@Skords-01` | Vitest + MSW + RTL                      | `finykKeys`                           | Tailwind, localStorage. Mono webhooks → `monoWebhook*` keys.                                                                                                           |
| `apps/web/src/modules/fizruk/**`                      | `@Skords-01` | Vitest + MSW + RTL                      | (none yet — local-first via MMKV-web) | Workouts/sets are local-first. Cloud sync via `cloudsync` queue.                                                                                                       |
| `apps/web/src/modules/nutrition/**`                   | `@Skords-01` | Vitest + MSW + RTL                      | `nutritionKeys`                       | OFF = OpenFoodFacts; barcode scans share cache key with meal-sheet.                                                                                                    |
| `apps/web/src/modules/routine/**`                     | `@Skords-01` | Vitest + RTL                            | (local-first)                         | Habits + streaks; rely on Kyiv-day boundary (see Domain invariants).                                                                                                   |
| `apps/web/src/core/**`                                | `@Skords-01` | Vitest + RTL + (MSW for fetch)          | `hubKeys`, `coachKeys`, `digestKeys`  | HubChat, OnboardingWizard, dashboard. Quick actions registry lives here.                                                                                               |
| `apps/web/src/core/lib/chatActions/**`                | `@Skords-01` | Vitest + RTL                            | n/a                                   | HubChat tool handlers. Повертають `string` для `tool_result`. Пишуть у localStorage тільки через `ls`/`lsSet`. Тест: happy path + error path кожного handler-а.        |
| `apps/web/src/shared/**`                              | `@Skords-01` | Vitest                                  | factories defined here                | Pure utils. No React.                                                                                                                                                  |
| `apps/server/src/modules/**`                          | `@Skords-01` | Vitest + Testcontainers (real Postgres) | n/a                                   | Always coerce bigint→number in serializers (rule #1). Update `api-client` types.                                                                                       |
| `apps/server/src/modules/chat/**`                     | `@Skords-01` | Vitest                                  | n/a                                   | Anthropic tool defs split per domain in `toolDefs/`. See Architecture section.                                                                                         |
| `apps/server/src/migrations/**`                       | `@Skords-01` | n/a                                     | n/a                                   | Sequential `NNN_*.sql` (currently 001–028). No gaps. Two-phase for DROP — see rule #4.                                                                                 |
| `apps/mobile/src/core/**`                             | `@Skords-01` | Jest                                    | (mobile RQ uses module-local keys)    | NativeWind (not Tailwind). MMKV (not localStorage). No DOM.                                                                                                            |
| `apps/mobile/app/**`                                  | `@Skords-01` | Jest                                    | n/a                                   | Expo Router routes. Each `_layout.tsx` is a navigator.                                                                                                                 |
| `apps/mobile-shell/**`                                | `@Skords-01` | none                                    | n/a                                   | Capacitor wrapper around `apps/web`. No app code lives here, only build glue.                                                                                          |
| `apps/console/**`                                     | `@Skords-01` | Vitest                                  | n/a                                   | Telegram bot (grammy + Anthropic). Multi-agent: ops + marketing. Internal only.                                                                                        |
| `packages/shared/**`                                  | `@Skords-01` | Vitest                                  | n/a                                   | Zod schemas, types, business logic. Used by all apps — change with care.                                                                                               |
| `packages/api-client/**`                              | `@Skords-01` | Vitest                                  | n/a                                   | HTTP clients + types. Must mirror `apps/server/src/modules/*` response shapes.                                                                                         |
| `packages/insights/**`                                | `@Skords-01` | Vitest                                  | n/a                                   | Cross-module analytics. Pure functions over normalized data.                                                                                                           |
| `packages/{finyk,fizruk,nutrition,routine}-domain/**` | `@Skords-01` | Vitest                                  | n/a                                   | Domain logic shared web ↔ mobile (e.g., kcal math, budget computations).                                                                                               |
| `packages/db-schema/**`                               | `@Skords-01` | Vitest                                  | n/a                                   | Drizzle ORM schemas (Postgres + SQLite) and the migration runner used by `apps/server`. Schema changes pair with a new SQL migration in `apps/server/src/migrations/`. |
| `packages/eslint-plugin-sergeant-design/**`           | `@Skords-01` | `node --test` (`__tests__/*.mjs`)       | n/a                                   | Custom ESLint rules. Run via `pnpm lint:plugins`.                                                                                                                      |

> Owner is the GitHub handle responsible for review and incident escalation (L2 on-call). All modules currently roll up to `@Skords-01`; per-module delegation will be tracked here when sub-owners are introduced.

> CODEOWNERS coverage of every governance / CI / migrations / skills surface is enforced by `pnpm lint:codeowners` (`scripts/check-codeowners-coverage.mjs`). Whenever you delegate a sub-owner here, also add the matching pattern in `.github/CODEOWNERS` — the script will fail the next PR if a required path drifts uncovered.

## Hard rules (do not break)

### 1. DB types: coerce `bigint` to `number` in serializers

The `pg` driver returns `bigint` as **string** (see [#708](https://github.com/Skords-01/Sergeant/issues/708)). Always coerce in the serializer, never let it leak to API consumers.

```ts
// ❌ BAD — bigint leaks as string to client; arithmetic breaks silently
return rows.map((r) => ({
  id: r.id, // string!
  amount: r.amount, // string!
}));

// ✅ GOOD — explicit Number() in the serializer
return rows.map((r) => ({
  id: Number(r.id),
  amount: Number(r.amount),
}));
```

Snapshot tests in `apps/server/src/modules/*` lock the shapes — if the snapshot diff shows a stringified number, you forgot the coercion.

### 2. RQ keys: only via centralized factories

All `useQuery`/`useMutation` keys come from `apps/web/src/shared/lib/queryKeys.ts`. Factories: `finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `digestKeys`, `pushKeys`.

```ts
// ❌ BAD — drift; impossible to bulk-invalidate; typos compile
useQuery({ queryKey: ["finyk", "transactions", accountId], ... });

// ✅ GOOD — typed factory, supports bulk invalidate via `finykKeys.all`
import { finykKeys } from "@shared/lib/queryKeys";
useQuery({
  queryKey: finykKeys.monoTransactionsDb(from, to, accountId),
  ...
});
```

Secrets (Mono token, etc.) **must** be hashed via `hashToken()` before going into a key — they leak into devtools / logs otherwise.

### 3. API contract: server response shape ↔ `api-client` types ↔ test

When you change a JSON response shape in `apps/server/src/modules/*`, three things move together:

```diff
  // apps/server/src/modules/finyk/transactionsHandler.ts
  return rows.map((r) => ({
    id: Number(r.id),
+   merchantCategory: r.mcc ? String(r.mcc) : null,
    amount: Number(r.amount),
  }));
```

```diff
  // packages/api-client/src/endpoints/finyk.ts
  export interface MonoTransaction {
    id: number;
+   merchantCategory: string | null;
    amount: number;
  }
```

```diff
  // apps/server/src/modules/finyk/transactionsHandler.test.ts
  expect(result).toMatchInlineSnapshot(`
    {
      "id": 42,
+     "merchantCategory": "5411",
      "amount": 250,
    }
  `);
```

If you change only one — CI will pass but consumers break. Always do all three in the same PR.

### 4. SQL migrations: sequential, no gaps, two-phase for DROP

Files in `apps/server/src/migrations/` use the pattern `NNN_description.sql` (currently 001–028). Pre-deploy: `pnpm db:migrate` (Railway, runs `apps/server/migrate.mjs`). The build step copies them via `apps/server/build.mjs` (fixed in [#704](https://github.com/Skords-01/Sergeant/issues/704)).

> **Local Postgres image:** `docker-compose.yml` uses `pgvector/pgvector:pg16`, not stock `postgres:16-alpine`. Migration `025_ai_memories_pgvector.sql` runs `CREATE EXTENSION IF NOT EXISTS vector;` and the alpine image does not ship the extension — `pnpm db:up` would fail at migrate-time. CI workflows (`ci.yml`, `extended-e2e.yml`, `visual-regression.yml`) already pin the same image.

- **Adding a column:** single file `NNN_add_foo.sql`. Make it `NULL`-able or `DEFAULT`-ed so old code keeps working.
- **Renaming/removing a column:** **two phases**, deployed **separately**:

```sql
-- Phase 1: NNN_add_new_amount.sql (deployed first; old code unaffected)
ALTER TABLE transactions ADD COLUMN amount_minor BIGINT;
UPDATE transactions SET amount_minor = (amount * 100)::BIGINT;
-- Code is updated to write BOTH columns and read the new one.

-- Phase 2: (N+M)_drop_old_amount.sql (deployed only after phase 1 is live)
ALTER TABLE transactions DROP COLUMN amount;
```

Never drop a column in the same release as the code that stops writing to it — Railway pre-deploy migrates before the new app starts, so the old version (briefly serving traffic) will crash.

A `down.sql` companion (e.g. `008_mono_integration.down.sql`) is for local rollbacks. Production never runs `down.sql`.

### 5. Conventional Commits: explicit scope enum

Format: `<type>(<scope>): <subject>`. Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`, `build`, `ci`.

**Scopes (use one of these — do not invent new ones):**

| Scope              | When to use                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `web`              | `apps/web/**`                                                      |
| `server`           | `apps/server/**` (excluding migrations alone)                      |
| `mobile`           | `apps/mobile/**`                                                   |
| `mobile-shell`     | `apps/mobile-shell/**`                                             |
| `console`          | `apps/console/**`                                                  |
| `shared`           | `packages/shared/**`                                               |
| `api-client`       | `packages/api-client/**`                                           |
| `finyk-domain`     | `packages/finyk-domain/**`                                         |
| `fizruk-domain`    | `packages/fizruk-domain/**`                                        |
| `nutrition-domain` | `packages/nutrition-domain/**`                                     |
| `routine-domain`   | `packages/routine-domain/**`                                       |
| `insights`         | `packages/insights/**`                                             |
| `design-tokens`    | `packages/design-tokens/**`                                        |
| `config`           | `packages/config/**`                                               |
| `db-schema`        | `packages/db-schema/**`                                            |
| `eslint-plugins`   | `packages/eslint-plugin-sergeant-design/**`                        |
| `migrations`       | `apps/server/src/migrations/**` only                               |
| `agents`           | `.agents/**`, `apps/console/src/agents/**`, `ops/n8n-workflows/**` |
| `deps`             | Renovate / dependency-only PRs                                     |
| `docs`             | `docs/**`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`             |
| `ci`               | `.github/workflows/**`, `turbo.json`, scripts under `scripts/`     |
| `root`             | Repo-level config (`pnpm-workspace.yaml`, `package.json` at root)  |

If a PR genuinely spans multiple scopes (rare), use the most "user-visible" one and explain in the body. **Do not invent** scopes like `monorepo`, `app`, `core`, `all`.

### 6. No force push to main/master

`--force-with-lease` on feature branches is OK.

### 7. Pre-commit hooks via Husky — do not skip

`--no-verify` is forbidden. If a hook is broken, fix the hook in the same PR; do not bypass it.

### 8. Tailwind colour-opacity steps must be on the registered scale

Tailwind only generates the utility `<color>/<N>` when `N` exists in `theme.opacity`. The Sergeant preset (`packages/design-tokens/tailwind-preset.js`) registers:

```
0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100
```

(Default Tailwind v3 scale steps in 5-pt increments; the explicit `8` is Sergeant's "barely there" 8 % wash on panel surfaces — used for dark-mode module bento tiles, primary/danger row highlights, and Routine surface tints.)

Any other step (`/7`, `/9`, `/12`, `/18`, …) is **silently dropped** — Tailwind emits no class, the surrounding `dark:` / `hover:` / `focus:` variant falls through to the previous declaration, and you typically only notice because dark mode looks wrong (this is exactly bug [#814](https://github.com/Skords-01/Sergeant/pull/814)).

```tsx
// ❌ BAD — `/12` is not on the scale; the `dark:` override silently
// falls through to the light-mode background.
<div className="bg-routine-surface/40 dark:bg-routine/12" />

// ✅ GOOD — `/10` and `/15` are on the scale.
<div className="bg-routine-surface/40 dark:bg-routine/10" />
```

Enforced by `sergeant-design/valid-tailwind-opacity` (`error`). To add a new step, extend the `opacity` map in the preset **and** the `ALLOWED_TAILWIND_OPACITY_STEPS` constant in `packages/eslint-plugin-sergeant-design/index.js` — they must stay in sync.

### 9. Saturated brand fills behind `text-white` must use the `-strong` companion

Every saturated brand colour (`brand`, `accent`, `success`, `warning`, `danger`, `info`, `finyk`, `fizruk`, `routine`, `nutrition`) ships with a `-strong` companion (typically the `-700` step; `nutrition` uses `-800`) that clears WCAG 2.1 AA 4.5 : 1 against `text-white`. The saturated `-500` shades regress to ~2.4–2.8 : 1 against white — see `docs/design/brandbook.md` → "WCAG-AA `-strong` Tier" for the full per-family contrast table and `docs/design/brand-palette-wcag-aa-proposal.md` for the migration history (PRs [#854](https://github.com/Skords-01/Sergeant/pull/854) / [#855](https://github.com/Skords-01/Sergeant/pull/855) / [#857](https://github.com/Skords-01/Sergeant/pull/857)).

```tsx
// ❌ BAD — saturated brand fill behind white text fails WCAG AA at body sizes.
<button className="bg-brand text-white">…</button>
<button className="bg-brand-500 text-white">…</button>
<span className="bg-fizruk text-white">…</span>

// ✅ GOOD — strong companion clears AA (5.2 – 6.6 : 1).
<button className="bg-brand-strong text-white">…</button>
<span className="bg-fizruk-strong text-white">…</span>
```

The rule deliberately does **not** fire on:

- `bg-{family}-strong text-white` — the canonical fix.
- `bg-{family}-{700,800,900}` — explicit dark steps already clear AA.
- `bg-{family}/N` — opacity-tinted soft washes; the foreground is `text-{family}-strong`, not white.
- `bg-[#hex] text-white` — arbitrary hex values, now separately forbidden by rule #11 (`sergeant-design/no-hex-in-classname`).
- `dark:bg-{family} text-white` — on dark surfaces emerald-500 vs. white passes ~5.4 : 1; the strong tier would actually regress contrast.
- `hover:bg-{family} text-white` — hover-only saturated bg if the base state is fine.

Enforced by `sergeant-design/no-low-contrast-text-on-fill` (`error`). The four saturated `*-500` brand-identity tokens in `packages/design-tokens/tokens.js` remain unchanged — they're still the canonical brand colours for logos, marketing assets, and dark-mode bento surfaces. The strong tier is purely additive and only required for text/fill-behind-text contexts.

### 10. Lifecycle markers — every file/doc declares its status

> Why a hard rule? Because PR [#1143](https://github.com/Skords-01/Sergeant/pull/1143) silently merged a "dead-code cleanup" that deleted scaffolded-but-not-yet-wired components (`PullToRefreshIndicator`, `usePullToRefresh`, `EmptyStateIllustrations`, `OptimizedImage`). They were dropped in by a `feat(web)` commit ahead of integration and `pnpm knip` correctly reported "no importers" — but cleaning them up was wrong, because they were the next-step UI scaffolding, not legacy. We need a way to tell intentional-zero-importers apart from real dead code.

Every non-trivial source file and every published doc declares **one** of these statuses. If a file/doc has no marker, treat it as `Active` (the default) — but if `pnpm knip` flags it as unused, you must check git log and possibly add a `@scaffolded` marker before deleting.

#### Code: JSDoc lifecycle tags

Place the marker in the **first JSDoc block of the file** (above imports is fine). Tags compose with TS-LSP — `@deprecated` shows strikethrough in editors automatically.

| Tag             | Meaning                                                                                   | When to add                                                         | When to remove                                                                       |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@scaffolded`   | Ready for use but no live consumer yet. Intentional zero-importer. Knip MUST NOT flag it. | When you commit a component/hook ahead of its first wiring PR.      | In the PR that wires it into a page/route/registry — also delete the tag in that PR. |
| `@experimental` | API may change or be reverted. Live consumers exist but we are not promising stability.   | When shipping a feature flag or A/B candidate that may be reverted. | When stabilizing (delete tag), or when removing (replace with `@deprecated`).        |
| `@deprecated`   | Live consumers must migrate away. Will be removed by a target date.                       | When introducing a replacement.                                     | After the deletion PR lands and consumers are migrated.                              |
| _(no tag)_      | Active. Default for everything else.                                                      | —                                                                   | —                                                                                    |

Each non-Active marker is followed by a **machine-readable block** with the same shape:

```ts
/**
 * @scaffolded
 * @owner @Skords-01
 * @addedIn <commit-sha>  # short SHA of the commit that introduced the file
 * @nextStep <one-line plan> — link to a doc/issue describing the integration
 *
 * Scaffolded but not yet imported by any consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #10 in AGENTS.md.
 */
```

`@deprecated` blocks add `@removeBy YYYY-MM-DD` (target removal date) and `@migration <link>` (where consumers learn how to switch).

Knip respects `@scaffolded` and `@deprecated` files via `knip.json` `ignore` glob entries that include the markers (see `scripts/knip-respects-scaffolded.mjs` for the regex list). When you add a marker, no knip config change is needed.

#### Docs: status badge under the freshness marker

Right after the existing `> **Last validated:** YYYY-MM-DD …` line, add:

```md
> **Status:** Active | Scaffolded | Deprecated | Archived
```

- `Active` — current source of truth. Default.
- `Scaffolded` — describes a feature/component that exists in code but isn't wired yet. Do NOT cite it as live behaviour. Pair with the matching `@scaffolded` JSDoc tag in code.
- `Deprecated` — describes a behaviour we're replacing; reference the replacement.
- `Archived` — historical artefact, lives in `docs/<area>/archive/`. CI freshness checks ignore.

`scripts/check-tech-debt-freshness.mjs` accepts the new `Status:` line and refuses to run on `Archived` docs (so we don't churn timestamps on archives).

#### What this rule blocks

- **Dead-code PRs** — agent/human MUST check for `@scaffolded`/`@deprecated` markers before deleting a "knip-says-unused" file. If a marker exists, leave the file. If knip flags an unmarked file, prefer to add `@scaffolded` (with owner + next step) rather than delete, unless `git log --follow` makes it obvious the file is truly orphaned (e.g. last touched > 12 months ago, no `feat(...)` commit). Document the reasoning in the PR description.
- **Doc cleanup PRs** — `Archived` docs may be moved to `archive/`, but their content is not edited.
- **AI agents** — when surfacing files for review, group by status. A file with `@scaffolded` is NOT a candidate for the "remove dead code" task type.

### 11. No arbitrary hex colors in `className`

Raw `<utility>-[#hex]` values in Tailwind `className` (`bg-[#10b981]`, `text-[#fff]/50`, `border-[#abc]`, `ring-[#1234ab]`) bypass the design-system token layer entirely. Dark-mode adaptation, the WCAG-AA `-strong` promotion from rule #9, the module-accent containment from rule #12, and future palette migrations all stop working for those literals — you get a hard-coded colour that no other system in the repo can reason about.

```tsx
// ❌ BAD — off-palette emerald that dark-mode cannot touch
<div className="bg-[#10b981] text-[#fff]/50" />

// ✅ GOOD — status soft token; both `bg-` and `text-` adapt per theme
// via CSS variables owned by the preset.
<div className="bg-success-soft text-success-strong" />

// ✅ GOOD — page-level surface + foreground; semantic and theme-aware.
<div className="bg-surface text-fg" />
```

The rule covers every colour-aware utility (`bg-`, `text-`, `border-`, `ring-`, `fill-`, `stroke-`, `from-`, `to-`, `via-`, `shadow-`, `outline-`, `divide-`, `placeholder-`, `caret-`, `decoration-`, `accent-`) and validates hex length (3 / 4 / 6 / 8 digits). Non-hex arbitrary values (`bg-[oklch(…)]`, `border-[var(--foo)]`, `bg-[rgb(…)]`) are **intentionally left alone** — they can reference CSS variables owned by the preset and are occasionally necessary for one-off interop.

If you genuinely need a new shade, add it to `packages/design-tokens/tailwind-preset.js` (alongside a `-soft` / `-strong` companion per rule #9) instead of inlining hex at the call-site. Enforced by `sergeant-design/no-hex-in-classname` (`error`).

### 12. Module-accent containment — no foreign accents inside a module subtree

Sergeant's four module accents (`finyk`/emerald, `fizruk`/teal, `routine`/coral, `nutrition`/lime) are deliberately close in saturation. A fizruk screen that accidentally renders a coral `ring-routine` reads to the user as "Рутина" — it's a semantic design bug, not a stylistic choice. Inside the `apps/<app>/src/modules/<X>/` subtree, only `<X>`'s accent utilities (`bg-<X>-surface`, `text-<X>-strong`, `ring-<X>`, `bg-<X>-500/15`, …) may appear.

```tsx
// apps/web/src/modules/fizruk/pages/PlanCalendar.tsx
// ❌ BAD — coral focus ring inside a Fizruk page
<button className="focus-visible:ring-routine" />

// ✅ GOOD — module-consistent focus ring
<button className="focus-visible:ring-fizruk" />
```

The rule handles variant prefixes (`dark:`, `hover:`, `lg:`), shade suffixes (`-500`, `-soft`, `-strong`), and opacity suffixes (`/15`) transparently. Cross-module shells remain **exempt** so the Hub / HubChat / shared widgets can still reference every accent:

- `apps/*/src/core/**`, `apps/*/src/shared/**`, `apps/*/src/stories/**`
- `apps/*/src/modules/shared/**` (non-canonical module folder — a cross-module utility, not an accent owner)
- `__tests__/*.{ts,tsx,mjs}` — test fixtures naturally reference all four for coverage.

Enforced by `sergeant-design/no-foreign-module-accent` (`error`). See `docs/design/module-accent.md` for the "one accent = one module" design principle.

### 13. No raw-palette light/dark `className` pairs

A `className` that pairs a raw-palette light utility with a `dark:` raw-palette override encodes both themes by hand at the call-site. The next palette migration (or the next opacity-step renaming — bug [#814](https://github.com/Skords-01/Sergeant/pull/814)) silently drops one half and the surrounding override falls through to the wrong colour. Lift the (light, dark) pair into the design-system token layer (`bg-success-soft`, `bg-finyk-surface`, `text-brand-strong`, `border-routine-soft-border`, …) so the preset owns the swap and the call-site keeps zero `dark:` palette overrides. The full migration history (Wave 1b → 2a → 2b → 2c) lives in [`docs/design/dark-mode-audit.md`](docs/design/dark-mode-audit.md).

```tsx
// ❌ BAD — both halves are raw `brand-*` palette steps; the next
// emerald retune silently drops one of them.
<a className="text-brand-600 dark:text-brand-400">…</a>

// ✅ GOOD — `text-brand-strong` is the WCAG-AA companion (no numeric
// step), `dark:text-brand` is the saturated DEFAULT for dark panels.
<a className="text-brand-strong dark:text-brand">…</a>

// ❌ BAD — paired raw-palette borders on a hero card.
<Card className="border border-teal-200/50 dark:border-teal-800/30 …" />

// ✅ GOOD — `border-fizruk-soft-border` is theme-adaptive via
// `--c-fizruk-soft-border` (light = teal-200-ish, dark = teal-900-ish).
<Card className="border border-fizruk-soft-border/50 …" />
```

The rule fires only when **both** halves are present on the same className value:

- a bare `<utility>-<PALETTE>-<SHADE>[/<opacity>]`, AND
- a `dark:<utility>-<PALETTE>-<SHADE>[/<opacity>]`,

where `<utility> ∈ { bg, text, border }` and `<PALETTE>` is one of the 24 raw Tailwind families (`gray`, `slate`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`, plus Sergeant's `brand` / `coral` aliases — both are theme-inert raw palettes despite the brand-y names). `<SHADE>` is a numeric step (`50`, `100`, …, `950`), so semantic suffixes (`brand-soft`, `brand-strong`, `routine-soft-border`) are NOT flagged.

What the rule **never** flags (these stay):

- `dark:bg-white/10`, `dark:bg-black/40`, `dark:border-white/15` — bare-colour glass washes.
- Dark-side-only "patches" where the light side is already semantic (`bg-success-soft text-success-strong dark:text-emerald-100`) — these document gaps in the WCAG-AA `-strong` companion scale on dark panels (rule #9).
- Semantic tokens that happen to carry a `dark:` prefix (`dark:bg-surface`, `dark:text-fg`, `dark:border-border`).

Enforced by `sergeant-design/no-raw-dark-palette` (`error`), scoped to `apps/web/**/*.{ts,tsx,js,jsx}` — the semantic replacements (`bg-{family}-soft`, `border-{module}-soft-border`, …) resolve through `--c-{family}-soft*` CSS variables that live only in `apps/web/src/index.css`. NativeWind (`apps/mobile`) renders classNames into React Native inline styles and does not consume those CSS variables, so the rule does not apply there. Promoted from absent → `error` in PR [#1155](https://github.com/Skords-01/Sergeant/pull/1155) once the audit's inventory hit zero (Wave 2a + 2b in PR [#1153](https://github.com/Skords-01/Sergeant/pull/1153), Wave 1b in [#1149](https://github.com/Skords-01/Sergeant/pull/1149)) and the 40 additional paired call-sites surfaced by the rule were migrated to the canonical Wave 1b shape. Refined in [#1157](https://github.com/Skords-01/Sergeant/pull/1157) to skip variant-prefixed dark utilities (`lg:dark:bg-amber-500/15`, `hover:dark:text-coral-300`, …) — those carry an extra breakpoint or state condition that the rule's bare-pair contract does not model.

### 14. Visible focus indicators must use `focus-visible:`, not `focus:`

> Why a hard rule? `focus:ring-*` and `focus:bg-*` fire on every focus event — including a pointer click, which produces a flashing ring on every mouse interaction with a button or input. `focus-visible:` is the modern primitive that only fires when the user is navigating with the keyboard or assistive tech. Sergeant's design-system contract (`docs/design/design-system.md`) explicitly lists `focus-visible:ring-2 ring-brand-500/45 ring-offset-2 ring-offset-surface` as the canonical focus indicator and notes "**Focus — `focus-visible:ring-brand-500/30`, а не `focus:`, аби pointer-клік не блимав кільцем**". Every `focus:` colour utility shipped to date predates that rule and is a regression that needs to be migrated.

```tsx
// ❌ BAD — pointer click on the input flashes the brand ring
<input className="focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30" />

// ✅ GOOD — only keyboard / assistive-tech focus paints the ring;
//          pointer click leaves the input untouched
<input className="focus:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30" />

// ❌ BAD — paired raw `focus:` rules duplicate `focus-visible:` (legacy
//          fallback for pre-2022 browsers); modern targets don't need them
<input className="focus-visible:border-brand-400 focus:border-brand-400" />

// ✅ GOOD — `focus-visible:` is supported by Chrome 86+, Safari 15.4+,
//          Firefox 85+; the legacy fallback is dead weight
<input className="focus-visible:border-brand-400" />
```

The single legitimate `focus:` utility is **`focus:outline-none`** — the canonical reset that pairs with `focus-visible:ring-*` so the user-agent outline doesn't double up with the design-system ring.

What the rule **never** flags (these stay):

- `focus:outline-none`, `focus:outline-hidden`, `focus:outline-transparent` — outline resets that pair with `focus-visible:ring-*`.
- `focus:not-sr-only`, `focus:fixed`, `focus:px-4`, `focus:rounded-xl`, … — non-colour layout / sizing utilities. Skip-links use these legitimately to promote a sr-only element to a visible pinned pill on focus, and that's intentional UX.
- `focus:text-sm`, `focus:text-base`, `focus:text-mini`, `focus:text-center`, … — `text-` size / alignment / transform tails that aren't colours.
- `focus:font-semibold` and other typography utilities outside the colour/border/ring/shadow set.
- `lg:focus:bg-panel`, `hover:focus:text-brand-strong`, `dark:focus:border-brand-400`, `group-focus:bg-panel`, `peer-focus:ring-2`, `focus-within:bg-panel`, `focus-visible:ring-brand-500/45` — variant-prefixed `focus:` and the unrelated `:focus-visible` / `:focus-within` / `:group-focus` / `:peer-focus` pseudo-classes.

Enforced by `sergeant-design/prefer-focus-visible` (`error`), scoped to `apps/web/**/*.{ts,tsx,js,jsx}` — React Native (`apps/mobile`, NativeWind) doesn't expose a `:focus-visible` pseudo-class equivalent; mobile uses `onFocus` handlers and the ring concept is web-only. Promoted from absent → `error` in PR [#1158](https://github.com/Skords-01/Sergeant/pull/1158) once the existing 14 paired `focus:` colour utilities (in `Input`, `Select`, `SkipLink`, `InputDialog`, `AssistantCataloguePage`) were migrated to `focus-visible:`.

### 15. Read governance before coding; update docs alongside code; internal docs in Ukrainian

> Why a hard rule? Because rules are useless if no one reads them, and docs are dangerous if they describe behaviour the code no longer has. Both failure modes have shipped here ([#1143](https://github.com/Skords-01/Sergeant/pull/1143) deleted scaffolded code partly because the AI agent skipped the playbook; multiple Tailwind-opacity bugs survived because the design-system doc still listed deprecated tokens). This rule closes both gaps.

#### Before writing any code

Both AI agents and human contributors **must** read the relevant governance up front, in this order:

1. **`AGENTS.md`** — Hard Rules (#1–#15), Module ownership map for the path you're touching, AI-marker conventions, Domain invariants.
2. **`CONTRIBUTING.md`** — branch/commit conventions, pre-commit hooks, PR checklist.
3. **`CLAUDE.md`** — Claude/AI-specific commands and guardrails (sister file to AGENTS.md).
4. **The matching playbook** in `docs/playbooks/` — pick by trigger phrase. New API endpoint → `add-api-endpoint.md`. New HubChat tool → `add-hubchat-tool.md`. Removing code → `cleanup-dead-code.md`. Migrations → `add-migration.md`.
5. **The freshness header** of every doc you cite or change (`> Last validated: YYYY-MM-DD by @owner`). If the doc is stale (`Next review` date passed), flag it in the PR — don't blindly trust it, but don't silently ignore it either.

If you're an AI agent, treat steps 1–4 as a **pre-flight checklist**: do not begin implementation until you can name (a) the Hard Rules that apply, (b) the playbook(s) you'll follow, (c) the owner of the path. If no playbook exists for the task type, write a one-paragraph mini-plan and link it in the PR.

#### During the work

- Do not work around a rule because it's inconvenient. If you genuinely believe a rule is wrong, raise it in the PR description (or open an `AGENTS.md` PR first) — don't ship code that violates it.
- If you discover the rule is unclear or contradictory, fix it in the same PR (one paragraph in `AGENTS.md` is cheaper than the next confused agent).
- Honour `@scaffolded` / `@deprecated` / `@experimental` markers (Hard Rule #10).

#### Before opening the PR — update docs alongside code

Documentation is part of the change set, not a follow-up. Treat any of the following as **must-update** when the underlying code/contract moves:

| Code change                                       | Docs that must move with it                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New / changed JSON response shape                 | `packages/api-client/**` types **+** the matching contract test (Hard Rule #3). If the response is documented in `docs/api/*.md`, update there too.                    |
| New SQL migration                                 | `apps/server/src/migrations/README.md` (if present), and any ER-diagram in `docs/architecture/`.                                                                       |
| New / removed npm script                          | `CONTRIBUTING.md § Everyday Commands`, `CLAUDE.md § Quick commands`.                                                                                                   |
| New Hard Rule, lint rule, or convention           | `AGENTS.md` § Hard Rules (the canonical entry) **+** mirror summary in `CONTRIBUTING.md § Hard rules`. PR template's "AGENTS.md updated?" checkbox **must** be ticked. |
| New design token, palette, or component           | `docs/design/design-system.md`, `docs/design/brandbook.md`, and the relevant audit (`docs/audits/*-audit-*.md`) if it changes status.                                  |
| Deprecating a behaviour                           | Add `@deprecated` JSDoc with `@removeBy YYYY-MM-DD` (Hard Rule #10) **+** update the consuming doc to mark the section `> **Status:** Deprecated`.                     |
| New playbook trigger or HubChat tool              | `docs/playbooks/<name>.md` (or update the existing playbook). Cross-link from `CLAUDE.md § Before you write code` if it's a frequent trigger.                          |
| Anything that invalidates an existing doc's claim | Update the doc in the same PR, or move it to `docs/<area>/archive/` with a `> **Status:** Archived` badge if the claim is no longer relevant.                          |

In every doc you touch, also bump the freshness header:

```md
> **Last validated:** 2026-04-29 by @your-handle. **Next review:** 2026-07-29.
> **Status:** Active
```

If you genuinely change nothing in the doc but its claims still hold, leave the header alone — _do not_ touch the date just to silence freshness warnings. The freshness checker (`scripts/check-tech-debt-freshness.mjs`) accepts unchanged dates.

#### What this rule blocks

- Silent contract drift (server changed, `api-client` didn't).
- Stale design-system docs that still document deprecated tokens / removed components.
- AI agents shipping code that violates a Hard Rule because they didn't read AGENTS.md.
- "Just a one-line change" PRs that quietly remove behaviour the docs still promise.

#### Verification

The PR template includes the relevant boxes (`AGENTS.md updated?`, "Docs updated alongside code?"). CI catches the cases that are mechanically detectable:

- `pnpm lint:governance-sync` — fails (error, not warning) on **concrete** dangling `apps/.../*.ts` / `packages/.../*.ts` / `scripts/...` refs in non-aspirational docs (anything outside `docs/launch/`, `docs/planning/`, `docs/integrations/*-roadmap.md`, `docs/audits/*-implementation-roadmap.md`, ADRs with `Status: proposed`). Refs containing glob/placeholder syntax (`*`, `?`, `<>`, `[]`, `{}`) are skipped — those are templates, not concrete claims.
- `pnpm docs:check-freshness`, `pnpm docs:check-playbook-index`, `pnpm docs:check-playbook-schema`, `pnpm hard-rules:check`, `pnpm api:check-openapi` — supplementary gates per category.

The remaining categories (api-client type drift, CHANGELOG entries, design-system updates) are still reviewer- and self-discipline-enforced. If a reviewer spots an unchecked-but-required doc update, that's a request-changes signal — not a "follow-up issue". And if `lint:governance-sync` shows a path you renamed/moved, **do not** silence it by adding `<>` placeholders unless the file truly is aspirational — fix the doc to reference the real new path.

#### Doc-source-of-truth language

> Promoted from soft → hard 2026-04-30: agents kept emitting English-only ADR/playbook prose, leaving the repo bilingual-by-accident.

All **prose** in internal docs (ADRs, playbooks, audits, RFCs, architecture docs, governance docs, tech-debt notes, runbooks, design specs) is written in **Ukrainian**. The **only** English-by-default surfaces are:

- `README.md` (public-facing, GitHub default-rendered).
- ADR titles and Status badges (canonical English keywords: `proposed`, `accepted`, `superseded`, `shipped`).
- The first H1 of `AGENTS.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `DEVIN.md` (shared-tooling convention).
- OpenAPI / `docs/api/*` schema & description fields (consumed by tooling).
- Commit messages (Conventional Commits English vocabulary — Hard Rule #5).
- PR titles & descriptions (English so reviewers across timezones / Devin / Codex can scan).
- Code identifiers, command names, log lines, env-var names, error codes (always English).
- Verbatim quotes from English-language sources (RFCs, vendor docs, Stripe error names, etc.).

Inside any of those English surfaces it's still fine to mix Ukrainian prose where it clarifies (e.g. `> _Update 2026-04-30_:` blocks); the rule is about the **default** language for new prose, not a ban.

If a reviewer sees a new prose paragraph or table cell in English in a doc that's not on the exception list above, that's a request-changes signal — switch to Ukrainian and keep the technical terms (token names, flags, function/class identifiers) verbatim.

### 16. Typography scale — semantic styles + 12px floor

> Why a hard rule? Drift on the type scale is invisible until it isn't. Two PRs landed `text-3xs` (9px) on touch targets despite Hard Rule #4-style review (`docs/audits/UX-UI-AUDIT-2026.md` § Typography utilities неконсистентні). Codifying the floor and the named-style contract closes the gap.

**Use one of the semantic `.text-style-*` utilities whenever a slot has a documented role.** The utilities live in `packages/design-tokens/tailwind-preset.js → plugins.semanticTypography` and bundle font-size, line-height, weight, letter-spacing, and casing so layouts can't drift on any single axis (e.g. shipping the hero size with the wrong weight).

| Utility                | Contract                       | Slot                              |
| ---------------------- | ------------------------------ | --------------------------------- |
| `.text-style-hero`     | 26 / 32 / 700 / -0.02em        | Page H1, hero stat number         |
| `.text-style-title`    | 20 / 28 / 600 / -0.01em        | Section heading, card title       |
| `.text-style-body`     | 16 / 24 / 400                  | Main body copy                    |
| `.text-style-label`    | 14 / 20 / 500                  | Form label, button text           |
| `.text-style-caption`  | 12 / 16 / 400                  | Helper text, metadata, timestamps |
| `.text-style-overline` | 12 / 16 / 600 / 0.06em / UPPER | Section kicker / eyebrow          |

**Floor: 12px (`text-style-caption` / `text-xs`).** `text-3xs` (9px) is removed from the scale; `text-2xs` (10px) is reserved for chart axis ticks and decorative metadata badges (timestamps, badge counts) — never primary content. Anything a user has to read to take an action MUST clear 12px.

**What this rule blocks:**

- New `text-3xs` classes (the token no longer resolves and Tailwind silently drops the class).
- `text-2xs` on primary body copy or button labels — bump to `text-xs` / `.text-style-caption`.
- Bespoke `text-* font-* tracking-* uppercase` combos that re-implement an existing `.text-style-*` utility. Reach for the named utility instead so future retunes propagate from one place.

The `.text-style-overline` utility is the canonical way to render kickers; module-headers that need `text-brand-700` may keep the hand-rolled span (with the existing `// eslint-disable-next-line sergeant-design/no-eyebrow-drift` justification) until SectionHeading exposes a brand-tinted variant.

### 17. Animation budget — max 2 concurrent, 3 tiers

> Why a hard rule? Unconstrained animations create visual noise and harm users with vestibular disorders. Past audits found confetti firing on every checkbox tick and stagger delays compounding to 350 ms+, both violating the WCAG 2.3 (Animation from Interactions) guideline.

Three animation tiers — every animation in the codebase belongs to exactly one:

| Tier          | Examples                                                       | Constraint                                                                                            |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **AMBIENT**   | `shimmer`, `pulse-soft`, `wiggle`                              | Looped; always behind `motion-safe:`; `prefers-reduced-motion` collapses to opacity-only              |
| **RESPONSE**  | `fade-in`, `slide-up`, `scale-in`, `press-scale`, `hover-lift` | One-shot, 150–300 ms, `ease-out`; fires once per user action                                          |
| **CELEBRATE** | `check-pop`, `bounce-in`, `success-pulse`, confetti burst      | Milestones only: first entry, streak 7/30/100/365, weekly goal hit. **Not** every checkbox completion |

Rules:

- Max **1 AMBIENT + 1 RESPONSE** running simultaneously on screen.
- A stagger group counts as **1 RESPONSE** regardless of child count.
- Stagger timing: **max 30 ms between children**, total delay cap **≤ 150 ms** (`Math.min(index * 30, 150)`).
- Never wrap a component that has its own internal entry animation in `StaggerChild` (double-animation).
- `showConfetti` on `AnimatedCheckbox` / `HabitCheckbox` must only be `true` at streak milestones (7, 30, 100, 365) — never on every tick.

## Touch targets

All interactive elements must clear **WCAG 2.5.5** / Apple HIG **≥44×44px** on touch devices (`@media (pointer: coarse)`). Three layers cooperate:

1. **`Button` component** auto-applies `min-h-[44px] min-w-[44px]` on coarse pointers for `xs` / `sm` / `iconOnly` sizes — zero work at the call-site (see `packages/design-tokens/tailwind-preset.js` and `apps/web/src/shared/components/ui/Button.tsx`).
2. **`touch-target` / `touch-target-48` Tailwind utilities** raise the floor to 44 / 48 px on coarse pointers without touching the desktop sizing. Use these for bespoke interactive elements that are visually smaller than 44 px on desktop (icon-only chips on cards, drag handles on bento tiles, dense toggles).
3. **Global safety net** in `apps/web/src/index.css` enforces ≥44×44 on every `<button>`, `a[role="button"]`, and `[role="tab"]` on coarse pointers. Opt out with `data-compact` for elements that are intentionally smaller (heatmap cells, dense data grids, inline chips).

```tsx
// ❌ BAD — 28×28 hit target on touch fails WCAG.
<button className="w-7 h-7 rounded-lg" onClick={onAdd}>+</button>

// ✅ GOOD — visible 28×28 glyph, 44×44 hit area on touch.
<button className="w-7 h-7 touch-target rounded-lg" onClick={onAdd}>+</button>

// ✅ GOOD — intentionally compact (heatmap cell), 44×44 floor opted out.
<button data-compact className="w-3 h-3 rounded-sm" />
```

The `Button` component handles the common case automatically; reach for `touch-target` only when you cannot use `Button` (e.g. absolutely-positioned siblings, drag activators, custom-styled toggles). Refer to `BentoCard` for the canonical "small visible glyph + 44 px hit area" pattern.

## AI markers

Structured comments for AI-agent context. Enforced by ESLint rule `sergeant-design/ai-marker-syntax` (warn).

| Marker                             | Purpose                                                                    | Example                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `// AI-NOTE: <text>`               | Contextual hint for future AI agents (not a human TODO)                    | `// AI-NOTE: coerce bigint→number; see rule #1`                                         |
| `// AI-CONTEXT: <text>`            | Architectural decision — _why_, not _what_ (rationale future AI must know) | `// AI-CONTEXT: tool виконується на клієнті — localStorage local-first, без round-trip` |
| `// AI-DANGER: <text>`             | High-risk zone — AI should confirm before changing                         | `// AI-DANGER: timing-safe comparison is critical here`                                 |
| `// AI-GENERATED: <generator>`     | File is generated — edit the generator, not this file                      | `// AI-GENERATED: from codegen.ts`                                                      |
| `// AI-LEGACY: expires YYYY-MM-DD` | Temporary code scheduled for removal                                       | `// AI-LEGACY: expires 2026-06-01`                                                      |

**Rules:**

- Use exactly these 5 prefixes followed by a colon and a space.
- Malformed variants (`AI-NOTES`, `AINOTE`, `AI_NOTE`, missing colon) trigger a lint warning.
- Do not spam markers — use only where they add genuine context for AI.
- `AI-NOTE` vs `AI-CONTEXT`: use `AI-NOTE` for short pointer-style hints ("see rule #1", "keep order stable"). Use `AI-CONTEXT` to record the _reason_ behind a non-obvious architectural choice that an agent might otherwise "clean up" (e.g. why two systems coexist, why a value is duplicated, why a sync write is intentional). The `sergeant-design/ai-marker-syntax` ESLint rule currently validates the original four prefixes; `AI-CONTEXT` is accepted but not yet enforced — extend the plugin in a follow-up if drift becomes a problem.

**`AI-LEGACY` expiry tracking:**

Every `// AI-LEGACY: expires YYYY-MM-DD` marker is also tracked by `pnpm lint:ai-legacy` (script `scripts/check-ai-legacy.mjs`). The PR-time gate in `.github/workflows/ai-legacy-scan.yml` fails if any tracked marker is past its expiry, and the weekly scheduled run files an idempotent GitHub issue for each expired marker so the cleanup gets queued instead of silently rotting in the codebase. Engineers can also download a colour-coded HTML dashboard from the `ai-legacy-dashboard` workflow artifact, or build it locally with `pnpm ai-legacy:dashboard`.

## Domain invariants

Things that bite hard if assumed wrong.

### Time and dates

- **Single source of truth: Europe/Kyiv.** All "today / yesterday / this week" UI logic computes day boundaries against `Europe/Kyiv` (UTC+2/+3 with DST).
- **Storage:** `timestamptz` in Postgres (UTC at rest), but read with `timezone('Europe/Kyiv', ts)` when bucketing by day in SQL.
- **Day key format:** `YYYY-MM-DD` interpreted in Kyiv local time. This is what `coachKeys.insight(dayKey)`, `digestKeys.byWeek(weekKey)`, and Routine streaks use.
- **Week start:** Monday (ISO 8601). `weekKey` = `YYYY-Www`.
- **Don't** use `new Date().toISOString().slice(0,10)` — it gives a UTC day, which flips a day at 21:00–22:00 Kyiv time and breaks Routine streaks for late-evening users.

### Money (UAH)

- **Database & API: minor units (kopiykas) as `number`** after bigint coercion. Mono webhook delivers minor units; we keep that representation through the stack.
- **UI display:** divide by 100 at render time only. For Finyk transactions and balances use `fmtAmt(minor, currencyCode?)` from `@sergeant/finyk-domain/lib/formatting` — it handles `+`/`-` sign and currency symbol consistently. For other contexts (insights, dashboards) write a thin local helper that wraps `(minor / 100).toLocaleString("uk-UA", { minimumFractionDigits: 2 })` rather than re-inlining the math at every call site.
- **Negative = expense, positive = income.** Match Mono's convention; transfers between own accounts come as a pair (-X on source, +X on destination) and are netted in budget calculations, not summed.

### Identity

- User IDs are Better Auth opaque strings (e.g. `I3BUW5atld8oOHM7lpFEJBIInpW1hzv7`). Do not assume UUID format. Cookies are HTTP-only; auth in tests goes via Better Auth test session helpers.

## Architecture: AI tool execution path

The HubChat assistant uses Anthropic tool-calling. Tools are **defined on the server**, **executed on the client** — server is a thin pass-through:

```
┌─────────────────┐    POST /api/chat        ┌────────────────────────┐
│ HubChat (web)   │ ──────────────────────▶  │ apps/server            │
│ apps/web/src/   │                          │ src/modules/chat/      │
│ core/HubChat.   │                          │  - chat.ts (handler)   │
│ tsx             │                          │  - tools.ts (TOOLS)    │
└─────────────────┘                          │  - toolDefs/*.ts       │
        ▲                                    └───────────┬────────────┘
        │ stream: text + tool_use blocks                 │
        │                                                ▼
        │                                    ┌────────────────────────┐
        │                                    │ Anthropic Messages API │
        │                                    │ (streaming, with tools)│
        │                                    └───────────┬────────────┘
        │                                                │
        │ ◀──────────────────────────────────────────────┘
        │
        ▼ tool_use{name,input}
┌──────────────────────────────────────┐
│ Client executor                      │
│ apps/web/src/core/lib/               │
│  hubChatActions.ts                   │
│   ├─ create_transaction → localStorage / api-client
│   ├─ log_meal → localStorage / api-client
│   ├─ start_workout → MMKV-web
│   ├─ mark_habit_done → localStorage
│   └─ … (one handler per tool)
└──────────────────────────────────────┘
        │ result text
        ▼ tool_result block sent back to model
┌──────────────────────────────────────┐
│ ChatMessage renders markdown + cards │
│ via hubChatActionCards.ts mapper     │
└──────────────────────────────────────┘
```

**Implications when changing tools:**

- A new tool needs three coordinated edits: `apps/server/src/modules/chat/toolDefs/<domain>.ts` (definition), `apps/web/src/core/lib/hubChatActions.ts` (executor), and (if user-visible) `hubChatActionCards.ts` + optionally `hubChatQuickActions.ts`.
- The server **does not** run tool side effects — never put DB writes in `chat.ts`. They go through the regular `apps/server/src/modules/<domain>/*` HTTP endpoints, called by the client executor.
- "Risky" tools (delete/forget/import) live in `RISKY_TOOLS` in `hubChatActionCards.ts` and get a "Критична дія" badge in the UI.

### `max_tokens` budget per request

`apps/server/src/modules/chat/chat.ts` uses two distinct `max_tokens` values, intentionally:

| Request                      | `max_tokens` | Where (chat.ts)                 | Why                                                                                                                                              |
| ---------------------------- | ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| First user-message chat call | **1500**     | line ~243, payload to Anthropic | Enough for a tool call + short reply, OR a structured direct-text answer with markdown formatting (3–6 sentences українською).                   |
| Tool-result continuation     | **2500**     | line ~181, follow-up payload    | Фінальна відповідь юзеру після tool_result — брифінги, підсумки, аналіз бюджету. Markdown-таблиці + кілька секцій легко займають 1.5–2k токенів. |

Do **not** lower these without testing the worst-case `/help` response and the largest tool-result blob (briefing + weekly summary go through the continuation path).
When Anthropic returns `stop_reason: "max_tokens"`, the model may truncate **mid-JSON-tool-call** — the client `executeAction` then throws a parse error and the user sees "Невідома дія". On the continuation path it instead truncates the user-facing markdown mid-sentence (this is what motivated the bump from 400→2500 / 600→1500 in PR #804). If you need a longer system prompt or more tools, raise `max_tokens` first; do not silently squeeze the budget.

**Auto-continuation ([PR #813](https://github.com/Skords-01/Sergeant/pull/813)): сервер сам дотягує обірвані текстові відповіді.** Якщо upstream віддав `stop_reason: "max_tokens"` і в `content` лише `text`-блоки (без `tool_use`), `callAnthropicWithContinuation` (non-stream) і `streamAnthropicToSse` (SSE) додають partial-text як останнє `assistant`-повідомлення і б'ють ще один upstream-виклик — Anthropic продовжить рівно з обриву. Cap — `MAX_TEXT_CONTINUATIONS = 3` (env `CHAT_MAX_TEXT_CONTINUATIONS`), бо runaway-генерація на N×max_tokens — це баг у промпті, а не легітимний кейс. **Не вимикай continuation як «оптимізацію»**: воно безпечне (паритет з ручним «продовж»), і саме воно ховає коротко-cap-нуті відповіді, поки `max_tokens` встановлений правильно. Якщо `tool_use` присутній у відповіді — continuation НЕ відбувається (бо далі має йти `tool_result` від клієнта, не assistant-text).

### `SYSTEM_PREFIX` is a prompt-cache candidate

`SYSTEM_PREFIX` (in `apps/server/src/modules/chat/toolDefs/systemPrompt.ts`) is the same on every request — only the appended `context` block varies. That makes it the natural target for Anthropic prompt caching (`cache_control: { type: "ephemeral" }` on the `system` array). Two consequences:

1. **Don't churn `SYSTEM_PREFIX`.** Each edit invalidates the cache for every active user, so a casual wording tweak can briefly multiply Anthropic spend. Batch prompt changes; bump a `SYSTEM_PROMPT_VERSION` constant when wiring caching so cache misses are observable.
2. **`context` (the dynamic data block) must stay outside the cached segment.** When caching is wired, the cached prefix is `SYSTEM_PREFIX` only; the per-user `context` is appended as a separate, non-cached `text` block.

Anthropic cache breakpoints have a model-specific minimum length and silently no-op below it: the request succeeds, but both `cache_creation_input_tokens` and `cache_read_input_tokens` stay `0`. In the PR #790 smoke, `SYSTEM_PREFIX` alone was ~987 tokens — below the Sonnet 1024-token floor observed there — so the viable Sergeant rollout also marks the last stable tool definition with `cache_control`. That tools breakpoint is the real cost win today; the `SYSTEM_PREFIX` marker stays forward-looking for when the prompt grows past the minimum.

See the `enable-prompt-caching` playbook for the actual rollout steps.

## Performance budgets

CI gates fail when these regress. Numbers come from `apps/web/package.json` → `"size-limit"` and the `Bundle size guard` workflow step ([#740](https://github.com/Skords-01/Sergeant/pull/740)).

| Metric                                | Budget             | Where enforced                                      |
| ------------------------------------- | ------------------ | --------------------------------------------------- |
| `apps/web` JS total (brotli)          | **≤ 615 kB**       | `pnpm --filter @sergeant/web exec size-limit` in CI |
| `apps/web` CSS (brotli)               | **≤ 22 kB**        | same                                                |
| Backend `/health` p95                 | < 100 ms           | (informal; track in Railway logs)                   |
| Anthropic `/api/chat` p95 first token | < 1.5 s            | (informal; will move to PostHog/Sentry once wired)  |
| Test suite total wall time            | < 60 s per package | turbo cache makes this implicit                     |

If you legitimately need to raise a limit (e.g. a major new dependency), bump the number in the same PR and call it out in the description so reviewers can sanity-check.

> **Implementation note:** `size-limit` paths in `apps/web/package.json` point to `../server/dist/assets/*` because the Vite build output is copied into the server's `dist/` directory for unified-mode serving (Replit/Railway). If the server build pipeline or `dist` layout changes, verify that `size-limit` paths still resolve — otherwise the budget check silently passes with zero files matched.

## Anti-patterns from past bugs

Real regressions we've shipped — do not repeat:

1. **bigint → string leaks ([#708](https://github.com/Skords-01/Sergeant/issues/708)).** Mono account balances suddenly went stringly-typed in the API; arithmetic in the dashboard silently produced `"123" + "456" = "123456"`. Fix: explicit `Number(r.id)` in serializers, snapshot tests on response shapes.
2. **`vitest.base.ts` ESM crash ([#720](https://github.com/Skords-01/Sergeant/pull/720)).** A `.ts` file behind `package exports` failed to load under Node's native ESM loader, and **every** package's `pnpm test` died. Lesson: shared config files exposed via `package.json` `exports` must be `.js` (with JSDoc types) or be transpiled, not raw `.ts`.
3. **Hardcoded RQ keys.** Several places had `["finyk", "transactions"]` inline; bulk-invalidate after a mutation missed half of them. Centralized factories make this impossible.
4. **One-shot DB migration that dropped a column.** Pre-deploy ran the migration before the new image started serving, so the still-warm old version crashed on the missing column. Two-phase migration policy (rule #4) prevents this.
5. **Skipped `// AI-DANGER` zone.** A subtle timing-safe comparison was rewritten as `===` during a "cleanup" PR. Catch them with `// AI-DANGER:` markers and lint warnings on malformed prefixes.
6. **Direct `localStorage.setItem` in chat tool handlers.** A handler that writes to localStorage via `localStorage.setItem` (instead of the project's `lsSet` helper) bypasses quota fallbacks **and** the cloud-sync queue used by `cloudsync`. Under a concurrent request (e.g. user fires two tool calls fast, or background sync runs) the local write and the cloud-sync write race — the user sees the change in the UI but the next device boot pulls a stale value from cloud. Always go through `ls` / `lsSet` (or `safeReadLS` / `safeWriteLS` / `createModuleStorage`); the same wrappers are also enforced by the `sergeant-design/no-raw-local-storage` ESLint rule.

## Soft rules (preferred)

- Branch naming: `devin/<unix-ts>-<short-area>-<desc>`. Example: `devin/1777137234-mono-bigint-coercion`.
- Tests next to code: `foo.ts` + `foo.test.ts` in the same folder (Vitest).
- Use path aliases (`@shared/*`, `@finyk/*`, etc.) instead of relative `../../../`.
- Dependency bumps — separate PRs (don't mix with features).
- When deleting a file — first `grep` its imports across the entire monorepo.
- ~~Documentation language: write new/updated prose docs in Ukrainian where practical.~~ **Promoted to Hard Rule #15 → "Doc-source-of-truth language" 2026-04-30.** Keep code identifiers, commands, API names, commit scopes, stack terms, and external quotes in their original language when that is clearer (still applies inside the hard rule's scope).

## Verification before PR

- `pnpm format:check` — must be green (Prettier; CI uses this exact command).
- `pnpm lint` — must be green.
- `pnpm typecheck` — must be green.
- `pnpm --filter <package> exec vitest run <path>` — for affected tests.
- When changing DB / API: `apps/server` tests must be green.
- When changing UI: take a screenshot and attach it to the PR description.
- **When bumping deps or shipping a heavy import:** `pnpm licenses:check` and `pnpm --filter @sergeant/web size` (bundle-size guard, budgets in `apps/web/package.json` → `size-limit`). Both are blocking CI steps.

## CI workflows

| Workflow                         | Trigger                     | Blocks PR? | Purpose                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | --------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                         | push / PR                   | Yes        | Lint, typecheck, test, build, audit (`--audit-level=high`), license check, bundle size                                                                                                                                                                                                                                                                     |
| `security-sla-reminder.yml`      | Monday 08:00 UTC / dispatch | No         | Comments on open `security:*` issues that breach SLA deadlines                                                                                                                                                                                                                                                                                             |
| `nightly-audit.yml`              | Daily 03:00 UTC / dispatch  | No         | Full `pnpm audit` (all severities) + OSV-Scanner dependency check + optional Snyk. Fails on critical/high; creates GitHub issue on failure. See [docs/security/nightly-audit.md](docs/security/nightly-audit.md)                                                                                                                                           |
| `posthog-release-annotation.yml` | push to `main` / dispatch   | No         | Posts a release annotation to PostHog API (`/api/projects/<id>/annotations/`) so deploys show up as vertical markers on every dashboard. Graceful no-op when `POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID` секрети не виставлені. See [docs/observability/frontend.md](docs/observability/frontend.md#release-annotations-github-actions--posthog-api) |

> Markdown link checker (in `docs-automation.yml`) runs with `--strict-external` against `docs/external-link-allowlist.json`. New external link rot fails the PR. To allow a URL the script cannot verify (immutable ADRs, anti-bot hosts, localhost-only references), add an entry with a non-trivial `reason` to the allowlist — empty/short reasons are rejected by the loader.

## Deployment

- **Frontend**: Vercel (preview deploy on each PR; free tier may rate-limit).
- **Backend**: Railway via `Dockerfile.api`. Pre-deploy: `pnpm db:migrate`. Health endpoint: `/health`.
- Migrations require `MIGRATE_DATABASE_URL` env (= public DB URL).

## Test users

- `I3BUW5atld8oOHM7lpFEJBIInpW1hzv7` — primary test user, 6 Monobank accounts, ~2 246 ₴ on UAH cards.

## See also

- [`docs/playbooks/README.md`](docs/playbooks/README.md) — full index of procedural recipes (with triggers and 🌳 decision-tree markers)
- [`docs/superpowers/agent-skills-catalog.md`](docs/superpowers/agent-skills-catalog.md) — canonical routing table for repo-owned Sergeant skills
- [`.agents/skills/`](.agents/skills/) — current `SKILL.md` files for AI agents; start with `sergeant-start-here`
- [`docs/security/audit-exceptions.md`](docs/security/audit-exceptions.md) — tracked vulnerabilities with no available fix (audit-exception label workflow)
- `docs/planning/ai-coding-improvements.md` — full roadmap for AI coding infra
- `docs/planning/dev-stack-roadmap.md` — top-15 dev-stack roadmap with progress
- `docs/integrations/monobank-roadmap.md`
- `docs/tech-debt/frontend.md`
- `docs/tech-debt/backend.md`
