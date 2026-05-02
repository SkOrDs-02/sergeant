# Mobile-білди — команди для локальної розробки

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Короткий operator-oriented довідник по Capacitor-shell-у (`@sergeant/mobile-shell`). Дизайн-обґрунтування, список плагінів і історію shell-а — див. [`apps/mobile-shell/README.md`](../../apps/mobile-shell/README.md). Для Expo / React Native застосунку (`@sergeant/mobile`) — див. [`apps/mobile/README.md`](../../apps/mobile/README.md) і [`overview.md`](./overview.md).

Capacitor-shell обгортає існуючий Vite-бандл `@sergeant/web` як нативний Android/iOS-застосунок. Web-бандл лягає в `apps/server/dist` — shell читає його звідти через `webDir: "../server/dist"` у [`apps/mobile-shell/capacitor.config.ts`](../../apps/mobile-shell/capacitor.config.ts).

> Shell білдить web-бандл через `pnpm --filter @sergeant/mobile-shell build:web`, який делегує до `@sergeant/web build:capacitor` (`VITE_TARGET=capacitor`). Цей варіант вимикає `vite-plugin-pwa`, тому `sw.js`, `manifest.webmanifest` і `virtual:pwa-register` chunk **не** потрапляють у `apps/server/dist` — native WebView їх все одно ігнорує. Для web-деплою (Vercel) і далі використовується root `pnpm build:web`, PWA-поведінка без змін.

## Передумови

| Інструмент        | Версія             | Нотатки                                                        |
| ----------------- | ------------------ | -------------------------------------------------------------- |
| Node.js           | 20.x (див. .nvmrc) | `nvm install 20 && nvm use 20`                                 |
| pnpm              | 9.15.1             | `corepack enable && corepack prepare pnpm@9.15.1 --activate`   |
| JDK               | 21 (Temurin)       | потрібен для Capacitor 7.6+ (компілює у VERSION_21) / AGP 8    |
| Android SDK       | API 35             | `compileSdk=35`, `minSdk=23` (Android Studio або `sdkmanager`) |
| Xcode + CocoaPods | latest stable      | тільки macOS, тільки iOS                                       |

## Android — debug APK

Папка `android/` уже закомічена, тож scaffolding не потрібен.

```bash
# з кореня репо
pnpm install --frozen-lockfile
# `mobile-shell#build:web` делегує до `@sergeant/web build:capacitor`
# (`VITE_TARGET=capacitor`), який вимикає `vite-plugin-pwa` — shell не
# тягне `sw.js` / `manifest.webmanifest` / `virtual:pwa-register` chunk.
# Для чистого web-деплою все ще використовується root `pnpm build:web`.
pnpm --filter @sergeant/mobile-shell build:web # → apps/server/dist
pnpm --filter @sergeant/mobile-shell exec cap sync android
cd apps/mobile-shell/android
./gradlew assembleDebug                        # → app/build/outputs/apk/debug/
```

Встановити на підключений девайс:

```bash
./gradlew installDebug
```

Відкрити в Android Studio (для дебагу з брейкпойнтами / контролю емулятора):

```bash
pnpm --filter @sergeant/mobile-shell open:android
```

`pnpm --filter @sergeant/mobile-shell build:android` — це зручний alias для `pnpm build:web && pnpm --filter @sergeant/mobile-shell sync android`.

## iOS — debug-білд для Simulator-а

`apps/mobile-shell/ios/` свідомо **не** закомічено — він регенерується при першому запуску через `cap add ios` (який під капотом робить `pod install`). Потрібен macOS + Xcode + CocoaPods.

```bash
# з кореня репо
pnpm install --frozen-lockfile
# Capacitor-варіант web-бандла (без `vite-plugin-pwa`).
pnpm --filter @sergeant/mobile-shell build:web # → apps/server/dist

cd apps/mobile-shell
pnpm exec cap add ios                          # лише перший раз — scaffolds ios/
pnpm exec cap sync ios                         # подальші sync-и

# Запуск у Simulator-і з Xcode
pnpm exec cap open ios

# …або білд із CLI без Xcode UI
cd ios/App
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build
```

`pnpm --filter @sergeant/mobile-shell build:ios` запускає web-білд + `cap sync ios` (він **не** запускає `cap add ios` — це треба зробити один раз вручну на свіжій машині).

## CI

Два окремі workflow-и білдять shell на кожному PR, який чіпає `apps/mobile-shell/**`, `apps/web/**`, `apps/server/**` або `packages/**`:

| Workflow                                                                       | Runner          | Output                                                       |
| ------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------ |
| [`mobile-shell-android.yml`](../../.github/workflows/mobile-shell-android.yml) | `ubuntu-latest` | Debug APK заливається як артефакт `sergeant-shell-debug-apk` |
| [`mobile-shell-ios.yml`](../../.github/workflows/mobile-shell-ios.yml)         | `macos-latest`  | Simulator `.app` (build-only, без артефакта)                 |

Обидва debug-джоби запускають `pnpm build:web` → `cap sync <platform>` → нативний білд без підпису. Підписані / release-лейни живуть в окремих workflow-ах — див. [§ Release — iOS](#release--ios) і [§ Release — Android](#release--android).

Окремі Detox-сьюти (`detox-android.yml`, `detox-ios.yml`) покривають Expo / React Native застосунок у `apps/mobile/` — вони не стосуються Capacitor-shell-а.

## Release — iOS

Release-лейн живе в [`mobile-shell-ios-release.yml`](../../.github/workflows/mobile-shell-ios-release.yml) на `macos-latest`. Тригериться на push тегів формату `v*` і на ручний `workflow_dispatch`; PR-time workflow `mobile-shell-ios.yml` лишається без змін.

Джоб запускає unsigned Simulator-fallback (ідентичний PR-time workflow), доки не присутні всі підписувальні секрети нижче. Як тільки вони є — джоб архівує `App.xcarchive`, експортує підписаний `.ipa` через [`apps/mobile-shell/ci/ExportOptions.plist`](../../apps/mobile-shell/ci/ExportOptions.plist) (рендериться через `envsubst`), заливає IPA як GitHub-артефакт (`sergeant-shell-ipa`, retention 14 днів), і шле його у TestFlight через `apple-actions/upload-testflight-build@v1`.

### Потрібні repo-секрети

| Секрет                              | Звідки взяти                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APPLE_BUILD_CERTIFICATE_BASE64`    | Apple Developer Portal → Certificates, Identifiers & Profiles → **Certificates** → створити **Apple Distribution** cert → завантажити `.cer` → імпортувати в Keychain Access → експортувати як `.p12` → `base64 -i ios_distribution.p12 \| pbcopy`.                   |
| `APPLE_P12_PASSWORD`                | Пароль, який ви виставили при експорті `.p12` вище.                                                                                                                                                                                                                   |
| `APPLE_PROVISIONING_PROFILE_BASE64` | _(Опційно — потрібно тільки якщо ви не використовуєте ASC API для авто-завантаження.)_ Apple Developer Portal → **Profiles** → створити **App Store** profile для `com.sergeant.shell` → завантажити `.mobileprovision` → `base64 -i sergeant-shell.mobileprovision`. |
| `APPLE_KEYCHAIN_PASSWORD`           | Будь-який сильний випадковий рядок. Per-run keychain-пароль (`openssl rand -hex 32`).                                                                                                                                                                                 |
| `APP_STORE_CONNECT_API_KEY_ID`      | App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** → створити ключ із роллю **App Manager** → скопіювати 10-символьний **Key ID**.                                                                                               |
| `APP_STORE_CONNECT_API_ISSUER_ID`   | Той самий екран → **Issuer ID** угорі (UUID). Спільний для всіх ключів у команді.                                                                                                                                                                                     |
| `APP_STORE_CONNECT_API_KEY_BASE64`  | Той самий екран → завантажити `.p8` (one-shot, повторно не дають) → `base64 -i AuthKey_<KEY_ID>.p8`.                                                                                                                                                                  |
| `IOS_TEAM_ID`                       | Apple Developer Portal → **Membership** → 10-символьний **Team ID**.                                                                                                                                                                                                  |

### Опційні repo-змінні (`vars.*`, не секрети)

| Змінна                          | За замовчуванням           | Призначення                                                                                                                                                          |
| ------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IOS_BUNDLE_ID`                 | `com.sergeant.shell`       | Має співпадати з `appId` у `apps/mobile-shell/capacitor.config.ts`.                                                                                                  |
| `IOS_PROVISIONING_PROFILE_NAME` | `Sergeant Shell App Store` | Human-readable назва App Store profile в Apple-порталі. Використовується як значення `provisioningProfiles[IOS_BUNDLE_ID]` у `ExportOptions.plist`. НЕ UUID профілю. |

### Запуск workflow-а

```bash
# Tag-push (бажаний варіант для «це реліз, який треба випустити»):
git tag v0.1.0 && git push origin v0.1.0

# Ad-hoc (build-and-test без тега):
# GitHub → Actions → "Mobile Shell (iOS Release)" → "Run workflow"
# Зніміть галку "Upload the resulting .ipa to TestFlight", щоб пропустити upload
# і просто отримати .ipa-артефакт.
```

Після успішного запуску:

- Завантажте підписаний `.ipa` із секції **Artifacts** прогона (`sergeant-shell-ipa`) для sideload-у / ручного QA.
- Обробка TestFlight займає 5–20 хв. Додати тестерів: App Store Connect → **TestFlight** → обрати білд → **Internal** або **External Testing** group → **Add Testers by Email**.

### Нотатки до першого запуску

- `apps/mobile-shell/ios/` свідомо **не** закомічено. Workflow запускає `cap add ios` (який також робить `pod install`) на першому ран-і та кешує `~/.cocoapods` + `ios/App/Pods` для подальших ранів через `actions/cache`. Це означає, що перший tag-push повільний (~10 хв додатково на Pods resolution); подальші — з кеша.
- Fallback Simulator-білд не має вимог до підпису, тож цей PR безпечно мерджити до того, як секрети потраплять у репо — release-джоб просто залогує `::warning::iOS release secrets not configured, skipping signed build` і зібʼє unsigned `.app`.

## Release — Android

Release-лейн віддає **два** артефакти з одного запуску workflow-а:

| Артефакт                     | Gradle-таска           | Коли використовувати                                                                                                                                                                              |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sergeant-shell-release-aab` | `:app:bundleRelease`   | Завантаження в Play Store (`google-github-actions/upload-google-play`, internal track). `.aab` напряму **не** встановлюється — Play на стороні сервера ділить його на per-device APK-и.           |
| `sergeant-shell-release-apk` | `:app:assembleRelease` | Прямий sideload поза Play: `adb install app-release.apk`, install через файл-менеджер, QA-девайс-ферми, ad-hoc демо. Підписаний `.apk` — це те, що PackageInstaller на телефоні реально споживає. |

> Правило великого пальця: якщо білд кудись поряд із Play Store — берете `.aab`. Якщо людина дропатиме його на телефон через USB чи download-link — берете `.apk`. Обидва йдуть з одного ран-у, шарять той самий `versionCode` / `versionName` і підписані тим самим ключем — тож не доведеться перезапускати workflow заради іншого формату.

Workflow: [`mobile-shell-android-release.yml`](../../.github/workflows/mobile-shell-android-release.yml).
Тригери:

- `workflow_dispatch` — ручний запуск з Actions UI (вибрати бранч; теги теж підтримуються).
- `push` тега, що матчить `v*` (наприклад `v0.1.0-shell.1`) — створіть локально reлiз-тег через `git tag v0.1.0-shell.1 && git push origin --tags`.

Без чотирьох підписувальних секретів (нижче) workflow усе одно запускає `:app:bundleRelease :app:assembleRelease` — але артефакти будуть unsigned. Це корисно як CI smoke-test release-графа (ProGuard/R8 keep-rules, Capacitor sync, resource shrinking) на PR-ах, що не мають доступу до прод-підпису. Unsigned-артефакти не можна ставити на реальний девайс і не можна заливати в Play — вони існують лише щоб валідувати Gradle-конфіг.

### Одноразове налаштування — згенерувати signing keystore

Це локальний, одноразовий крок для maintainer-а з write-доступом до GitHub Secrets. Сам keystore-файл лишається ПОЗА репо — у GitHub Secrets ідуть лише base64-blob і паролі.

```bash
# 1. Згенерувати PKCS12 keystore, валідний на ~27 років (Play рекомендує
#    expiry ≥2033 для нових заливок).
keytool -genkeypair -v \
  -keystore sergeant-shell-release.keystore \
  -alias sergeant-shell \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storetype PKCS12

# 2. Закодувати для transport-у через GitHub Secrets (вставка raw-binary
#    у UI не виживає newline-нормалізацію).
base64 -w0 sergeant-shell-release.keystore > sergeant-shell-release.keystore.base64

# 3. Збекапити .keystore-файл + паролі у командний password-manager.
#    Втратити keystore = більше ніколи не зможете шипнути апдейт у той
#    самий Play Store listing — Play назавжди перевіряє, що ключ підпису
#    співпадає з першою заливкою.
```

### GitHub Secrets — чотири записи

Додайте в **Repo → Settings → Secrets and variables → Actions**:

| Секрет                              | Значення                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `ANDROID_RELEASE_KEYSTORE_BASE64`   | Вміст `sergeant-shell-release.keystore.base64` (один рядок).  |
| `ANDROID_RELEASE_KEYSTORE_PASSWORD` | `-storepass`, який ви обрали під час `keytool -genkeypair`.   |
| `ANDROID_RELEASE_KEY_ALIAS`         | `sergeant-shell` (або який `-alias` ви передали в `keytool`). |
| `ANDROID_RELEASE_KEY_PASSWORD`      | `-keypass` для alias-а (зазвичай той самий, що store-пароль). |

Workflow декодує base64-blob у файл на runner-і, експортує чотири `SERGEANT_RELEASE_*` env-змінні, які читає `apps/mobile-shell/android/app/build.gradle`, і потім видаляє декодований keystore у `post`-кроці — raw-keystore не лежить на runner-і довше за один Gradle-виклик.

### Тригер release-білда

```bash
# Варіант A — manual, з будь-якого бранча:
#   GitHub → Actions → "Mobile Shell (Android, Release AAB + APK)"
#   → "Run workflow" → обрати бранч → Run.

# Варіант B — tag-driven, відтворюваний:
git tag v0.1.0-shell.1
git push origin v0.1.0-shell.1
# Push тега тригерить той самий workflow; пара артефактів несе SHA коміта тега
# у назві файлу через стандартний output-naming Gradle-а.
```

### Як забрати AAB / APK

Після завершення ран-а:

1. GitHub → Actions → "Mobile Shell (Android, Release AAB + APK)" → клікнути ран → проскролити до **Artifacts**.
2. Завантажити або `sergeant-shell-release-aab.zip` (Play), або `sergeant-shell-release-apk.zip` (sideload). Обидва zip-и містять один файл за очікуваним Gradle output-path-ом.
3. Для sideload-у: `adb install app-release.apk` (девайс має бути підключений + USB debugging увімкнено; перед цим видаліть будь-який debug-білд `com.sergeant.shell` — Android відмовляє ставити, коли ключ підпису змінюється).

Заливка в Play Store (`upload-google-play` + service-account JSON) **не** входить у цей workflow — вона прийде окремим PR-ом, що налаштує internal-track workflow + окремий секрет `ANDROID_PLAY_SERVICE_ACCOUNT_JSON`.
