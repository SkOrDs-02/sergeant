# @sergeant/entropy-janitors

> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-08.
> **Status:** Active

Scheduled entropy checks for the Sergeant monorepo.

This workspace package ships three independent janitors, each as a CLI:

| Janitor             | What it does                                                                                                                        | Issue label                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `doc-drift`         | scans `docs/`, `.agents/`, `.github/` and package READMEs for broken `path:line` references and missing RQ-key symbols              | `entropy-janitor/doc-drift`         |
| `dead-code`         | wraps Knip in JSON mode and reports unused files/exports/dependencies per workspace                                                 | `entropy-janitor/dead-code`         |
| `dep-cycles`        | finds circular dependencies in `apps/` and `packages/` via a built-in ESM resolver (no extra deps)                                  | `entropy-janitor/dep-cycles`        |
| `dualwrite-residue` | flags new raw LS/MMKV reads of module data (`finyk_*`, `fizruk_*`, …) outside the teardown allowlist; guards `residualImport` count | `entropy-janitor/dualwrite-residue` |

Janitors are scheduled weekly (Monday 06:00 UTC) by
[`.github/workflows/entropy-janitors.yml`](../../.github/workflows/entropy-janitors.yml)
and only ever create **issues** — never PRs (the human owner decides what to do
with the report).

## Local usage

```bash
pnpm install
pnpm --filter @sergeant/entropy-janitors doc-drift
pnpm --filter @sergeant/entropy-janitors dead-code
pnpm --filter @sergeant/entropy-janitors dep-cycles
pnpm --filter @sergeant/entropy-janitors dualwrite-residue
# or
pnpm --filter @sergeant/entropy-janitors all
```

Each subcommand accepts:

| Flag               | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `--root <path>`    | Repo root (default: cwd)                                                    |
| `--dry-run`        | Print summary, do not open a GitHub issue                                   |
| `--json`           | Emit machine-readable JSON to stdout                                        |
| `--out-dir <path>` | Write `report.md` + `report.json` (default: `dist/entropy-janitors/<kind>`) |
| `--limit <n>`      | Max findings (kind-specific default)                                        |
| `-h, --help`       | Show help                                                                   |

When run from a clean working tree with no findings, exit code is 0 and no
issue is opened. The issue is only opened when there is at least one finding
**and** no open issue with the same title already exists (`gh issue list --search in:title`).
This guards against weekly noise.

## Tests

```bash
pnpm --filter @sergeant/entropy-janitors test
pnpm --filter @sergeant/entropy-janitors typecheck
```

Tests cover: reference extraction, path normalisation, relative-import
resolution, cycle detection (DAG vs cyclic, dedup), output rendering,
GitHub-PAT redaction.

## Design notes

- **No new dependencies** beyond what Knip already pulls in (`tsx`, `knip`).
  The `dep-cycles` resolver is hand-rolled to satisfy the
  "no new deps without ADR" rule and to keep CI time low.
- **Pino redaction is applied to every log line** before it leaves the
  process (Hard Rule #21).
- **Issues only, never PRs** — keeps humans in the loop for janitor-driven
  changes; see ADR 0070.

## Related docs

- [ADR 0070 — Scheduled Entropy Janitors](../../docs/04-governance/adr/0070-entropy-janitors.md)
- [sergeant-tech-debt skill](../../.agents/skills/sergeant-tech-debt/SKILL.md) — section "Scheduled janitors"
