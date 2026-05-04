# M11 — No SAST lint rules for non-literal SQL / FS calls

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Closed (2026-05-04)

| Field          | Value                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Medium                                                                                                                                                   |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                                                                |
| **Owner**      | platform                                                                                                                                                 |
| **Effort**     | 0.25 person-day                                                                                                                                          |
| **Status**     | Closed (2026-05-04) — `eslint-plugin-security` wired for server + console with companion `no-restricted-syntax` selector and `Linter`-driven plugin test |
| **Discovered** | 2026-05-03 deep security review                                                                                                                          |

## Summary

The current SQL parameterisation and table-name allowlists are correct, but
nothing in lint forbids the next regression. A fresh contributor can
introduce a templated SQL string or a non-literal `fs` path without any
guard rail catching it.

## Recommendation

- Add `eslint-plugin-security` and enable
  `security/detect-non-literal-fs-filename`, `security/detect-eval-with-expression`,
  and `security/detect-non-literal-regexp`.
- Add a custom ESLint rule (or a `no-restricted-syntax`) that flags
  ``pool.query(`...${...}...`)`` patterns.

## Correction points

- `eslint.config.js` (or `.eslintrc`) — register the plugin and configure
  rules; `no-restricted-syntax` regex for templated `pool.query`.
- `package.json` — add the plugin via `pnpm add -D eslint-plugin-security`.
- `docs/security/audit-exceptions.md` — document any false positives that
  must be silenced.

## Verification

- **Unit:** a fixture file with `pool.query(\`SELECT … ${userId}\`)` makes
  the lint job fail.
- **CI:** the lint job runs the new rules; baseline run produces no new
  errors on the existing codebase.

## Resolution (2026-05-04)

- `package.json` — added `eslint-plugin-security@^4.0.0` (workspace
  root devDependency) so the plugin resolves identically across all
  workspaces.
- `eslint.config.js` — new server+console-scoped block (excludes
  tests, integration tests, the migrations test harness, and
  `apps/server/src/test/**`) registers `eslint-plugin-security` and
  enables three rules:
  - `security/detect-eval-with-expression` at `error` (zero call-sites
    in the codebase — any new occurrence blocks CI).
  - `security/detect-non-literal-fs-filename` at `warn` (signal in CI
    output without blocking on the audited dynamic-path baseline).
  - `security/detect-non-literal-regexp` at `warn` (same baseline
    rationale; CORS allowlist + persona-router slug regex are the
    only call-sites).
- `eslint.config.js` — companion `no-restricted-syntax` selector for
  `pool.query(\`…${…}…\`)` and bare `query(\`…${…}…\`)`whose first
argument is a`TemplateLiteral`with`expressions.length > 0`. A
multi-line static template literal (no `${…}`interpolation) is
intentionally **not** flagged — it's just SQL formatting. Level is`warn` so the existing dynamic-by-design call-sites (`SET LOCAL
  hnsw.ef_search = ${Math.floor(efSearch)}`, dynamic `WHERE`over
allowlisted columns, the syncV2 dynamic upsert engine) ship as-is;
promotion to`error`is tracked in`audit-exceptions.md` once the
longest-tail file (`syncV2.ts`) is migrated to a typed
`buildDynamicSelect()` helper.
- `packages/eslint-plugin-sergeant-design/__tests__/eslint-security-rules.test.mjs`
  — `Linter`-driven plugin test exercising all four rules: positive
  cases (`eval(userInput)`, `readFile(name)`, `new RegExp(input)`,
  templated `pool.query`/bare `query`) and negative cases (literal
  RegExp source, static multi-line `pool.query` without
  interpolation, parameterised `pool.query('… $1 …', [value])`). The
  test asserts both rule firing and message wording — accidental
  un-wiring of the plugin is caught here even though the rules ship
  at `warn` (which alone would not fail `pnpm lint`).
- `docs/security/audit-exceptions.md` — new "SAST baseline warnings"
  section enumerates every existing call-site that currently fires
  one of these rules, with the dynamic-by-design rationale and the
  promotion-to-error plan.

### Verification log (2026-05-04)

```bash
pnpm --filter @sergeant/server lint    # 0 errors, 25 warnings (audit baseline)
pnpm --filter @sergeant/console lint   # 0 errors, 1 warning  (audit baseline)
pnpm lint:plugins                      # 391 tests / 8 new passing
```

## Cross-references

- [`./I1-codeql-workflow.md`](./I1-codeql-workflow.md)
