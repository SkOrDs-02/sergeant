# ADR-0048: APNs provider library

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** Active

- **Status:** Proposed
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Related:**
  - [ADR-0019 — Push notifications](./0019-push-notifications.md)
  - [`apps/server/src/push/apnsClient.ts`](../../apps/server/src/push/apnsClient.ts)
  - [`docs/initiatives/stack-pulse-2026-05/pr-09-apns-library-adr.md`](../initiatives/stack-pulse-2026-05/pr-09-apns-library-adr.md)

## Context and Problem Statement

Sergeant sends iOS native push notifications through `@parse/node-apn`.
The original stack-pulse finding marked the package as a risk because it is
a community fork of the older `node-apn` library and because native push is
credential-sensitive: APNs key rotation, environment selection, and invalid
token cleanup must keep working without silent delivery loss.

Current npm registry probe on 2026-05-06:

| Package           | Version  | Registry modified | Repository                     |
| ----------------- | -------- | ----------------- | ------------------------------ |
| `@parse/node-apn` | `8.1.0`  | 2026-04-12        | `parse-community/node-apn`     |
| `apns2`           | `12.2.0` | 2025-05-21        | `AndrewBarba/apns2`            |
| `firebase-admin`  | `13.8.0` | 2026-04-09        | `firebase/firebase-admin-node` |

The premise is therefore narrower than "abandoned library": `@parse/node-apn`
is not currently stale by release date. The remaining question is whether we
want a dedicated APNs client, a smaller HTTP/2-only APNs client, or a
Firebase-admin bridge that routes iOS delivery through FCM.

## Considered Options

| Option                              | Fit                                                          | Operational cost                        | Risk                                           |
| ----------------------------------- | ------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------- |
| Keep `@parse/node-apn`              | Matches current code; supports APNs token auth; no migration | Low                                     | Medium: community-maintained API surface       |
| Migrate to `apns2`                  | Smaller APNs-only surface; modern HTTP/2 focus               | Medium: rewrite client + tests          | Medium: lower project adoption, migration risk |
| Route APNs through `firebase-admin` | One provider library for Android + iOS via FCM               | High: FCM/APNs credential model changes | Medium-high: extra vendor hop for iOS          |
| Hand-roll APNs HTTP/2 client        | Maximum control                                              | High                                    | High: security-sensitive signing/retry code    |

## Decision

Keep `@parse/node-apn` for the current production path. Do not migrate until
there is a concrete defect, unpatched security advisory, or delivery feature
that the library cannot support.

This is a **hold with explicit re-open triggers**, not a permanent endorsement:

- Re-open this ADR if `@parse/node-apn` has no registry release for 12 months.
- Re-open immediately for an APNs auth/signing defect, Node runtime breakage,
  or an unpatched high/critical advisory.
- Re-open if Android/iOS delivery logic is consolidated around
  `firebase-admin` for another reason.

## Rationale

The current implementation already isolates APNs behind
`apps/server/src/push/apnsClient.ts`, and `sendToUser` treats APNs as one
delivery channel among APNs, FCM, and web push. A library migration would touch
credential parsing, retry classification, invalid-token cleanup, and test
mocks without removing an active runtime bug.

`apns2` is a plausible fallback if a dedicated APNs replacement is needed, but
switching now would be a speculative migration. `firebase-admin` would reduce
the number of provider libraries only if we also accept routing iOS delivery
through FCM; that is a product and operations decision, not just a dependency
choice.

## Consequences

- `@parse/node-apn` remains in `apps/server/package.json`.
- APNs code must stay behind the existing `apnsClient` wrapper; new call sites
  should not import the provider package directly.
- Dependency review should treat the package as watchlisted. A stale-release
  or advisory trigger opens a follow-up migration ADR/PR.
- PR-09 from the stack-pulse plan is satisfied as an ADR-only review; no
  runtime code change is required.
