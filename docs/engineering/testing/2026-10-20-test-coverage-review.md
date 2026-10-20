# Стан тестів і пріоритети покриття — 2026-10-20

> **Last validated:** 2026-10-20 by Codex. **Next review:** 2026-11-20.
> **Status:** Active

## Джерела й межі

База аналізу — `main` на `22303f8d8`, конфіги тестів і
[щотижневий CI від 19 жовтня](https://github.com/SkOrDs-02/sergeant/actions/runs/39231813544).
Відсотки нижче взято з його артефакту `vitest-coverage-summary`, а не з
порогів у конфігах. Це історичний зріз: зміни після того прогону можуть
змінювати знаменник. Локальні результати цієї зміни наведено окремо.

## Які перевірки є

| Шар                            | Що перевіряє                                          | Коли запускається                                                        |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Vitest / RTL / MSW             | Доменна логіка, компоненти, HTTP-обгортки             | `check` на PR і `main`                                                   |
| Jest                           | Наявний native-код; продуктовий розвиток на паузі     | `check`                                                                  |
| Testcontainers + Postgres      | Реальний SQL, транзакції, синхронізація, сесії        | `server-integration`, щопонеділка / вручну                               |
| Playwright critical-flow       | Браузер → API → БД                                    | На PR і `main`                                                           |
| Playwright a11y / mobile audit | Доступність і розмір touch-target                     | Щопонеділка / вручну                                                     |
| Pact / OpenAPI                 | Клієнтський контракт і provider replay                | Частина contract-тестів у звичайному Vitest; окремий roundtrip — щотижня |
| Property-based                 | Інваріанти дат, чисел і форматування                  | У звичайному Vitest                                                      |
| Stryker                        | Чи ловлять тести навмисні помилки у вибраних утилітах | Щотижня / вручну                                                         |
| Coverage floors / ratchet      | Падіння вимірюваного покриття                         | Щотижня / вручну                                                         |

Повний перелік і команди — у [каталозі тестування](./README.md).
Інтеграційні файли навмисно виключені зі звичайного server-конфігу;
`pnpm test` сам по собі не означає прогін Testcontainers.
Візуальні golden-тести наразі локальні; Detox заморожений рішенням ADR-0094.

## Виміряне покриття до зміни

| Workspace        | Рядки, % | Гілки, % |
| ---------------- | -------: | -------: |
| server           |    94.53 |    85.77 |
| web              |    93.41 |    83.18 |
| api-client       |    97.26 |    91.15 |
| shared           |    95.36 |    89.84 |
| routine-domain   |    97.36 |    89.18 |
| finyk-domain     |    98.33 |    87.06 |
| fizruk-domain    |    99.43 |    90.18 |
| nutrition-domain |    99.00 |    89.48 |
| db-schema        |    95.30 |    97.05 |
| dualwrite-core   |   100.00 |    97.43 |
| insights         |    98.98 |    82.71 |
| mobile-shell     |    94.41 |    91.79 |

Високе покриття рядків не доводить перевірку аварійних гілок. Наприклад,
`dbReplica.ts` мав 33.33% рядків: перевіряли створення пулу й shutdown,
але не робочі запити, fallback або звільнення клієнтів.

Щотижневий CI мав зелений coverage і critical-flow, але червоні
`server-integration` та a11y. Отже загальний відсоток і зелений PR-набір
не замінюють стан розширених перевірок. Інші червоні джоби того прогону
(bundle budget, Knip, dependency audit, secret scan) потребують окремого
розбору; цей огляд не встановлює їх причин.

У логах a11y — **9 падінь**: axe на `/pricing` (також high-contrast),
`/finyk` і `/fizruk/programs`; контраст полів/треків у settings і станів
вибору на welcome у light/dark; відсутній очікуваний елемент у перевірці
reflow при 320 px. Це результати CI 19 жовтня, не повторний браузерний
прогін поточного `main`; після недавнього редизайну їх слід відтворити.

## Додані перевірки

- 16 юніт-сценаріїв `dbReplica.routing.test.ts`: вибір репліки / primary,
  передавання параметрів і результату, помилки конекту й timeout,
  нетипові відхилення Promise, override primary, поширення помилки primary,
  подія помилки пулу та звільнення клієнта на успішних і аварійних шляхах.
- Чотири `dbReplica.integration.test.ts` зі справжнім Postgres: SQL-параметри,
  read-only транзакція, відновлення після SQL-помилки репліки та fallback
  після закриття пулу. `application_name` розрізняє два реальні з'єднання.
  Цей набір не моделює фізичну реплікацію або lag.
- Дві додаткові перевірки SSE у `session-protection.integration.test.ts`:
  увімкнений маршрут без сесії повертає 401 з `same-origin` CORP;
  вимкнений повертає 404 з `cross-origin` для анонімного клієнта і
  клієнта з реальною сесією Better Auth.

Причину падіння inventory-тесту відтворено локально до правки: вимкнений
SSE-guard повертав 404 до `requireSession`, а тест вважав це відсутністю
захисту. Inventory тепер явно вмикає маршрут; вимкнений стан перевіряється
окремо. Маршрут не додано до списку винятків, runtime-код не змінено.

Повний локальний інтеграційний прогін також виявив застарілий бюджет SQL
у `finyk/import/commit.integration.test.ts`: `expected 7 to be 6`.
Коміт `5c0b79511` додав обов'язковий advisory-лок на користувача для
серіалізації оп-логу, а бюджет лишився старим. Тест тепер очікує сім
запитів і перевіряє сам лок із правильним user ID одразу після `BEGIN`
як для одного рядка, так і для батчу. Порівняння кількості запитів
незалежно від кількості рядків збережено.

Для `dbReplica.ts` однаковий локальний вимір до / після додавання юнітів:
**33.33% → 100% рядків**, **33.33% → 95.83% гілок**, 6 → 22 тести.
Coverage include в обох прогонах обмежено саме цим файлом; це не
показник усього server-workspace.

## Локальна верифікація

Node 22.19.0, pnpm 9.15.1; залежності з незміненого lockfile.

| Команда                                                                                                                                                                                                                   | Результат                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter @sergeant/server exec vitest run src/dbReplica.test.ts src/dbReplica.routing.test.ts --coverage --coverage.include=src/dbReplica.ts --coverage.reportsDirectory=/workspace/scratch/replica-final-coverage` | 22 passed; 100% рядків, 95.83% гілок helper-а                 |
| `CI=true pnpm --filter @sergeant/server exec vitest run --config vitest.integration.config.ts src/dbReplica.integration.test.ts`                                                                                          | 4 passed, справжній Postgres                                  |
| `CI=true pnpm --filter @sergeant/server exec vitest run --config vitest.integration.config.ts src/__tests__/session-protection.integration.test.ts`                                                                       | До правки 1 failed / 1 passed; після 4 passed                 |
| `CI=true pnpm --filter @sergeant/server exec vitest run --config vitest.integration.config.ts src/modules/finyk/import/commit.integration.test.ts`                                                                        | До правки `expected 7 to be 6`; після 15 passed               |
| `pnpm --filter @sergeant/server typecheck`                                                                                                                                                                                | Exit 0                                                        |
| `pnpm --filter @sergeant/server lint`                                                                                                                                                                                     | Exit 0; 0 errors, 1 наявний warning у `routes/frontend.ts:27` |

Цільові прогони вище не означають проходження всього монорепозиторію.
Фінальні результати повних прогонів server-пакета — у Verification PR.

## Наступні тести за ризиком

Це кандидати з coverage-звіту, а не доведені дефекти продукту.

| Пріоритет | Ділянка / історичне покриття рядків                                        | Потрібна перевірка                                                                                                                           |
| --------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| P1        | `core/durability/anonymousDataMigration.ts`, 58.03%, 107 непокритих рядків | Відмова запису посеред переносу, повтор після перезапуску, ізоляція акаунтів; перевірка збереження даних у реальній SQLite та browser reload |
| P1        | `core/syncEngine/singleton.ts`, 82.95%                                     | Два незалежні контексти браузера, offline → reconnect, повтор ACK, logout із чергою; свіжа сесія і локальна БД для кожного пристрою          |
| P1        | `auth/encryptingAdapter.ts`, 60.00%                                        | Реальний adapter create/findOne/findMany/update з Postgres: ciphertext у БД, читання після ротації; helper-тести вже є                       |
| P1        | `modules/gdpr/externalDelete.ts`, 72.91%                                   | Відповіді 429/5xx і network rejection для кожного провайдера; зв’язок із retry-чергою. Missing config і 404 уже покриті                      |
| P2        | `shared/lib/media/compressImage.ts`, 24.24%                                | Некоректне зображення, відсутність bitmap/canvas API, помилка encoder, ліміт розміру; browser-тест для реальних API                          |
| P2        | `StrongImportReview.tsx`, 33.33%; `FinykPrivatBankSection.tsx`, 25.00%     | Валідація імпорту, повтор submit, помилка сервера з відновленням форми; RTL/MSW і один наскрізний сценарій                                   |
| P2        | API-клієнт `silpo.ts`, 85.00%                                              | Некоректна відповідь за схемою, encoded ID/query, abort та помилки destructive-endpoint-ів                                                   |

Поза цією зміною: розібрати конкретні axe-порушення з артефакту
`playwright-a11y-report`; перевірити покриття нового `tabular-import`
(його summary відсутній у зрізі 19 жовтня); додавати mutation-цілі для
нових критичних інваріантів, не лише піднімати відсоток рядків.
Зміна частоти CI потребує оцінки часу й черги: поточний тижневий розклад
є свідомим рішенням ADR-0102, у цьому PR він не змінюється.
