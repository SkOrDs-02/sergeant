<!-- Lifecycle: Active | Owner: product | Added: 2026-09-17 | Next review: 2027-03-17 -->

# Дизайн-контракт: Налаштування

> **Last touched:** 2026-10-03 by @claude (імпорт бекапу: два режими, знімок перед заміною, гейт готовності, § Стани й § Дані). Раніше: 2026-09-19 by @claude. **Next review:** 2027-05-02.
> **Status:** Active — контракт as-built: описує `core/hub/HubSettingsPage.tsx`, `core/hub/settingsSectionsCatalog.ts`, `core/hub/hubSettingsUrlParams.ts`, `core/settings/SettingsPrimitives.tsx` і 14 секцій (`core/settings/{Dashboard,Notifications,AIDigest,Capabilities,Routine,Fizruk,Finyk,Nutrition,Privacy,PWA,DataExport,Experimental}Section.tsx`, `core/feedback/FeedbackSection.tsx`, `core/settings/PlanSection.tsx`), їхні підсекції (`FinykWebhookServiceSection`, `SilpoIntegrationSection`, `SilpoUnmatchedReceipts`, `SilpoPrivacyPromise`, `FinykPrivatBankSection`, `MonoTokenInlineForm`, `core/hub/HubBackupPanel.tsx`, `core/components/PushNotificationToggle.tsx`, `shared/components/ui/ThemeSwitcher.tsx`), реєстр `core/lib/featureFlags.ts` і `core/settings/route.tsx` станом на 2026-09-17. Кожне правило нижче або вже так у коді, або позначене **[борг]** із файлом і рядком; код цим документом не правився. Відкритих боргів — 10, перелік у § «Чого не робити» і в кожній таблиці.

Налаштування — вкладка хаба (`/?tab=settings`), де людина крутить вигляд
головної, тему, сповіщення, Сержанта, підписку, чотири модулі, згоди на
дані, резервну копію, кеш PWA і експериментальні прапорці. Секція
«Підписка та план» (`PlanSection.tsx`) описана в
[pricing-контракті](./2026-09-16-pricing-paywall-design.md) — тут на неї
лише посилаємось. До 2026-09-17 поверхня не мала дизайн-контракту:
[`README.md`](../README.md) тримав її «нейтральним stone-брендом без
модульного акценту та компонентами хаба».

## Проблема

Налаштування — найбільша за кількістю контролів поверхня продукту: 14
секцій у трьох вкладках, ~30 тумблерів, п'ять інтеграцій із власними
станами підключення, дві незворотні дії (імпорт бекапу, видалення даних
Сільпо) і єдине місце, де користувач сам вмикає прапорці з
`FLAG_REGISTRY`. Код дійшов до нього чотирма аудитами (2026-08-08,
2026-09-04, 2026-09-13, 2026-09-15), і кожен лишив по правилу в
коментарях компонентів, а не в одному документі. Наслідок видно в коді:
три ідіоми для стану вибору (бренд у щільності, семантичний `success` у
таймері Фізрука, `bg-brand-soft` у темі), два контроли часу для однієї
дії в «Сповіщеннях», копі в семи локальних `COPY`-об'єктах, які лінт
кирилиці не бачить, і сирі `<button>` без фокус-контракту поруч із
примітивом.

## Мета

Один документ, за яким (а) рев'ю перевіряє нову секцію чи тумблер на
примітиви, палітру, стани й тон, (б) агент верстає нову секцію без
здогадок: бере `SettingsGroup` → `SettingsSubGroup` → `ToggleRow`, пише
заголовок у каталог, а копі — в `@shared/i18n`. Процедура додавання
прапорця лишається у
[`feature-flags.md`](../../../engineering/architecture/feature-flags.md);
цей документ каже, **як виглядає** його тумблер і що навколо.

## Продуктові рішення, на які спирається контракт

- **Налаштування живуть рівно в одному місці — вкладці хаба.**
  `/settings/*` — redirect-only (`core/settings/route.tsx:56-72`, L-1,
  рішення власника 2026-08-08): переносить усі query-параметри й хеш на
  `/?tab=settings…` з `replace`, бо сюди повертаються з платіжного порталу
  і з OAuth Сільпо (зовнішній origin). Вкладку монтує `HubMainContent.tsx:338-352`
  у власному `ErrorBoundary` + `SuspenseWithMinDelay`.
- **«Профіль про людину, Налаштування про застосунок»** (перекрій
  2026-09-04, `HubSettingsPage.tsx:219-223`): PIN-блокування, пам'ять
  Сержанта і видалення акаунта переїхали в Профіль. Тут лишились
  **вказівники** («Відкрити Профіль → Пам'ять», «… → Небезпечна зона»,
  `PrivacySection.tsx:260-302`), не другі кнопки: незворотна дія має один
  шлях і одне підтвердження.
- **Три вкладки, порядок фіксований** — `GROUPS` у `HubSettingsPage.tsx:224-247`:
  «Загальні» (dashboard, notifications, ai, plan), «Розділи» (routine,
  fizruk, finyk, nutrition), «Додатково» (privacy, dataExport,
  capabilities, feedback, pwa, experimental). Порядок секцій у вкладці —
  порядок `GROUPS`, не каталогу; кожна секція каталогу мусить бути рівно в
  одній вкладці (`HubSettingsPage.test.tsx:571-581`).
- **Один рівень акордеона, усе згорнуте.** Варіант A (2026-08-08) прибрав
  другий рівень: `SettingsSubGroup` — підписана група з `<h3>`, без
  кнопки й стану (`SettingsPrimitives.tsx:305-329`). Forced-first-of-tab
  знято рішенням власника 2026-09-11: на холодному завантаженні жодна
  секція не відкривається сама (`HubSettingsPage.tsx:711-731`); відкриває
  лише ціль диплінка (`#settings-<id>`, `?billing=…`, `?silpo=…`) або
  явний тап юзера, який переживає перемикання вкладки
  (`sectionOpenOverrides`).
- **Пошуку по сторінці немає** (2026-09-04, #1097): 14 секцій у трьох
  вкладках не потребують третього механізму навігації. ⌘K індексує ті самі
  секції з каталогу (`search/searchSettings.ts:95-115`). Замість пошуку —
  горизонтальний свайп між вкладками через спільний `SwipePages`
  (рішення founder-а 2026-09-14, `HubSettingsPage.tsx:701`).
- **Заголовок секції — з каталогу.** `settingsSectionsCatalog.ts` — єдине
  джерело `id/title/keywords` для сторінки, ⌘K і `hubNav`; секція читає
  його через `settingsSectionTitle(id)`, незнайомий id кидає (V-7).
  Парність для всіх 14 пінить `settingsSectionTitles.test.tsx`.
- **Тема — три явні режими** (`light` / `dark` / `hc`, `useTheme.ts:40`),
  без авто-режиму й шедулера (знято 2026-08-18). Живе в «Головна → Вигляд»
  (`DashboardSection.tsx:98-104`), бо саме там її шукали — ключові слова
  теми лежать у `dashboard.keywords` каталогу.
- **Аналітика — opt-in.** `DEFAULT_PREFERENCES.analytics: false`
  (`PrivacySection.tsx:27-44`), збігається з серверним `DEFAULT FALSE`
  (міграція 111) і з «DENY UNTIL HYDRATED» в `analyticsConsent.ts`; до
  відповіді сервера екран не стверджує ні «увімкнено», ні «вимкнено».
- **Прапорці — три системи, тут видно одну.** `FLAG_REGISTRY`
  (`core/lib/featureFlags.ts:37-92`) живе в `localStorage` `hub_flags_v1`,
  **per-device**; запис із `experimental: true` автоматично стає
  тумблером у «Експериментальні функції» (`ExperimentalSection.tsx:49`),
  без нього — сплячий прапорець без UI (`billing_trial_banner`). До
  першого підтвердження ризику тумблери вимкнені (PR-36 §9.3).
- **Що куди персиститься.** П'ять тумблерів головної, щільність і
  автодайджест — мішок `hub_prefs_v1`, який цілком їде на акаунт LWW
  (PR-S13, міграція 137, `hubPrefs.ts:125-134`); згоди й «Повідомлення від
  Сержанта» — `/api/me/preferences` (серверний шедулер читає їх без
  клієнта, `useServerPreference.ts:11-14`); нагадування модулів, вода,
  автокалібрування, таймер відпочинку, календарні тумблери — локальні
  сховища модулів. Активні модулі — локальний KV + fire-and-forget на
  акаунт (`DashboardSection.tsx:80-84`).
- **Експорт: CSV і JSON разом** (рішення founder-а #5,
  `uk.dataExport.ts:11`); декларації «Куди їдуть дані для AI» і
  sunset-обіцянка живуть у «Дані та приватність», не при кнопках експорту
  (PR-S4, 2026-09-14, `uk.dataDisclosure.ts:15-31`).
- **Банк-інтеграції — безкоштовні.** Pro-гейт із підключення Monobank
  знято 2026-09-02 (`FinykWebhookServiceSection.tsx:71-82`); Сільпо за
  серверним `SILPO_ENABLED` деградує до тихого «не увімкнена», а не до
  помилки (`SilpoIntegrationSection.tsx:10-14`).

## Палітра і тон поверхні

Налаштування — **нейтральна поверхня зі stone-брендом** усередині
`core/**`. Модульний акцент з'являється в одному місці — на гліфі
заголовка чотирьох модульних секцій — і в двох свідомих позиках Фініка
всередині його ж секції.

| Елемент                         | Канон                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Оболонка сторінки               | `flex flex-col gap-4 pt-3 pb-6`, sr-only `<h1>Налаштування</h1>` (`HubSettingsPage.tsx:621-622`). Без safe-area зверху — сторінка сидить під фіксованою шапкою хаба.                                                                                                                                                                                                                                                                                                                                          |
| «Острів» вкладок                | `sticky top-0 z-10`, прозора обгортка + фейд `bg-linear-to-b from-bg from-55% to-transparent` на 32px нижче; сама картка `rounded-2xl bg-panel border border-surface-line shadow-e2 p-3` (рішення власника 2026-08-28, `HubSettingsPage.tsx:637-670`).                                                                                                                                                                                                                                                        |
| Вкладки                         | `Tabs style="pill" variant="brand" fill`; трек `bg-panelHi rounded-xl`, активний піл перекрито на `aria-selected:bg-panel border-line shadow-e1`, `rounded-lg` (концентрично до треку). `aria-label="Групи налаштувань"`, `getPanelId` → `role="tabpanel"` з `aria-label="Налаштування · <вкладка>"`.                                                                                                                                                                                                         |
| Картка секції (`SettingsGroup`) | `Card prominence="glass" radius="lg" padding="none"` + `shadow-e1` (`SettingsPrimitives.tsx:201-213`). `glass` — back-compat-аліас з непрозорою заливкою після «Чорнила» ([README § Стан](../README.md)), тож картка читається як `bg-panel` із hairline. Шапка `<h2 class="contents"><button aria-expanded>` `px-4 py-4`, `hover:bg-surface-strong-glass`, відкрита `bg-surface-soft-glass`; тіло `border-t border-line/60 px-4 py-5 space-y-6`.                                                             |
| Гліф секції                     | `Icon size="lg"` у рядку заголовка, **без тонованого квадрата** (T5 анти-слоп, огляд 2026-09-04). Колір `text-muted`; для чотирьох модульних секцій — `text-finyk` / `text-fizruk` / `text-routine` / `text-nutrition` лише на гліфі (`MODULE_ICON_BG`, `SettingsPrimitives.tsx:47-52`). Це єдина легітимна точка модульного акценту на рівні картки.                                                                                                                                                         |
| Підгрупа (`SettingsSubGroup`)   | `<h3 class="text-style-overline text-text">` + `flex flex-col gap-3`; сусідні `[data-row]` стоять впритул на спільній hairline (`[&>[data-row]+[data-row]]:-mt-3`).                                                                                                                                                                                                                                                                                                                                           |
| Рядок тумблера (`ToggleRow`)    | `<label data-row>` `min-h-[44px] py-3 -mx-2 px-2 rounded-lg border-b border-line/60 last:border-b-0`, `hover:bg-panelHi` (рядок списку на hairline, не картка в картці — П2 анти-слоп). Підпис `text-style-label text-text group-hover:text-brand-strong`, опис `text-style-caption text-muted` (не `subtle`: опис пояснює, ЩО вмикаєш), праворуч `Switch aria-labelledby`.                                                                                                                                   |
| Стан вибору (сегмент)           | **Бренд**: щільність — `border-brand bg-brand/8 ring-1 ring-brand/30 shadow-soft`, підпис `text-brand-strong`, неактивна `border-line bg-panel hover:border-brand/40` (`DashboardSection.tsx:166-171`); тема — `bg-brand-soft border-brand-soft-border text-brand-strong shadow-sm` у `role="radiogroup"` (`ThemeSwitcher.tsx:86-88`). **[борг]** `FizrukSection.tsx:59` фарбує обраний таймер семантичним `success` (`border-success bg-success/15 text-success-strong`) — третя ідіома для тієї самої ролі. |
| Попередження в секції           | `role="note"` `rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5`, `Icon alert-triangle text-warning-strong dark:text-warning` (`ExperimentalSection.tsx:65-82`; той самий рецепт у Silpo `lastFailedAt` `:251-276` і в reauth `:319-334`). Токен саме `warning` — `warn` не існує (V-5).                                                                                                                                                                                                         |
| Статус-панель інтеграції        | `p-3 rounded-xl border border-success/30 bg-bg` + крапка `w-2.5 h-2.5 rounded-full bg-success`, `text-style-label` + `text-style-caption text-subtle` (`SilpoIntegrationSection.tsx:277-289`, `FinykWebhookServiceSection.tsx:258-305`: `success` / `warning` / `danger` за статусом).                                                                                                                                                                                                                        |
| Помилка поруч із контролом      | `<p role="alert" class="text-style-caption text-danger-strong">` одразу під групою тумблерів (`PrivacySection.tsx:205-208`, finding #7); банер-помилка інтеграцій `text-style-body text-danger bg-danger/10 rounded-xl px-3 py-2` (`FinykWebhookServiceSection.tsx:364-369`).                                                                                                                                                                                                                                 |
| Рамка-контейнер підблоку        | `rounded-2xl border border-line/60 bg-surface-soft-glass p-3` навколо «Права на дані» (`DataExportSection.tsx:105`); `rounded-2xl border border-line bg-panelHi/40 px-3 py-2.5` у `HubBackupPanel.tsx:170`. Рамка — візуальне групування, не структурний заголовок (V-12).                                                                                                                                                                                                                                    |
| Скелет секції                   | `SectionSkeleton` — та сама `Card prominence="glass"`, `minHeight` 72px для згорнутої шапки або повна висота лише коли секція справді намалюється розгорнутою (`lazySectionMinH`, V-15); shimmer, `role="status" aria-busy`.                                                                                                                                                                                                                                                                                  |
| Типографіка                     | `text-style-title` — заголовок секції, `overline` — підгрупа, `label` — підпис контролу, `caption text-muted` — опис, `body text-subtle` — вступний абзац, `text-style-code` — Merchant ID. Нижче 12px нічого (`pnpm lint:design-conventions` зелений на всій поверхні).                                                                                                                                                                                                                                      |
| Позики модульного акценту       | У секції Фініка (усередині `core/**`, де containment не діє): `input-focus-finyk` на полях токена (`FinykSection.tsx:74`, `MonoTokenInlineForm.tsx:71`), `focus-visible:ring-finyk` на `<summary>` чеків і обіцянки приватності (`SilpoUnmatchedReceipts.tsx:64`, `SilpoPrivacyPromise.tsx:48`), `tone="finyk"` на парі «Витрата / Надходження» і на «Створити витрату». Свідомі: контроли належать Фініку.                                                                                                   |
| Motion                          | Розкриття — `grid-rows-[0fr] → [1fr]` з `transition-[grid-template-rows] duration-base ease-standard`, шеврон `rotate-90 transition-transform duration-base`; скрол до якоря — `motionScrollBehavior()` по власному скролеру, ніколи `scrollIntoView` (iOS-шапка). Без конфеті, без пульсації.                                                                                                                                                                                                                |
| Гліфи                           | `Icon` з реєстру, ніколи емодзі. Неіснуюче ім'я малює порожнє коло (так `smartphone` став `refresh-cw`, `PWASection.tsx:65-67`). Позашкальний `size={18}` (`CapabilitiesSection.tsx:78`, `FinykPrivatBankSection.tsx:147`) — легальний one-off за докстрінгом `Icon`, храповик `numericIconSize` його не рахує.                                                                                                                                                                                               |

Правило вибору: **вибір із кількох — бренд; попередження — `warning`;
помилка — `danger-strong` текстом або `danger/10` банером; модульний
акцент — лише гліф секції та контроли, що належать Фініку.**

## Примітиви й кнопки

Канон кнопки — `(variant, tone)`, `variant ∈ solid | soft | outline | ghost`
([`04-components § Button`](../design-system/04-components.md)). Для
секцій Налаштувань є власний гейт
[`settingsActionButtonVariants.test.ts`](../../../../apps/web/src/core/settings/settingsActionButtonVariants.test.ts):
повноширинна (`w-full` / `flex-1`) `ghost`-кнопка в `core/settings` або
`FeedbackSection` валить тест із точним `file:line`.

| Кнопка / контрол                          | Канон                                                                                                                                                | Стан у коді                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дія-блок на всю ширину                    | `Button variant="outline"` (`w-full h-11`, іконка `size="md"` перед підписом)                                                                        | так: «Оновити дані», «Звʼязати Сільпо», «Підключити повторно», «Спробувати ще раз» після збою перевірки (`FinykWebhookServiceSection.tsx:404-412`, `SilpoIntegrationSection.tsx:348-356`), «Написати» у Фідбеку (`FeedbackSection.tsx:45-54`, `h-10 w-full`)                 |
| Пара «дія + деструктив»                   | `outline` + `soft tone="danger"`, обидві `flex-1 h-11`                                                                                               | так: Webhook «Синхронізувати історію / Відʼєднати» (`:307-325`), Silpo «Оновити чеки / Відключити» (`:290-309`), PWA «Діагностика SW / Скинути кеш PWA» (`PWASection.tsx:72-96`, `size="sm" h-10`)                                                                           |
| Незворотна дія блоком                     | `soft tone="danger"` + іконка `trash`, далі `ConfirmDialog danger`                                                                                   | так: «Очистити кеш транзакцій», «Видалити всі дані Сільпо», «Відʼєднати ПриватБанк»                                                                                                                                                                                          |
| Дія всередині рамки (рядок «лейбл — дія») | `ghost size="xs"`                                                                                                                                    | так: «Скопіювати» в результаті діагностики (`PWASection.tsx:113-125`)                                                                                                                                                                                                        |
| Тихі вказівники в Профіль                 | `ghost size="sm"`, не на всю ширину, під абзацом-поясненням                                                                                          | так (`PrivacySection.tsx:266-274, 293-301`)                                                                                                                                                                                                                                  |
| Головна дія блока «Резервна копія»        | Головна дія блока — `solid`; `ghost` лише там, де межу дає рядок «лейбл — дія»                                                                       | **[борг]** `HubBackupPanel.tsx:193-209`: «Експорт JSON» і «Імпорт…» — `variant="ghost"` з ручним `min-h-[44px]`; гейт `settingsActionButtonVariants` файл не сканує (`SCOPE` — `core/settings` + `FeedbackSection`), і `w-full` там немає, тож він і не спрацював би         |
| Кнопка без `variant`                      | Явний `variant="solid"` — дефолт `Button` досі легасі `"primary"` (`Button.tsx:352`, `@removeBy 2026-12-01`)                                         | **[борг]** `NotificationsSection.tsx:170-177` («Дозволити»), `FinykSection.tsx:129-135` («Додати»), `MonoTokenInlineForm.tsx:83`, `FinykPrivatBankSection.tsx:228-235`: без `variant` ідуть легасі-гілкою `resolveStyleKey`; храповик `legacyButton` бачить лише явний рядок |
| Модульна пара вибору                      | `variant={active ? "solid" : "soft"} tone="finyk"`                                                                                                   | так — «Витрата / Надходження» (`FinykSection.tsx:98-111`), єдина модульна кнопка на сторінці; «Створити витрату» з чека — `soft tone="finyk" size="xs"`                                                                                                                      |
| Тумблер                                   | `ToggleRow` → `Switch` (`aria-labelledby`, `disabled` на самому контролі, не на контейнері — PR-S11)                                                 | так у 12 секціях; **[борг]** `SettingsPrimitives.tsx:383` — обгортка `<label>` із вкладеним `<label>`-ом `Switch` невалідна за контент-моделлю HTML, `aria-labelledby` знімає симптом (ім'я є), структура названа відкритим боргом у коментарі `:360-372`                    |
| Сегмент вибору (щільність, таймер, тема)  | `role="group"`/`radiogroup` з іменем, `aria-pressed`/`aria-checked`, канонічний фокус (`focus-ring` або `focus-visible:ring-2 ring-focus/45`), ≥44px | тема — так (`ThemeSwitcher.tsx:66-95`, `min-h-11` + фокус-рамка); **[борг]** `DashboardSection.tsx:161-172` і `FizrukSection.tsx:48-62` — сирі `<button>` без жодного `focus-visible:` класу (лишається браузерний outline), щільність ще й без `min-h`                      |
| «Видалити» власну категорію               | Дія в рядку списку — `Button variant="ghost"` або `IconButton` з фокус-контрактом і 44px                                                             | **[борг]** `FinykSection.tsx:152-158` — сирий `<button>` як текст `text-danger-strong`, без фокус-рамки, без `min-h`                                                                                                                                                         |
| Поле часу / години                        | `TimeField` (несе `min-w-0` + `inline-size`, `w-[9rem]` для локалі пристрою)                                                                         | Фізрук — так (`NotificationsSection.tsx:256-268`); **[борг]** `NotificationsSection.tsx:282-303` — Їжа бере сирий `<input type="number">` `h-9` без `.input-focus` (канон 04 § 6.1 вимагає утиліту на сирому `<input>`): два контроли для однієї дії «о котрій нагадати»     |
| Текстові поля токенів / чисел             | Сирий `<input>` дозволений лише з `.input-focus*` і `h-11 rounded-xl border-line bg-panelHi`                                                         | так: `MonoTokenInlineForm.tsx:65-73`, `FinykPrivatBankSection.tsx:177-204`, `FinykSection.tsx:73-74`, `NutritionSection.tsx:61-75` (`h-10`); кнопка «показати токен» — `focus-ring touch-target`                                                                             |
| Картка-посилання «Що вміє …»              | `<button>` на всю ширину `min-h-[44px] rounded-2xl border-line/60`, `focus-visible:ring-2 ring-focus/45`                                             | так (`CapabilitiesSection.tsx:68-95`); рукописна рамка рахується стелею `handRolledFocusRing`, не боргом на міграцію                                                                                                                                                         |
| Підтвердження                             | Лише `ConfirmDialog` (портальний), `danger` для незворотного                                                                                         | так у всіх шести місцях; локальний `ConfirmModal` видалено (V-8, `SettingsPrimitives.tsx:432-442`)                                                                                                                                                                           |
| Фолбек зламаного чанка                    | `Button variant="solid"`                                                                                                                             | **[борг]** `ChunkErrorBoundary.tsx:74-80` — сирий `<button>` на `bg-primary text-bg` замість примітива (рендериться на місці lazy-секції «Розділів»)                                                                                                                         |

Touch targets ≥ 44px під `pointer: coarse` — тримає `Button`;
`ToggleRow` несе `min-h-[44px]` сам; ручні `<button>` мусять нести
`min-h-[44px]` (як `CapabilitiesSection`) — там, де не несуть, це борг вище.

## Стани, які поверхня зобов'язана мати

| Стан                               | Поведінка                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Холодне завантаження               | Усі секції згорнуті; чотири модульні секції — `React.lazy` за `ChunkErrorBoundary` + `Suspense` зі `SectionSkeleton` тієї самої висоти, що й намалюється (`HubSettingsPage.tsx:762-785`); згорнутий вміст `inert` + `aria-hidden` (`useInertWhileCollapsed`, L-7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Диплінк `#settings-<id>`           | Вкладка перемикається на власника секції, секція розкривається (сама, без хеш-слухача — PR-S1), скрол по власному скролеру з урахуванням sticky-острова (`scroll-mt-40`); `?group=` дзеркалить вкладку для reload/share, `general` — без параметра                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Повернення з платіжного порталу    | `?billing=portal-return\|manage` → вкладка «Загальні», відкрита «Підписка та план», рефетч `billingKeys.status`, toast «Статус підписки перевірено.» (не «оновлено» — finding #4), параметр знято з URL через `navigate(replace)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Повернення з OAuth Сільпо          | `?silpo=connected` → «Розділи» → Фінік, рефетч `silpoKeys.all`, toast «Сільпо звʼязано. Натисни «Оновити чеки»…»; `?silpo=error&reason=…` → людський текст із `SILPO_ERROR_REASON_MESSAGES` з фолбеком «Не вдалося звʼязати Сільпо.» і дією «Спробувати ще раз»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Гість                              | Приватність: `role="status" text-muted` «Увійди в акаунт, щоб керувати налаштуваннями згоди…» + `outline sm` «Спробувати ще» — не alert, не червоне (огляд 2026-09-04); Сержант: `text-muted role="status"` (`NotificationsSection.tsx:208-219`); серверний експорт: обидві кнопки `disabled` + `guestHint` ДО натискання, гейт на `signedIn === false`, не `!signedIn` (PR-S14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Гідрація серверних згод            | «Завантажую налаштування…» `role="status" aria-live="polite"` без тумблерів (L-3); експорт при `signedIn === null` нічого не стверджує                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Офлайн / 5xx при завантаженні      | `classifyPreferenceLoadFailure` (`preferenceLoadFailure.ts:39-46`): «Увійди» лише на 401/403; `kind: "network"` → «Немає звʼязку з сервером…», решта → «Не вдалося завантажити…» — обидва `role="alert" text-danger-strong` + retry (PR-S2). Не через `navigator.onLine`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Збій перевірки стану інтеграції    | Webhook / Silpo: `role="alert"` банер «Не вдалося перевірити стан підключення… Це не означає, що звʼязок втрачено» + `outline w-full` «Спробувати ще раз» з busy «Перевіряю…»; для непостійних помилок лише (`isRetriableError`, F2), інакше — форма підключення. ПриватБанк на збій показує форму без помилки (`:70-73`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Збереження в процесі               | Опис рядка стає «Зберігаю…» (`PrivacySection.tsx:154-156`); кнопки — «Готую експорт…», «Оновлюю…», «Перевіряю…», «Скасовую…», `disabled` на час запиту                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Помилка збереження                 | Оптимістичний запис відкочується, `role="alert" text-danger-strong` поруч із групою (`PrivacySection.tsx:125-131`, `useServerPreference.ts:136-144` з гонкою GET/PUT — L-14/F3); Їжа — банер `border-danger/40 bg-danger/10` (`NutritionSection.tsx:126-130`); `hub_prefs_v1` — локальний запис лишається, мітка `HUB_PREFS_UNSYNCED` до наступного буту                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Експорт у процесі / готово / збій  | Обидві серверні кнопки `disabled`, підпис `busy`; успіх — `role="status" text-success-strong` («…завантажено як JSON/CSV»); збій — `role="alert" text-danger-strong` «Не вдалося створити серверний експорт. Спробуй ще раз.» (більше не звинувачує вхід — PR-S14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Імпорт бекапу                      | Файл валідується `isHubBackupPayload` ДО діалогу; `ConfirmDialog` з двома режимами (`HubRestoreModePicker`): «Додати відсутнє» (дефолт, «Додати дані з файлу?», нічого не видаляє) і «Замінити даними з файлу» (`danger`, чесний текст про акаунт і всі пристрої для залогінених, перед заміною автознімок `hub-backup-before-replace-<дата>.json`, без знімка заміни немає); список РЕАЛЬНИХ секцій цього файлу; невалідний/нечитаний файл → `toast.error` з дією «Обрати інший». Кнопка «Імпорт…» `disabled` + `role="status"`-пояснення, доки dual-write контексти не зареєстровані, кеші не прогріті і (для залогіненого) не завершився перший повний pull з акаунта (`pullCompletion.ts`; окремий текст «Чекаю на синхронізацію з акаунтом», потрібен інтернет); після apply панель чекає `outboxCheckpoint()` і лише тоді робить reload; `skipped`/часткова помилка запису = `toast.error`, не тихий успіх (`HubBackupPanel.tsx`, `hubBackup.ts`) |
| Видалення даних                    | Сільпо: «Відключити» (токен) і «Видалити всі дані Сільпо» (чеки) — окремі `ConfirmDialog danger`, `destructivePending` блокує подвійний тап (`SilpoIntegrationSection.tsx:128-129, 215-223`); toast із числом видалених. Акаунт — лише вказівник у Профіль → «Небезпечна зона»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Скидання кешу PWA                  | `ConfirmDialog danger` «Скинути кеш PWA?» з чесною ціною («Твої дані й офлайн-черга лишаються на місці…»), toast.success + reload через 300 мс; збій — `toast.error` з «Повторити»; без Service Worker обидві кнопки `disabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Дозвіл браузера на сповіщення      | Чотири стани: `granted` / `denied` / `default` / `unsupported` (`NotificationsSection.tsx:135-148`, кольори `success-strong` / `danger-strong` / `warning-strong` / `muted`); `default` — кнопка «Дозволити», `denied` — лише інструкція (кнопка була б обіцянкою, яку браузер не виконає); тумблери нагадувань спершу питають дозвіл, без нього не вмикаються + `toast.warning`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Push непідтримуваний               | Рядок не зникає: iOS — «…лише у застосунку з початкового екрана…», решта — «Спробуй Chrome, Edge або Firefox…» (`PushNotificationToggle.tsx:31-42`); `denied` → `Switch disabled` + «Заблоковано в налаштуваннях браузера»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Фонова доставка нагадувань         | Опис рядка чесний за фактом push-підписки: «Приходить навіть коли застосунок закрито.» або «…увімкни push-сповіщення вище.» (`NotificationsSection.tsx:38-47`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Експериментальне до підтвердження  | Банер `role="note"` завжди; чекбокс «Я розумію, що це ранні можливості» (`accent-brand`); тумблери `disabled` НА КОНТРОЛІ (PR-S11), без `opacity` на контейнері; після одного opt-in секція звичайна, стан per-device `hub_experimental_acknowledged_v1`; без `experimental`-прапорців секція не рендериться взагалі                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Останній активний модуль           | `toast.warning("Щонайменше один модуль має бути активним")` без дії — заблокована дія, не помилка (`DashboardSection.tsx:70-76`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Інтеграція не увімкнена на сервері | Сільпо `status === "disabled"` → тиха картка «Інтеграція ще не увімкнена» (`:189-200`), ніколи не error-банер; ПриватБанк без `VITE_PRIVAT_ENABLED` — секції немає                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Токен відкликано / потрібна reauth | Webhook `invalid` → `role="alert"` warning «Monobank втратив звʼязок» + форма нового токена + «Відʼєднати»; Silpo `reauth_required` → warning + `outline w-full` «Підключити повторно»; `lastFailedAt` → `role="status"` warning «Чеки не оновлюються» з кодом помилки                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Чеки без транзакції                | `<details>` «Чеки без транзакції · N чеків» лише коли `connected` і є що показати; кожен чек пропонує «Створити витрату» через `ManualExpenseSheet`, нічого не створюється мовчки                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Зламаний lazy-чанк                 | `ChunkErrorBoundary` `role="alert"` тієї ж висоти, що скелет; одна захищена перезавантажка, далі ручна кнопка; не-chunk помилки летять до `ErrorBoundary` хаба                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Копі

- **Заголовки секцій** — `core/hub/settingsSectionsCatalog.ts:33-152`,
  єдине джерело для сторінки, ⌘K і `hubNav`; секція читає
  `settingsSectionTitle(id)`. Чотири модульні та `plan` тримають літерал у
  `<SettingsGroup title="…">`, парність пінить
  `settingsSectionTitles.test.tsx`. Назви без крапки, «Сержант» замість
  «AI» (Q1 аудиту 2026-09-01), «Їжа» не «Харчування», «Головна» як вкладка
  внизу.
- **Каталог `@shared/i18n`:** `uk.core.ts` → `experimentalSection.*`
  (`title` — дзеркало каталогу, `intro`, `warningBanner`, `optInLabel`,
  `optInHint`), `onboarding.capabilitiesGroupTitle / tourLaunchLabel /
appCapabilitiesHint`, `loaders.loadingSection`; `uk.sergeant.ts` →
  `nudgesToggleLabel / nudgesToggleDescription / nudgesSaveError /
nudgesAuthRequired`, `capabilitiesSectionTitle / Body`; `uk.dataExport.ts`
  → `busy / downloadJson / downloadCsv / formatsHint / doneJson / doneCsv /
failed / guestHint / sections.*`; `uk.dataDisclosure.ts` →
  `subprocessors.*`, `sunset.*`; `uk.ts` → `feedback.settingsTitle /
settingsSubGroupTitle / settingsDescription / openButton`,
  `finyk.silpoUnmatchedReceipts.*`, `loadingActions.connecting`,
  `errors.generic.sectionFailed`, `actions.reload`. `uk.privacy.ts` живить
  Профіль (PIN, пам'ять) і `AiMemoryList`, не цю секцію.
- **Копі прапорців** — `label` / `description` у самому `FLAG_REGISTRY`
  (`featureFlags.ts:37-92`): реєстр живить UI, тож рядок живе поруч із
  дефолтом і умовою зняття (правило
  [`feature-flags.md § 4`](../../../engineering/architecture/feature-flags.md)).
- **[борг] Кирилиця в JSX-літералах.** 13 файлів `core/settings/*` +
  `HubSettingsPage.tsx`, `HubBackupPanel.tsx`, `PushNotificationToggle.tsx`,
  `ThemeSwitcher.tsx` і `modules/routine/components/settings/{Tags,Categories}Section.tsx`
  стоять в `apps/web/eslint.i18n-allowlist.json:89-136, 286-289, 299`.
  Стеля `cyrillicJsxAllowlist` = 299 без запасу: нова секція пише в
  каталог або мігрує один із цих файлів. `PlanSection.tsx:134` — той
  самий список, але його копі — предмет pricing-контракту.
- **[борг] Копі в локальних `COPY`-об'єктах**, які лінт кирилиці не
  бачить узагалі (той самий клас, що онбординг закрив 2026-09-16):
  `FinykWebhookServiceSection.tsx:31-69`, `SilpoIntegrationSection.tsx:44-94`
  (обіцянка приватності затверджена founder-ом дослівно — переїзд у
  каталог не змінює жодного слова), `FinykPrivatBankSection.tsx:19-37`,
  `MonoTokenInlineForm.tsx:32-36`, `HubSettingsPage.tsx:262-272`
  (`SILPO_ERROR_REASON_MESSAGES`), `HubBackupPanel.tsx:20-31`,
  `NotificationsSection.tsx:135-140` (`permLabels`), `NutritionSection.tsx:84`.
- **[борг] «Помилка …» як standalone** ([style-guide § 7](../../../product/copy/style-guide.uk.md)):
  `FinykWebhookServiceSection.tsx:166` («Помилка підключення»), `:206`
  («Помилка re-sync»), `:284` («Помилка webhook» як заголовок статусу),
  `FinykPrivatBankSection.tsx:105`. Решта помилок поверхні закриті
  наступним кроком («Спробуй ще раз», «Перевір мережу», «Онови токен»).
- **Тон** — за [`style-guide.uk.md`](../../../product/copy/style-guide.uk.md):
  «ти»; перша особа для дій продукту («Зберігаю…», «Готую експорт…»,
  «Оновлюю…», «Перевіряю…», «Видалю всі завантажені чеки…»); заголовки
  без крапки; підказки — повне речення з крапкою; кнопки — інфінітив
  («Скинути та перезавантажити», «Видалити назавжди», «Перезаписати»).
  Довгого тире у копі секцій немає (перевірено grep-ом по рядкових
  літералах `core/settings` і `HubBackupPanel`).
- **Єдиний виняток «ми»** — декларації сторони в `uk.dataDisclosure.ts`
  (рішення founder-а 2026-08-26, `eslint-disable sergeant-design/ukrainian-copy`
  з поясненням у шапці файлу). Скрізь інде на поверхні — «я».
- Копі не обіцяє більше за механізм: «Пам'ять про здоров'я» гейтить
  запис у пам'ять, а не використання (PR-S3, `PrivacySection.tsx:173-188`);
  скидання кешу не втрачає офлайн-черги (`PWASection.tsx:132-143`);
  фонові нагадування лише за push-підпискою.

## Аналітика

Івенти з `packages/shared/src/lib/analyticsEvents.ts`, які поверхня
реально шле: `hub_tab_switch_perf {tab:"settings", ttiMs, longTaskMs,
longTaskCount, cacheHit}` — раз на перемикання вкладки, коли панель
змонтувалась (`hubPerf.ts:102-119`, `TabReadyProbe` в
`HubMainContent.tsx:348`); `feedback_widget_opened {source:"settings"}` на
кожне відкриття діалогу (`FeedbackSection.tsx:29-34`);
`module_settings_opened_from_module {module}` — з шестерні модуля, яка
веде на `/?tab=settings#settings-<module>` (`useHubNavigation.ts:132-147`);
`pricing_viewed {source:"settings"}` — уже на `/pricing`, куди веде
«Перейти на Premium» (pricing-контракт).

**[борг] Поверхня без власних івентів.** Зміна тумблера, теми, щільності,
активних модулів, прапорця, згоди, серверний експорт, імпорт бекапу,
підключення/відключення інтеграцій — жоден не трекається.
`PERMISSIONS_SETTINGS_OPENED` і `PERMISSION_STATUS_CHANGED` оголошені в
`analyticsEvents.ts:422-429`, але в `apps/web/src` не стріляють ніде.
Правило контракту на майбутнє те саме, що в pricing і onboarding: новий
стан поверхні без івента не приймається.

## Безпека

- **Серверний експорт не містить сирих секретів і токенів** — так каже
  копі (`DataExportSection.tsx:107-110`), а форму задає `MeExportResponse`
  з явним переліком секцій (`toCsvSections`, `:28-43`); новий масив у
  експорті додається руками, і на це є тест.
- **Локальний бекап** не включає токен Monobank і кеш транзакцій; копі
  прямо попереджає, що файл містить особисті дані, і радить тримати його
  приватно (`HubBackupPanel.tsx:174-191`). Імпорт — лише після
  `isHubBackupPayload` і явного підтвердження в `ConfirmDialog`; дефолт
  «лише додати відсутнє», «замінити» явне, `danger` і зі знімком (бо
  видалення з нього їде на сервер і на всі пристрої акаунта, аудит
  2026-10-01 data-06); ідентифікатори акаунта з файлу прибираються.
- **Токени банків не осідають у браузері.** Mono: «Токен відправляється на
  сервер і не зберігається у браузері» (`COPY.tokenHelp`); ПриватБанк:
  зашифрований на сервері, прив'язаний до акаунта, чекбокса «запам'ятати»
  немає (`FinykPrivatBankSection.tsx:39-48`); поля токенів —
  `type="password"` з кнопкою показу і `autoComplete="off"`. Сільпо:
  «Дані обробляються на сервері, токен у браузер не потрапляє»;
  `GET /api/silpo/connect` — навігаційний 302, не `fetch`.
- **Незворотні дії** — тільки через портальний `ConfirmDialog danger`, з
  блокуванням подвійного тапу там, де мутації летять на сервер
  (`destructivePending`). Видалення акаунта на цій поверхні **не
  дублюється** — один шлях у Профілі.
- **Згоди** — opt-in із серверним дефолтом `false`; `analyticsConsent`
  оновлюється оптимістично й відкочується при збої
  (`PrivacySection.tsx:114-129`). «Пам'ять про здоров'я» гейтить
  персистентний запис (`ai-memory/ingestQueue.ts`, прапорець `healthData`).
- **Прапорці** — per-device `localStorage` `hub_flags_v1` через
  `typedStore` (валідація zod, cross-tab sync); сплячі прапорці без
  `experimental` не мають тумблера, тож бета-тестер не увімкне їх сам.
- **Скидання кешу PWA** видаляє рівно записи CacheStorage
  (`src/sw/cache.ts`), не торкаючись `sync_op_outbox` у SQLite/OPFS,
  IndexedDB Їжі й `localStorage` (`PWASection.tsx:132-143`).
- Редиректи на оплату — `ALLOWED_CHECKOUT_HOSTS`, описано в
  pricing-контракті.

## Чого не робити

- Не заводити другий рівень акордеона і не відкривати секцію «бо вона
  перша у вкладці» — Варіант A і рішення 2026-09-11.
- Не хардкодити заголовок секції в компоненті — лише
  `settingsSectionTitle(id)`; не додавати секцію в `SECTION_RENDERERS` без
  запису в каталог і в `GROUPS` (перше кидає на завантаженні модуля, друге
  ховає секцію від вкладок мовчки).
- Не повертати пошук по сторінці й окремий LS-ключ під новий прапорець —
  лише `FLAG_REGISTRY`.
- Не дублювати сюди дії Профілю (PIN, пам'ять, видалення акаунта) — лише
  вказівник.
- Не фарбувати стан вибору семантичним кольором — бренд
  (**[борг]** `FizrukSection.tsx:59`).
- Не писати сирий `<button>` там, де є `Button` / `IconButton`, і сирий
  `<input>` без `.input-focus*` (**[борг]** `DashboardSection.tsx:161`,
  `FizrukSection.tsx:48`, `FinykSection.tsx:152`, `ChunkErrorBoundary.tsx:74`,
  `NotificationsSection.tsx:284`).
- Не класти `ghost` на головну дію блока і не домальовувати їй межу
  руками (**[борг]** `HubBackupPanel.tsx:193-209`); не лишати `Button`
  без `variant` — дефолт легасі (**[борг]** чотири виклики в таблиці вище).
- Не писати копі в компоненті — ні JSX-літералом, ні `COPY`-об'єктом
  (**[борг]** allowlist + сім `COPY`); не лишати «Помилка …» без наступного
  кроку (**[борг]** чотири рядки).
- Не вкладати `<label>` у `<label>` (**[борг]** `SettingsPrimitives.tsx:383`).
- Не додавати стан поверхні без івента (**[борг]** — поки що їх немає
  взагалі).
- Не використовувати `scrollIntoView` для якорів — лише власний скролер
  (`HubSettingsPage.tsx:597-618`); не присвоювати `window.location.hash`
  напряму (finding #3).
- Не обіцяти в копі більше, ніж робить код: втрату даних, якої немає;
  фонову доставку без push; «ця інформація не використовується» замість
  «не осідає в пам'яті».

## Поза скоупом

- `PlanSection.tsx` і все про тарифи, портал, скасування —
  [pricing-контракт](./2026-09-16-pricing-paywall-design.md).
- Профіль (`core/profile/**`: PIN, пам'ять Сержанта, «Небезпечна зона»),
  `AiMemoryList.tsx` (лежить у `core/settings`, але рендериться з
  `profile/AiMemorySection.tsx`) — контракт profile, коли поверхню
  візьмуть у роботу.
- Внутрішні редактори Рутини (`modules/routine/components/settings/{Tags,Categories}Section.tsx`)
  — рендеряться всередині секції «Рутина», але належать модулю і його
  контракту; тут лише зафіксовано їхню присутність в allowlist кирилиці.
- `ModuleSettingsDrawer` (правий drawer модулів) — інша поверхня.
- Мобільний застосунок — контур на паузі
  ([ADR-0094](../../../governance/adr/0094-mobile-web-first-freeze.md)).

## Верифікація

- `pnpm --filter @sergeant/web exec vitest run src/core/settings src/core/hub/HubSettingsPage src/core/hub/settingsSectionsCatalog src/core/hub/search/searchSettings`
  — стани з таблиці покриті `HubSettingsPage.test.tsx` (диплінки, billing-
  і silpo-return, згорнуте за замовчуванням, пам'ять явного розкриття,
  tabpanel, свайп), `PrivacySection.test.tsx` (гідрація, гість, офлайн/500,
  відкат збереження, декларації), `DataExportSection.test.tsx` (CSV ≠ JSON,
  гість до натискання, `signedIn === null`), `NotificationsSection.test.tsx`
  (чотири стани дозволу, чесна фонова доставка, ширина поля часу),
  `PWASection.test.tsx`, `DashboardSection.test.tsx` (останній модуль,
  щільність у мішку, названа група), `ExperimentalSection.test.tsx`
  (справжній `disabled`, токен `warning`), `settingsRoute.test.tsx`
  (redirect-only з `replace`), `preferenceLoadFailure.test.ts`,
  `settingsSectionTitles.test.tsx` (парність 14 заголовків),
  `settingsActionButtonVariants.test.ts` (нуль повноширинних ghost у
  `core/settings`), `useServerPreference.race.test.ts`, `hubPrefsSync.test.ts`.
- `pnpm lint:ui-canon` — `legacyButton` 0, `offCanonRingOpacity` 0,
  `numericIconSize` 0, `handRolledFocusRing` ≤ 225, `cyrillicJsxAllowlist`
  = 299: новий кириличний літерал у секції означає новий рядок у
  allowlist, тобто червоний гейт. Храповик не бачить ні кнопок без
  `variant`, ні `COPY`-об'єктів — ці два борги тримає лише цей документ.
- `pnpm lint:design-conventions` — `focus:`, `text-2xs`, під-12px і сирий
  hex на поверхні на нулі.
- `pnpm --filter @sergeant/web test:a11y` — `heading-order` гейтить
  `h1 → h2 (contents) → h3` секцій у справжньому Chromium
  (`SettingsPrimitives.tsx:214-234`); блокуючий job «Mobile UI audit (44px
  touch targets)» міряє `ToggleRow` і `Button` під `pointer: coarse`.
- Рев'ю за цим документом: заголовок із каталогу; `SettingsGroup →
SettingsSubGroup → ToggleRow`; кнопка з явним `(variant, tone)` за
  таблицею; стан вибору — бренд; копі в `@shared/i18n`; помилка з
  наступним кроком; незворотне — через `ConfirmDialog danger`; івент на
  новий стан.
