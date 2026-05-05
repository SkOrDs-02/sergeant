# M20 — `App.exitApp()` on back without unsaved-state check

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Closed

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Severity**   | Medium (mostly UX, light security implication)            |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                 |
| **Owner**      | mobile                                                    |
| **Effort**     | 0.25 person-day                                           |
| **Status**     | Closed (2026-05-05) — batched M20 + L1 + L14 hardening PR |
| **Discovered** | 2026-05-03 deep security review                           |

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

## Resolution

Shipped a press-back-twice-to-exit pattern with a 2-second debounce in
[`apps/mobile-shell/src/index.ts`](../../../apps/mobile-shell/src/index.ts).
When `canGoBack=false`, the first hardware-back tap does **not** call
`App.exitApp()`; instead it dispatches a `mobileshell:back-hint`
`CustomEvent` (web layer can show a toast "Press back again to exit")
and records the timestamp. Only a second tap within
`BACK_TO_EXIT_WINDOW_MS = 2000` invokes `App.exitApp()`. If the window
lapses or the user navigates back to a non-root route, the counter
resets — a racy deep-link that races for the exit can no longer suppress
in-flight state changes (e.g. session-revoke). The counter lives in
the listener closure (no module-scope state), so HMR's `initialized`
re-guard does not leave a dangling window after a re-import.

The richer `onBeforeExit` bridge for forms with unsaved state
(originally suggested in this card) is still possible as a follow-up,
but the press-twice-to-exit pattern alone closes the racy-exit
attack-surface and is the recommended Android UX.

4 regression tests in
[`apps/mobile-shell/src/index.test.ts`](../../../apps/mobile-shell/src/index.test.ts)
cover: (1) first tap dispatches hint and does NOT call `exitApp`,
(2) two taps within 2s call `exitApp` exactly once, (3) two taps with
3s gap reset the counter, (4) a successful intermediate `history.back`
resets the exit window.

## Cross-references

- [`./M19-mobile-deeplink-sanitize.md`](./M19-mobile-deeplink-sanitize.md)
