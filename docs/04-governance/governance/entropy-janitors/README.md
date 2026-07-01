# Entropy Janitors — Operator Notes

> **Last validated:** 2026-07-01 by @claude. **Next review:** 2026-09-29.
> **Status:** Active

This directory is the human-facing companion to the janitor workflow
(`.github/workflows/entropy-janitors.yml`) and the workspace package
`@sergeant/entropy-janitors`.

## What lives where

| File                                              | Purpose                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| `tools/entropy-janitors/src/doc-drift/`           | `doc-drift` janitor source                      |
| `tools/entropy-janitors/src/dead-code/`           | `dead-code` janitor source (Knip wrapper)       |
| `tools/entropy-janitors/src/dep-cycles/`          | `dep-cycles` janitor source (built-in resolver) |
| `tools/entropy-janitors/src/shared/`              | Logger (Pino redaction), output, git helpers    |
| `tools/entropy-janitors/src/__tests__/`           | Unit tests (`node --test`)                      |
| `tools/entropy-janitors/README.md`                | Local-usage doc                                 |
| `docs/04-governance/adr/0070-entropy-janitors.md` | Architectural decision record                   |
| `.github/workflows/entropy-janitors.yml`          | Weekly scheduled run + manual dispatch          |

## Triage checklist (when an issue lands)

1. **Read the title and label** — `entropy-janitor/<type>` and `tech-debt`.
2. **Open `dist/entropy-janitors/<type>/report.md`** (artefact) or the
   inline table in the issue body.
3. **Apply the lifecycle-marker table** from
   `.agents/skills/sergeant-tech-debt/SKILL.md § Scheduled janitors`.
4. **Fix or ignore**:
   - Real finding → open a focused cleanup PR.
   - False positive → add an `ignorePatterns` entry in the next PR that
     touches that surface, document the rationale here, and close the
     issue.

## Manual dispatch

```bash
gh workflow run entropy-janitors.yml
```

Artifacts are uploaded to the run as `entropy-janitor-reports` (30 days
retention).
