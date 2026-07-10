# L12 — iOS `NSAppTransportSecurity` audit

> **Last validated:** 2026-05-14 by Devin. **Next review:** 2026-08-12.
> **Status:** **Closed (2026-05-14)** — `apps/mobile-shell/scripts/check-info-plist.mjs` audits the generated Info.plist; wired into both iOS CI workflows (`mobile-shell-ios.yml`, `mobile-shell-ios-release.yml`) between `cap sync ios` and `xcodebuild`.

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | mobile                          |
| **Effort**     | 0.1 person-day                  |
| **Status**     | **Closed (2026-05-14)**         |
| **Discovered** | 2026-05-03 deep security review |

## Summary

Capacitor `cleartext: false` is correct, but it can be bypassed if iOS
`Info.plist` has `<key>NSAllowsArbitraryLoads</key><true/>`. Confirm the
production build sets this to `<false/>` (or omits the key entirely —
iOS's ATS default already blocks arbitrary cleartext).

## Implementation

The L12 spec listed a `.sh` script driven by PlistBuddy. We shipped it
as Node (`.mjs`) instead because:

1. The iOS CI workflows already run `setup-node` (Node **22**) before any
   iOS step, so no extra runtime dependency is needed on the macOS
   runners.
2. The Node script's hand-rolled XML-plist parser (`parseAtsDict`) runs
   unmodified on Linux dev boxes — contributors can lint and unit-test
   it via `node --test apps/mobile-shell/scripts/__tests__/check-info-plist.test.mjs`
   without an Xcode toolchain.

The audit fires AFTER `cap sync ios` (when the Capacitor template has
written `apps/mobile-shell/ios/App/App/Info.plist`) and BEFORE
`xcodebuild` consumes it — that is the only window in which the
generated plist actually exists on disk, because `apps/mobile-shell/ios/`
is intentionally uncommitted (regenerated each CI run; see
`apps/mobile-shell/.gitignore` and `apps/mobile-shell/README.md` → "iOS").

Blacklisted keys (any `true` is a fail):

- `NSAllowsArbitraryLoads`
- `NSAllowsArbitraryLoadsForMedia`
- `NSAllowsArbitraryLoadsInWebContent`
- `NSAllowsLocalNetworking`

`NSExceptionDomains` is allowed (per-domain ATS exceptions are the
supported escape hatch for documented cleartext endpoints; they would
also need an entry in `docs/04-governance/security/audit-exceptions.md`).

## Correction points

- `apps/mobile-shell/scripts/check-info-plist.mjs` — Node audit script.
- `apps/mobile-shell/scripts/__tests__/check-info-plist.test.mjs` —
  unit tests covering self-closing / open-close booleans, XML-commented
  keys, and the NSExceptionDomains escape hatch (`node --test`).
- `.github/workflows/mobile-shell-ios.yml` — `Audit iOS App Transport
Security (L12)` step between `Capacitor sync (ios)` and
  `Build App scheme for iOS Simulator`.
- `.github/workflows/mobile-shell-ios-release.yml` — same step between
  `Cache CocoaPods` and the unsigned-fallback / signed `xcodebuild`
  paths.

## Verification

- **CI:** the new script fails if a contributor flips the value.
- **Manual:** a release build attempts a cleartext request to `http://`;
  the request is rejected.

## Cross-references

- [`./H1-mobile-bearer-storage.md`](./H1-mobile-bearer-storage.md)
