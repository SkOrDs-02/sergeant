# Rule 10 — Lifecycle markers — every file/doc declares its status

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #10. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- `packages/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- `docs/**/*.md`
- `scripts/**/*.{mjs,js}`

## Enforced by

- **eslint-rule** — sergeant-design/ai-marker-syntax (error)
- **ci** — pnpm lint:ai-legacy
- **ci** — pnpm dead-code:files (honours @scaffolded markers)

## Why / What is enforced

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

## Related

- **agents** — #10
