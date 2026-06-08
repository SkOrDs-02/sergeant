# ADR-0063: Expo SDK 52 → 53 upgrade — pre-flight compatibility

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Accepted

- **Status:** Accepted <!-- Proposed | Accepted | Deprecated | Superseded by ADR-NNNN -->
- **Date:** 2026-06-06
- **Deciders:** @Skords-01
- **Supersedes:** — <!-- pre-flight only; no prior ADR replaced -->
- **Related:**
  - [`docs/90-work/initiatives/stack-pulse-2026-05/pr-22-mobile-expo-sdk-53.md`](../90-work/initiatives/stack-pulse-2026-05/pr-22-mobile-expo-sdk-53.md) — source PR plan (M6 finding)
  - [ADR-0050](./0050-typescript-major-version-policy.md) — TS major-version policy + Expo TS pinning
  - [ADR-0052](./0052-mobile-strategy-capacitor-primary.md) — Capacitor primary, Expo/RN parity track

---

## Context and Problem Statement

`apps/mobile` runs **Expo SDK 52** (`apps/mobile/package.json:44` → `"expo": "~52.0.0"`) on **React Native 0.76.9** (`:72`). SDK 52 went GA November 2025; SDK 53 GA is expected ~June 2026 with React Native 0.77+. The repo's lag-policy keeps mobile one Expo major behind latest GA, so SDK 53 GA starts a ~6-month clock before a forced upgrade.

Standing risk of upgrading late rather than early:

1. EAS Build deprecates older SDK images ~9 months after release → CI breakage.
2. Expo Go (dev mode) drops SDK 52 support.
3. RN 0.77+ security patches don't reach us.
4. `patches/@expo__cli@0.22.28.patch` (stack-pulse PR-20) may become incompatible against the SDK-53 `@expo/cli` line.

This ADR is the **pre-flight gate** for stack-pulse PR-22: it records the native-dep compatibility matrix, the RN 0.76 → 0.77 breaking-change checklist, the patch rebase/drop plan, and the TypeScript implications — so the actual bump PR is mechanical, not exploratory. **No SDK bump ships in this ADR.**

The current native-dep baseline (read from `apps/mobile/package.json`):

| Native dep                       | Current (SDK 52) | Target (SDK 53 min)                    | Notes                                                          |
| -------------------------------- | ---------------- | -------------------------------------- | -------------------------------------------------------------- |
| `expo`                           | `~52.0.0`        | `~53.0.0`                              | core; drives `expo install --fix` resolution                   |
| `react-native`                   | `0.76.9`         | `0.77.x` (SDK-53 pinned)               | New Architecture default-on upstream                           |
| `expo-notifications`             | `~0.29.14`       | `~0.30.x`                              | push lifecycle — highest-risk dep; verify APNs/FCM token flow  |
| `expo-image-picker`              | `~16.0.6`        | `~17.0.x`                              | permissions API stable across the bump                         |
| `expo-secure-store`              | `~14.0.1`        | `~15.0.x`                              | keychain/keystore — auth-token storage; smoke login after bump |
| `expo-network`                   | `~7.0.5`         | `~8.0.x`                               | offline/sync gating reads reachability here                    |
| `expo-camera`                    | `~16.0.0`        | `~17.0.x`                              | barcode/scan paths                                             |
| `expo-crypto`                    | `~14.0.2`        | `~15.0.x`                              | app-lock PBKDF2 (ADR-0054) consumer                            |
| `expo-sqlite`                    | `~15.1.4`        | `~16.0.x`                              | local-first store (ADR-0011)                                   |
| `expo-router`                    | `~4.0.21`        | `~5.0.x`                               | navigation; out-of-scope for behavior changes per PR-22        |
| `expo-file-system`               | `~18.0.12`       | `~19.0.x`                              | document/image export                                          |
| `react-native-reanimated`        | `~3.16.1`        | `~3.17.x`+                             | New-Arch-sensitive; Detox-cover animations                     |
| `react-native-screens`           | `~4.4.0`         | `~4.5.x`+                              | New-Arch-sensitive                                             |
| `react-native-gesture-handler`   | `~2.20.2`        | `~2.21.x`+                             | New-Arch-sensitive                                             |
| `react-native-safe-area-context` | `4.12.0`         | `5.x` (SDK-53)                         | major bump — insets API check                                  |
| `@sentry/react-native`           | `~6.10.0`        | verify SDK-53 / RN-0.77 support matrix | crash reporting must survive New-Arch                          |

> Exact minor/patch targets are resolved by `npx expo install --fix` against the SDK-53 manifest at bump time; the table records the major-version step and the per-dep risk, not pinned hashes. The hard gate: **every native dep above must publish an SDK-53-compatible version before the bump PR opens** (PR-22 acceptance — "≥1 critical dep not ready" stops the upgrade).

## Considered Options

1. **Pre-flight ADR now, bump PR after SDK 53 GA + 2-week stability window** — record compatibility + risk, ship the bump only once the ecosystem settles. (chosen)
2. **Bump immediately on SDK 53 GA** — no soak; highest regression exposure on a single-maintainer mobile track.
3. **Do nothing / stay on SDK 52** — accrues the four standing risks above; forced upgrade later under worse time pressure.

## Decision

Adopt **Option 1**. This ADR is the accepted pre-flight; the SDK 52 → 53 bump proceeds as stack-pulse PR-22 only after: (a) SDK 53 GA, (b) a 2-week minor-stability window, (c) every native dep in the matrix has a published SDK-53-compatible release. The bump PR carries the mechanical changes (`expo install --fix`, `eas.json` image hashes, Pods/Gradle regen) and is verified by the full Detox suite + a 7-day EAS Preview soak on ≥3 internal testers.

### New Architecture — KEEP `newArchEnabled: true` (accepted risk)

`apps/mobile/app.config.ts:170` already sets `newArchEnabled: true`. RN 0.77 makes the New Architecture (Fabric / TurboModules / Bridgeless) the upstream default, so this is already aligned with where SDK 53 lands. **The decision is to keep `newArchEnabled: true` through the upgrade** — we do **not** flip it to `false`.

This is recorded as an **accepted risk**: New-Arch-sensitive native deps (`react-native-reanimated`, `react-native-screens`, `react-native-gesture-handler`, `react-native-safe-area-context`, `@sentry/react-native`) can regress silently under Fabric. The mitigation is **verification via the Detox suite**, not opting out:

- Detox iOS + Android full run on SDK 53 with New-Arch ON is a hard gate before the bump merges.
- Animations, gesture/nav transitions, and safe-area insets get explicit Detox coverage because those are the New-Arch failure surfaces.
- Sentry crash reporting must be confirmed live post-bump (New-Arch can change the native crash-handler path).

> Note: stack-pulse PR-22's risk table proposed `newArchEnabled: false` as a mitigation. This ADR **overrides** that line: with New-Arch already ON in `app.config.ts` and default-on upstream in RN 0.77, reverting would be a regression and would diverge from the SDK-53 default. We hold the line and verify instead.

### Patch plan — `@expo__cli@0.22.28.patch`

`patches/@expo__cli@0.22.28.patch` is version-pinned to the SDK-52 `@expo/cli` line and will not apply against the SDK-53 `@expo/cli`. Plan, in order:

1. **Drop** the patch if the upstream SDK-53 `@expo/cli` already contains the fix (check upstream changelog for the patched behavior). Preferred outcome — one fewer patch to carry.
2. If not upstreamed, **rebase** the patch onto the new `@expo/cli` version in the **same** bump PR, renaming to the new `patches/@expo__cli@<new-version>.patch`.
3. CI `pnpm install` must be clean (patch applies or is absent) — a failing patch apply is a red gate, not a follow-up.

### TypeScript implications

Per [ADR-0050](./0050-typescript-major-version-policy.md), mobile is pinned to **TS 5.9.x** (Expo SDK 52 constraint) while server/web/packages run TS 6.x and `tools/openclaw` runs TS 5.7.x. SDK 53 ships its own `expo/tsconfig.base` and `@types/react` expectations:

- Re-validate the mobile TS pin against the SDK-53 toolchain. If SDK 53 raises the supported TS floor, bump the mobile pin **within** ADR-0050's policy and update that ADR's matrix in the bump PR — do not silently drift.
- `@types/node` stays pinned to `^20` via the root `pnpm.overrides` (ADR-0050); SDK 53 does not change that.
- `@types/react` is currently `~18.3.29` (`apps/mobile/package.json:88`) with `react@18.3.1`; confirm SDK 53 stays on React 18 (it does not force React 19) so the types pin holds.

## Rationale

A pre-flight ADR de-risks a single-maintainer mobile bump by converting an exploratory upgrade into a checklist with hard gates. Keeping New-Arch ON avoids a backward step and matches the RN 0.77 / SDK 53 default, trading a known verification cost (Detox coverage) for staying on the supported path. Deferring the bump past GA + a 2-week window buys ecosystem stability for the native-dep matrix, which is where the real breakage lives.

## Consequences

### Positive

- The bump PR is mechanical and gated, not exploratory.
- Mobile stays on the upstream-default architecture (New-Arch), avoiding a future second migration.
- Native-dep readiness is an explicit go/no-go gate, so a not-yet-ready dep stops the upgrade cleanly.

### Negative

- New-Arch-ON adds Detox coverage burden (animations, gestures, insets, crash reporting) as a hard pre-merge gate.
- The `@expo/cli` patch must be re-resolved (drop or rebase) in the same PR — extra work if not upstreamed.
- Possible mobile TS-pin bump cascades into an ADR-0050 matrix edit.

### Neutral

- No change to the Capacitor-primary mobile strategy (ADR-0052); this is the Expo/RN parity track.
- `expo-router` v5 behavior changes stay out of scope (PR-22 §Out of scope) — version-aligned only.
- No CI-topology change beyond `eas.json` image hashes and the Detox gate.

## Compliance

- Bump does not merge until: Detox iOS + Android green on SDK 53 (New-Arch ON), EAS Preview 7-day soak on ≥3 testers with no critical regressions, clean `pnpm install` (patch resolved), and `docs/02-engineering/mobile/sdk-version-history.md` updated — per the PR-22 DoD checklist.
- Every native dep in the matrix must show an SDK-53-compatible published version before the PR opens; `npx expo install --fix` output is the evidence.
- Any mobile TS-pin change is reflected in [ADR-0050](./0050-typescript-major-version-policy.md) in the same PR.

## Links

- [`docs/90-work/initiatives/stack-pulse-2026-05/pr-22-mobile-expo-sdk-53.md`](../90-work/initiatives/stack-pulse-2026-05/pr-22-mobile-expo-sdk-53.md) — source plan + acceptance criteria
- [Expo SDK release roadmap](https://docs.expo.dev/versions/latest/)
- [React Native release notes](https://github.com/facebook/react-native/releases)
