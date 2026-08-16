# Hard Rules — per-rule canonical files

> **Last touched:** 2026-08-16 by @claude. **Next review:** 2026-12-12.
> **Status:** Active

> One file per Hard Rule (full prose + BAD/GOOD examples). Compact summary table in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break). Registry: [`hard-rules.json`](../hard-rules.json). Matrix: [`hard-rules-matrix.md`](../hard-rules-matrix.md). Sync gate: `pnpm lint:hard-rules-registry`.

| #   | Rule                                                                                  | File                                                                                       |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | DB types: coerce `bigint` to `number` in serializers                                  | [`01-db-types-coerce-bigint-to-number.md`](./01-db-types-coerce-bigint-to-number.md)       |
| 2   | RQ keys: only via centralized factories                                               | [`02-rq-keys-via-centralized-factories.md`](./02-rq-keys-via-centralized-factories.md)     |
| 3   | API contract: server response shape ↔ `api-client` types ↔ test                       | [`03-api-contract-server-client-test.md`](./03-api-contract-server-client-test.md)         |
| 4   | SQL migrations: sequential, no gaps, two-phase for DROP                               | [`04-sql-migrations-sequential-two-phase.md`](./04-sql-migrations-sequential-two-phase.md) |
| 5   | Conventional Commits: explicit scope enum                                             | [`05-conventional-commits-explicit-scope.md`](./05-conventional-commits-explicit-scope.md) |
| 6   | No force push to main/master                                                          | [`06-no-force-push-to-main.md`](./06-no-force-push-to-main.md)                             |
| 7   | Pre-commit hooks via Husky — do not skip                                              | [`07-pre-commit-hooks-via-husky.md`](./07-pre-commit-hooks-via-husky.md)                   |
| 10  | Lifecycle markers — every file/doc declares its status                                | [`10-lifecycle-markers.md`](./10-lifecycle-markers.md)                                     |
| 15  | Read governance before coding; update docs alongside code; internal docs in Ukrainian | [`15-governance-and-doc-language.md`](./15-governance-and-doc-language.md)                 |
| 18  | Module-size discipline — `max-lines: 600` for web TS/TSX and server TS/JS             | [`18-module-size-discipline-600.md`](./18-module-size-discipline-600.md)                   |
| 19  | Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo      | [`19-strict-mode-flag-canonical.md`](./19-strict-mode-flag-canonical.md)                   |
| 20  | No OpenClaw PATs in production                                                        | [`20-no-openclaw-pats-in-production.md`](./20-no-openclaw-pats-in-production.md)           |
| 21  | Pino redaction policy enforced                                                        | [`21-pino-redaction-policy.md`](./21-pino-redaction-policy.md)                             |
| 22  | Skill body security scan                                                              | [`22-skill-body-security-scan.md`](./22-skill-body-security-scan.md)                       |
| 23  | Archive-move depth integrity                                                          | [`23-archive-move-depth.md`](./23-archive-move-depth.md)                                   |
| 25  | Auto-generated docs marker                                                            | [`25-auto-generated-marker.md`](./25-auto-generated-marker.md)                             |
| 26  | PR ledger update on merge                                                             | [`26-pr-ledger-update-on-merge.md`](./26-pr-ledger-update-on-merge.md)                     |

Номери #8, #9, #11–#14, #16, #17 і #24 retired за [ADR-0081](../../adr/0081-repository-simplification.md) та не перевикористовуються.

## Ненумеровані ESLint-конвенції

Правила з механічним enforcement у `eslint-plugin-sergeant-design`, які не є нумерованими Hard Rules і не живуть у `hard-rules.json`:

- [`kyiv-time-helpers.md`](./kyiv-time-helpers.md) — явна доктрина межі доби в `apps/web/**` (ADR-0078): Kyiv для відображення/звітів, device-local для особистого дня.
- [`prefer-parse-body.md`](./prefer-parse-body.md) — `parseBody` / `parseQuery` замість sentinel-`validateBody` / `validateQuery`.
