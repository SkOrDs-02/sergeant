# Capacitor deep links — App Links (Android) + Universal Links (iOS)

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

Цей документ описує HTTPS-варіант deep-лінків для Capacitor-shell-а
(`apps/mobile-shell`), що доповнює custom scheme
`com.sergeant.shell://<path>`. HTTPS-посилання з email-ів / push / SMS
відкриваються в app напряму, без chooser-діалогу «Complete action
using…» (Android) і без зупинки у Safari (iOS).

## Короткий контракт

- **Custom scheme** (`com.sergeant.shell://scan`) — працював і раніше
  через `parseDeepLink()` + `App.addListener('appUrlOpen', ...)`; див.
  `apps/mobile-shell/src/index.ts` і `docs/architecture/platforms.md`.
- **HTTPS App Links / Universal Links** — нова форма, яку `parseDeepLink()`
  нормалізує до тієї ж React-Router-path. Хости перераховані в константі
  `DEEP_LINK_HTTPS_HOSTS` у тому ж файлі та мають бути синхронізовані з:
  - `AndroidManifest.xml` → HTTPS intent-filter з `autoVerify="true"`;
  - iOS entitlements `com.apple.developer.associated-domains`
    (`applinks:<host>`) — **коли буде додано `apps/mobile-shell/ios/`**;
  - `/.well-known/assetlinks.json` (Android DAL);
  - `/.well-known/apple-app-site-association` (iOS AASA).

Поточні hosts (див. `docs/mobile/overview.md` секція CORS — «prod»):

- `sergeant.vercel.app` — Vercel дефолт;
- `sergeant.2dmanager.com.ua` — кастомний prod-домен.

## Статичні файли

Файли-шаблони лежать у `apps/web/public/.well-known/`:

- `assetlinks.json` — Android Digital Asset Links;
- `apple-app-site-association` — iOS (БЕЗ розширення; Content-Type
  `application/json`).

Vite копіює `apps/web/public/` у `apps/server/dist/` при білді
(`apps/web/vite.config.js` → `build.outDir`), тому обидва файли
опиняються у `apps/server/dist/.well-known/`, звідки їх роздає Vercel
(`vercel.json` → `outputDirectory`).

### Vercel: заголовки та rewrite

У `vercel.json` додано:

- `headers` правило для `/.well-known/apple-app-site-association` і
  `/.well-known/assetlinks.json` — `Content-Type: application/json` +
  `Cache-Control: public, max-age=3600`.
- SPA rewrite `"/((?!api/|\\.well-known/).*)" → "/index.html"` явно
  **виключає** `.well-known/` — щоб catch-all не відбивав запити на
  `index.html` навіть гіпотетично (Vercel і так віддає статику раніше
  за rewrites, але defense-in-depth).

### Express (apps/server) дзеркало

Коли `apps/server` сервує фронт у Replit-режимі, `express.static` з
`apps/server/src/routes/frontend.ts` має `setHeaders`-callback, який
ставить `Content-Type: application/json; charset=utf-8` на обидва
`.well-known`-файли. Без цього iOS AASA-валідатор tiha відхиляв би
файл (дефолтний Content-Type на файл без розширення — порожній або
`application/octet-stream`).

## Android App Links — генерація `assetlinks.json`

1. Отримати SHA-256 із release-keystore (для debug-білда — debug
   keystore у `~/.android/debug.keystore`):

   ```bash
   keytool -list -v \
     -keystore <path-to-keystore>.jks \
     -alias <alias> \
     -storepass <password>
   ```

   У виводі знайти рядок `SHA256:` і скопіювати hex (без пробілів,
   залишивши двокрапки — Google Digital Asset Links приймає обидві
   форми).

2. Альтернативно — згенерувати JSON-фрагмент онлайн:
   <https://developers.google.com/digital-asset-links/tools/generator>
   Вставити `com.sergeant.shell` як package name і SHA-256 зверху.

3. Відредагувати `apps/web/public/.well-known/assetlinks.json`,
   замінивши `REPLACE_WITH_SHA256_FROM_SIGNING_KEYSTORE` на реальний
   fingerprint. Якщо релізний і debug-підпис різні — список може
   містити **обидва** fingerprints:

   ```json
   "sha256_cert_fingerprints": [
     "14:6D:E9:83:...release...",
     "A8:8B:7C:...debug..."
   ]
   ```

4. Задеплоїти на всі hosts з `DEEP_LINK_HTTPS_HOSTS`. Файл має
   віддаватись по `GET https://<host>/.well-known/assetlinks.json` з
   `Content-Type: application/json` та без редіректу.

5. Перевірити через Google Statement List Tester:
   <https://developers.google.com/digital-asset-links/tools/generator>
   → «Check that the statement file is...» внизу сторінки.

### Тест на девайсі

```bash
# Подивитись, чи Android перевірив domain-verification після встановлення APK:
adb shell pm get-app-links com.sergeant.shell

# Очікуваний вивід: "Domain verification state" → "verified" для обох hosts.

# Ручний тест відкриття:
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'https://sergeant.vercel.app/scan'

# Якщо state=none або !verified, форсувати перевірку:
adb shell pm verify-app-links --re-verify com.sergeant.shell
```

Посилання з email / SMS / Chrome intent відкриваються в app-і без
chooser-а тоді й тільки тоді, коли `pm get-app-links` показує
`verified` для кожного host-а.

## iOS Universal Links (тільки документація)

> **Зараз `apps/mobile-shell/ios/` не закомічено в репо.** Коли
> `ionic capacitor add ios` відбудеться — нижче checklist, який має
> виконати maintainer, щоб Universal Links запрацювали.

1. У Xcode відкрити target → Signing & Capabilities → «+ Capability»
   → **Associated Domains**. Додати для кожного host-а:

   ```
   applinks:sergeant.vercel.app
   applinks:sergeant.2dmanager.com.ua
   ```

   Це додає `com.apple.developer.associated-domains` у
   `App.entitlements`.

2. Знайти Team ID: Apple Developer portal → Membership → Team ID
   (формату `ABCDE12345`). У комбінації з bundle id
   `com.sergeant.shell` отримаємо AppID: `ABCDE12345.com.sergeant.shell`.

3. Відредагувати `apps/web/public/.well-known/apple-app-site-association`,
   замінивши `REPLACE_WITH_TEAM_ID` на реальний Team ID. Формат:

   ```json
   {
     "applinks": {
       "details": [
         {
           "appIDs": ["ABCDE12345.com.sergeant.shell"],
           "components": [{ "/": "/*" }]
         }
       ]
     }
   }
   ```

   Якщо для тих самих hosts у майбутньому будуть різні appIDs (RN
   `com.sergeant.app` + Capacitor `com.sergeant.shell`), обидва можна
   перерахувати у `appIDs` — iOS розв'язує колізію по першому
   entitlement-match.

4. Файл **має називатись саме** `apple-app-site-association` без
   розширення, віддаватись по HTTPS (не HTTP), без редіректів, з
   `Content-Type: application/json`. Перевірити:

   ```bash
   curl -I https://sergeant.vercel.app/.well-known/apple-app-site-association
   # очікуваний HTTP/2 200 + Content-Type: application/json

   curl https://sergeant.vercel.app/.well-known/apple-app-site-association | jq .
   ```

5. Після деплою — на реальному iOS-девайсі видалити app, передеплоїти
   через Xcode / TestFlight, перезапустити. iOS кешує AASA агресивно
   (до 24 годин); для CI-тестування Apple дозволяє debug-обхід:

   Settings → Developer → **Associated Domains Development** → Enable.
   Потім у схемі Run додати launch arg:

   ```
   -com.apple.developer.associated-domains.debug-mode 1
   ```

6. Тест: будь-яке повідомлення в Messages / Mail з
   `https://sergeant.vercel.app/<path>` → довгий тап → «Open in
   Sergeant Shell» має зʼявитись у меню. Тап по банеру на top-і
   Safari («Open in …») — теж валідний indicator.

## Тестові чек-листи

### Android

- [ ] `apps/web/public/.well-known/assetlinks.json` містить реальний
      SHA-256 (release + debug) і коректний `package_name`.
- [ ] Файл сервиться по HTTPS на всіх `DEEP_LINK_HTTPS_HOSTS` з
      `Content-Type: application/json` і без редіректів.
- [ ] Після `adb install` і перезапуску app-и
      `adb shell pm get-app-links com.sergeant.shell` показує
      `verified` для кожного host-а.
- [ ] `adb shell am start -a android.intent.action.VIEW -d 'https://sergeant.vercel.app/scan'`
      відкриває app на `/scan` (а не chooser).
- [ ] Custom scheme і далі працює:
      `adb shell am start -d 'com.sergeant.shell://scan'`.

### iOS

- [ ] `apps/web/public/.well-known/apple-app-site-association` містить
      валідний `<TEAM_ID>.com.sergeant.shell` і правильний
      components-паттерн.
- [ ] Файл сервиться БЕЗ розширення, з `Content-Type: application/json`,
      без редіректів, по всіх hosts-ах.
- [ ] Xcode Signing & Capabilities показує `applinks:<host>` для
      обох доменів, entitlement закомічено.
- [ ] SMS/Mail з `https://sergeant.vercel.app/scan` відкриває app-у
      напряму (чи через "Open in Sergeant Shell" у long-tap меню).
- [ ] Custom scheme і далі працює —
      `xcrun simctl openurl booted 'com.sergeant.shell://scan'`.

## Пов'язані файли

- `apps/mobile-shell/src/index.ts` — `parseDeepLink()` приймає обидві
  форми; `DEEP_LINK_HTTPS_HOSTS` — строгий allow-list hosts-ів.
- `apps/mobile-shell/android/app/src/main/AndroidManifest.xml` — два
  intent-filter-и: custom scheme (autoVerify=false) і HTTPS
  (autoVerify=true).
- `apps/web/public/.well-known/assetlinks.json` — Android DAL.
- `apps/web/public/.well-known/apple-app-site-association` — iOS AASA.
- `vercel.json` — Content-Type headers + rewrite-exclusion для
  `/.well-known/`.
- `apps/server/src/routes/frontend.ts` — Express static mirror з тим
  самим Content-Type override.
- `apps/mobile-shell/src/__tests__/parseDeepLink.test.ts` — unit-тести
  на всі edge-кейси (custom scheme, HTTPS, case-insensitivity,
  suffix-attack, userinfo-injection тощо).
