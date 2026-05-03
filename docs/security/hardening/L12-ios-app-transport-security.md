# L12 — iOS `NSAppTransportSecurity` audit

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Low                                           |
| **Sprint**     | [Sprint 4](./sprint-4.md)                     |
| **Owner**      | mobile                                        |
| **Effort**     | 0.1 person-day                                |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

Capacitor `cleartext: false` is correct, but it can be bypassed if iOS
`Info.plist` has `<key>NSAllowsArbitraryLoads</key><true/>`. Confirm the
production build sets this to `<false/>`.

## Recommendation

- Audit `apps/mobile-shell/ios/App/App/Info.plist`.
- Add a CI check (or a pre-archive script) that fails if any
  `NSAllowsArbitraryLoads` is set to `true`.

## Correction points

- `apps/mobile-shell/ios/App/App/Info.plist` — confirm `<false/>`.
- `apps/mobile-shell/scripts/check-info-plist.sh` (new) — invoked from
  Xcode build phase + CI.

## Verification

- **CI:** the new script fails if a contributor flips the value.
- **Manual:** a release build attempts a cleartext request to `http://`;
  the request is rejected.

## Cross-references

- [`./H1-mobile-bearer-storage.md`](./H1-mobile-bearer-storage.md)
