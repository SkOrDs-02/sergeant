# `@sergeant/mobile` — Detox E2E

Detox-E2E-харнес для мобільного застосунку (Phase 4 з `docs/mobile/react-native-migration.md`, §8 + §13 Q8).

## Сьюти

| Сьют                          | Скоуп                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| `finyk-manual-expense.e2e.ts` | Фінік Overview → Transactions → додати manual expense → row видно.          |
| `finyk-transactions.e2e.ts`   | Фінік Transactions, period filter (prev-month / next-month chevrons).       |
| `hub-ux-smoke.e2e.ts`         | Hub → Settings → theme toggle + стабільні top-level tab testIDs.            |
| `routine-smoke.e2e.ts`        | Рутина → Settings → додати daily habit → Calendar → toggle today → ✓ видно. |

Усі три спираються на спільні примітиви з `helpers.ts` (`tapWhenVisible`, `waitForVisibleById`, `byId`) і той самий launch-flag `EXPO_PUBLIC_E2E=1`, який обходить auth. Сьюти крутяться послідовно з `maxWorkers: 1`, щоб MMKV-стан був детермінованим між блоками `it()` — кожен сьют засіває власний row, не покладаючись на залишки від іншого сьюта.

## Локальний запуск

```bash
# Раз: prebuild нативних проєктів. Detox драйвить бінарі, які генерує
# Expo development-профіль, тож той самий output використовується для
# `expo run:ios` / `expo run:android`.
pnpm --filter @sergeant/mobile exec expo prebuild --clean

# iOS (тільки macOS)
pnpm --filter @sergeant/mobile e2e:build:ios
pnpm --filter @sergeant/mobile e2e:test:ios

# Android (macOS / Linux, AVD має бути запущений заздалегідь)
pnpm --filter @sergeant/mobile e2e:build:android
pnpm --filter @sergeant/mobile e2e:test:android
```

Лаунчер виставляє `EXPO_PUBLIC_E2E=1` (див. `.detoxrc.js` + `apps/mobile/app/(tabs)/_layout.tsx`), що обходить Better Auth-гейт, тож tab-layout рендериться без живої сесії. У release-бінарях цей прапор **не діє** — Metro інлайнить значення `EXPO_PUBLIC_*` тільки якщо вони присутні під час бандла, а продакшн-EAS-профіль їх не виставляє.

## Як додати тест

1. Створіть новий `*.e2e.ts` у `apps/mobile/e2e/` — `jest.config.js` підхопить його автоматично.
2. Перевикористовуйте `helpers.ts` для типових патернів `tapWhenVisible` / `waitForVisibleById`, щоб повідомлення про падіння залишались actionable.
3. Матчіть за `testID` (або `accessibilityLabel` для рядків, які природно унікальні за label-ом). Не покладайтесь на текст amount / date — локалізація змінюється per-device і флакає CI.
4. Якщо нова DOM-поверхня потребує тестового хука — додайте `testID` у файлі компонента; не мутуйте рендер DOM усередині сьюта.

## CI

Два паралельні workflow-и шарять один і той самий набір сьютів:

- **iOS** — `.github/workflows/detox-ios.yml`, runner `macos-14`, симулятор iPhone 15. Запускається на `pull_request` + `push` до `main`, коли змінюються mobile-scoped path-и; `workflow_dispatch` також підтримується.
- **Android** — `.github/workflows/detox-android.yml`, `ubuntu-latest` з KVM-акселерацією і action-ом `reactivecircus/android-emulator-runner`, що драйвить AVD `Pixel_5_API_34` (відповідає девайсу `emulator` у `.detoxrc.js`). Кешує pnpm-store, Gradle dependency graph і AVD-снапшот, щоб тримати cold-start під контролем.

Обидва workflow-и аплоудять `apps/mobile/.detox-artifacts` на падінні (логи + скріншоти, увімкнено в `.detoxrc.js > artifacts`), щоб ран можна було діагностувати без ретраю.
