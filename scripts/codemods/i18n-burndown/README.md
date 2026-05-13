# `i18n-burndown` codemod

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

Migrates inline UA JSX literals (text + attribute strings) to references
to the central message catalog (`apps/web/src/shared/i18n/uk.ts`) and
drops the corresponding entries from
`apps/web/eslint.i18n-allowlist.json`. Long-running burndown for item
**#18** of the [web deep-dive
diagnostic](../../../docs/audits/2026-05-03-web-deep-dive/00-overview.md).

Unlike the one-shot codemods next to it (`strip-js-extensions/`,
`syncedKV/`), this script is meant to be **re-run** every time we widen
the catalog or want to pull more files out of the allowlist. It is
idempotent: a second run on the same tree is a no-op, because the
JSXText / JSX-attribute string literals it targets get rewritten to
JsxExpression references (`{messages.foo.bar}`) and no longer match the
source-text scan.

## Usage

```bash
# Dry run: prints which allowlist files would be fully migrated.
node scripts/codemods/i18n-burndown/script.mjs

# Apply: rewrites files in-place + drops migrated paths from
# apps/web/eslint.i18n-allowlist.json.
node scripts/codemods/i18n-burndown/script.mjs --write

# Limit to allowlist entries whose path contains a substring.
node scripts/codemods/i18n-burndown/script.mjs --filter=settings

# Verbose: also list every skipped file with the reason.
node scripts/codemods/i18n-burndown/script.mjs --verbose
```

## What it rewrites

For every allowlist entry, the script TS-AST-parses the file and looks
at two node shapes:

1. **`JsxText`** with a Cyrillic content (matching `/[\u0400-\u04FF]/`).
   Replaced as `<X>Закрити</X>` → `<X>{messages.actions.close}</X>` —
   only the trimmed slice is rewritten so leading / trailing whitespace
   stays put.
2. **`StringLiteral`** transitively inside a `JsxAttribute` (mirrors the
   ESLint rule's [`isInsideJsxAttribute`](../../../packages/eslint-plugin-sergeant-design/index.js)
   walker — stop on `JsxElement` / `JsxFragment`, return true on
   `JsxAttribute`). Two replacement shapes:
   - Direct attribute: `aria-label="Закрити"` →
     `aria-label={messages.actions.close}`
   - Nested expression: `aria-label={cond ? "X" : "Y"}` →
     `aria-label={cond ? messages.x : messages.y}`

The mapping table is derived **from the catalog itself** — the script
parses `apps/web/src/shared/i18n/uk.ts` once per run, walks the
`messages = { … }` object literal, and emits a
`Map<string, "messages.group.key">` for every leaf string value. There
is no hand-maintained literal table.

## Conservatism

A file is migrated **only if every Cyrillic JSX literal in it can be
mapped to a catalog key**. If even one literal is unmappable, the whole
file is skipped — we'd rather leave a file in the allowlist than ship a
half-migrated component where some strings live in the catalog and
others remain inline. Run `--verbose` to see the list of skipped files
and the reason (`partial: N mappable + M unmappable`,
`no-cyrillic-jsx`, `parseError: …`).

## Long-term enforcement

Drift back to inline literals is gated by the ESLint rule
[`sergeant-design/no-cyrillic-jsx-literal`](../../../packages/eslint-plugin-sergeant-design/index.js)
(warn-mode + allowlist), landed round 14. This codemod is intentionally
**NOT** a CI drift-check — burndown is gradual and per-PR; the
codemod is a labour-saving accelerator, not a hard gate.

## Re-running after the catalog grows

Whenever a new key is added to `apps/web/src/shared/i18n/uk.ts`, re-run
the codemod (dry-run first). Files that previously were skipped as
"partial" because of one unmappable string may now be fully mappable
and graduate out of the allowlist.

```bash
node scripts/codemods/i18n-burndown/script.mjs           # dry run
node scripts/codemods/i18n-burndown/script.mjs --write   # apply
```

## When this codemod becomes obsolete

When `apps/web/eslint.i18n-allowlist.json` is `[]` and the rule is
promoted to `"error"` (see
[`docs/i18n/readiness.md`](../../../docs/i18n/readiness.md) §
Phase 3), this codemod is no longer load-bearing. At that point:

1. Mark this file `// @deprecated` like the sibling one-shots.
2. Update the catalog table in `scripts/codemods/README.md` with the
   final-run round.
