<!-- Lifecycle: Active | Owner: product | Added: 2026-09-17 | Next review: 2027-03-17 -->

# Дизайн-контракт: auth (вхід, реєстрація, скидання пароля, verify)

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-04-01.
> **Status:** Active — контракт as-built: описує `core/auth/{AuthPage,LoginForm,RegisterForm,ForgotPasswordPanel,ResetPasswordPage,VerifyEmailPage,GoogleSignInButton,AppleSignInButton,authFormPrimitives}.tsx`, `authSchemas.ts`, `useForgotPassword.ts`, `AuthContext.tsx` (`translateAuthError`) і маршрути `/sign-in`, `/reset-password`, `/verify-email` у `core/app/StandaloneRoutes.tsx` станом на 2026-09-17 (пункт «без контракту лишаються auth, profile, HubChat…» у [`README.md`](../README.md); пишеться, бо поверхню беруть у роботу). Розбіжності з кодом, які контракт вимагає закрити, позначені **[борг]** нижче; код у цьому PR не правився.

Поверхня, на якій продукт уперше просить довіру: `/sign-in` (один екран
у двох режимах — вхід і реєстрація, з панеллю «Забули пароль?» усередині),
`/reset-password` (лендинг magic-link із листа) і `/verify-email` (лендинг
після кліку «Підтвердити email»). Усі три — standalone-маршрути поза хабом
і поза будь-яким модулем; на них можуть потрапити з листа, в іншому
браузері, без сесії й без локальних даних узагалі. До 2026-09-17 ця
поверхня жила за рішенням D1 «лише візуальне оновлення» і не мала
контракту, за яким її можна перевірити на рев'ю.

## Проблема

Auth — єдина поверхня, де користувач читає помилки сервера, і єдина, де
частина копі народжується не в каталозі, а в мапері кодів Better Auth.
Без контракту три сторінки однієї поверхні вже розійшлись між собою:
заголовок `/sign-in` стоїть на `headline`, а два лендинги — на `display`;
картка на всіх трьох оголошує `prominence="hero"`, який без `module`
не робить нічого; кнопка результату на `/verify-email` сидить на легасі-
варіантах, яких храповик не бачить; сім із десяти файлів каталогу живуть
у allowlist кирилиці. Агент, який верстає новий стан (2FA, зміна email,
passkey), не має чого скопіювати, крім найближчого сусіда.

## Мета

Один документ, за яким (а) рев'ю перевіряє PR у `core/auth/**` на палітру,
примітиви, стани, копі й безпеку, (б) агент верстає новий стан auth без
здогадок. Контракт as-built: кожне правило нижче або вже так у коді, або
позначене як **[борг]** із файлом і рядком. Станом на 2026-09-17 відкритих
боргів **9** (перелік у § «Підсумок боргів»).

## Продуктові рішення, на які спирається контракт

- **[ADR-0017](../../../governance/adr/0017-better-auth-choice-and-session-model.md):
  Better Auth як єдиний auth-stack.** Email + пароль, мінімум 10 символів,
  сесія 7 днів із добовим rolling-refresh і 5-хвилинним cookie-кешем
  (`apps/server/src/auth.ts:454-461`). На клієнті Better Auth — лише
  actions-layer (`signIn` / `signUp` / `signOut` / `requestPasswordReset` /
  `resetPassword` в `authClient.ts`); «хто я» каже `GET /api/v1/me` через
  `useUser()` в `AuthContext.tsx:319-324`, `useSession` навмисно не
  реекспортується (`authClient.ts:168-173`).
- **D1 (2026-05-22): AuthPage v2 — лише візуальне оновлення**
  ([`phase-7-product-decisions-2026-05-22.md`](../redesign-v2/phase-7-product-decisions-2026-05-22.md)
  § D1): `MeshBackground`, `Card prominence="hero"`, `text-style-display`,
  touch targets ≥44px, `focus-visible`. Флоу не чіпати. Соцвхід, який D1
  забороняв додавати, приїхав пізніше окремою ініціативою (0010 Phase
  4.3, JSDoc `AppleSignInButton.tsx:10`) і тепер частина as-built.
- **PR-H7 (2026-09-13, закрито 2026-09-15): гейт онбордингу закривається
  лише підтвердженою сесією** — `markOnboardingDone()` викликається
  рівно в рендері `/sign-in` для `!authLoading && user`
  (`StandaloneRoutes.tsx:182-194`), а не при тапі «У мене вже є акаунт».
  Джерело — [`2026-09-13-product-full-review.md § PR-H7`](../../../work/specs/audits/2026-09-13-product-full-review.md).
- **Auth — не гейт, а опція.** «Поки що пропустити» повертає в застосунок
  (`HubPage.tsx:46-56`: на `/welcome`, якщо онбординг не пройдено; інакше
  крок назад по історії; інакше `/`). Копі під кнопкою прямо каже: акаунт
  потрібен лише для синхронізації (`AuthPage.tsx:204-207`). Предикат «є
  справжній акаунт» один — `useHasAccount()` (`useHasAccount.ts:31-38`).
- **Один спосіб відкрити вхід — `useOpenSignIn()`** (`useOpenSignIn.ts`),
  SPA-перехід на `SIGN_IN_PATH`; `/login`, `/signin`, `/auth` — редиректи
  на канонічний `/sign-in` (`appPaths.ts:97-101`, `StandaloneRoutes.tsx:217-220`).
- **Соцвхід — opt-out, Apple — opt-in.** `VITE_SOCIAL_LOGIN_ENABLED !== "false"`
  ховає Google разом із роздільником «або»; `VITE_APPLE_LOGIN_ENABLED === "true"`
  показує Apple (`AuthPage.tsx:36-41`, чому саме так — коментар `:23-35`).
- **Верифікація email — не блокер входу за замовчуванням.** Лист іде на
  кожен sign-up (`auth.ts:424`), але `requireEmailVerification` читається
  з env і за замовчуванням вимкнений (`auth.ts:384-398`).

## Палітра і тон поверхні

Auth — **pre-module поверхня зі stone-брендом**: `MeshBackground` монтується
без `<ModuleAccentProvider>` (`AuthPage.tsx:88-94`, `ResetPasswordPage.tsx:122-123`),
тож `--module-accent-rgb` тут не визначений, і жодна `bg-module-accent*`-
утиліта не має права з'явитись ([`module-accent.md` § правило 2](../module-accent.md)).
Семантика кольору на поверхні рівно трирівнева: **бренд** для інформації
й успіху, **danger** для помилок, **muted / subtle** для другорядного.

| Елемент                     | Канон                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Оболонка (усі три сторінки) | `MeshBackground className="items-center px-5 overflow-y-auto"` + safe-area `paddingTop/Bottom: max(1.25rem, env(safe-area-inset-*))`; `main#main tabIndex={-1} max-w-sm my-auto`. Зовні — обгортка `page-enter h-app-dvh min-h-0` (`StandaloneRoutes.tsx:205, 231, 248`; чому потрібна висота — AI-DANGER `:198-204`).                                                                                                                                                                        |
| Логотип                     | `BrandLogo as="h1" size="md" className="justify-center"` над карткою, `text-center mb-6` (`AuthPage.tsx:107-109`, `ResetPasswordPage.tsx:136-138`, `VerifyEmailPage.tsx:166-168`). `h1` — логотип; заголовок екрана — `h2`.                                                                                                                                                                                                                                                                   |
| Картка                      | `Card prominence="hero" radius="xl" padding="lg" className="space-y-5"` (`AuthPage.tsx:111-116`, `ResetPasswordPage.tsx:140`, `VerifyEmailPage.tsx:170`). **[борг]** без `module` `hero` падає у захисний фолбек `NON_MODULE_PROMINENCE.default` = `bg-panel border border-line shadow-e1` (`Card.tsx:321-331`, коментар називає це misconfiguration). Фактичний вигляд — `default`; проп бреше. Рішення власника: або `prominence="default"` явно, або нейтральний hero в `Card`.            |
| Заголовок екрана            | `h2 text-style-display text-text` з heading-focus (`tabIndex={-1}`, `focus-visible:ring-2 ring-focus/45 rounded-sm`, `ResetPasswordPage.tsx:142-146`, `VerifyEmailPage.tsx:186-190`). **[борг]** `AuthPage.tsx:118` — `text-style-headline` без heading-focus: одна поверхня, дві ролі; D1 називає `display`.                                                                                                                                                                                 |
| Підзаголовок                | `p text-style-label text-subtle mt-2` (`AuthPage.tsx:121`, `ResetPasswordPage.tsx:149`).                                                                                                                                                                                                                                                                                                                                                                                                      |
| Лейбл поля                  | `label text-style-caption text-muted mb-1.5`, завжди з `htmlFor` (`LoginForm.tsx:63-68`, `RegisterForm.tsx:60-65`, `ResetPasswordPage.tsx:176-181`).                                                                                                                                                                                                                                                                                                                                          |
| Помилка поля                | `FieldError`: `p role="alert" text-style-caption text-danger-strong dark:text-danger mt-1.5` з `id`, на який поле посилається через `aria-describedby` лише коли помилка є (`authFormPrimitives.tsx:73-84`, `LoginForm.tsx:76-82`).                                                                                                                                                                                                                                                           |
| Серверна помилка            | Бокс `role="alert" text-style-caption text-danger-strong dark:text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-2.5` (`LoginForm.tsx:126-133`, `RegisterForm.tsx:132-139`, `ResetPasswordPage.tsx:237-248`). Джерело тексту — `authError` з `useAuth()`, не `serverError` форми (чому — коментар `LoginForm.tsx:122-125`).                                                                                                                                                  |
| Інформаційна панель         | Бренд, не success: `bg-brand-500/10 border border-brand-500/30 rounded-xl` — панель скидання (`ForgotPasswordPanel.tsx:31`) і «Пароль оновлено» (`ResetPasswordPage.tsx:243`). На `/verify-email` — чип іконки `w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-strong`, для проблеми `bg-danger/10 text-danger-strong` (`VerifyEmailPage.tsx:172-185`).                                                                                                                                     |
| Лінк-кнопки                 | `text-brand-strong dark:text-brand-400 hover:underline` + `focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45` (`AuthPage.tsx:184`, `LoginForm.tsx:96`). `focus:outline-none` — дозволений парний патерн гейта (`check-design-conventions.mjs:12-15`).                                                                                                                                                                                                                       |
| Роздільник «або»            | `text-style-caption text-muted` між двома `h-px bg-line`, рендериться лише разом із соцкнопками (`AuthPage.tsx:157-163`).                                                                                                                                                                                                                                                                                                                                                                     |
| Індикатор сили пароля       | Трек `h-1 rounded-full bg-line`, заливка `w-1/3 → w-full`, підпис `text-style-caption font-medium` (`authFormPrimitives.tsx:9-41`). **[борг]** середній рівень фарбується сирою палітрою `bg-amber-400` / `text-amber-500` (`:17, :21`) замість семантичного `warning` / `warning-strong` (токен існує саме для тексту: `tailwind-preset.js:295`, `#92400e`, 5.94:1 на `#ecebe7`); канон — «семантичні токени → утиліти» ([`01-tokens-colors.md` § 1](../design-system/01-tokens-colors.md)). |
| Іконки                      | `Icon name="eye" / "eye-off" size="lg"` (`authFormPrimitives.tsx:63`), `alert` / `check` `size={22} strokeWidth={2.5}` (`VerifyEmailPage.tsx:180-184`; 22 — позашкальне число, храповик `numericIconSize` його свідомо не рахує). Google/Apple — інлайн-SVG 18px; hex-заливки Google (`GoogleSignInButton.tsx:24-38`) — брендові кольори провайдера в атрибутах SVG, не в `className`, гейт їх не чіпає і не має.                                                                             |
| Типографіка                 | Лише `.text-style-*` (`display` / `headline` / `label` / `body` / `caption`). Нижче 12px нічого — `pnpm lint:design-conventions` зелений на `core/auth` (перевірено 2026-09-17).                                                                                                                                                                                                                                                                                                              |
| Motion                      | `main`: `motion-safe:animate-in motion-safe:fade-in motion-safe:duration-slower`; картка `/sign-in` додатково `slide-in-from-bottom-2 duration-slow` (`AuthPage.tsx:105, 115`); індикатор пароля `transition-all duration-slow`. Без конфеті, без пульсації.                                                                                                                                                                                                                                  |
| Юридичні лінки              | `LegalLinks compact className="mt-5"` під карткою лише на `/sign-in` (`AuthPage.tsx:211`); `text-style-caption text-muted`, кожен лінк `min-h-11 min-w-11`.                                                                                                                                                                                                                                                                                                                                   |

## Примітиви й кнопки

Канон кнопки — `(variant, tone)`, `variant ∈ solid | soft | outline | ghost`
([`04-components § Button`](../design-system/04-components.md)). `tone` на
цій поверхні завжди `neutral` (не передається): auth поза модулем.

| Кнопка                             | Канон                                                                                                                                    | Стан у коді                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Головна дія форми                  | `Button type="submit" variant="solid" size="lg" className="w-full" loading={isSubmitting}`                                               | так: «Увійти» (`LoginForm.tsx:135-143`), «Зареєструватися» (`RegisterForm.tsx:141-149`), «Встановити новий пароль» (`ResetPasswordPage.tsx:250-263`)                                                                                                                                                                                                                  |
| Соцвхід Google / Apple             | `Button variant="outline" size="lg" className="w-full" loading disabled={loading}` + SVG 18px                                            | так (`GoogleSignInButton.tsx:13-21`, `AppleSignInButton.tsx:21-30`). **[борг]** JSDoc `AppleSignInButton.tsx:10-12` досі каже `variant="secondary"` — застарілий коментар, який наступний агент скопіює                                                                                                                                                               |
| Панель скидання: надіслати / назад | `Button variant="outline" size="md" className="w-full"`                                                                                  | так (`ForgotPasswordPanel.tsx:40-48, 83-92`)                                                                                                                                                                                                                                                                                                                          |
| «Поки що пропустити»               | `Button variant="outline" size="md" className="w-full"` під карткою                                                                      | так (`AuthPage.tsx:195-203`); рендериться лише коли `onContinueWithoutAccount` передано                                                                                                                                                                                                                                                                               |
| `/reset-password` без токена       | `Button variant="outline" size="md" className="w-full"` → `/sign-in`                                                                     | так (`ResetPasswordPage.tsx:163-171`)                                                                                                                                                                                                                                                                                                                                 |
| `/verify-email`: результат         | `variant="solid"` для успіху, `variant="outline"` для проблеми, `size="lg" className="w-full"`                                           | **[борг]** `VerifyEmailPage.tsx:210` — `variant={isProblem ? "secondary" : "primary"}`: легасі-аліаси в тернарі, який храповик `legacyButton` не бачить (регекс `\svariant=("…"\|'…')`, `check-ui-canon-ratchet.mjs:268`); той самий клас, що вже ловили на `/pricing` 2026-09-16                                                                                     |
| Перемикач режиму                   | Ручний `<button>` лінк-стилю з `min-h-touch-target`, `text-style-label`, канонічна фокус-рамка                                           | так (`AuthPage.tsx:181-189`); рукописна рамка йде в стелю `handRolledFocusRing` (225, не борг на міграцію)                                                                                                                                                                                                                                                            |
| «Забули пароль?»                   | Ручний `<button>` `text-style-caption`, канонічна фокус-рамка                                                                            | так (`LoginForm.tsx:93-99`); без власного `min-h` — 44px під `pointer: coarse` дає safety-net `mobile.css:37-47`; на fine pointer менший за 44px — це системна знахідка PR-X4, а не борг цієї поверхні                                                                                                                                                                |
| Показати / сховати пароль          | Ручний `<button aria-label aria-pressed>` `absolute inset-y-0 right-1 p-3`, Input із `pr-12`                                             | так (`authFormPrimitives.tsx:48-66`); 20px іконка + 12px паддинг = 44×44, пояснення в коментарі `:52-54`                                                                                                                                                                                                                                                              |
| Поля                               | `Input` за замовчуванням (`bg-panelHi border-line`, `focus-visible:ring-focus/45`), `error` + `aria-invalid` + `aria-describedby` у парі | так на всіх полях; `autoComplete` виставлено (`email` / `current-password` / `new-password` / `name`), `autoFocus` на першому обов'язковому полі з `eslint-disable`-обґрунтуванням (`LoginForm.tsx:74-75`, `RegisterForm.tsx:92-93`, `ForgotPasswordPanel.tsx:69-70`); `/reset-password` замість `autoFocus` фокусує заголовок (F25, `ResetPasswordPage.tsx:112-119`) |

Touch targets ≥44px під `pointer: coarse` — тримають `Button`, `Input`
(`COARSE_TOUCH_FLOOR`, `Input.tsx:53-60`) і safety-net для голих `<button>`.

## Стани, які поверхня зобов'язана мати

| Стан                               | `/sign-in`                                                                                                                                                                                                                     | `/reset-password`                                                                                                                                                     | `/verify-email`                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Сесія ще вантажиться               | `PageLoader` у `Suspense`; редирект відкладено до `!authLoading` (`StandaloneRoutes.tsx:176-178`)                                                                                                                              | те саме                                                                                                                                                               | те саме                                                                                                                                                                                                           |
| Уже увійшов                        | `markOnboardingDone()` + `RedirectTo "/"` (PR-H7, `StandaloneRoutes.tsx:182-195`)                                                                                                                                              | Рендериться безумовно — токен може належати іншому акаунту (`:222-224`)                                                                                               | Рендериться безумовно — лист могли відкрити в іншому браузері (`:238-242`)                                                                                                                                        |
| Гість                              | Режим `login` за замовчуванням (`AuthPage.tsx:42`), `key={mode}` ремаунтить форму при перемиканні (`:130-137`)                                                                                                                 | Форма з двома полями                                                                                                                                                  | Гілка `unknown`: «Тут не видно статусу без входу», CTA «На сторінку входу» (`VerifyEmailPage.tsx:61-62, 219-221`)                                                                                                 |
| Валідація на клієнті               | zod: email обов'язковий + формат; пароль на вході лише «не порожній» (старі 6-символьні акаунти, `authSchemas.ts:14-18`), на реєстрації 10–128, ім'я ≤80 і опційне (`:22-37`)                                                  | 10–128 + збіг через `superRefine` (`ResetPasswordPage.tsx:27-43`)                                                                                                     | —                                                                                                                                                                                                                 |
| Надсилаю                           | `Button loading` (`aria-busy`), усі поля `disabled={isSubmitting}`; підпис «Входжу…» / «Реєструю…» (`loadingActions`, `uk.ts:278-279`)                                                                                         | «Зберігаю…», поля `disabled` (`ResetPasswordPage.tsx:192, 254-259`)                                                                                                   | Гілка `syncing`: «Перевіряю підтвердження» / «Оновлюю профіль…» до завершення `refreshSessionCookieCache()` + `refresh()` (`:116-127`)                                                                            |
| Успіх                              | Вхід: тост «Вхід виконано» (`LoginForm.tsx:50`), далі гейт маршруту сам веде на `/`. Реєстрація: тосту немає, `SIGNUP_COMPLETED` і той самий редирект (`AuthContext.tsx:529-535`)                                              | Тост «Пароль оновлено» + статус-бокс `role="status"` + `/sign-in` через `POST_SUCCESS_REDIRECT_MS` (1,5 с за тестом), кнопка «Готово» `disabled` (`:94-100, 237-263`) | Гілка `verified`: «Email підтверджено», авторедирект на `/` (або `/sign-in` анонімному) через той самий таймаут (`:133-144`)                                                                                      |
| Неправильні дані / помилка сервера | `authError` у боксі під полями; текст із `translateAuthError` за кодом Better Auth, 429 → `rateLimited`, ≥500 → `serverDown` (`AuthContext.tsx:157-207`)                                                                       | `serverError` форми з тим самим мапером (`:81-91`); після помилки форма НЕ блокується — статус береться з `lastResponse`, не з `isSubmitSuccessful` (`:103-110`)      | Гілка `failed` за `?error=`: власна мапа `ERROR_COPY` для `TOKEN_EXPIRED` / `INVALID_TOKEN` / `USER_NOT_FOUND` / `INVALID_USER`, інакше `FALLBACK_ERROR_COPY` (`:26-37`); чому не `translateAuthError` — `:22-24` |
| Email уже зареєстровано            | `register()` повертає `"exists"`, форма сама перемикається на вхід, `authError` «Цей email вже зареєстровано. Спробуй увійти.» лишається видимим (`RegisterForm.tsx:42-49`, `AuthPage.tsx:82-84`)                              | —                                                                                                                                                                     | —                                                                                                                                                                                                                 |
| Забув пароль                       | Панель `role="group" aria-label="Скидання пароля"` з префілом email із поля входу (`useForgotPassword.ts:32-37`); `authError` форми входу при відкритій панелі ховається (`LoginForm.tsx:126`)                                 | —                                                                                                                                                                     | —                                                                                                                                                                                                                 |
| Лист надіслано                     | Стан `sent`: нейтральна копія без підтвердження існування адреси, «Назад до входу», автозгортання через 6 с (`useForgotPassword.ts:57-76`)                                                                                     | —                                                                                                                                                                     | —                                                                                                                                                                                                                 |
| Посилання неповне / протерміноване | —                                                                                                                                                                                                                              | `!token` → `role="alert"` бокс + «На сторінку входу» замість форми (`:154-172`); `INVALID_TOKEN` від сервера → `messages.auth.invalidToken`                           | `notVerified` (відкрито без листа): «Email ще не підтверджено», редиректу НЕМАЄ, щоб людина прочитала, що робити (`:57-58, 135-137`)                                                                              |
| Соцвхід не стартував               | `PROVIDER_NOT_FOUND` → «Цей провайдер входу не налаштовано.», спіннер кнопки скидається (`AuthPage.tsx:64-70`, `AuthContext.tsx:479-485`)                                                                                      | —                                                                                                                                                                     | —                                                                                                                                                                                                                 |
| Соцвхід вимкнено на деплої         | Кнопок і роздільника «або» немає; email-форма лишається (`AuthPage.tsx:155-178`)                                                                                                                                               | —                                                                                                                                                                     | —                                                                                                                                                                                                                 |
| Офлайн                             | **Окремого офлайн-стану немає.** Мережева помилка йде тим самим `translateAuthError`; нерозпізнане повідомлення повертається як є (`AuthContext.tsx:230`) — див. борг у § Копі. Це не гейт: «Поки що пропустити» працює офлайн | так само                                                                                                                                                              | `refresh()` без мережі осідає на 401 → гілка `unknown`                                                                                                                                                            |
| Пропустити                         | «Поки що пропустити» + пояснення про синхронізацію (`AuthPage.tsx:193-209`); куди веде — `HubPage.tsx:46-56`                                                                                                                   | Немає (шлях назад — «На сторінку входу» без токена)                                                                                                                   | Немає (є CTA «У застосунок» / «На сторінку входу»)                                                                                                                                                                |

Стан, якого в коді немає і який контракт не вигадує: **2FA**, passkey,
magic-link для входу, повторне надсилання verify-листа з цієї сторінки
(копі `/verify-email` відсилає у профіль).

## Копі

- **Каталожна частина — `uk.core.ts` → `auth.*`** (`apps/web/src/shared/i18n/uk.core.ts:325-352`):
  `signInWithApple`, `genericFailure`, мапа кодів Better Auth
  (`invalidEmailOrPassword`, `invalidToken`, `userAlreadyExists`,
  `invalidEmail`, `invalidPassword`, `passwordTooShort`, `passwordTooLong`,
  `emailNotVerified`, `providerNotFound`, `sessionFailure`), серверні
  `rateLimited`, `serverDown` і `createAccount` (споживач —
  `core/onboarding/SoftAuthPromptCard.tsx:111`, не ця поверхня). Саме
  `uk.core`, а не `uk`: `AuthContext.tsx` — eager-поверхня, і повний
  каталог тягнув би десять модульних файлів (AI-DANGER `AuthContext.tsx:32-42`).
- **Валідація — `uk.ts` → `validation.*`** (`uk.ts:51-103`): `emailRequired`,
  `emailInvalid`, `passwordRequired`, `passwordMin10`, `passwordMax128`,
  `nameMax80`, `passwordResetMin10`, `passwordsDontMatchDot` (з крапкою —
  навмисно окремий ключ від `passwordsDontMatch`, коментар `:96-100`).
  Підписи очікування — `uk.ts` → `loadingActions.signingIn` «Входжу…»,
  `registering` «Реєструю…».
- **[борг] Решта копі живе поза каталогом.** Сім файлів поверхні стоять у
  `apps/web/eslint.i18n-allowlist.json:79-85` (`AuthPage`, `ForgotPasswordPanel`,
  `GoogleSignInButton`, `LoginForm`, `RegisterForm`, `ResetPasswordPage`,
  `authFormPrimitives`) — заголовки, підзаголовки, лейбли, плейсхолдери,
  підписи кнопок, текст панелі скидання, «Слабкий / Середній / Надійний».
  Плюс літерали, яких лінт не бачить узагалі, бо вони не в JSX: мапи
  `ERROR_COPY` / `HEADING_COPY` / `BODY_COPY` у `VerifyEmailPage.tsx:26-63`,
  fallback-и `translateAuthError` в `AuthContext.tsx:429, 463, 496, 518, 758`,
  «Введи email, на який відправити лист.» у `useForgotPassword.ts:48`.
  Храповик `cyrillicJsxAllowlist` стоїть на 299 і не росте, тож новий стан
  auth пише рядки в каталог або звільняє місце міграцією одного з цих
  семи файлів.
- **[борг] Помилки без наступного кроку й англійський витік.**
  `translateByMessage` повертає нерозпізнане повідомлення сирим
  (`AuthContext.tsx:230`, `return message || fallback`), тобто мережева
  помилка або новий код Better Auth доїжджає в UI англійською; fallback-и
  «Помилка входу» / «Помилка реєстрації» (`:429, :518`) не закриті дією,
  як вимагає [`style-guide.uk.md` § 1.5 і § 3](../../../product/copy/style-guide.uk.md);
  «Акаунт для цієї адреси не знайдено.» (`VerifyEmailPage.tsx:31`) і
  «Не вдалося скинути пароль. Посилання могло вже бути використане.»
  (`ResetPasswordPage.tsx:88`) — теж без кроку. Приклад правильної форми
  вже поруч: `TOKEN_EXPIRED` (`VerifyEmailPage.tsx:27-28`).
- **[борг] Підпис головної дії — рішення власника, не код.** § 4
  style-guide тримає виняток «головна дія логіну / онбордингу — наказова:
  „Увійди", „Створи акаунт"», а поверхня послідовно пише інфінітив:
  «Увійти» (`LoginForm.tsx:142`), «Зареєструватися» (`RegisterForm.tsx:148`),
  «Створити акаунт» як заголовок (`AuthPage.tsx:119`). Історична правка
  § 4 від 2026-08-26 сама визнає, що продукт цього винятку ніколи не
  виконував. Або зняти виняток із гайду, або перекласти підписи — не
  вирішувати мовчки в PR.
- Тон у решті — за гайдом: «ти» («Введи email акаунту», «Перевір вхідні
  та папку «Спам»»), перша особа для дій продукту («пришлю посилання»,
  «Зараз перенесу на вхід…», «Зараз поверну тебе в застосунок»), без
  «Ви», без «Зачекайте», без довгого тире в копії. Нейтральна копія
  «Якщо такий email зареєстровано…» — свідомо без підтвердження
  існування адреси (`useForgotPassword.ts:26-28`).

## Аналітика

Івенти з `packages/shared/src/lib/analyticsEvents.ts`:

- `signup_provider_selected {provider, surface}` — стріляє ДО редиректу
  на провайдера для `google` / `apple`, `surface: sign_in | sign_up` за
  режимом (`AuthPage.tsx:59-80`; чому до редиректу — коментар `:53-58`).
  **[борг]** контракт (`analyticsEvents.ts:379-380`) оголошує ще
  `provider: "email"`, але email-шлях цього івента не шле ніде — воронка
  `_SELECTED → _COMPLETED` по email не будується.
- `signup_completed {method: email | google | apple}` — email: одразу
  після успішного `signUp.email`, до `invalidateMe` (`AuthContext.tsx:525-529`);
  OAuth: через `sessionStorage`-прапорець провайдера + порівняння
  `user.createdAt` з моментом редиректу після повернення на `/`
  (`consumePendingOAuthSignup`, `AuthContext.tsx:70-119`). Це «акаунт
  створено», незалежно від верифікації email.
- **Івента для входу (не реєстрації), для скидання пароля і для
  результату `/verify-email` немає.** Новий стан цих сторінок без івента
  не приймається, але й вигадувати ретроактивно тут нічого.
- `auth_prompt_shown / _dismissed / auth_after_value` — м'який запит на
  акаунт у хабі (`core/onboarding/SoftAuthPromptCard.tsx:65`); поверхня
  онбордингу, не ця.

## Безпека

- **Rate-limit — два бакети, обидва fail-closed** (`apps/server/src/config/rateLimit.ts:30-57`,
  монтуються на `/api/auth` у `routes/auth.ts:24-28`): 5 спроб / 60 с на
  IP (`AUTH_RATE_LIMIT_*`, `env.ts:495-497`) і 10 / 15 хв на акаунт за
  SHA-256 email-а (`AUTH_ACCOUNT_RATE_LIMIT_*`, `env.ts:505-507`). 429 на
  клієнті → `messages.auth.rateLimited` раніше за будь-який код
  (`AuthContext.tsx:171-174`).
- **CSRF.** `/api/auth/*` виключений із глобального `X-Requested-With`-гарда
  (`http/requireCsrfHeader.ts:20-32`): Better Auth несе власні PKCE +
  signed-state (аудит проти `better-auth@1.6.9` там же); клієнт усе одно
  шле заголовок (`authClient.ts:36-38`). `trustedOrigins`: `localhost:*`
  лише поза production, `https://appleid.apple.com`, нативні схеми,
  `ALLOWED_ORIGINS` (`auth.ts:679-715`).
- **Редиректи.** OAuth `callbackURL: "/"` (`AuthContext.tsx:459, 492`);
  reset-лист веде на `${window.location.origin}/reset-password`
  (`:752`); verify-лист — сервер переписує `callbackURL` на
  `{WEB_APP_URL}/verify-email` (`auth.ts:425-431`), і `VERIFY_EMAIL_PATH`
  мусить лишатись синхронним із `VERIFY_EMAIL_CALLBACK_PATH` сервера
  (`appPaths.ts:131-136`). Жодного `?next=` / `?redirect=` із URL поверхня
  не читає.
- **Enumeration.** Запит скидання завжди «прийнято» (`AuthContext.tsx:745-748`),
  відправка на сервері не await-иться (`auth.ts:406`); на вході
  `USER_NOT_FOUND` і `CREDENTIAL_ACCOUNT_NOT_FOUND` мапляться в те саме
  «Неправильний email або пароль.» (`AuthContext.tsx:179-182`).
- **Скидання пароля відкликає всі сесії** (`revokeSessionsOnPasswordReset: true`,
  `auth.ts:399-405`). Довжина пароля на сервері — `MIN_PASSWORD_LENGTH` /
  `MAX_PASSWORD_LENGTH` з env (`auth.ts:382-383`); клієнт тримає 10–128,
  тобто не м'якший за сервер.
- **Verify не довіряє URL.** Відсутність `?error=` ≠ успіх: джерело істини —
  `emailVerified` із сесії після обходу 5-хвилинного cookie-кешу
  (AI-DANGER `VerifyEmailPage.tsx:90-102`, `refreshSessionCookieCache`
  в `authClient.ts:218-243`).
- **Capacitor** — bearer-гілка замість cookie (`authClient.ts:18-57`);
  у браузері no-op. Мобільний контур на паузі, але шлях лишається в коді.

## Чого не робити

- Не тягнути модульний акцент чи `ModuleAccentProvider` на auth — поверхня
  pre-module, `bg-module-accent*` тут прозорий.
- Не фарбувати успіх семантичним `success`: інформація й успіх на auth —
  бренд (`bg-brand-500/10 border-brand-500/30`), як у панелі скидання.
- Не писати легасі `variant="primary"` / `"secondary"` — навіть у тернарі,
  який храповик не бачить (борг на `VerifyEmailPage.tsx:210` і є приклад).
- Не додавати новий рядок кирилиці в JSX цих семи файлів — allowlist на
  стелі; рядки йдуть у `uk.core.ts → auth` (для eager-шляху) або `uk.ts`.
- Не імпортувати повний `@shared/i18n/uk` у `AuthContext.tsx` і не
  додавати туди runtime-імпорт `@sergeant/shared` — білий екран на буті
  (`AuthContext.tsx:32-65`, `apps/web/AGENTS.md`).
- Не викликати `markOnboardingDone()` до підтвердженої сесії (PR-H7).
- Не додавати власний `navigate("/sign-in")` чи `<a href>` у нових
  поверхнях — лише `useOpenSignIn()`.
- Не показувати «Email підтверджено» без прочитаного `emailVerified`.
- Не вводити мінімальну довжину пароля на формі входу — старі акаунти.
- Не змінювати текст `SIGN_IN_PATH`-роутингу так, щоб `/reset-password` і
  `/verify-email` гейтились на `user` — обидві сторінки мусять рендеритись
  без сесії.

## Поза скоупом

- Зміна пароля / email, сесії, видалення акаунта — це `core/profile` і
  `core/settings` (Better Auth-методи `changePassword`, `changeEmail`,
  `listSessions`, `deleteUser` експортуються з того самого `authClient.ts`,
  але UI живе не тут).
- `SoftAuthPromptCard` і м'який запит на акаунт після першої цінності —
  [контракт онбордингу](./2026-09-16-onboarding-design.md).
- App Lock / біометрія (`APP_LOCK_*`, `BIOMETRIC_*` в `analyticsEvents.ts`) —
  окрема поверхня.
- Листи (verify, reset) — серверний `auth/verificationMail.ts` і
  `email/authTransactionalMail.ts`; їхній тон — гайд § 2 (перша особа
  однини), тут не описується.
- Мобільний застосунок і `mobile-shell` — контур на паузі
  ([ADR-0094](../../../governance/adr/0094-mobile-web-first-freeze.md));
  bearer-гілка в `authClient.ts` лишається кодом, не планом.

## Верифікація

- `pnpm --filter @sergeant/web exec vitest run src/core/auth` — стани з
  таблиці покриті `AuthPage.test.tsx` (валідація, обидва режими,
  перемикання, autoFocus / autocomplete / aria, панель скидання й
  автозгортання, прапорці соцвходу), `LoginForm.test.tsx`,
  `RegisterForm.test.tsx` (10 символів, fallback імені, `exists`),
  `ForgotPasswordPanel.test.tsx`, `useForgotPassword.test.tsx`,
  `ResetPasswordPage.test.tsx` (heading-focus, без токена, валідація,
  редирект через 1,5 с, `serverError`), `VerifyEmailPage.test.tsx` (три
  гілки без сесії, обхід cookie-кешу, редиректи, копія помилок),
  `authFormPrimitives.test.tsx`, `AuthContext*.test.tsx`, `authClient.test.ts`.
  Перед Vitest — `pnpm --filter @sergeant/db-schema build`.
- `pnpm --filter @sergeant/web e2e:auth` — `tests/smoke/auth.spec.ts`
  (`@critical auth: sign-up leads to authenticated hub surface`) і
  `auth-webkit.spec.ts` (`@auth` sign-up на webkit / mobile-safari +
  збереження cookie після reload; nightly-матриця). `auth.setup.ts`
  проходить реєстрацію через UI один раз на прогін для решти `@critical`.
- `pnpm --filter @sergeant/web e2e:mobile` — `mobile-ui-audit.spec.ts:196`
  міряє `/sign-in` (44px під `pointer: coarse`, горизонтальний overflow).
  У `tests/a11y/axe.spec.ts` auth-маршрутів немає; Storybook-сторі для
  `core/auth` теж немає — обидва факти as-built, не вимога.
- `pnpm lint:ui-canon` — `legacyButton` 0, `cyrillicJsxAllowlist` 299,
  `handRolledFocusRing` 225 (перевірено 2026-09-17: зелений, бо тернар у
  `VerifyEmailPage` невидимий для метрики — саме тому його ловить лише
  цей контракт). `pnpm lint:design-conventions` — зелений на `core/auth`.
- Рев'ю за цим документом: бренд без модульного акценту, стани з таблиці,
  копі з каталогу, помилка з наступним кроком, івент на новий стан,
  редирект лише на відомі шляхи.

## Підсумок боргів (2026-09-17)

| #   | Де                                                                                                             | Що                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `VerifyEmailPage.tsx:210`                                                                                      | Легасі `secondary` / `primary` у тернарі `variant`                                      |
| 2   | `AuthPage.tsx:112`, `ResetPasswordPage.tsx:140`, `VerifyEmailPage.tsx:170`                                     | `Card prominence="hero"` без `module` рендериться як `default`                          |
| 3   | `AuthPage.tsx:118`                                                                                             | `text-style-headline` проти `display` на двох інших сторінках і в D1; без heading-focus |
| 4   | `authFormPrimitives.tsx:17, 21`                                                                                | Сирі `bg-amber-400` / `text-amber-500` замість `warning` / `warning-strong`             |
| 5   | `AppleSignInButton.tsx:10-12`                                                                                  | JSDoc описує `variant="secondary"`, код — `outline`                                     |
| 6   | `eslint.i18n-allowlist.json:79-85` + `VerifyEmailPage.tsx:26-63`, `AuthContext.tsx`, `useForgotPassword.ts:48` | Копі поза каталогом                                                                     |
| 7   | `AuthContext.tsx:230, 429, 518`, `VerifyEmailPage.tsx:31`, `ResetPasswordPage.tsx:88`                          | Помилки без наступного кроку; нерозпізнане повідомлення витікає англійською             |
| 8   | `LoginForm.tsx:142`, `RegisterForm.tsx:148` ↔ style-guide § 4                                                  | Інфінітив на головній дії проти винятку гайду — потрібне рішення власника               |
| 9   | `analyticsEvents.ts:379-380` ↔ `AuthPage.tsx:59-80`                                                            | `signup_provider_selected {provider: "email"}` оголошений, але не шлеться               |
