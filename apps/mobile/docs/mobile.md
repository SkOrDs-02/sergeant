# Mobile build & push notifications

Цей документ описує як зібрати native dev-client `@sergeant/mobile` через
EAS, як підʼєднати push-entitlements, та як не комітити секрети в репо.

## TL;DR

```sh
# Один раз:
pnpm --filter @sergeant/mobile check-build-config   # sanity-check
npx eas-cli@latest login                            # або EXPO_TOKEN env
npx eas-cli@latest init --id                        # створить EAS_PROJECT_ID

# Dev client (credentials ok, archive start — Apple/Google креди резолвляться
# автоматично якщо є App Store Connect API key та Play service account):
npx eas-cli@latest build --profile development --platform ios --non-interactive
npx eas-cli@latest build --profile development --platform android --non-interactive
```

Готовий .ipa/.apk ставиш на фізичний пристрій, логінишся — `PushRegistrar`
(`apps/mobile/src/features/push/PushRegistrar.tsx`) шле native APNs/FCM
токен у `POST /api/v1/push/register`. У серверних логах має зʼявитись
реальний токен (64-hex на iOS).

## Передумови

| Змінна                                                 | Де взяти                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                                           | https://expo.dev/settings/access-tokens                                                                    |
| `EAS_PROJECT_ID`                                       | результат `eas init` (збережи як org-secret)                                                               |
| `APPLE_TEAM_ID`                                        | https://developer.apple.com/account → Membership details                                                   |
| App Store Connect API key (Key ID + Issuer ID + `.p8`) | App Store Connect → Users & Access → Integrations, роль _App Manager_                                      |
| Android `google-services.json`                         | Firebase Console → Project settings → загрузь як EAS secret                                                |
| Play service account JSON                              | Play Console → Users and permissions → API access (роль _Release manager_, потрібно лише для `eas submit`) |

Bundle identifier та Android applicationId — обидва `com.sergeant.app`.

### Fallback bundle id

Якщо Apple відкине `com.sergeant.app` через конфлікт (щось уже
зарезервовано), тимчасово перемкнемось на `ai.sergeant.app`:

1. В `apps/mobile/app.config.ts` поміняти `ios.bundleIdentifier` та
   `android.package`.
2. Перевірити `pnpm --filter @sergeant/mobile check-build-config`.
3. Оновити App Store Connect / Firebase з новим id.

Рішення зафіксувати у PR description.

## EAS profiles

Визначені у `apps/mobile/eas.json`:

- **development** — `developmentClient: true`, `distribution: internal`.
  iOS ресурс `m-medium`, Android `.apk`. Це те, що ставиш на пристрій
  для локального debug + push smoke.
- **preview** — internal, канал `preview`. Для stakeholder review.
- **production** — канал `production`, автоінкремент buildNumber.

## `app.config.ts`

Динамічний конфіг замінив статичний `app.json`. Тримається разом з
кодом, тому читає `process.env`:

```ts
extra: {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  eas: { projectId: process.env.EAS_PROJECT_ID },
}
```

EAS CLI читає id саме з `extra.eas.projectId` (це те, що `eas init --id`
вписує), і `Notifications.getExpoPushTokenAsync()` на Expo SDK 52+ бере
його звідти ж, тож **не** тримай плаский `easProjectId`.

Увага: всі існуючі поля (icon, splash, scheme, web, plugins,
`newArchEnabled`, `experiments.typedRoutes`) перенесено 1:1. Якщо
додаєш нове — додавай у `app.config.ts`, не повертай `app.json`.

## Google Services

Android FCM-токен вимагає `google-services.json`. Правила:

1. Файл **не комітиться** у git (він у `.gitignore` як
   `apps/mobile/google-services.json`).
2. Для локального bare-білду — поклади файл у
   `apps/mobile/google-services.json`.
3. Для EAS — заванаж як secret, тоді EAS сам його покладе під час білду:

   ```sh
   eas secret:create \
     --scope project \
     --name GOOGLE_SERVICES_JSON \
     --type file \
     --value ./google-services.json
   ```

   І посилання у `app.config.ts → android.googleServicesFile` (додамо
   коли будемо реально білдити Android; для iOS-first dev smoke не
   обовʼязково).

## iOS push entitlements

- `ios.infoPlist.UIBackgroundModes` вже містить `remote-notification`.
- EAS автоматично включить `Push Notifications` capability у
  provisioning profile, якщо у проєкті є App Store Connect API key.
- Після інсталу dev-client на пристрій, `PushRegistrar` викличе
  `Notifications.getDevicePushTokenAsync()` → `api.push.register`.

## Sanity-check

`apps/mobile/scripts/check-build-config.ts` — CLI-перевірка яка читає
`app.config.ts` і друкує `bundleId`, `androidPackage`, `plugins`,
`iosBackgroundModes`. Падає якщо:

- відсутній `ios.bundleIdentifier` або `android.package`;
- у `plugins` немає `expo-notifications`;
- `UIBackgroundModes` не містить `remote-notification`.

Запуск: `pnpm --filter @sergeant/mobile check-build-config`.

## Manual smoke після білду

Після того як dev-client встановлено на фізичний iPhone/Android:

1. Логін (Better Auth sign-in екран).
2. Approve push permission prompt.
3. В серверних логах `@sergeant/server` зʼявиться `POST /api/v1/push/register`
   з `token` довжиною 64 hex (iOS) або FCM-рядок (Android).

Цей крок — manual; у CI його не симулюємо.
