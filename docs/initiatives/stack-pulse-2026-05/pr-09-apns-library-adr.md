# PR-09: `@parse/node-apn` review (ADR-only)

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Planned

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Severity** | High (H3)                                                       |
| **Owner**    | TBD                                                             |
| **Effort**   | 0.5 дня (research + ADR)                                        |
| **Risk**     | Low (ADR-only)                                                  |
| **Touches**  | `docs/adr/0045-apns-library-choice.md`, `apps/server/src/push/` |

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

- **ADR-0045** з порівнянням `@parse/node-apn` vs `apns2` vs FCM-as-bridge.
- Decision criteria:
  - Maintainership age (last commit, issue response time).
  - HTTP/2 + JWT-token-auth fully supported.
  - Bundle size on server.
  - Rate-limit awareness.
- Якщо вибір ≠ status quo — окремий PR на migration з staged rollout.

## Out of scope

- Сама migration (це наступний PR після ADR).

## Acceptance criteria (DoD)

- [ ] ADR-0045 з secured-vote section — який саме library.
- [ ] Comparison table: 3 features × 4 metrics.
- [ ] Якщо decision = stay on `@parse/node-apn` → додати monitoring правило: «Якщо last release > 12 months — re-open ADR».

## Тести

- N/A (ADR-only).

## Rollout

- ADR-only PR, no runtime impact.

## Risks & mitigations

| Risk                                       | Mitigation                                |
| ------------------------------------------ | ----------------------------------------- |
| Аналіз вкаже на migration, але cost-у нема | OK — рішення «defer until next iteration» |

## Touchpoints (file:line)

- `apps/server/package.json:22`
- `apps/server/src/push/` — APNs sender code
- `docs/adr/0045-apns-library-choice.md` — новий

## Refs

- [Apple APNs HTTP/2 docs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
- [`apns2` library](https://github.com/AndrewBarba/apns2)
