# M16 — Telegram `parse_mode: "Markdown"` is the legacy variant

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | console                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/console/src/index.ts:128, 133` sends with `parse_mode: "Markdown"`. The
legacy parser has weaker escaping than `MarkdownV2` and tolerates zero-width
sequences that can be exploited if a future contributor accidentally
interpolates user input into a `Markdown`-formatted message.

## Recommendation

- Move every console / OpenClaw message to `MarkdownV2` and use the existing
  `escapeTelegramMarkdownV2` helper for any interpolated value.
- Add a lint guard / TODO that fails CI if `parse_mode: "Markdown"` is found
  in `apps/console`.

## Correction points

- `apps/console/src/index.ts` — replace `Markdown` with `MarkdownV2`;
  re-escape `HELP_TEXT` constants as needed.
- `apps/console/src/openclaw/*` — same treatment for any remaining call
  sites.
- `eslint.config.js` — add a `no-restricted-syntax` rule disallowing the
  literal string `"Markdown"` next to `parse_mode:`.

## Verification

- **Unit:** snapshot test of `HELP_TEXT` rendered through the new path
  produces unchanged user-visible output (only escapes differ).
- **Manual:** send `*bold*` and `_italic_` test messages; both render
  correctly under `MarkdownV2`.

## Cross-references

- [`./M17-console-global-rate-cap.md`](./M17-console-global-rate-cap.md)
