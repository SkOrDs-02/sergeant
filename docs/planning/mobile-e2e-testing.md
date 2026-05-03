# Mobile E2E тестування — Detox vs Maestro

> **Last validated:** 2026-05-03. **Next review:** 2026-08-01.
> **Status:** Рекомендація підготовлена, впровадження не розпочато.
> **Owner:** @Skords-01

## Проблема

Зараз у нас є E2E тести тільки для web (Playwright). Mobile app (`apps/mobile` на Expo 52 + React Native 0.76) **не має жодних E2E тестів**. Unit-тести є (Jest + Testing Library), але вони не перевіряють реальну навігацію, жести, native API, push notifications, deep links, та інші речі, які ламаються тільки на реальному пристрої.

## Кандидати

### Detox (Wix)

**Що це:** Gray-box testing framework створений спеціально для React Native. Синхронізується з JS thread — чекає поки RN завершить рендер перед кожною дією.

**Переваги:**

- Найкращий для React Native — розуміє JS bridge, async операції, animations
- Тести пишуться на TypeScript/JavaScript — та сама мова що й у проєкті
- Глибока інтеграція: доступ до native modules, mock location, permissions, notifications
- Мінімальна flakiness через gray-box синхронізацію (не потрібні `sleep`/`waitFor` хаки)
- Підтримка Expo (з `expo-dev-client`)
- Великий community: Shopify, Wix, Microsoft використовують у production

**Недоліки:**

- Потрібна компіляція `.app`/`.apk` перед кожним запуском (не працює з Metro dev server)
- Складніший setup: потрібен Xcode (iOS) або Android SDK (Android) на CI
- Повільніший цикл зворотного зв'язку порівняно з Maestro
- macOS обов'язковий для iOS тестів

**CI інтеграція:** GitHub Actions з macOS runner для iOS, Linux з Android emulator для Android. Потрібен EAS Build для Expo.

### Maestro (mobile.dev)

**Що це:** Declarative (YAML-based) mobile testing framework. Працює як black-box — не знає про React Native, просто бачить UI елементи.

**Переваги:**

- Тести пишуться на YAML — нульовий поріг входу, навіть не-розробник може писати тести
- Автоматичні retry — вбудована tolerance до flakiness без explicit waits
- Швидкий setup: `brew install maestro` + `maestro test flow.yaml`
- Працює з будь-яким мобільним додатком (не тільки RN)
- Maestro Cloud — хмарний CI з device farm (платний)
- Швидший цикл: тести працюють на вже зібраному `.apk`/`.app` без перекомпіляції

**Недоліки:**

- Black-box: не синхронізується з RN JS thread — може бути flaky на складних анімаціях
- YAML обмежений: складна логіка (умови, цикли, data-driven тести) потребує workaround-ів
- Немає прямого доступу до native modules (mock location, permissions — через Maestro CLI)
- Менша спільнота порівняно з Detox
- Maestro Cloud — додатковий vendor та кост

**CI інтеграція:** Простіша — один Docker container або macOS runner з Maestro CLI.

### Appium

**Не рекомендую.** Повільний, складний setup, надмірний для нашого масштабу. Підходить для великих QA команд з multi-platform тестуванням.

## Порівняння

| Критерій                   | Detox                             | Maestro                         |
| -------------------------- | --------------------------------- | ------------------------------- |
| Мова тестів                | TypeScript                        | YAML                            |
| RN інтеграція              | Gray-box (глибока)                | Black-box                       |
| Flakiness                  | Мінімальна (sync з JS thread)     | Низька (auto-retry)             |
| Setup складність           | Висока                            | Низька                          |
| CI складність              | Висока (macOS runners, emulators) | Середня                         |
| Швидкість написання тестів | Середня                           | Висока                          |
| Expo підтримка             | Так (з expo-dev-client)           | Так                             |
| Native module доступ       | Повний                            | Обмежений                       |
| Ціна                       | Безкоштовний                      | CLI безкоштовний, Cloud платний |
| Community                  | Великий, зрілий                   | Зростає                         |

## Рекомендація: Maestro

**Для Sergeant рекомендую Maestro**, ось чому:

1. **Solo-розробник / маленька команда:** YAML тести пишуться в 3-5× швидше ніж Detox TypeScript. Для одного розробника — час = гроші.

2. **Expo managed workflow:** Detox потребує native build кожен раз. З Expo це означає EAS Build перед кожним тестом — повільно та дорого на CI. Maestro працює з вже зібраним `.apk`/`.ipa`.

3. **Критичні flow — не edge cases:** Нам потрібно покрити 5-10 golden paths (логін, додати транзакцію, створити тренування, логнути їжу, чат з AI). Для цього YAML достатній.

4. **Простіший CI:** Не потрібні macOS runners ($0.08/хв на GitHub Actions). Android emulator на Linux достатній для більшості перевірок.

5. **Detox краще якщо:** Потрібен доступ до native modules, mock GPS, тестування offline-first sync, складні animation sequences. Це поки не пріоритет.

## Приклад Maestro тесту

```yaml
# flows/login-and-add-transaction.yaml
appId: com.sergeant.mobile
---
- launchApp
- tapOn: "Увійти"
- tapOn: "Email"
- inputText: "test@example.com"
- tapOn: "Пароль"
- inputText: "testpassword123"
- tapOn: "Увійти"
- assertVisible: "Головна"

# Navigate to Finyk
- tapOn: "ФІНІК"
- assertVisible: "Транзакції"

# Add transaction
- tapOn: "Додати"
- inputText: "100"
- tapOn: "Кава"
- tapOn: "Зберегти"
- assertVisible: "100"
```

## План впровадження

### Фаза 1: Setup (0.5 дня)

1. Встановити Maestro CLI
2. Створити `apps/mobile/e2e/` директорію
3. Додати `.maestro/` конфігурацію
4. Написати перший тест: app launch + onboarding

### Фаза 2: Golden paths (1-2 дні)

Покрити критичні user flows:

| #   | Flow                       | Модуль     |
| --- | -------------------------- | ---------- |
| 1   | Реєстрація + перший логін  | Auth       |
| 2   | Додати транзакцію          | Finyk      |
| 3   | Створити тренування        | Fizruk     |
| 4   | Логнути звичку             | Routine    |
| 5   | Логнути їжу (ручний ввід)  | Nutrition  |
| 6   | Відправити повідомлення AI | HubChat    |
| 7   | Barcode scan → add food    | Nutrition  |
| 8   | Deep link → module         | Navigation |

### Фаза 3: CI інтеграція (0.5 дня)

1. GitHub Actions workflow з Android emulator
2. Запуск на кожен PR (тільки critical flows) або nightly (всі flows)
3. Артефакти: screenshots + відео

### Фаза 4: (Опціонально) Maestro Cloud

Якщо локальний CI стане занадто повільним — перейти на Maestro Cloud для паралельного запуску на реальних пристроях.

## Корисні посилання

- [Maestro Docs](https://maestro.mobile.dev/)
- [Maestro + Expo Guide](https://maestro.mobile.dev/platform-support/react-native)
- [Detox Docs](https://wix.github.io/Detox/)
- [Detox + Expo Guide](https://wix.github.io/Detox/docs/19.x/guide/expo/)
