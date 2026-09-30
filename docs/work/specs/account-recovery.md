# SPEC: `POST /api/account/recovery` - відновлення доступу до акаунта

> **Last touched:** 2026-09-30 by @claude (виконано варіантом C: контракт знято). **Next review:** 2026-12-30.
> **Status:** Implemented (Варіант C: роут не імплементується, осиротілий контракт знято 2026-09-30). Історичний документ: розвідка нижче лишається як обґрунтування рішення.

<!-- Спека самодостатня. Пише розвідку й контракт із наявного коду; продуктові рішення
винесено питаннями (sergeant-spec § 2-4). Жодне число нижче не вигадане: кожне - з
константи в репо або з відповіді власника, джерело вказано поруч. -->

## Рішення

**2026-09-30, власник: Варіант C.** Роут `/api/account/recovery` не імплементується. Скидання пароля лишається на Better Auth: `/api/auth/request-password-reset` і `/api/auth/reset-password` залишаються без змін (Q4 знято: другого входу не буде). Відновлення видаленого акаунта лишається за `/api/me/restore`. Q1-Q3, Q5-Q7 втратили предмет.

Знято: схеми `AccountRecovery*` (`packages/shared/src/schemas/api.ts`), фікстури `contract-fixtures/accountRecovery.ts` з тестом, `apps/server/src/routes/account-recovery.contract.test.ts` і `apps/web/src/test/contract/account-recovery.contract.test.ts`, правило `/api/account/recovery` у `apps/server/src/sentry.ts` з кейсами `sentry-sampler.test.ts` і рядками `sentry-sampling.md`. Tombstone-guard: `packages/api-client/src/endpoints/accountRecoverySunset.test.ts` (за зразком `syncV1Sunset.test.ts`).

## Блокери (читати першими)

**Головне питання: чи роут дублює Better Auth?** За розвідкою - так, у частині, яку описують наявні схеми. Пара `initiate` + `confirm` (email -> лист із одноразовим токеном -> токен + новий пароль) - це рівно `POST /api/auth/request-password-reset` + `POST /api/auth/reset-password`, які вже змонтовані, обмежені двома rate-limit бакетами, мають web-UI (`ForgotPassword` -> `ResetPasswordPage`) і листа (`passwordResetMail`). Тобто новий роут за замовчуванням був би тонким дублем.

Що лишається як **можлива реальна потреба** (і чого сьогодні не закриває ні BA-reset, ні `/api/me/restore`) - у § Що бракує. Чи є хоч один із цих сценаріїв продуктовою потребою - питання власнику Q1. Якщо жоден - чесна відповідь «роут не потрібен, зняти контракт» (Варіант C нижче), і це не поразка рішення «імплементувати», а його уточнення.

Рішення власника (2026-09-30): «роут `/api/account/recovery` імплементувати». **Замінено Варіантом C (див. § Рішення).** Це рішення прийнято до цієї розвідки; воно не покриває питання Q1-Q3, про існування яких власник не знав.

## Проблема

У репо висить **контракт без реалізації**: `packages/shared` тримає схеми й фікстури `AccountRecovery*`, `apps/server/src/routes/account-recovery.contract.test.ts` пінить wire-форму «before implementation», `apps/server/src/sentry.ts:47` семплить `/api/account/recovery` на 100%, а `sentry-sampler.test.ts:36-39,81` захищає це правило. Самого роуту в `apps/server/src/routes/**` немає (`rg "account/recovery" apps/server/src` дає лише тест і Sentry). Аудит [`2026-08-05-orphaned-code-audit.md`](audits/2026-08-05-orphaned-code-audit.md) (§ 3г, P1 «рішення власника») ставить питання «імплементувати чи зняти контракт-тест»; власник відповів «імплементувати».

Контракт народжено аудитом безпеки 2026-05-13 (§ S7 «Contract test expansion - auth, csp-report, account-recovery»), тобто як **спорожнілий заготовок «на майбутнє»**, а не як відповідь на задокументовану користувацьку проблему. Жодного продуктового канону, ADR чи тікета, що формулює біль користувача «не можу повернути акаунт», у репо немає (`rg -i "account.recovery|account/recovery" docs` знаходить лише аудит, `hardening-matrix.md` і `sentry-sampling.md`). Це і є причина винести питання про потребу першим.

## Що вже є (інвентар)

| Що                                              | Де                                                                                                                                                                                                                                     | Стан                                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zod-схеми запитів/відповідей/помилки            | `packages/shared/src/schemas/api.ts:2058-2140`                                                                                                                                                                                         | Є. Усі `.strict()`                                                                                                                                                            |
| Фікстури + `assertAccountRecoveryFixturesValid` | `packages/shared/src/contract-fixtures/accountRecovery.ts` (+ `.test.ts`)                                                                                                                                                              | Є, експортуються з `contract-fixtures/index.ts`                                                                                                                               |
| Producer contract test                          | `apps/server/src/routes/account-recovery.contract.test.ts`                                                                                                                                                                             | Лише schema-acceptance; supertest-блоку по реальному хендлеру немає                                                                                                           |
| Sentry-правило 100% trace                       | `apps/server/src/sentry.ts:47`, тест `__tests__/sentry-sampler.test.ts:36-39,81`, таблиця в `docs/operations/observability/sentry-sampling.md:42`                                                                                      | Мертве правило (роуту нема), але захищене тестом                                                                                                                              |
| Better Auth reset                               | `apps/server/src/auth.ts:345-384` (`emailAndPassword.sendResetPassword`, `revokeSessionsOnPasswordReset: true`)                                                                                                                        | Працює. Лист іде через `queueAuthTransactionalEmail({kind:"password_reset"})` (не await - проти timing-enumeration), текст у `auth/verificationMail.ts` (`passwordResetMail`) |
| Rate limit на reset                             | `http/authMiddleware.ts:authSensitiveRateLimit` (IP, 5/60с за замовчуванням, fail-closed) і `authAccountRateLimit` (SHA-256(email), 10/15хв) - обидва матчать `request-password-reset` і `reset-password`                              | Працює. `reset-password` несе токен, не email, тож per-account бакет для нього пропускається (`authMiddleware.ts`, коментар до `authAccountRateLimit`)                        |
| Web-клієнт reset                                | `apps/web/src/core/auth/authClient.ts:87-150,253` (`requestPasswordReset`, `resetPassword`), `ResetPasswordPage.tsx`                                                                                                                   | Працює. У коментарі `authClient.ts:87-91`: старий `forgetPassword` «silently 404s» - BA перейменував ендпоінт                                                                 |
| Відновлення після запиту на видалення           | `POST /api/me/restore` (`routes/me.ts:317`, `modules/me/dataRights.ts:601` `restoreAccount`), [ADR-0098](../../governance/adr/0098-account-deletion-grace-window.md), [`user-deletion-grace-window.md`](user-deletion-grace-window.md) | Працює. Потребує **дійсної сесії** (`requireFreshSession({allowPendingDeletion:true})`) - вхід у вікні видалення дозволений гейтом `allowPendingDeletion`                     |
| Pino-редакція                                   | `packages/shared/src/lib/pii.ts` `REDACT_KEY_NAMES`: `password`, `newPassword`, `currentPassword`, `token`, ... (Class A)                                                                                                              | Є. `token` і `newPassword` вже редактуються                                                                                                                                   |

Посилання в коментарях контракту застаріли: `sentry.ts:42` (тепер `:47`), `docs/initiatives/stack-pulse-2026-05/pr-02-rate-limit-fail-closed.md` і `docs/audits/2026-05-13-security-observability-roast.md` за цими шляхами не існують. Виправити при виконанні (Hard Rule #15).

## Яку проблему роут мав розв'язувати

Реконструкція за кодом контракту (не за продуктовим документом, якого немає):

1. **Скидання пароля** - єдине, що описують схеми: `initiate {email}` -> `202/{ok:true}` без розрізнення «є акаунт / нема»; `confirm {token,newPassword}` -> `{ok:true}` без видачі сесії, щоб перехоплення відповіді не давало входу; одна узагальнена помилка для «токен хибний / прострочений / використаний». Це **скидання пароля**, не відновлення видаленого акаунта.
2. **Відновлення акаунта після видалення** - у схемах його немає взагалі, і воно вже закрите інакше: під 30-денним вікном ([ADR-0098](../../governance/adr/0098-account-deletion-grace-window.md)) користувач входить (гейт пускає з `allowPendingDeletion`) і викликає `POST /api/me/restore`. Після кінця вікна `purgeUserData` незворотний за задумом, і жоден recovery-роут цього не змінює.
3. Назва «recovery» історично об'єднує ці два поняття; контракт покриває лише перше.

### Що Better Auth уже закриває

- Запит листа: `POST /api/auth/request-password-reset` (відповідь BA - `200 {status,message}`, узагальнена; лист у черзі, не await).
- Підтвердження: `POST /api/auth/reset-password` `{newPassword, token}`; `revokeSessionsOnPasswordReset: true` знімає всі сесії; нову сесію reset не видає.
- Одноразовість і TTL токена - параметри BA (`resetPasswordTokenExpiresIn`; в `auth.ts` не перевизначено, тобто діє дефолт бібліотеки). **Не перевірено в цій сесії** (залежності не встановлені, `node_modules/better-auth` відсутній): точне значення дефолту й поведінка токена на повторне використання потрібно підтвердити по версії `^1.6.23` до Q2.
- Rate limit (два бакети), CSRF-хедер, аудит-лог операцій `forget_password` / `reset_password` (`authMiddleware.ts`), метрики `authAttemptsTotal`.
- UI: сторінка запиту й сторінка `/reset-password`.

### Розбіжності наявного контракту з реальним сервером (знайдено, це не рішення)

| Місце              | Контракт `AccountRecovery*`                                          | Реальний сервер / BA                                                     |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `newPassword`      | `min(8).max(128)` (`schemas/api.ts:2106-2111`)                       | `MIN_PASSWORD_LENGTH` = 10, `MAX_PASSWORD_LENGTH` = 256 (`env.ts:81-83`) |
| Коментар у схемі   | «якщо BA підніме поріг, схема мусить рухатись у ногу (Hard Rule #3)» | Уже не в ногу: поріг 10 проти 8                                          |
| Відповідь initiate | `202` + `{ok:true}`                                                  | BA: `200` + `{status,message}`                                           |
| Формат помилки     | `{error: string}` (`.strict()`)                                      | BA: `{code,message}`; серверні `AppError`-и мають власну форму (`code`)  |
| Шлях               | `/api/account/recovery`, `/api/account/recovery/confirm`             | `/api/auth/request-password-reset`, `/api/auth/reset-password`           |

Ці розбіжності мають бути закриті **в будь-якому** варіанті (A/B/C), бо або роут їх успадкує, або контракт знімається.

## Що бракує (кандидати на реальну потребу)

Перелік для Q1. Жоден не підтверджений як бажаний продуктом; варіанти - гіпотези.

1. **Акаунт лише з соціальним входом** (Google/Apple, без credential-запису), який втратив доступ до провайдера. BA-reset працює над credential-акаунтом; що станеться з `request-password-reset` для користувача без пароля - **не перевірено** (див. Q2). Якщо BA додає credential-акаунт при reset - це сценарій «встановити пароль», якого нинішній UI не пропонує.
2. **Втрата доступу до пошти** (пошта = єдиний фактор). Роут із контрактом «email -> лист» його не розв'язує; потрібен другий фактор або ручна процедура підтримки. У контракті цього немає, і це нова поверхня безпеки (перший крос-акаунтний шлях відновлення), тобто власників клас рішень (sergeant-spec § 3).
3. **Стабільний серверний контракт над BA**: BA вже раз перейменувала ендпоінт (`forgetPassword` -> `requestPasswordReset`, тихий 404 - `authClient.ts:87-91`). Власний фасад ізолював би web/mobile від перейменувань. Це аргумент інженерний, не користувацький.
4. **Узгоджена помилка/відповідь** для клієнтів (`{ok:true}` замість `{status,message}`), якщо в майбутнього mobile-клієнта (ADR-0094: на паузі) є вимога до контракту.

## Мета

Після завершення (лише коли Q1 підтвердить потребу): один задокументований, покритий тестами шлях відновлення доступу до акаунта, чий wire-контракт збігається з `AccountRecovery*` схемами (або схеми свідомо змінені), відповідь якого не розрізняє «email зареєстрований / ні», а токен одноразовий і не логується. Якщо Q1 = «потреби немає»: контракт, фікстури, контракт-тест і мертве Sentry-правило знято (Варіант C) - і це вважається виконанням мети «прибрати осиротілий код».

## Варіанти реалізації (вибір - Q1/Q2, не мій)

- **A. Тонкий фасад над Better Auth.** `POST /api/account/recovery` викликає `auth.api.requestPasswordReset`, `POST /api/account/recovery/confirm` - `auth.api.resetPassword`, відповіді нормалізуються до `{ok:true}`, помилки - до `{error}`. Плюси: стабільний контракт (п. 3-4 вище), контракт-тест стає supertest-ом. Мінуси: дублює 1:1 наявний шлях, два входи на одну дію, подвоєна поверхня для rate limit / CSRF / аудиту; web уже ходить в `/api/auth/*`.
- **B. Власний потік, незалежний від BA-reset** (власна таблиця токенів, власний лист). Потрібен лише якщо є сценарій, якого BA не закриває (п. 1-2). Мінуси: власна криптографія токенів на security-critical шляху при готовому перевіреному (ADR-0017, [`better-auth-audit-2026-05.md`](../../governance/security/better-auth-audit-2026-05.md)); окремий threat-model; міграція. **Не рекомендується без конкретного сценарію, якого BA не може.**
- **C. Не імплементувати.** Зняти `AccountRecovery*` зі `shared`, `account-recovery.contract.test.ts`, правило `sentry.ts:47` разом із тестом `sentry-sampler.test.ts:36-39,81` і рядок таблиці в `sentry-sampling.md`; за зразок tombstone - `syncV1Sunset.test.ts` (аудит § 3б). Закрити розбіжності таблиці вище не потрібно: їх немає, коли контракту немає.

Якщо власник підтверджує «імплементувати» без нового сценарію - варіант A є мінімальним чесним читанням його рішення, з явним застереженням, що це фасад.

## Рішення дизайну

Прийняті (з джерелом):

- **Замінено Варіантом C (§ Рішення):** ~~Рішення власника 2026-09-30: роут імплементувати (джерело: доручення власника; аудит § P1). Уточнюється Q1.~~
- **Замінено Варіантом C:** ~~**Форма запиту/відповіді - як у наявних схемах** `packages/shared/src/schemas/api.ts:2058-2140`, доки Q3 не вирішить інакше: initiate `{email}` -> `{ok:true}` (однакова для наявного й відсутнього email), confirm `{token,newPassword}` -> `{ok:true}` без сесії, помилка `{error}`. Джерело: контракт, зафіксований аудитом 2026-05-13 § S7 і тестами.~~
- **Замінено Варіантом C:** ~~**Confirm не видає сесію**, клієнт іде на `/api/auth/sign-in` (контракт-тест, блок «post-recovery re-auth»). Узгоджується з `revokeSessionsOnPasswordReset: true` (`auth.ts:375`).~~
- **Замінено Варіантом C:** ~~**Єдине повідомлення про помилку токена** без розрізнення «хибний / прострочений / використаний» (контракт-тест, блок «error envelope»).~~
- **Замінено Варіантом C:** ~~**Токен і пароль - Class A у логах:** `token`, `newPassword` уже в `REDACT_KEY_NAMES` (`packages/shared/src/lib/pii.ts`); окремого списку не додавати (Hard Rule #21).~~
- **Замінено Варіантом C:** Sentry 100% trace для `/api/account/recovery` (`sentry.ts:47`) лишався б, якби роут імплементували; підрядковий матч охоплює й `/confirm`.
- **Замінено Варіантом C:** ~~**Не використовувати `requireSession`** на цих роутах: шлях до входу, сесії ще немає. Політика rate limit - fail-closed (як `AUTH_SENSITIVE_RATE_LIMIT`, `config/rateLimit.ts`).~~

Не прийняті (питання, а не рішення): TTL токена, довжина/формат токена, чи лист однаковий для соціальних акаунтів, чи потрібен другий фактор, рівень мінімальної довжини пароля в контракті, чи фасад чи власний потік - див. § Відкриті питання.

## Безпека (вимоги, що виконуються в будь-якому варіанті)

Ця секція - обов'язкові інваріанти, а не нові рішення; вони виведені з контракту, Hard Rules і `sergeant-security-audit` та BA-конфігу.

- **Account enumeration.** Відповідь initiate і за статусом, і за тілом однакова для існуючого й неіснуючого email (контракт). **Час відповіді** теж: лист ставиться в чергу без `await` (як `sendResetPassword` у `auth.ts:377`), без гілки «користувача нема - повертаємось швидше». Потрібен тест на часову однорідність (див. § Тести).
- **Rate limit.** Обидва бакети, що й для BA-reset: IP (`api:auth:sensitive`, 5/60с) і per-account SHA-256(email) (`api:auth:account`, 10/15хв), обидва fail-closed з kill-switch `RATE_LIMIT_FAIL_CLOSED_AUTH`. Якщо роут живе **поза** префіксом `/api/auth`, обидва middleware мають бути змонтовані явно: вони матчать `originalUrl` за підрядками `request-password-reset` / `reset-password` / `forget-password` (`authMiddleware.ts`), а шлях `/api/account/recovery` під жоден із них **не потрапляє**. Це пастка: без правки матчера роут вийшов би без ліміту. Для `confirm` (токен без email) per-account бакет пропускається за дизайном; захист - одноразовий токен + IP-бакет.
- **Токени.** Одноразові, з обмеженим TTL (значення - Q2), зберігаються так, щоб витік БД не давав дійсний токен (хеш, як робить BA для reset-токенів - **перевірити**). Токен ніколи не потрапляє в URL-логи сервера, Sentry breadcrumbs, аудит-лог тіла; у листі - лише посилання на web-origin (`withWebCallbackURL`).
- **Pino redaction.** `token`, `newPassword`, `email` (Class B/PII за `pii.ts`) - не логувати тіло; у аудит-лог іде лише 12-hex фінгерпринт email (`authMiddleware.ts` `emailFingerprint`), не сам email. При змінах `REDACT_KEY_NAMES` - `node --test scripts/__tests__/lint-pii-handling-drift.test.mjs`.
- **CSRF / origin.** Роути змінюють стан без сесії, тому підпадають під `requireCsrfHeader` так само, як `/api/auth/*`; змонтувати на тому самому ланцюжку.
- **Сесії.** Після успішного confirm усі сесії користувача відкликаються (`revokeSessionsOnPasswordReset`-еквівалент, якщо роут не через BA).
- **Пароль.** Політика = `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH` з `env`; схема в `shared` не може бути слабшою (розбіжність 8/10 і 128/256 закрити, Q3). Хешування - як ADR-0042 (scrypt через BA), не власне.
- **Pending deletion.** Скидання пароля не знімає `deletion_requested_at`; відновлення видалення - лише `/api/me/restore` після входу. Автоматично «скасовувати видалення» recovery-ом заборонено (інакше людина, що втратила пошту, а зловмисник з поштою скасовує чуже видалення): окреме рішення власника, у v1 не робимо.
- **Threat model.** Оновити [`threat-model.md`](../../governance/security/threat-model.md) записом про поверхню recovery (спека виконавця: окремий рядок, не переписування).

## Зв'язок з Better Auth

- **Варіант A:** роут - обгортка над `auth.api.*`; токени, TTL, хешування, revoke сесій - вся логіка BA, роут лише нормалізує форму. BA-ендпоінти лишаються змонтованими (`ALL /api/auth/{*splat}`), тому в системі буде **два публічні входи** на скидання; політика: один з них - канонічний, інший - не рекламується. Web-клієнт переключати чи ні - Q3.
- **Варіант B:** несе власний токен-стор; виходить за вже перевірену модель ([ADR-0017](../../governance/adr/0017-better-auth-choice-and-session-model.md), [ADR-0049](../../governance/adr/0049-auth-vendor-risk.md)); вимагає ADR за [`sergeant-adr`](../../../.agents/skills/sergeant-adr/SKILL.md).
- Скіл `better-auth-best-practices` у цій сесії не читався через `Read` (перевіряється при виконанні; owner-скіл за AGENTS.md для auth/session/cookie/account lifecycle). Обов'язково перечитати перед кодом.

## Міграції

- **A:** міграцій не потрібно (усе в таблицях BA `verification`/`account`).
- **B:** нова таблиця токенів; SQL-міграція послідовна без пропусків (Hard Rule #4, наступний номер - за `apps/server/src/migrations/`, перевірити на момент роботи); вхідні ID - Better Auth opaque strings, не UUID (`domain-invariants.md`).
- **C:** міграцій нема.

## Поверхня змін

Залежить від варіанта (перевірено, що шляхи існують):

- `apps/server/src/routes/account-recovery.ts` (новий) + реєстрація в `routes/index.ts` - A/B
- `apps/server/src/http/authMiddleware.ts` - розширити матчери rate-limit на `/api/account/recovery` (A/B, критично)
- `packages/shared/src/schemas/api.ts:2058-2140`, `contract-fixtures/accountRecovery.ts` - вирівняти з політикою пароля (Q3); `packages/api-client` - методи, якщо web/mobile переключаємо (Hard Rule #3: server <-> api-client <-> test)
- `packages/shared/src/openapi/routes.ts` - описати шляхи (аудит § 3г: гейт `api:check-openapi` звіряє лише з цим джерелом)
- `apps/server/src/routes/account-recovery.contract.test.ts` - додати supertest-блок
- `apps/server/src/sentry.ts:47`, `__tests__/sentry-sampler.test.ts`, `docs/operations/observability/sentry-sampling.md` - лишаються (A/B) або знімаються (C)
- Owner-скіли за AGENTS.md: `sergeant-server-api` (роут, api-client, OpenAPI), `better-auth-best-practices` (auth lifecycle), `sergeant-security-audit`; `sergeant-data-and-migrations` лише для B.

## Поза скоупом v1

- Відновлення акаунта **після** кінця 30-денного вікна видалення (незворотне за [ADR-0098](../../governance/adr/0098-account-deletion-grace-window.md)).
- Автоскасування `deletion_requested_at` через recovery (див. § Безпека).
- Відновлення через другий фактор / підтримку при втраті пошти (нова поверхня - окреме рішення, Q1 п. 2).
- Passkeys, TOTP, SMS.
- Переробка `ForgotPassword`/`ResetPasswordPage` UI, крім переключення на новий клієнт, якщо Q3 це вирішить.
- Зміна `MIN_PASSWORD_LENGTH` (вирівнюється контракт до сервера, а не навпаки).
- `apps/mobile*` (пауза ADR-0094).

## Тести

- **Contract test** (`account-recovery.contract.test.ts`): до наявної schema-acceptance додати supertest-блок - кожна фікстура проходить через реальний хендлер (за анонсом у шапці файлу).
- **Enumeration:** зареєстрований і незареєстрований email дають байт-в-байт однакову відповідь; тест часу: різниця медіан у межах порога, узятого з заміру (не з голови).
- **Rate limit:** 6-й запит з одного IP за вікно -> 429; 11-й запит по одному email з різних IP -> 429 (за зразком `authAccountRateLimit.test.ts` і сценарію F2 із [`beta-security-readiness.md`](beta-security-readiness.md)); окремий тест, що шлях `/api/account/recovery` **не** обходить ліміт (регресія пастки з § Безпека).
- **Токен:** повторне використання -> та сама узагальнена помилка; прострочений -> та сама; хибний -> та сама.
- **Сесії:** після confirm старі сесії відкликані, нова не видана.
- **Redaction:** тіло запиту з `token`/`newPassword` не з'являється в лог-виводі (за зразком `logger.test.ts`).
- **Drift-гейти:** `assertAccountRecoveryFixturesValid`, `pnpm api:check-openapi`.

## Rollout

- Нова поверхня - за feature-прапорцем лише якщо власник так вирішить (Q6); за замовчуванням безпечніше **не вмикати без прапорця**, бо роут публічний і без сесії. Вибір системи прапорців - `docs/engineering/architecture/feature-flags.md` + скіл `sergeant-feature-flags`.
- Деплой: міграцій для A немає, тож ризик - лише код; порядок за AGENTS.md: `pnpm deploy:api`, далі фронт, якщо клієнт переключається; перед завершенням сесії - `pnpm deploy:status`. Деплой викочує `main` цілком.
- Спостереження: 100% Sentry-трейси (вже налаштовано), `authAttemptsTotal` для операцій recovery, аудит-лог.
- Відкат: вимкнути прапорець / повернути web на `/api/auth/*` (для A відкат безболісний, бо BA-шлях нікуди не зникав).

## Верифікація (обов'язково)

Для виконавця, **коли** блокери зняті:

1. `pnpm --filter @sergeant/server test -- src/routes/account-recovery.contract.test.ts src/__tests__/sentry-sampler.test.ts` і `pnpm --filter @sergeant/shared test -- contract-fixtures/accountRecovery` - зелені; `pnpm --filter @sergeant/server typecheck`; `pnpm api:check-openapi`.
2. Живий сценарій (локально, `pnpm dev:db && pnpm dev:server`): зареєструвати `user@example.com`; `POST /api/account/recovery {"email":"user@example.com"}` і `{"email":"noone@example.com"}` -> однакові статус і тіло `{ok:true}`; лист із посиланням з'являється лише для першого (перевірка по логу транспорту в dev, не по відповіді); `POST /api/account/recovery/confirm` з токеном із листа -> `{ok:true}`, повторний виклик тим самим токеном -> `{error}` (узагальнена); вхід зі старим паролем -> відмова, з новим -> успіх; старі сесії -> 401.
3. Rate limit: 6 запитів підряд з одного IP -> 429 на шостому; те саме для email з різних `X-Forwarded-For` після 10-го.
4. Docs-гейти (Hard Rule #15): `node scripts/docs/check-freshness.mjs --check-coverage`, `node scripts/docs/generate-open-work.mjs --check`, `pnpm lint:specs`.

Якщо приймається Варіант C - верифікація: `rg -i "account.?recovery|account/recovery" apps packages docs` не знаходить нічого, окрім історичних записів; `sentry-sampler` тест зелений без рядків про recovery.

## Відкриті питання до власника

Кожне - вибір із наслідком; дефолтів, які я вважаю прийнятими, немає.

- **Q1 (головне). Яка потреба?** Чи є реальний сценарій, якого не закриває BA-reset + `/api/me/restore`? Варіанти: (a) **немає** - тоді Варіант C (зняти контракт), або Варіант A як стабільний фасад «на майбутнє» з явним визнанням, що це дубль; (b) **акаунти лише з Google/Apple**, які втратили провайдера - потрібен потік «встановити пароль» (перевірити Q2); (c) **втрата пошти** - потрібен другий фактор, це окремий, набагато більший проєкт з власним threat-model і, ймовірно, ADR. Наслідок вибору: (a) - 0 нового коду безпеки; (b)/(c) - нова поверхня відновлення.
- **Q2. Що з соціальними акаунтами?** Чи повинен `request-password-reset` для користувача без credential-запису (a) мовчки нічого не робити (як для неіснуючого email), (b) надсилати лист «встановити пароль», (c) надсилати лист «увійди через Google/Apple»? Зараз поведінка BA не перевірена (залежності не встановлені) - до відповіді потрібен один запуск проти живої БД. Також підтвердити TTL і одноразовість reset-токена BA в `^1.6.23`.
- **Q3. Контракт vs сервер.** Схеми кажуть 8-128 символів пароля, сервер вимагає 10-256; відповідь `202 {ok:true}` проти `200 {status,message}` в BA. Що канонічне: (a) підняти схеми до 10-256 і залишити `202 {ok:true}`; (b) переписати контракт під форму BA і знищити власні схеми; (c) не мати контракту (Варіант C). Це також відповідає, чи переключати web-клієнт на новий шлях.
- **Q4. Два публічні входи.** Якщо A: чи лишати `/api/auth/request-password-reset` доступним назовні паралельно з `/api/account/recovery`, чи закривати (ризик: ламає наявні листи й UI, які вже ходять у BA)?
- **Q5. Лист.** Чи однаковий шаблон для recovery і reset (зараз один `passwordResetMail`)? Чи потрібне окреме брендування/текст для сценарію «акаунт у вікні видалення»? Копірайт - за `sergeant-copy-and-tone`.
- **Q6. Прапорець.** Роут публічний і без сесії; чи вмикати за feature-прапорцем спершу (безпечніше, +1 запис у реєстрі тумблерів), чи одразу?
- **Q7. Скоуп «відновлення».** Чи ділимо терміни: «recovery» = лише скидання пароля (як у контракті), а відновлення видаленого - залишається `/api/me/restore`; чи власник має на увазі щось третє?

## Ризики

- **Дубль поверхні безпеки.** Два входи на одну дію подвоюють аудит rate limit / CSRF / логів; кожна пропущена гілка (пастка матчера rate-limit) - дірка саме на шляху, який атакують найчастіше.
- **Ілюзія готового контракту.** Контракт «узгоджений наперед», але вже розійшовся з сервером (8/10, 128/256) за 4,5 місяця без реалізації; найдорожче в такому заготовку - припущення, що він досі правильний.
- **Осиротілий код лишається, якщо питання Q1 не вирішене:** контракт-тест, схеми, фікстури й Sentry-правило продовжують захищати неіснуючий роут (аудит § 3г).
- **Незнання поведінки BA** для соціальних акаунтів і TTL токена: блокує Q2; закривається одним запуском проти живої БД.

## Стан виконання

- 2026-09-30: розвідка й чернетка (цей документ). Код не змінювався. Пункт аудиту `2026-08-05-orphaned-code-audit.md` § P1 (`account-recovery`) позначено «рішення власника дане, спека - тут».
- 2026-09-30: власник обрав Варіант C, контракт знято (див. § Рішення). Код роуту не з'являвся.
