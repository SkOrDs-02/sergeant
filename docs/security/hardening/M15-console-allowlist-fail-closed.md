# M15 — Confirm `CONSOLE_BOT_TOKEN` allowlist is fail-closed

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Closed (2026-05-04)

| Field          | Value                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Medium                                                                                                           |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                        |
| **Owner**      | console                                                                                                          |
| **Effort**     | 0.1 person-day                                                                                                   |
| **Status**     | Closed (2026-05-04) — `isUserAllowed` aligned with OpenClaw fail-closed pattern + table-driven regression matrix |
| **Discovered** | 2026-05-03 deep security review                                                                                  |

## Summary

`tools/console/src/security.ts` parses `CONSOLE_ALLOWED_TG_USER_IDS` and
gates the console bot. The audit confirms the OpenClaw bot is fail-closed
(empty list → reject everyone) but did not see equivalent test coverage for
`CONSOLE_BOT_TOKEN`. Empty / undefined env-var must reject, not allow.

## Recommendation

Add a regression test:

```ts
test("CONSOLE_BOT_TOKEN allowlist fails closed when empty", () => {
  expect(isUserAllowed("123", { CONSOLE_ALLOWED_TG_USER_IDS: "" })).toBe(false);
  expect(isUserAllowed("123", {})).toBe(false);
  expect(isUserAllowed(undefined, {})).toBe(false);
});
```

## Correction points

- `tools/console/src/security.test.ts` — add the table-driven test.
- `tools/console/src/security.ts` — if needed, defensively short-circuit the
  empty / undefined cases before parsing.

## Verification

- **Unit:** the new test fails before the fix and passes after.
- **Manual:** run the console with `CONSOLE_ALLOWED_TG_USER_IDS=` (empty);
  every command from any Telegram ID is rejected with the standard
  not-allowed message.

## Resolution (2026-05-04)

- `tools/console/src/security.ts` — `isUserAllowed` now mirrors the
  OpenClaw `isFounderAllowed` fail-closed contract (per
  [`tools/console/src/openclaw/security.ts`](../../../tools/console/src/openclaw/security.ts)):
  empty / undefined `ALLOWED_USER_IDS` returns `false` regardless of
  `NODE_ENV`. The previous `NODE_ENV !== "production"` fall-open path
  is removed — preview / staging deploys with a missing allowlist no
  longer let any Telegram user through.
- `tools/console/src/security.test.ts` — replaced the dev-only
  fall-open test with a `it.each` matrix that locks the fail-closed
  contract across `production` / `development` / `staging` / unset
  `NODE_ENV`, plus empty + whitespace-only `ALLOWED_USER_IDS` strings.
- Local-dev impact: contributors must export `ALLOWED_USER_IDS=<your-tg-id>`
  to interact with the dormant Console bot. No production behaviour
  change — production already required the allowlist.

## Cross-references

- [`./M17-console-global-rate-cap.md`](./M17-console-global-rate-cap.md)
