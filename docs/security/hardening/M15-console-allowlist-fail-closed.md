# M15 — Confirm `CONSOLE_BOT_TOKEN` allowlist is fail-closed

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | console                         |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`apps/console/src/security.ts` parses `CONSOLE_ALLOWED_TG_USER_IDS` and
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

- `apps/console/src/security.test.ts` — add the table-driven test.
- `apps/console/src/security.ts` — if needed, defensively short-circuit the
  empty / undefined cases before parsing.

## Verification

- **Unit:** the new test fails before the fix and passes after.
- **Manual:** run the console with `CONSOLE_ALLOWED_TG_USER_IDS=` (empty);
  every command from any Telegram ID is rejected with the standard
  not-allowed message.

## Cross-references

- [`./M17-console-global-rate-cap.md`](./M17-console-global-rate-cap.md)
