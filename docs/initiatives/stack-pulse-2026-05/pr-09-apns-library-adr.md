# PR-09: `@parse/node-apn` review (ADR-only)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Closed — ADR-0048 merged ([`docs/adr/0048-apns-provider-library.md`](../../adr/0048-apns-provider-library.md))

|              |                                                                   |
| ------------ | ----------------------------------------------------------------- |
| **Severity** | High (H3)                                                         |
| **Owner**    | TBD                                                               |
| **Effort**   | 0.5 дня (research + ADR)                                          |
| **Risk**     | Low (ADR-only)                                                    |
| **Touches**  | `docs/adr/0048-apns-provider-library.md`, `apps/server/src/push/` |

## Контекст

```jsonc
// apps/server/package.json:22
"@parse/node-apn": "^8.1.0"
```

`@parse/node-apn` — це fork оригінального `node-apn` (Argon Design), що з 2018-го непідтримуваний. Підтримує Apple Push Notification service, але:

- **Maintainership**: pakerwise — Parse Platform community fork. Активність — sporadic. Last release 2024-Q4 на момент написання.
- **APNs HTTP/2 protocol**: Apple offiicially deprecated binary protocol. `@parse/node-apn` мав bug-fixes для HTTP/2 але не всі edge-cases (token-rotation, JWT signing).
- **Альтернативи**:
  - `apns2` (npm: `apns2`) — modern HTTP/2-only, JWT-auth, активніше підтримується.
  - `firebase-admin` через FCM HTTP v1 → APNs (один client для FCM+APNs).
- Sergeant сьогодні використовує і FCM (для Android) і APNs — два library = два surface, два rotation flows.

## Scope

- **ADR-0048** з порівнянням `@parse/node-apn` vs `apns2` vs FCM-as-bridge.
- Decision criteria:
  - Maintainership age (last commit, issue response time).
  - HTTP/2 + JWT-token-auth fully supported.
  - Bundle size on server.
  - Rate-limit awareness.
- Якщо вибір ≠ status quo — окремий PR на migration з staged rollout.

## Out of scope

- Сама migration (це наступний PR після ADR).

## Acceptance criteria (DoD)

- [x] ADR-0048 з decision section — який саме library.
- [x] Comparison table: `@parse/node-apn` / `apns2` / `firebase-admin` / hand-rolled APNs.
- [x] Якщо decision = stay on `@parse/node-apn` → monitoring правило: re-open if last release > 12 months, high/critical advisory, auth/signing defect, or Node runtime breakage.

## Тести

- N/A (ADR-only).

## Rollout

- ADR-only PR, no runtime impact.

## Resolution note

Implemented as [`ADR-0048`](../../adr/0048-apns-provider-library.md) instead of
`ADR-0045`, because `0045` is already the Hard Rules taxonomy ADR. Current
decision: keep `@parse/node-apn`; re-open on stale release (>12 months),
high/critical advisory, APNs auth/signing defect, or Node runtime breakage.

## Risks & mitigations

| Risk                                       | Mitigation                                |
| ------------------------------------------ | ----------------------------------------- |
| Аналіз вкаже на migration, але cost-у нема | OK — рішення «defer until next iteration» |

## Touchpoints (file:line)

- `apps/server/package.json:22`
- `apps/server/src/push/` — APNs sender code
- `docs/adr/0048-apns-provider-library.md` — новий

## Refs

- [Apple APNs HTTP/2 docs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
- [`apns2` library](https://github.com/AndrewBarba/apns2)
