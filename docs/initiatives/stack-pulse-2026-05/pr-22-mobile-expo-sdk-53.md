# PR-22: Mobile Expo SDK 52 → 53 upgrade

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Planned

|                    |                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Severity**       | Medium (M6)                                                                            |
| **Linked finding** | M6 (`00-overview.md`)                                                                  |
| **Owner**          | TBD (sponsor: @Skords-01) — потрібен mobile-engineer                                   |
| **Effort**         | 3–5 днів (включно з Detox + EAS rebuild)                                               |
| **Risk**           | Medium (RN 0.76 → 0.77+, breaking changes у new architecture)                          |
| **Touches**        | `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/eas.json`, `patches/` |
| **Trigger**        | Q3 2026 — Expo SDK 53 GA (заявлено June 2026)                                          |

## Контекст

`apps/mobile/package.json:43`: `"expo": "~52.0.0"`, рядок 69: `"react-native": "0.76.9"`. SDK 52 був GA листопад 2025; SDK 53 GA очікується ~червень 2026 з RN 0.77+.

Lag-policy (Hard Rule N+1): тримаємо одну major-версію Expo назад від latest GA. Зараз ми на N (latest), але це означає ~6 місяців до forced upgrade при появі SDK 53.

Ризики «не оновлюватись завчасно»:

1. EAS Build deprecates older SDK images через ~9 місяців → CI breakage.
2. Expo Go (dev-mode) перестає підтримувати SDK 52.
3. Нові патчі безпеки RN 0.77+ не доходять до нас.
4. `@expo__cli@0.22.28.patch` (PR-20) може стати incompatible.

## Scope

### 1. Pre-flight ADR

`docs/adr/0055-expo-sdk-53-upgrade.md`:

- Compatibility matrix: всі native deps (`expo-notifications`, `expo-av`, `expo-image-picker`, `expo-secure-store`, etc.) — кожна має minimum-SDK-53 version?
- Breaking changes RN 0.76 → 0.77 (zero-config Hermes? new arch default? expo-router changes?)
- Patch compatibility: `@expo__cli@0.22.28.patch` rebase / drop / rewrite plan.

### 2. Branch upgrade

```bash
cd apps/mobile
npx expo install expo@~53.0.0
npx expo install --fix    # auto-bumps usual deps
pnpm install
```

### 3. Manual fixes

- `eas.json` build-profiles → нові SDK 53 image hashes.
- `metro.config.js` (якщо є custom resolver) → check API compatibility.
- iOS Pods rebuild (`apps/mobile/ios/Podfile.lock` regen).
- Android `gradle.properties` → AGP version bump.

### 4. Detox + EAS rebuild

- Detox iOS + Android — full run на новій SDK.
- EAS Preview build на TestFlight + Internal Track.
- 7-денний soak з 3+ internal testers.

### 5. Patches reapply

`patches/@expo__cli@0.22.28.patch` → пере-base на upstream-version-fix-у або на rewrite під SDK 53.

### 6. Documentation

- `docs/mobile/sdk-version-history.md` — додати entry "Upgraded SDK 52 → 53".
- Update `docs/mobile/expo-go-vs-dev-build.md` — нова min-version Expo Go.

## Out of scope

- React Native New Architecture (Fabric / TurboModules) — окремий ADR після SDK 53 stable.
- Перехід на `expo-router` v4+ — окремий PR.

## Acceptance criteria (DoD)

- [ ] ADR-0055 з compatibility matrix + breaking-change checklist.
- [ ] `apps/mobile/package.json` з `expo@~53.0.0` + RN bumped.
- [ ] `pnpm install` clean (no peer warnings beyond known whitelist).
- [ ] Detox iOS + Android pass на новому SDK.
- [ ] EAS Preview build на TestFlight + Internal Android Track.
- [ ] 7-денний soak на 3+ internal testers — no critical regressions.
- [ ] `patches/@expo__cli@0.22.28.patch` rebased або dropped (per ADR).
- [ ] `docs/mobile/sdk-version-history.md` updated.

## Тести

- Detox iOS suite (full) — green.
- Detox Android suite (full) — green.
- `apps/mobile/__tests__/` Jest tests — green.
- Manual smoke: login, sync, all 4 modules, push notifications.

## Rollout

1. PR-1: ADR-0055 standalone (no code).
2. PR-2: SDK 53 upgrade (after SDK 53 GA + 2-week minor stability period).
3. EAS Preview → 7d soak.
4. EAS Production rollout (staged): 10% → 50% → 100% per Apple Phased Release.

## Risks & mitigations

| Risk                                                           | Mitigation                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Native deps incompatible з SDK 53 (e.g., `expo-notifications`) | Pre-flight ADR matrix; гранична зупинка якщо ≥1 critical dep не готова     |
| New Architecture default-on у RN 0.77 → silent regressions     | `newArchEnabled: false` явно у `expo.app.json` до окремого опт-у           |
| Patch rebase fail-ить → CI red                                 | Drop patch якщо upstream вже містить fix; інакше оновлений patch у same PR |
| Production crash після rollout                                 | EAS Update rollback до попередньої версії в межах <1 год                   |

## Touchpoints (file:line)

- `apps/mobile/package.json:43` — `"expo": "~52.0.0"`
- `apps/mobile/package.json:69` — `"react-native": "0.76.9"`
- `apps/mobile/app.json` — sdkVersion field
- `apps/mobile/eas.json` — build profiles
- `apps/mobile/ios/Podfile.lock` — regen
- `apps/mobile/android/gradle.properties` — AGP version
- `patches/@expo__cli@0.22.28.patch` — rebase
- `docs/adr/0055-expo-sdk-53-upgrade.md` — new

## Refs

- [Expo SDK release roadmap](https://docs.expo.dev/versions/latest/)
- [React Native release notes](https://github.com/facebook/react-native/releases)
- ADR-0021 mobile sync-version policy
