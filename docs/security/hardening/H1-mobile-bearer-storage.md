# H1 — Bearer token у мобільному shell без явного Keychain-accessibility

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Closed (Phase 1 — 2026-05-04). Phase 2 (TTL + device-binding) залишається відкритим, відстежується в [H3](./H3-session-revoke-and-binding.md).

| Field              | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High** (CVSS 7.4 — Mobile credential leakage via cross-device sync)                                   |
| **Sprint**         | [Sprint 1](./sprint-1.md)                                                                               |
| **Owner**          | mobile                                                                                                  |
| **Effort**         | 0.5 person-day                                                                                          |
| **Status**         | **Closed (Phase 1, 2026-05-04)** — secure-storage міграція на iOS Keychain + iCloud-sync OFF            |
| **Discovered**     | 2026-05-03                                                                                              |
| **Threat model**   | Information Disclosure → Account Takeover                                                               |
| **Affected files** | `apps/mobile-shell/src/auth-storage.ts`, `apps/mobile-shell/capacitor.config.ts`, `AndroidManifest.xml` |

## Summary

Bearer-token у `apps/mobile-shell` зберігається через `@capacitor/preferences` без явного `accessibility: kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. На iOS це означає Keychain з default-accessibility `kSecAttrAccessibleAfterFirstUnlock`, що дозволяє:

1. **iCloud Keychain sync** — токен синхронізується на всі девайси з тим самим AppleID.
2. **iOS device-backup** — токен потрапляє у iTunes/Finder backup без passcode і витягається тулзами типу iMazing.
3. На Android — `EncryptedSharedPreferences` (API 23+), але `android:allowBackup` за замовчуванням `true` → `adb backup` витягає shared_prefs.

Bearer-token має lifetime **30 днів** (Better Auth default), тому витік = повний доступ на місяць.

## Evidence

```ts
// apps/mobile-shell/src/auth-storage.ts:30–45
import { Preferences } from "@capacitor/preferences";

const BEARER_KEY = "auth.bearer";

export async function getBearerToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: BEARER_KEY });
  return value ?? null;
}

export async function setBearerToken(token: string): Promise<void> {
  await Preferences.set({ key: BEARER_KEY, value: token });
  // ↑ Немає { accessibility: 'AfterFirstUnlockThisDeviceOnly' }
  // ↑ Немає захисту від iCloud-sync
}
```

```ts
// apps/server/src/auth.ts:104–115
session: {
  expiresIn: 60 * 60 * 24 * 30,   // 30 days bearer lifetime
  updateAge: 60 * 60 * 24,
  cookieCache: { enabled: true, maxAge: 5 * 60 },
}
```

## Impact

1. **Cross-device leakage** — викрадений MacBook з iCloud Keychain unlock → bearer-token доступний → 30 днів повного доступу до Sergeant без знання пароля юзера.
2. **Forensic backup recovery** — `iMazing`/`iExplorer` витягують Keychain з iTunes-backup на seized iPhone → bearer.
3. **Android cloud-backup** — `adb backup -shared <com.sergeant.app>` (debug-mode device) витягає `shared_prefs/CapacitorStorage.xml`.
4. **Multi-account abuse** — якщо attack-vector — це partner-after-breakup сценарій (shared AppleID), iCloud-sync дає cross-device токен без явного opt-in.

## Recommendation

### Primary

1. **iOS — explicit accessibility**: мігрувати на `@capacitor-community/secure-storage-plugin` або `@capacitor/secure-storage` (якщо існує) з явним `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + `kSecAttrSynchronizable: false`.
2. **Android — disable backup**: `android:allowBackup="false"` АБО `android:dataExtractionRules` (API 31+) з `<exclude domain="sharedpref" path="CapacitorStorage.xml"/>`.
3. **Скоротити TTL bearer-tokenа до 7 днів** + rotation-on-use (Better Auth підтримує rolling refresh).

### Secondary (defense-in-depth)

- Додати **device-binding**: при login виставляти `device_id` (UUID, генерований раз і збережений у secure-storage), при `bearer auth` валідувати у БД.
- Розглянути перехід на **OAuth refresh-token flow** замість long-lived bearer (refresh-token = 30d, access-token = 15min, обидва store у secure-storage).
- На server-side, додати **`User-Agent` + `IP-prefix`-fingerprint** при першому use bearer-у; при сильному drift — forced re-auth (див. [H3](./README.md)).

## Correction points

| File / line                                                                      | Action                                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile-shell/src/auth-storage.ts:39`                                       | Виставити `accessibility: 'AfterFirstUnlockThisDeviceOnly'` АБО мігрувати на `@capacitor-community/secure-storage-plugin`. |
| `apps/mobile-shell/android/app/src/main/AndroidManifest.xml`                     | `android:allowBackup="false"` + `android:dataExtractionRules="@xml/data_extraction_rules"` (API 31+).                      |
| `apps/mobile-shell/android/app/src/main/res/xml/data_extraction_rules.xml` (new) | `<data-extraction-rules>` з `exclude domain="sharedpref"` для CapacitorStorage.                                            |
| `apps/mobile-shell/ios/App/App/Info.plist`                                       | Перевірити `<key>NSAllowsArbitraryLoads</key><false/>` (cleartext-fallback).                                               |
| `apps/server/src/auth.ts:104`                                                    | `expiresIn: 7 * 24 * 60 * 60` для bearer (короткий TTL + rolling refresh).                                                 |
| `apps/server/src/auth.ts:databaseHooks.session.create.before`                    | Зберігати `userAgent` + `ipPrefix` для device-binding (див. [H3](./README.md)).                                            |

## Verification

1. **Unit test** — `getBearerToken()` / `setBearerToken()` пишуть з правильним accessibility (mock Capacitor + assert call args).
2. **Manual cross-device test**:
   - iPhone-A: install + login + увімкнути iCloud Keychain backup.
   - iPhone-B: same AppleID, install Sergeant → перевірити, що bearer **НЕ** прийшов через iCloud → юзер мусить логінитись наново.
3. **Android backup-extraction test** — `adb backup -shared com.sergeant.app` → відкрити `shared_prefs/` → bearer **відсутній**.
4. **TTL test** — створити сесію → перемотати system clock на 8 днів → `req.user` = null (bearer expired).

## Cross-references

- [docs/security/hardening/sprint-1.md](./sprint-1.md) — sprint context.
- [docs/security/hardening/H3-session-revoke-and-binding.md](./H3-session-revoke-and-binding.md) (Sprint 2) — TTL + revoke-on-password-change (Phase 2 для H1).
- [docs/mobile/shell.md](../../mobile/shell.md) — Capacitor shell architecture.
- [Capacitor Preferences docs](https://capacitorjs.com/docs/apis/preferences) — accessibility-параметри.
- [Apple: kSecAttrAccessible](https://developer.apple.com/documentation/security/ksecattraccessible) — iOS Keychain accessibility constants.

## Resolution log

### 2026-05-04 — Phase 1 closed

Bearer-token мігровано з `@capacitor/preferences` (UserDefaults на iOS, plain
SharedPreferences на Android) у `@aparajita/capacitor-secure-storage` із явними
hardening-налаштуваннями:

- **iOS** → Keychain з `KeychainAccess.afterFirstUnlockThisDeviceOnly` (закриває
  cross-device-leak через encrypted device-backup; токен **не** мігрує на новий
  девайс при відновленні з backup-у іншого пристрою) і `setSynchronize(false)`
  (iCloud Keychain sync вимкнено — токен **не** з'явиться на іншому пристрої з
  тим самим AppleID).
- **Android** → AndroidX EncryptedSharedPreferences (AES-GCM, ключ у
  AndroidKeyStore). `android:allowBackup="false"` уже виставлено в
  `AndroidManifest.xml`, тому `adb backup -shared com.sergeant.shell` нічого
  не дістане.
- **Web** → fallback на `localStorage` (тільки для DevTools-браузера; у
  prod-bundle модуль динамічно імпортується тільки під `isCapacitor()`).

**Migration handling.** Для існуючих юзерів, що логінилися до Phase 1, додано
lazy one-shot міграцію у `getBearerToken()`: якщо secure-storage порожній,
читаємо `@capacitor/preferences`-ключ → переписуємо у secure-storage →
видаляємо з legacy. Якщо secure-storage write падає — повертаємо legacy-токен
без видалення (не валимо UX, наступний read спробує знову). Такий fall-forward
гарантує, що жоден юзер **не** буде розлогінений примусово; одночасно цей шлях
безпечний — токен переноситься в encrypted-storage перед видаленням з legacy.

**Tests** (`apps/mobile-shell/src/auth-storage.test.ts` — 15 кейсів, all pass):

1. **H1 hardening contract** (4 кейси) — `setSynchronize(false)` викликаний на
   першому read-і; `setDefaultKeychainAccess(afterFirstUnlockThisDeviceOnly)`
   викликаний на першому read-і; ці виклики НЕ повторюються для наступних
   операцій; падіння конфіг-фази не валить getBearerToken (graceful fallback).
2. **getBearerToken** (3) — повертає secure-value без legacy-call; повертає
   null коли обидва порожні; пробрасує помилку із secure-storage без legacy-fallback.
3. **legacy migration** (4) — мігрує legacy-токен → secure + чистить legacy;
   при secureSet-падінні повертає legacy без видалення; null-legacy = null;
   міграція виконується тільки один раз для серії read-ів.
4. **setBearerToken** (2) — записує у secure + чистить legacy; пробрасує
   виняток із secure-storage.
5. **clearBearerToken** (2) — видаляє з secure + з legacy-prefs; пробрасує
   виняток із secure-remove.

**Phase 2 (винесено окремо як [H3](./H3-session-revoke-and-binding.md)):**

- TTL bearer-tokenа з 30 днів до 7 днів + rolling refresh (Better Auth side).
- Device-binding: `userAgent` + `ipPrefix`-fingerprint при першому use bearer-у;
  при сильному drift — forced re-auth.
- Revoke-on-password-change.

Phase 2 — server-side зміна, що зачіпає бази (revocation table) і всіх існуючих
юзерів (forced re-login через 7 днів). Тримаємо її окремо від Phase 1, щоб
mobile rollout (потребує store-review від Apple/Google) не блокував server-side
hardening.

**Verification status:**

- ✅ Unit-тест на H1 hardening contract (15/15 pass).
- ✅ Web `bearerToken.test.ts` (gate навколо dynamic-import-у) — 12/12 pass,
  contract-shape стабільний.
- ⏳ Manual cross-device test (iPhone-A iCloud Keychain ON → iPhone-B same
  AppleID) — буде виконано після першого app-store rollout-у Phase 1
  (потребує signed build + 2 фізичних девайси).
- ⏳ Android `adb backup` test — потребує debug-build на фізичному Android.
  `android:allowBackup="false"` уже у манифесті, тож ризику drift немає.
- ⏳ TTL + rolling refresh — не тут, відстежується в H3.
