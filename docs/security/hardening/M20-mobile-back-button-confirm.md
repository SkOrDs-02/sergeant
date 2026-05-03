# M20 — `App.exitApp()` on back without unsaved-state check

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Medium (mostly UX, light security implication) |
| **Sprint**     | [Sprint 3](./sprint-3.md)                     |
| **Owner**      | mobile                                        |
| **Effort**     | 0.25 person-day                               |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

`apps/mobile-shell/src/index.ts:264–283` exits the app on the hardware back
button when the navigation history is empty. A user mid-form loses unsaved
data; a malicious deep-link can also race the exit to suppress important
state changes (e.g. revoking a session) before they persist.

## Recommendation

- Confirm before exiting when the active route declares unsaved state.
- Fall back to a "press back again to exit" pattern for routes without
  unsaved data, with a 2-second debounce.

## Correction points

- `apps/mobile-shell/src/index.ts:264–283` — gate `App.exitApp()` behind a
  bridge call into the web app that returns `confirm | exit | cancel`.
- `apps/web/src/core/shell-bridge.ts` — register an `onBeforeExit` hook
  that pages can subscribe to.
- Add a regression test that mocks the bridge: form-with-unsaved-state
  blocks exit, confirmed exit succeeds.

## Verification

- **Unit:** bridge returns `cancel` → `App.exitApp` is not called.
- **Manual:** open a half-filled "add expense" form and press back; expect
  the confirm dialog, not an immediate exit.

## Cross-references

- [`./M19-mobile-deeplink-sanitize.md`](./M19-mobile-deeplink-sanitize.md)
