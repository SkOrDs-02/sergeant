<!-- Lifecycle: Active | Owner: product | Added: 2026-09-17 | Next review: 2027-03-17 -->

# Дизайн-контракт: профіль

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2027-05-10.
> **Status:** Active — контракт as-built: описує `core/profile/{ProfilePage,PersonalInfoSection,ChangePasswordSection,SessionsSection,BiometricsSection,MemoryBankSection,AiMemorySection,DangerZoneSection,DeleteAccountDialog}.tsx`, `avatar.ts`, `biometrics.ts`, `useBiometrics.ts`, `recordBodyWeight.ts`, `useLatestBodyWeight.ts` і `core/security/AppLockSettings.tsx` (як гостя групи «Безпека») станом на 2026-09-17. Код не правився: кожна розбіжність із каноном позначена **[борг]** із файлом і рядком. Відкритих боргів — 5 (перелік у підсумку внизу).

Профіль — вкладка хаба (`/?tab=profile`), де людина керує собою, а не
застосунком: хіро ідентичності (аватар, імʼя, email), «Вийти» одразу під
ним, три групи-дисклоужери — «Безпека» (пароль, сесії, PIN), «Про тебе»
(памʼять, біометрія) та «Акаунт» (видалення). До 2026-09-17 поверхня не
мала дизайн-контракту; [`README.md`](../README.md) прямо перелічував її
серед тих, що «тримає нейтральний stone-бренд без модульного акценту та
компоненти хаба», доки поверхню не візьмуть у роботу.

## Проблема

Профіль — найбезпечніша поверхня продукту з погляду дизайну (жодного
модульного акценту, лише примітиви хаба) і найнебезпечніша з погляду
дій: тут стирають локальну базу («Вийти»), відкликають сесії, видаляють
акаунт. Кожна з цих дій пройшла через окремий аудит (V-4/V-10/V-11
2026-08-08, F1/F4/F6/L-4/L-17/L-18/L-19, D1/D4/D7, огляд 2026-09-04,
звіт власника 2026-09-13), і рішення осіли в коментарях коду, а не в
одному документі. Агент, який верстає новий рядок Профілю, копіює
найближчого сусіда, а сусіди неоднорідні: половина копі в каталозі
`uk.ts`, половина літералами під allowlist-ом; діалог видалення акаунта
рукописний і стоїть на нереєстрованому z-рівні; підтвердження виходу йде
через спільний `ConfirmDialog`, у якому досі живе легасі-варіант кнопки.

## Мета

Один документ, за яким (а) рев'ю перевіряє PR у `core/profile/**` на
палітру, примітиви, стани, копі й безпеку, (б) агент верстає новий рядок
або стан Профілю, не вигадуючи. Контракт as-built: кожне правило нижче
або вже так у коді, або позначене як **[борг]** із файлом і рядком.

## Продуктові рішення, на які спирається контракт

- **«Профіль про людину, Налаштування про застосунок» (огляд 2026-09-04,
  `ProfilePage.tsx:29-35`).** Хіро ідентичності завжди відкрите, «Вийти»
  одразу під ним (доти лежав ПІСЛЯ «Видалення акаунта»), далі три названі
  групи. PIN-блокування переїхало сюди з Налаштувань → Конфіденційність
  (`core/security/AppLockSettings.tsx:4-9`); банк фактів і серверна памʼять
  Сержанта зведені в одну секцію (V-11, `ProfilePage.tsx:216-219`).
- **Профіль — вкладка хаба, не маршрут.** `ProfilePage` завжди рендериться
  всередині хаба як панель `hub-panel-profile` (`HubMainContent.tsx:313-336`,
  лінивий чанк `:58-60`); стандалон `/profile` (`PROFILE_PATH`,
  `appPaths.ts:137`) — легасі-діп-лінк, який редиректить на `/?tab=profile`
  для авторизованого і на вхід для гостя (`StandaloneRoutes.tsx:255-269`,
  `StandaloneRoutes.extra.test.tsx:102-118`).
- **Вага: профіль — вхід, fizruk — сховище
  ([ADR-0080](../../../governance/adr/0080-body-weight-source-of-truth.md)).**
  `hub_biometrics_v1.weightKg` — кеш останнього значення, не джерело правди
  (`biometrics.ts:10-15`, AI-DANGER). Форма Біометрії пише вагу спершу в
  fizruk-журнал через `useDailyLog.addEntry` (`BiometricsSection.tsx:338-340`),
  а той сам дзеркалить її назад через єдиний фаннел `recordBodyWeight()`
  (`useDailyLog.ts:116-118`, `recordBodyWeight.ts:52-61`) із канонічною
  межею `MEASUREMENT_BOUNDS.weightKg` 20–400 кг. Другий запис (`saveBiometrics`)
  свідомо виключає `weightKg`, щоб не перебити LWW-маркер часом кліку
  замість часу зважування (D7, `BiometricsSection.tsx:315-328`). Nutrition
  читає вагу з fizruk через `useLatestBodyWeightKg` з фолбеком на кеш
  (`useLatestBodyWeight.ts:25-39`, `modules/nutrition/lib/tdee.ts:211`).
- **День — за годинником пристрою
  ([ADR-0078](../../../governance/adr/0078-day-boundary-device-local.md)).**
  Профіль дня не обирає: запис ваги отримує `at: new Date().toISOString()`
  у fizruk-хуку (`useDailyLog.ts:100-101`, коментар «не Kyiv-межа доби»), і
  той самий `at` стає `weightUpdatedAt` кешу. Єдине київське місце на
  поверхні — верхня межа дати народження `max={getKyivDayKey()}`
  (`BiometricsSection.tsx:425`): це не день-ключ запису, а межа календаря.
- **Чистий вихід теж питає (звіт власника 2026-09-13,
  `ProfilePage.tsx:77-86`).** Один тап по «Вийти» стирає локальну БД,
  SW-кеші й сесію, тож підтвердження стоїть завжди; другий діалог «Є
  незбережені записи» зʼявляється лише коли `logout()` не зміг доставити
  чергу синку (`:69-76`, `AuthContext.tsx:546-557`).
- **Небезпечні дії — лише через діалоги застосунку, не `window.confirm`**
  (V-6, `AiMemorySection.tsx:94-95`); гейт «є незбережене» стоїть ПЕРЕД
  відкликанням поточної сесії, а не після (F1, `SessionsSection.tsx:146-172`).
- **Видалення акаунта — один серверний шлях.** `POST /api/auth/delete-user`
  з паролем; хук `beforeDelete` виконує `deleteUserData` (скасування
  підписки, purge, `gdpr_cleanup_queue`) і на помилці лишає акаунт цілим із
  `ACCOUNT_DELETE_FAILED` (`apps/server/src/auth.ts:285-338`).

## Палітра і тон поверхні

Профіль живе в `core/**`, тобто hub-level: **модульного акценту тут немає і
бути не може** ([`module-accent.md § Не мігруйте`](../module-accent.md)
— «будь-що всередині `core/**`»). Grep на `finyk|fizruk|routine|nutrition`
у `core/profile/*.tsx` дає лише імпорти хуків і коментарі. Єдині кольори
поза stone-брендом — семантичні `warning` і `danger`.

| Елемент                       | Канон                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Оболонка                      | Панель хаба `role="tabpanel"` без власного `pt` (`HubMainContent.tsx:315-329`); корінь сторінки `flex flex-col gap-4 pt-3 pb-6` без `max-w`/`px` — та сама форма, що `HubSettingsPage` (V-10, `ProfilePage.tsx:134-144`); `h1` sr-only з `messages.nav.profile` (`:145`).                                                                                  |
| Група секцій                  | `ProfileGroup`: `<section class="flex flex-col gap-3">` + `<h2 class="text-style-overline text-muted px-1">` (`ProfilePage.tsx:48-61`). Дерево заголовків: sr-only `h1` → `h2` групи → заголовки секцій.                                                                                                                                                   |
| Секція-дисклоужер             | `CollapsibleSection` з `storageKey="sergeant.profile.<id>.open"`, `defaultOpen={false}`, `headingSize="md"` (= `text-style-label`, `SectionHeading.tsx:99`), `collapsedIcon`, `collapsedSubtitle` (`ProfilePage.tsx:173-251`). V-4: зовнішній заголовок не може бути дрібнішим за будь-який текст усередині, тому картки секцій власного title не малюють. |
| Картка секції                 | `Card radius="lg" padding="none" className="overflow-hidden"`; шапка `px-4 py-3.5 flex items-center gap-2 border-b border-line` з іконкою `text-muted` та мета-інформацією `text-style-caption text-muted` праворуч (`BiometricsSection.tsx:376-381`, `MemoryBankSection.tsx:250-257`, `ChangePasswordSection.tsx:83-85`).                                 |
| Хіро ідентичності             | `px-6 pt-6 pb-5 flex flex-col items-center gap-3 border-b border-line/60`; аватар 80×80 `rounded-3xl`, фолбек-ініціал `text-style-headline bg-brand-500/15 text-brand-strong`; hover-оверлей `bg-black/40`; імʼя `text-style-title text-text truncate`; email `text-style-label text-muted` (`PersonalInfoSection.tsx:239-298`).                           |
| Бейдж верифікації             | `rounded-xl px-1.5 py-0.5 text-style-caption font-medium`: підтверджено `bg-brand-500/10 text-brand-strong`, не підтверджено `bg-warning/10 text-warning-strong dark:text-warning` (`PersonalInfoSection.tsx:299-309`).                                                                                                                                    |
| Банер офлайн                  | `rounded-xl bg-warning/10 border border-warning/30 px-4 py-3` + `Icon wifi-off text-warning` + `text-style-label text-warning-strong dark:text-warning` (`ProfilePage.tsx:146-153`).                                                                                                                                                                       |
| Банер «email не підтверджено» | Рядок картки `px-4 py-3 bg-warning/5` + `Icon alert text-warning` + `text-style-caption text-warning-strong dark:text-warning` + `Button ghost xs` (`PersonalInfoSection.tsx:353-369`).                                                                                                                                                                    |
| Рядок форми                   | `divide-y divide-line/60`, кожен рядок `px-4 py-4 space-y-2`; мітка `<label class="text-style-caption block text-muted">`; помилка `text-style-caption text-danger-strong dark:text-danger` під полем (`ChangePasswordSection.tsx:87-172`, `BiometricsSection.tsx:383-545`).                                                                               |
| Серверна помилка форми        | `role="alert"` `text-style-caption text-danger-strong dark:text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2` (`ChangePasswordSection.tsx:174-181`); у формі імені/email — той самий `text-style-caption text-danger-strong role="alert"` без плашки (`PersonalInfoSection.tsx:403-412`).                                              |
| Рядок сесії                   | `<li class="flex items-start gap-3 p-3 rounded-xl border border-line bg-panel">`; бейдж «Цей пристрій» `rounded-full bg-brand-500/10 text-brand-strong border border-brand-500/30 text-style-caption font-medium`; «Закінчилась» `text-style-caption text-danger-strong dark:text-danger` (`SessionsSection.tsx:265-290`).                                 |
| Небезпечна зона               | `Card` з `border-danger/30`, шапка `border-b border-danger/20`, `Icon alert` + `text-style-label` у `text-danger-strong dark:text-danger`, тіло `text-style-body text-muted` (`DangerZoneSection.tsx:68-88`). Єдина картка Профілю з кольоровою рамкою.                                                                                                    |
| Діалог видалення акаунта      | Рукописний: `fixed inset-0 z-120`, скрим `bg-black/60 backdrop-blur-sm`, панель `max-w-sm bg-panel border border-line rounded-2xl shadow-soft p-5 overflow-y-auto`, `role="dialog"` (`DeleteAccountDialog.tsx:57-79`). **[борг]** `z-120` (`:59`) не є зареєстрованим тіром — див. § Примітиви.                                                            |
| Підтвердження виходу / сесій  | Спільний `ConfirmDialog`: портал, `z-200`, скрим `bg-black/40`, панель `bg-panel rounded-3xl shadow-float border border-line p-6`, `role="alertdialog"`, swipe-to-dismiss (`ConfirmDialog.tsx:85-141`). `danger={!online}` для чистого виходу, `danger` завжди для «Є незбережені записи» (`ProfilePage.tsx:258-298`).                                     |
| Порожній стан памʼяті         | `EmptyState size="sm"` з іконкою `sergeant` у `text-brand-500` (`MemoryBankSection.tsx:267-303`); порожній результат імпорту — `EmptyState variant="warning"` (`:505-518`).                                                                                                                                                                                |
| Типографіка                   | `text-style-title` (імʼя, заголовки діалогів), `headline` лише для ініціала аватара, `label` / `body` / `caption` / `overline` для решти. Нижче 12px нічого: `text-2xs` і `text-[…]` у `core/profile` відсутні.                                                                                                                                            |
| Іконки                        | `Icon` з ручних path-ів; токени `md`/`lg`/`sm`/`xs` там, де є токен, і one-off числа `10` (бейджі), `15` (банер), `18` (шапки карток), `22` (порожній стан) — докстрінг `Icon.tsx:36` дозволяє числа для one-off, а храповик `numericIconSize` рахує лише числа зі шкали (`.tech-debt/ui-canon-budget.json` § МЕТРИКА 4). Емодзі немає.                    |
| Motion                        | `motion-safe:animate-spin` на іконці завантаження аватара (`PersonalInfoSection.tsx:272`); `transition-opacity duration-fast` на hover-оверлеї (`:267`); `transition-colors` на текстових кнопках. Жодних stagger-анімацій по секціях.                                                                                                                     |

## Примітиви й кнопки

Канон кнопки — `(variant, tone)`, `variant ∈ solid | soft | outline | ghost`
([`04-components § Button`](../design-system/04-components.md)). Модульного
`tone` на поверхні немає (і не має бути — hub-level).

| Кнопка                                          | Канон                                                                                                                                      | Стан у коді                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Вийти» під хіро                                | `variant="ghost" size="sm" className="gap-2 text-muted"` + `Icon log-out` — вихід нейтральний, не деструктивний (`ProfilePage.tsx:92-95`)  | так (`ProfilePage.tsx:158-169`); busy-підпис `messages.loadingActions.exiting` «Виходжу…»                                                                                                                                                                                                                                                                                                                                                |
| «Зберегти» імʼя / email / біометрію             | `variant="solid" size="sm"`, `disabled` доки форма не dirty                                                                                | так (`PersonalInfoSection.tsx:390-401`, `:453-466`; `BiometricsSection.tsx:547-554`)                                                                                                                                                                                                                                                                                                                                                     |
| «Змінити» email, «Надіслати» верифікацію        | `variant="ghost" size="xs"` — дія всередині рядка «лейбл — дія»                                                                            | так (`PersonalInfoSection.tsx:428-438`, `:359-367`)                                                                                                                                                                                                                                                                                                                                                                                      |
| «Скасувати» в редакторі email                   | `ghost sm` поруч із `solid` — рядок усередині картки, межу дає рамка (клітинка «дія всередині обмеженої коробки»)                          | так (`PersonalInfoSection.tsx:467-477`); те саме у пари «Скасувати» / «Імпортувати нові» (`MemoryBankSection.tsx:521-535`)                                                                                                                                                                                                                                                                                                               |
| «Змінити аватар»                                | Ручний `<button>` 80×80 з `focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2` і `aria-label` | так (`PersonalInfoSection.tsx:242-251`); `focus:outline-none` — дозволений парний виняток гейта `check-design-conventions.mjs:12-14`                                                                                                                                                                                                                                                                                                     |
| «Видалити фото» / «Так» / «Ні»                  | Текстові дії під хіро                                                                                                                      | **[борг]** три ручні `<button>` без `focus-visible:`-рамки (`PersonalInfoSection.tsx:316-323`, `:329-335`, `:336-342`); глобального `:focus-visible` у `index.css` немає, тож клавіатурного фокуса на них не видно. Touch-target тримає лише глобальний safety-net (AGENTS.md § Touch targets)                                                                                                                                           |
| «Змінити пароль»                                | `variant="solid" size="sm" className="w-full"`, `type="submit"`, `loading`                                                                 | так (`ChangePasswordSection.tsx:183-192`)                                                                                                                                                                                                                                                                                                                                                                                                |
| «Завершити» сесію                               | `variant="soft" tone="danger" size="xs"` — незворотна дія в рядку                                                                          | так (`SessionsSection.tsx:291-300`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| «Оновити» список сесій                          | `variant="ghost" size="xs"` під списком (шапку прибрано оглядом 2026-09-04)                                                                | так (`SessionsSection.tsx:307-316`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| «Видалити акаунт»                               | `variant="solid" tone="danger" size="sm" className="w-full"` — деструктивна CTA                                                            | так (`DangerZoneSection.tsx:89-98`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| Діалог видалення: «Скасувати» / «Видалити»      | `outline md` / `solid danger md`, обидві `flex-1`; «Видалити» `disabled={deleting \|\| !password}` + `loading`                             | так (`DeleteAccountDialog.tsx:103-123`)                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ConfirmDialog` (вихід, сесії, PIN, памʼять ШІ) | Confirm `solid` + `danger`/`neutral`, cancel `outline`                                                                                     | **[борг]** `variant={danger ? "destructive" : "primary"}` — легасі-аліаси в динамічному тернарі (`shared/components/ui/ConfirmDialog.tsx:168`); храповик `legacyButton` бачить лише статичні літерали, тож 0 у бюджеті це не ловить (той самий клас дефекту, що закрито в `PricingPage` 2026-09-16). Cancel `variant="outline"` (`:174`) — канон                                                                                         |
| «Очистити памʼять ШІ»                           | Незворотна дія в рядку → `soft` + `danger` (таблиця «Який варіант брати» 04-components)                                                    | **[борг]** `variant="ghost" size="sm" className="text-danger-strong hover:text-danger"` — деструктивність домальовано класом замість `tone="danger"` (`AiMemorySection.tsx:77-86`)                                                                                                                                                                                                                                                       |
| Порожній банк памʼяті                           | `EmptyState` слоти: `action` `solid sm`, `secondaryAction` `outline sm`, `tertiaryLink` `ghost sm`                                         | так (`MemoryBankSection.tsx:274-302`)                                                                                                                                                                                                                                                                                                                                                                                                    |
| PIN-блокування («Змінити PIN» тощо)             | `ghost sm` у `ToggleRow`                                                                                                                   | так (`core/security/AppLockSettings.tsx:110-116`); секція загорнута в `Card radius="lg" padding="md"` (`ProfilePage.tsx:203-205`)                                                                                                                                                                                                                                                                                                        |
| Оверлей діалогу видалення                       | Модальна елевація `shadow-e4` ↔ `z-modal` (200) парою ([`03 § z-tier`](../design-system/03-spacing-elevation-theming.md))                  | **[борг]** `shadow-soft` (= `--shadow-e4`, `tailwind-preset.js:678`) при `z-120` (`DeleteAccountDialog.tsx:59`): число поза зареєстрованою шкалою `0…50, 100, 150, 200…` (`tailwind-preset.js:1092-1119`) і нижче за `z-modal`; сусідній `ConfirmDialog` стоїть на `z-200`. Сам рукописний діалог обґрунтований (поле пароля + keyboard-геометрія, `DeleteAccountDialog.tsx:45-52`) і підключений до обох половин компенсації клавіатури |

Touch targets ≥ 44px під `pointer: coarse` — тримає `Button` для `xs`/`sm`;
ручні кнопки хіро — глобальний safety-net (`apps/web/src/index.css`, AGENTS.md
§ Touch targets), власного `min-h` вони не несуть.

## Стани, які поверхня зобов'язана мати

| Стан                            | Поведінка                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Гість                           | `ProfilePage` віддає `null` (`ProfilePage.tsx:88-90`); `/profile` → вхід (`StandaloneRoutes.extra.test.tsx:102`).                                                                                                                                                                                                                                                                    |
| Завантаження вкладки            | `SuspenseWithMinDelay fallback={<PageLoader />}` + `ErrorBoundary fallback={HubSectionFallback}` (`HubMainContent.tsx:314-333`).                                                                                                                                                                                                                                                     |
| Офлайн                          | Банер зверху; `disabled` на аватарі, імені, email, верифікації, паролі, «Видалити акаунт», «Оновити» сесій; біометрія теж `disabled`, хоча сховище локальне — свідомо, «для візуальної консистентності» (`BiometricsSection.tsx:215-220`, `:362`). «Вийти» лишається активним, але діалог стає `danger` з окремим текстом про неможливість увійти назад (`ProfilePage.tsx:254-266`). |
| Email не підтверджено           | Бейдж `warning` у хіро + рядок-банер із «Надіслати» (`PersonalInfoSection.tsx:305-308`, `:353-369`); тост «Лист підтвердження надіслано».                                                                                                                                                                                                                                            |
| Аватар: немає / є               | Ініціал з `name \|\| email \|\| "?"` (`:234`, `:258-262`) / `<img alt="">` (`:252-257`); «Видалити фото» лише коли `user.image` (`:313`).                                                                                                                                                                                                                                            |
| Аватар: завантаження            | Оверлей `opacity-100` зі спінером, кнопка `disabled` (`:244`, `:268-274`).                                                                                                                                                                                                                                                                                                           |
| Аватар: відмова валідації       | Не зображення / >5 MB → тост із дією **«Обрати інший»** (відкриває діалог файлу), без «Повторити» — повтор упав би так само (`:124-133`, `:166-178`; `avatar.ts:5-12`).                                                                                                                                                                                                              |
| Аватар: помилка сервера         | Тост з «Повторити», який жене той самий `File` із замикання (`:134-160`).                                                                                                                                                                                                                                                                                                            |
| Аватар: видалення               | Інлайн-підтвердження «Видалити фото? Так / Ні» замість діалогу (`:314-345`); успіх — «Аватар видалено».                                                                                                                                                                                                                                                                              |
| Імʼя                            | «Зберегти» `disabled` доки не dirty; zod: порожнє / >80; серверна помилка — інлайн під полем, без дублю тостом (`:65-76`, `:403-412`); успіх — «Імʼя оновлено» + `onRefresh`.                                                                                                                                                                                                        |
| Email: перегляд / редагування   | `editingEmail` перемикає рядок; «Зберегти» `disabled`, коли значення дорівнює поточному (`:457-461`); підказка «На новий email надійде лист для підтвердження.» (`:495-497`).                                                                                                                                                                                                        |
| Email: два успіхи               | Підтверджений акаунт → «Лист підтвердження надіслано на поточну адресу»; непідтверджений → «Адресу змінено, перевір нову скриньку» (`:104-116`; сервер `auth.ts:346-356`).                                                                                                                                                                                                           |
| Пароль                          | zod: поточний обовʼязковий, новий 10–128, підтвердження збігається (`ChangePasswordSection.tsx:23-40`); помилки під полями з `aria-invalid`/`aria-describedby`; серверна — `role="alert"`-плашка; успіх — «Пароль змінено» + очищення полів.                                                                                                                                         |
| Сесії: завантаження             | `loading` виводиться з `settledFor !== online`, не зберігається (F4, `SessionsSection.tsx:36-52`); «Завантаження…» лише коли список порожній.                                                                                                                                                                                                                                        |
| Сесії: помилка                  | `text-danger-strong` по центру, `COPY.loadFailed` або мапована помилка (`:235-238`).                                                                                                                                                                                                                                                                                                 |
| Сесії: офлайн до першого списку | Чесне «Офлайн, не вдалося завантажити…», а не «Немає сесій» (L-19, `:239-246`).                                                                                                                                                                                                                                                                                                      |
| Сесії: порожньо                 | `COPY.empty` «Немає сесій» (`:247-250`).                                                                                                                                                                                                                                                                                                                                             |
| Сесії: поточна невідома         | `COPY.currentUnknown` + `disabled` на всіх «Завершити» до успішного оновлення (`:55-61`, `:253-257`, `:295`).                                                                                                                                                                                                                                                                        |
| Сесії: список                   | Бейдж «Цей пристрій», «Закінчилась» за `expiresAt`, `revoking === s.id` → `loading` (`:259-303`).                                                                                                                                                                                                                                                                                    |
| Сесії: завершення поточної      | Спершу `flushPendingSyncOpsBeforeLogout`; якщо `pending > 0` — діалог «Є незбережені записи» («Все одно завершити» / «Залишитись»); далі `revokeSession({ token })` → повний `logout()` → `/sign-in` (`:146-211`, `:324-350`).                                                                                                                                                       |
| Біометрія: статус               | Шапка каже `statusReady` / `statusIncomplete` за `isBiometricsCompleteForTdee` (`BiometricsSection.tsx:297`, `:378-380`).                                                                                                                                                                                                                                                            |
| Біометрія: невалідне поле       | Червона рамка + helper + `role="alert"` лише після blur (D4, `:239-253`, `:273-278`); «Зберегти» заблоковано, поки БУДЬ-ЯКЕ поле invalid (D1, `:280-291`); invalid не стирає збережене (L-4, `:162-165`).                                                                                                                                                                            |
| Біометрія: очищення ваги        | `weightKg: null` іде в `saveBiometrics` (бампає `weightUpdatedAt`), але в журнал fizruk не пишеться — «очистити знімок ≠ видалити запис» (`:329-337`).                                                                                                                                                                                                                               |
| Біометрія: змінилась лише вага  | `saveBiometrics` викликається з порожнім патчем, щоб write-through на `/api/me/profile` усе одно пішов (L-17, `:341-351`; `useBiometrics.ts:69-83`).                                                                                                                                                                                                                                 |
| Біометрія: помилка              | Тост `saveError` з «Повторити» — значення лишаються в полях (`:353-359`).                                                                                                                                                                                                                                                                                                            |
| Памʼять: порожньо               | `EmptyState` з трьома діями (інтервʼю / вручну / імпорт); імпорт без нових записів — `EmptyState variant="warning"` (`MemoryBankSection.tsx:260-303`, `:500-518`).                                                                                                                                                                                                                   |
| Памʼять ШІ: очищення            | `ConfirmDialog danger`; статус `role="status"` розрізняє «очищено» і «очищено на сервері, але локальну копію стерти не вдалося» (`AiMemorySection.tsx:59-63`, `:87-91`).                                                                                                                                                                                                             |
| Вихід: підтвердження            | Завжди; онлайн — нейтральний діалог, офлайн — `danger` (`ProfilePage.tsx:258-274`).                                                                                                                                                                                                                                                                                                  |
| Вихід: незбережене              | Другий діалог з `pluralUa` («1 запис / 2 записи / 5 записів»); «Залишитись» лишає сесію живою без тосту й редиректу (`:37-42`, `:100-116`, `:280-298`).                                                                                                                                                                                                                              |
| Вихід: успіх / помилка          | Тост «Ти вийшов з акаунта» + `navigate(SIGN_IN_PATH, { replace: true })`; помилка — тост «Не вдалося вийти» з «Повторити» (`:117-128`).                                                                                                                                                                                                                                              |
| Видалення: тригер               | `disabled={!online}` (`DangerZoneSection.tsx:94`).                                                                                                                                                                                                                                                                                                                                   |
| Видалення: діалог               | Поле пароля `autoComplete="current-password"`; «Видалити» `disabled` без пароля; Escape / скрим → скасування, але не під час `deleting` (`DangerZoneSection.tsx:26-30`; `DeleteAccountDialog.tsx:33-36`, `:118-119`).                                                                                                                                                                |
| Видалення: помилка              | Тост із мапованим кодом + «Повторити»; діалог лишається відкритим із уже введеним паролем (`DangerZoneSection.tsx:36-45`).                                                                                                                                                                                                                                                           |
| Видалення: успіх                | Тост «Акаунт видалено» → `signOut()` → `onLogout()` → `navigate("/", { replace: true })` (`:46-55`).                                                                                                                                                                                                                                                                                 |

## Копі

- **Каталог** (`apps/web/src/shared/i18n/uk.ts`): `nav.profile` (`:119`),
  `loadingActions.exiting` (`:277`), `profileSessions.*` (`:438-454`:
  `refresh`, `loading`, `empty`, `loadFailed`, `revoke`, `revokeSuccess`,
  `revokeFailed`, `expired`, `thisDevice`, `unknownIp`, `lastSeenPrefix`,
  `currentUnknown`), `biometrics.*` (`:471-518`: мітки полів, драбина
  активності з підказками, `weightSyncHint`, `countWorkouts*`,
  `save*`, `heightRangeError` / `weightRangeError`, `ageLabel`),
  `validation.*` для zod пароля (`ChangePasswordSection.tsx:25-37`),
  `privacy.aiMemory.*` для секції памʼяті ШІ (`AiMemorySection.tsx:21`),
  `actions.close` для скрима `ConfirmDialog`. Копі помилок API —
  `mapApiErrorToUserCopy` (`INVALID_PASSWORD` «Неправильний поточний
  пароль.», `PASSWORD_TOO_SHORT`, `CHANGE_EMAIL_DISABLED`,
  `EMAIL_ALREADY_VERIFIED` — `shared/lib/api/mapApiErrorToUserCopy.ts:59-75`).
- **Числа в `heightRangeError` / `weightRangeError` дублюють
  `HEIGHT_CM_RANGE` / `WEIGHT_KG_RANGE`** (`biometrics.ts:99-100`) — каталог
  без інтерполяції, тож дрейф ловлять чотири пін-тести (`uk.ts:501-511`,
  `BiometricsSection.test.tsx:360-393`).
- **[борг] Кирилиця літералом у JSX** — сім файлів Профілю сидять в
  `apps/web/eslint.i18n-allowlist.json:118-124`, і саме через них храповик
  `cyrillicJsxAllowlist` стоїть на 299 без запасу: `ProfilePage.tsx`
  (тост `:117`, «Вийти» `:168`, назви груп і секцій `:172-248`, обидва
  діалоги `:261-268`, `:283-295`), `PersonalInfoSection.tsx` (zod-меседжі
  `:27`, `:35-37`, тости `:70-79`, `:113-115`, `:141-153`, `:170-174`,
  `:189-199`, `:215-226`, увесь JSX `:246-497`), `ChangePasswordSection.tsx`
  (`:62`, `:68`, мітки `:93`, `:121`, `:149`, `:191`), `SessionsSection.tsx`
  («Повторити» `:187`, `:215`, офлайн-копі `:244-246`, діалог `:327-347`),
  `DangerZoneSection.tsx` (`:40`, `:46`, `:57`, `:80-98`),
  `DeleteAccountDialog.tsx` (`:66`, `:81-99`, `:110`, `:122`),
  `MemoryBankSection.tsx` (`:272-301`, `:515-534` та ін.). `BiometricsSection`
  і `AiMemorySection` в allowlist-і немає — вони цілком на каталозі. Новий
  рядок у цих файлах — або в каталог, або червоний гейт.
- **Тон** — за [`style-guide.uk.md`](../../../product/copy/style-guide.uk.md):
  «ти» скрізь («Введи пароль для підтвердження», «Підключися до мережі»);
  перша особа для busy («Виходжу…»); кнопки в інфінітиві («Зберегти»,
  «Завершити», «Видалити», «Залишитись»); тости успіху в перфекті («Аватар
  оновлено», «Сесію завершено», «Біометрію збережено»); кожна помилка
  закрита дією («Повторити» / «Обрати інший» / «Онови список»). Довгого
  тире в рендерованій копі немає (лише в коментарях), апостроф — `ʼ`
  U+02BC («Імʼя», «памʼять», «зʼявиться»).
- Два різні плюралізатори на одній поверхні: `pluralUa` з `@sergeant/shared`
  (`ProfilePage.tsx:11`, `:38-42`) і `pluralize` з `core/hub/useHubDashboardState`
  (`SessionsSection.tsx:27`, `:335-340`) — обидва дають правильні форми,
  але новий рядок бери з `pluralUa`.

## Аналітика

**Власних івентів у `core/profile/**` немає** — grep на `track(` /
`ANALYTICS_EVENTS` по папці порожній; `AuthContext.tsx` шле лише
`SIGNUP_COMPLETED` (`:118`, `:529`), а в
`packages/shared/src/lib/analyticsEvents.ts` немає жодного `account_delet*`,
`logout`, `sign_out`, `password_*`, `avatar_*` чи `profile_*`. Єдине, що
звітує вкладка, — `HUB_TAB_SWITCH_PERF { tab: "profile", ttiMs,
longTaskMs, longTaskCount, cacheHit }` із `TabReadyProbe`
(`HubMainContent.tsx:332`; `analyticsEvents.ts:521-539`, RUM-бейзлайн
ініціативи 0017). Не плутати з `BIOMETRIC_SETUP_COMPLETED` /
`BIOMETRIC_AUTH_*` (`:387-405`) — це біометрія App Lock (Face ID /
WebAuthn), не форма «Біометрія». Отже, воронок виходу, видалення акаунта чи
заповнення біометрії поки що виміряти нічим; новий стан на цій поверхні
рішення про івент має ухвалювати явно, а не успадковувати «як було».

Хаб-пошук індексує сім секцій Профілю (`core/hub/search/searchProfile.ts:27-79`),
але ціль хіта лише перемикає вкладку: діп-лінку в конкретну
`CollapsibleSection` немає — борг названий у самому файлі (`:12-17`).

## Безпека

- **Видалення акаунта** — `deleteUser({ password })` Better Auth
  (`DangerZoneSection.tsx:35`); сервер `user.deleteUser.enabled` з
  `beforeDelete` → `deleteUserData` (скасування підписок Stripe / LiqPay /
  Plata, purge `ai_usage_daily`, `gdpr_cleanup_queue`); помилка всередині —
  транзакція відкочена, акаунт цілий, клієнт бачить `ACCOUNT_DELETE_FAILED`
  замість хибного «Акаунт видалено» (`apps/server/src/auth.ts:285-338`).
  Після успіху клієнт робить `signOut()` + повний `logout()`-teardown
  (`DangerZoneSection.tsx:49-55`).
- **Зміна пароля** — клієнтський мінімум 10 / максимум 128
  (`ChangePasswordSection.tsx:26-29`); серверний — `MIN_PASSWORD_LENGTH` /
  `MAX_PASSWORD_LENGTH` з env, scrypt (`auth.ts:375-383`); `hooks.before`
  форсує відкликання інших сесій на `/change-password` (`auth.ts:399-404`).
  Помилка Better Auth приходить через `result.error`, тож форма кидає
  `Error(mapApiErrorToUserCopy(...))`, щоб `useApiForm.serverError` її
  підхопив (`:47-66`).
- **Зміна email** — `user.changeEmail.enabled` + `updateEmailWithoutVerification`:
  непідтверджений акаунт міняє адресу одразу, підтверджений — спершу лист на
  СТАРУ адресу (захист від перепривʼязування вкраденої сесії, H6;
  `auth.ts:339-372`).
- **Сесії** — `revokeSession({ token })`, не `{ id }` (Better Auth валідує
  `body.token`, `SessionsSection.tsx:174-181`); поточна сесія без успішного
  `getSession` не відкликається взагалі (`:55-61`).
- **Аватар** — лише `image/*` до 5 MB, стискається на клієнті до 128px webp
  q0.8 і йде як data URL в `updateUser({ image })` (`avatar.ts:1-42`,
  `PersonalInfoSection.tsx:134-138`); `fileRef.value` очищається до
  валідації (`:165`).
- **Біометрія** — `hub_biometrics_v1` носить `ownerId` сесії, щоб на
  спільному пристрої не завантажити чужий знімок на сервер
  (`biometrics.ts:150-201`); `ownerId` ніколи не потрапляє в
  `pushBiometricsToServer`. Вага поза 20–400 кг — no-op у фаннелі, а не
  клемп (`recordBodyWeight.ts:52-61`); зріст поза 80–260 — відхилений, не
  підігнаний (`BiometricsSection.tsx:99-107`).
- **Вихід** — `logout()` спершу пробує доставити чергу синку, і лише коли
  щось лишилось, питає через `confirmUnsyncedLoss` (`AuthContext.tsx:546-557`);
  «Залишитись» гарантує, що нічого не стерто (`ProfilePage.tsx:69-76`).
- **Діалоги** — усі три (`ConfirmDialog`, `DeleteAccountDialog`, App Lock)
  ідуть через `useDialogFocusTrap(..., { inertBackground: true })` +
  `useBodyScrollLock`; `DeleteAccountDialog` додатково підключений до
  keyboard-геометрії (`useVisualKeyboardInset` + `useKeyboardAwareOverlay`,
  `DeleteAccountDialog.tsx:33-52`), як вимагає `apps/web/AGENTS.md` для
  fixed-оверлеїв із полями.

## Чого не робити

- Не тягнути модульний акцент на Профіль — `core/**` hub-level, ambient
  `--module-accent` тут не визначений і рендерився б прозоро
  ([`module-accent.md`](../module-accent.md) § Правила 2, 4).
- Не писати легасі `variant="primary"` / `"destructive"` — навіть у тернарі,
  який храповик не бачить (див. борг `ConfirmDialog.tsx:168`).
- Не домальовувати деструктивність класом `text-danger-*` на `ghost` — для
  незворотної дії в рядку є `soft` + `tone="danger"`.
- Не писати вагу повз `recordBodyWeight()` / `useDailyLog.addEntry` і не
  чіпати `mirrorWeightToBiometrics` напряму (`biometrics.ts:265-267`,
  AI-NOTE) — інакше профільний кеш і fizruk-журнал розійдуться, і TDEE
  рахуватиметься з застарілого числа.
- Не робити `hub_biometrics_v1` джерелом правди й не заводити для нього
  op-log — це кеш за ADR-0080; серверна нога — один JSONB-рядок
  `/api/me/profile`, який переписується цілком (`biometrics.ts:25-32`).
- Не виводити день-ключ ваги з київського годинника — ADR-0078.
- Не повертати `window.confirm` і не прибирати підтвердження чистого
  виходу «бо все синхронізовано».
- Не переносити «Вийти» назад під «Видалення акаунта» і не дублювати його в
  Налаштуваннях (UX roast §10.1 / C10, `ProfilePage.tsx:92-95`).
- Не малювати в картці секції власний текстовий title, що дублює
  `CollapsibleSection` (V-4): шапка картки — лише іконка + мета-інформація.
- Не додавати кирилицю в JSX цих файлів — allowlist заморожено на 299;
  рядки йдуть у `uk.ts` (лінивий каталог, не `uk.core.ts`).
- Не класти сюди налаштування застосунку (тема, модулі, сповіщення) — це
  `HubSettingsPage`.

## Поза скоупом

- Налаштування (`core/settings/**`) — окрема вкладка хаба з власними
  примітивами (`ToggleRow`, `SettingsPrimitives`) і гейтом
  `settingsActionButtonVariants.test.ts`.
- Auth / верифікація / скидання пароля (`AuthPage`, `ResetPasswordPage`) —
  контракт auth окремий.
- Внутрішня модель App Lock (`core/security/useAppLock`, PIN-екран) — тут
  лише як картка групи «Безпека».
- Банк памʼяті й серверна памʼять ШІ по суті (інтервʼю, експорт/імпорт,
  `aiMemoryKeys`) — `sergeant-module-ai`; тут лише їхні примітиви й стани.
- Споживачі біометрії (TDEE-калькулятор Nutrition, екрани Body/Progress
  Fizruk) — модульні контракти.
- `DELETE /api/me` та `dataRights.ts` як окремий API — `sergeant-server-api`.
- Мобільний застосунок — контур на паузі
  ([ADR-0094](../../../governance/adr/0094-mobile-web-first-freeze.md)).

## Верифікація

- `pnpm --filter @sergeant/db-schema build && pnpm --filter @sergeant/web exec vitest run src/core/profile`
  — стани з таблиці покриті `ProfilePage.test.tsx` (офлайн-гейти,
  підтвердження виходу, гейт незбереженого, ієрархія заголовків V-4/V-10),
  `PersonalInfoSection.test.tsx` (імʼя, дві гілки email, аватар,
  верифікація), `ChangePasswordSection.test.tsx`, `SessionsSection.test.tsx`,
  `BiometricsSection.test.tsx` (межі, L-4, D1, D4, D7, L-17, дзеркалення у
  fizruk), `DangerZoneSection.test.tsx`, `DeleteAccountDialog.test.tsx`,
  `recordBodyWeight.test.ts` (межа 20–400, LWW), `avatar.test.ts`,
  `biometrics.test.ts`, `profileWriteThrough.test.ts`,
  `useProfileWriteThroughBoot.test.tsx`.
- `pnpm --filter @sergeant/web exec vitest run src/core/app/StandaloneRoutes`
  — редиректи `/profile` для гостя й авторизованого.
- `pnpm lint:ui-canon` — `legacyButton` 0 (але динамічний тернар у
  `ConfirmDialog.tsx:168` він не бачить — це перевіряє лише цей контракт),
  `numericIconSize` 0 (one-off числа `10`/`15`/`18`/`22` поза метрикою),
  `cyrillicJsxAllowlist` 299: новий кириличний літерал у файлах Профілю —
  червоний гейт.
- `pnpm lint:design-conventions` — `focus:` (крім `outline-none`), raw hex,
  `text-2xs` / під-12px; на `core/profile` чисто.
- **Автоматизованих a11y/viewport-прогонів вкладка не має:** ані
  `tests/a11y/axe.spec.ts`, ані `tests/mobile/mobile-ui-audit.spec.ts` не
  містять `/?tab=profile` (лише `reports` і `settings`). Фокус-рамки ручних
  кнопок хіро й 44px під coarse pointer тут тримаються юнітами й рев'ю.
- Рев'ю за цим документом: жодного модульного тону, кнопки з таблиці,
  стани з таблиці, копі з каталогу, деструктивне — лише `tone="danger"`,
  діалог — лише `z-modal`/`z-200` з `shadow-e4`.

---

**Підсумок.** Описано вкладку «Профіль» хаба: хіро ідентичності з аватаром, імʼям і email, «Вийти» з двома діалогами, групи «Безпека» (пароль, сесії, PIN), «Про тебе» (памʼять, біометрія з ADR-0080/0078) та «Акаунт» (видалення) — палітра (16 рядків), примітиви (16 рядків), 34 стани, копі, аналітика, безпека.
Відкритих **[борг]** — 5: (1) легасі `destructive`/`primary` у тернарі `shared/components/ui/ConfirmDialog.tsx:168`; (2) `ghost` + `text-danger-strong` замість `soft`+`danger` в `AiMemorySection.tsx:77-86`; (3) `z-120` поза z-шкалою при `shadow-e4` у `DeleteAccountDialog.tsx:59`; (4) три ручні `<button>` без `focus-visible:`-рамки в `PersonalInfoSection.tsx:316-342`; (5) кирилиця літералом у семи файлах (`eslint.i18n-allowlist.json:118-124`).
Не борг, а факт: аналітичних івентів у Профілі немає взагалі; a11y/mobile-аудити вкладку не проганяють; діп-лінк із хаб-пошуку в секцію відсутній і названий у коді (`searchProfile.ts:12-17`).
