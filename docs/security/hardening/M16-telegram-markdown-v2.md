# M16 — Telegram `parse_mode: "Markdown"` is the legacy variant

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04)

| Field          | Value                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | Medium                                                                                                                                                                               |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                                                                                            |
| **Owner**      | console                                                                                                                                                                              |
| **Effort**     | 0.25 person-day                                                                                                                                                                      |
| **Status**     | Closed (2026-05-04) — call-sites migrated to MarkdownV2; ESLint plugin rule `sergeant-design/no-legacy-telegram-parse-mode` blocks regressions; HELP_TEXT snapshot test locks output |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                      |

## Summary

`tools/openclaw/src/index.ts:128, 133` sends with `parse_mode: "Markdown"`. The
legacy parser has weaker escaping than `MarkdownV2` and tolerates zero-width
sequences that can be exploited if a future contributor accidentally
interpolates user input into a `Markdown`-formatted message.

## Recommendation

- Move every console / OpenClaw message to `MarkdownV2` and use the existing
  `escapeTelegramMarkdownV2` helper for any interpolated value.
- Add a lint guard / TODO that fails CI if `parse_mode: "Markdown"` is found
  in `tools/openclaw`.

## Correction points

- `tools/openclaw/src/index.ts` — replace `Markdown` with `MarkdownV2`;
  re-escape `HELP_TEXT` constants as needed.
- `tools/openclaw/src/openclaw/*` — same treatment for any remaining call
  sites.
- `eslint.config.js` — add a `no-restricted-syntax` rule disallowing the
  literal string `"Markdown"` next to `parse_mode:`.

## Verification

- **Unit:** snapshot test of `HELP_TEXT` rendered through the new path
  produces unchanged user-visible output (only escapes differ).
- **Manual:** send `*bold*` and `_italic_` test messages; both render
  correctly under `MarkdownV2`.

## Resolution (2026-05-04)

- `tools/openclaw/src/help-text.ts` (new) — `HELP_TEXT` is now built from
  a list of `{bold, italic, plain}` pieces; each piece runs through
  `escapeTelegramMarkdownV2`, and the renderer wraps the bold/italic
  pieces with literal `*…*` / `_…_` markers. This is robust by
  construction: a future addition cannot accidentally drop an escape
  because the helper is the only string-producing path.
- `tools/openclaw/src/help-text.test.ts` (new) — three locking tests:
  - inline snapshot of the rendered MarkdownV2 string;
  - invariant that every MarkdownV2 special char outside the
    formatting markers is preceded by `\\`;
  - parity invariant that `*` and `_` markers come in pairs.
- `tools/openclaw/src/index.ts` — `/start` and `/help` send with
  `parse_mode: "MarkdownV2"`; the legacy hand-written `HELP_TEXT`
  literal was removed in favour of the renderer.
- `tools/openclaw/src/openclaw/handler.ts` — two remaining `parse_mode:
"Markdown"` call-sites at the council loop migrated to MarkdownV2:
  `*${PERSONA_LABEL[persona]}* думає…` now escapes the label and the
  trailing prompt; the synthesis header stays a static literal.
- `packages/eslint-plugin-sergeant-design/index.js` — new rule
  `no-legacy-telegram-parse-mode`. Custom plugin rule (rather than
  `no-restricted-syntax`) because the existing M11 templated-query
  selectors already own `no-restricted-syntax` in `tools/openclaw/**` and
  flat-config rule values do not merge — last block wins. The rule
  only matches object-property `parse_mode: "Markdown"`, so the
  parse-mode-guard regression test (which contains the literal string
  inside a regex) keeps compiling cleanly.
- `packages/eslint-plugin-sergeant-design/__tests__/no-legacy-telegram-parse-mode.test.mjs`
  (new) — 9 cases covering the BAD/GOOD inputs and the regex-literal
  exemption.
- `eslint.config.js` — wires the new plugin rule at "error" level on
  `tools/openclaw/src/**/*.{js,ts}`.

### Verification log (2026-05-04)

- Unit: `pnpm lint:plugins` → 400/400 passed (includes the 9 new
  cases).
- Unit: `pnpm --filter @sergeant/openclaw test` → 205/205 passed
  (includes the new snapshot, escape-invariant, and marker-parity
  tests; the existing parse-mode-guard regression test continues to
  pass).
- `pnpm --filter @sergeant/openclaw lint` → 0 errors, 1 baseline
  warning (`router.ts:48` `security/detect-non-literal-regexp`,
  pre-existing M11 baseline finding tracked in
  `audit-exceptions.md`). The new plugin rule fires cleanly with zero
  baseline.
- `pnpm --filter @sergeant/openclaw typecheck` → clean.
- **Manual:** `*bold*` and `_italic_` rendered correctly under
  `MarkdownV2` in dev. The HELP_TEXT snapshot proves the rendered
  output (which is the user-visible string) is exactly what we
  intend.

## Cross-references

- [`./M17-console-global-rate-cap.md`](./M17-console-global-rate-cap.md)
