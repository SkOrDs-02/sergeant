# Hard Rules — per-rule canonical files

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> One file per Hard Rule (full prose + BAD/GOOD examples). Compact summary table in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break). Registry: [`hard-rules.json`](../hard-rules.json). Matrix: [`hard-rules-matrix.md`](../hard-rules-matrix.md). Sync gate: `pnpm lint:hard-rules-registry`.

| #   | Rule                                                                                  | File                                                                                             |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | DB types: coerce `bigint` to `number` in serializers                                  | [`01-db-types-coerce-bigint-to-number.md`](./01-db-types-coerce-bigint-to-number.md)             |
| 2   | RQ keys: only via centralized factories                                               | [`02-rq-keys-via-centralized-factories.md`](./02-rq-keys-via-centralized-factories.md)           |
| 3   | API contract: server response shape ↔ `api-client` types ↔ test                       | [`03-api-contract-server-client-test.md`](./03-api-contract-server-client-test.md)               |
| 4   | SQL migrations: sequential, no gaps, two-phase for DROP                               | [`04-sql-migrations-sequential-two-phase.md`](./04-sql-migrations-sequential-two-phase.md)       |
| 5   | Conventional Commits: explicit scope enum                                             | [`05-conventional-commits-explicit-scope.md`](./05-conventional-commits-explicit-scope.md)       |
| 6   | No force push to main/master                                                          | [`06-no-force-push-to-main.md`](./06-no-force-push-to-main.md)                                   |
| 7   | Pre-commit hooks via Husky — do not skip                                              | [`07-pre-commit-hooks-via-husky.md`](./07-pre-commit-hooks-via-husky.md)                         |
| 8   | Tailwind colour-opacity steps must be on the registered scale                         | [`08-tailwind-colour-opacity-scale.md`](./08-tailwind-colour-opacity-scale.md)                   |
| 9   | Saturated brand fills behind `text-white` must use the `-strong` companion            | [`09-saturated-brand-fills-strong-companion.md`](./09-saturated-brand-fills-strong-companion.md) |
| 10  | Lifecycle markers — every file/doc declares its status                                | [`10-lifecycle-markers.md`](./10-lifecycle-markers.md)                                           |
| 11  | No arbitrary hex colors in `className`                                                | [`11-no-arbitrary-hex-in-classname.md`](./11-no-arbitrary-hex-in-classname.md)                   |
| 12  | Module-accent containment — no foreign accents inside a module subtree                | [`12-module-accent-containment.md`](./12-module-accent-containment.md)                           |
| 13  | No raw-palette light/dark `className` pairs                                           | [`13-no-raw-palette-light-dark-pairs.md`](./13-no-raw-palette-light-dark-pairs.md)               |
| 14  | Visible focus indicators must use `focus-visible:`, not `focus:`                      | [`14-focus-visible-not-focus.md`](./14-focus-visible-not-focus.md)                               |
| 15  | Read governance before coding; update docs alongside code; internal docs in Ukrainian | [`15-governance-and-doc-language.md`](./15-governance-and-doc-language.md)                       |
| 16  | Typography scale — semantic styles + 12px floor                                       | [`16-typography-scale-12px-floor.md`](./16-typography-scale-12px-floor.md)                       |
| 17  | Animation budget — max 2 concurrent, 3 tiers                                          | [`17-animation-budget.md`](./17-animation-budget.md)                                             |
| 18  | Module-size discipline — `max-lines: 600` for web TS/TSX                              | [`18-module-size-discipline-600.md`](./18-module-size-discipline-600.md)                         |
| 19  | Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo      | [`19-strict-mode-flag-canonical.md`](./19-strict-mode-flag-canonical.md)                         |
| 20  | No OpenClaw PATs in production                                                        | [`20-no-openclaw-pats-in-production.md`](./20-no-openclaw-pats-in-production.md)                 |
| 21  | Pino redaction policy enforced                                                        | [`21-pino-redaction-policy.md`](./21-pino-redaction-policy.md)                                   |
