# M11 — No SAST lint rules for non-literal SQL / FS calls

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Medium                                        |
| **Sprint**     | [Sprint 3](./sprint-3.md)                     |
| **Owner**      | platform                                      |
| **Effort**     | 0.25 person-day                               |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

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

## Cross-references

- [`./I1-codeql-workflow.md`](./I1-codeql-workflow.md)
