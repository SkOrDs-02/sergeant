# Sergeant — План PR-ів за UX-прожаркою (post-onboarding, 2026-05-06)

> **Last validated:** 2026-05-06 by @Skords-01 / Devin (housekeeping pass — викреслено PR-13/PR-37, оновлено Status / PR-22 заголовок). **Next review:** 2026-08-04.
> **Status:** Active

> **Cross-refs:**
> [`2026-05-06-ux-roast.md`](./2026-05-06-ux-roast.md) — джерельна прожарка (P0/P1/P2 + add/change/remove) ·
> [`2026-04-28-ux-improvement-plan.md`](./2026-04-28-ux-improvement-plan.md) — попередній UX execution tracker ·
> [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) — sprint registry онбордингу.

**Контекст:** виходимо з документа [`2026-05-06-ux-roast.md`](./2026-05-06-ux-roast.md). Жоден пункт не упущено: усі **17 add (A1–A17)**, **16 change (C1–C16)** та **6 remove (R1–R6)** з §14 покриті. Додатково — пункти з §7 (perf), §11 (privacy), §12 (mobile) і §15 (pricing). Загальна виконавча шкала — **41 PR** у 3 спринтах + 1 enabling-PR (PR-0). Початково було 43; PR-13 і PR-37 закриті як obsolete-by-drift після Stage 7 storage cleanup і dark-mode toggle consolidation (див. розділи нижче).

> **Update 2026-05-06:** PR-1 (App-lock, XL) розбито на **PR-1a** (base PIN-flow) + **PR-1b** (biometric add-on) — щоб знизити ризик XL-merge.
>
> **Update 2026-05-06 (housekeeping):** після перегляду стану main викреслено два пункти, бо їх фундамент уже відсутній:
>
> - **PR-13** «Module-context у sync-error toast [A15]» — cloudSync v1 engine tree dropped у Stage 7 ([#2046](https://github.com/Skords-01/Sergeant/pull/2046), `core/cloudSync/index.ts` тепер експортує лише `useSyncStatus`). `useSyncErrorToast.ts`, модульні `useCloudSync.ts` та supporting plumbing видалені — PR-13 ні до чого прив'язати.
> - **PR-37** «Прибрати dark-mode дубль у Settings [R3]» — дубля більше немає: `DarkModeToggle` хостить рівно одна точка (`apps/web/src/core/app/HubHeader.tsx`), у `apps/web/src/core/settings/*` жоден файл не імпортує `useDarkMode` / `DarkModeToggle`.

**Конвенції:**

- Гілки: `devin/$(date +%s)-<short-name>` (за репо-конвенцією AGENTS.md).
- Кожен PR оновлює `apps/web/src/shared/i18n/uk.ts`, якщо додає UA-літерали (Hard Rule #15 в AGENTS.md → ESLint `sergeant-design/no-cyrillic-jsx-literal`).
- RQ-ключі — лише через factories (`hubKeys`, `finykKeys` тощо).
- Кожен PR має RTL/Vitest тест (Hard Rule про testing) і pre-commit Husky-чек.
- Для destructive UX міняємо у двох місцях: компонент + його `.test.tsx` snapshot.
- Розмір (S/M/L/XL) — приблизна оцінка: S=½ дня, M=1–2 дні, L=3–5 днів, XL=тиждень+.
- Reviewer: **@Skords-01** (єдиний owner до моменту делегування — див. AGENTS.md secondary=TBD).
- PR-11 (CSV export) і PR-28 (Avatar upload) — **на паузі** до отримання S3/R2 credentials. Можна почати скелет без upload-storage частини.
- PR-X3 (content style guide) — пишемо **з нуля** на основі i18n каталогу `apps/web/src/shared/i18n/uk.ts`.

**Загальна послідовність:**

- **Sprint 0 (enabling, до 1 тижня):** PR-0 — підготовка governance + аналітики, потрібна для метрик.
- **Sprint 1 (P0 — trust + IA, ~1.5 тижня):** PR-1a, PR-1b, PR-2…PR-7.
- **Sprint 2 (P1 — empty/error/forms/permissions/perf, ~2 тижні):** PR-8…PR-25.
- **Sprint 3 (P2 — polish + tone-of-voice + cleanup, ~1 тиждень):** PR-26…PR-42.

---

## Status — shipped (станом на 2026-05-06)

| PR    | Title                                                            | Sprint | Status              | Landing                                                                                   |
| ----- | ---------------------------------------------------------------- | ------ | ------------------- | ----------------------------------------------------------------------------------------- |
| PR-4  | Уніфікація landing tab → «Огляд» (4 модулі) [C1]                 | 1      | ✅ done             | [#2103](https://github.com/Skords-01/Sergeant/pull/2103) (commit `9889e4ae`)              |
| PR-5  | Copy bundle: OfflineBanner UA + DataExport + Pricing [C2/C3/A13] | 1      | ✅ done             | commit [`bc4b9251`](https://github.com/Skords-01/Sergeant/commit/bc4b9251) (PR #2102)     |
| PR-21 | Прибрати reveal-toast Reports tab [R1]                           | 2      | ✅ done             | [#2105](https://github.com/Skords-01/Sergeant/pull/2105)                                  |
| PR-27 | Forgot-password autoclose / «Назад до входу» [A14]               | 3      | ✅ done             | [#2106](https://github.com/Skords-01/Sergeant/pull/2106)                                  |
| PR-29 | Delta arrow ▲▼ для colorblind [A10]                              | 3      | ✅ done             | [#2111](https://github.com/Skords-01/Sergeant/pull/2111)                                  |
| PR-33 | PWA reset cache → variant=danger [C11]                           | 3      | ✅ done             | [#2115](https://github.com/Skords-01/Sergeant/pull/2115)                                  |
| PR-34 | «Готово, [name]!» register success copy [C13]                    | 3      | ✅ done             | [#2114](https://github.com/Skords-01/Sergeant/pull/2114)                                  |
| PR-38 | Stagger reduce [R4]                                              | 3      | ✅ done (zero-diff) | [#2116](https://github.com/Skords-01/Sergeant/pull/2116) (тільки коментарі)               |
| PR-39 | Bar-grow cap 600 ms [R5]                                         | 3      | ✅ done             | [#2119](https://github.com/Skords-01/Sergeant/pull/2119)                                  |
| PR-30 | Loading-state copy unify (1-а особа однини) [C5]                 | 3      | ✅ done             | [#2124](https://github.com/Skords-01/Sergeant/pull/2124)                                  |
| PR-15 | Password-strength entropy [C8]                                   | 2      | ✅ done             | [#2156](https://github.com/Skords-01/Sergeant/pull/2156)                                  |
| PR-17 | Logout primary в Profile [C10]                                   | 2      | ✅ done             | [#2153](https://github.com/Skords-01/Sergeant/pull/2153)                                  |
| PR-18 | Tour vs Restart-onboarding copy revamp [C12]                     | 2      | ✅ done             | [#2154](https://github.com/Skords-01/Sergeant/pull/2154)                                  |
| PR-26 | Empty-state placeholder в /chat [A12]                            | 3      | ✅ done             | [#2160](https://github.com/Skords-01/Sergeant/pull/2160)                                  |
| PR-31 | «Введи X» zod-каталог unify [C6]                                 | 3      | ✅ done             | [#2158](https://github.com/Skords-01/Sergeant/pull/2158)                                  |
| PR-13 | Module-context у sync-error toast [A15]                          | 2      | ❌ obsolete         | cloudSync v1 dropped у Stage 7 ([#2046](https://github.com/Skords-01/Sergeant/pull/2046)) |
| PR-37 | Прибрати dark-mode дубль у Settings [R3]                         | 3      | ❌ obsolete         | дубля немає, `DarkModeToggle` лише в `core/app/HubHeader.tsx`                             |

**Прогрес:** 15 із 41 виконавчих PR-ів змерджено; 2 (PR-13, PR-37) закриті як obsolete-by-drift. Деталі у відповідних розділах нижче.

**Заблоковані напрямки:**

- **Sprint 0 (PR-0 telemetry)** — не стартував. Блокує A1 (App-lock), A4, A8 та решту PR-ів, що залежать від подій.
- **PR-11 (CSV export)** і **PR-28 (Avatar upload)** — на паузі до отримання S3/R2 credentials.

---

## Sprint 0 — Enabling

### PR-0 · Telemetry & ADR foundation

**Why first:** §18 (Як міряти ефект) вимагає PostHog-events, які зараз або відсутні, або непослідовні. Без них ми не помітимо, чи P0-зміни щось дали.
**Scope:**

- Додати в `core/observability/analytics.ts` нові events:
  - `app_lock_setup_started`, `app_lock_setup_completed`, `app_lock_unlock_success`, `app_lock_unlock_failed` (для PR-1a), `biometric_setup_completed`, `biometric_auth_success`, `biometric_auth_failed_fallback_pin` (для PR-1b)
  - `module_settings_opened_from_module` (для PR-2)
  - `module_landing_tab_clicked` з `{ module, tab_key }` (для PR-4)
  - `error_boundary_request_id_copied`, `error_boundary_retried` (для PR-14)
  - `permissions_settings_opened`, `permission_status_changed` (для PR-7)
- `docs/adr/00NN-ux-roast-2026-Q2.md` — фіксація рішень з §1–§13 прожарки.
- `docs/launch/product-os/ftux-master-tracker.md` — нова секція «UX-roast P0/P1/P2».
  **Files:** `apps/web/src/core/observability/analytics.ts`, `docs/adr/00NN-…md`, tracker.
  **Acceptance:** events видно в PostHog dev-проєкті, ADR прийнятий PR-review.
  **Size:** S
  **Depends on:** —

---

## Sprint 1 — P0 (trust + IA)

### PR-1a · App-lock (base PIN-flow) [A1 — phase 1/2]

**Items covered:** A1 (PIN portion), частково §11.1 (privacy P0).
**Scope:**

- `apps/web/src/core/security/AppLock.tsx` — модальний lock-screen (PIN 4–6 цифр + show/hide + back-tap).
- `apps/web/src/core/security/useAppLock.ts` — hook керування станом (idle / locked / unlocking).
- `apps/web/src/core/security/lockStorage.ts` — зберігання hash(PIN) у IndexedDB (SubtleCrypto PBKDF2, не localStorage).
- Settings → Privacy section: «Блокування додатка» (toggle + change-PIN flow). Без biometric-toggle (з'явиться у PR-1b).
- Lock triggers: cold-start, перемикання задач (на mobile — `visibilitychange`), idle > N хв (default 5).
- Recovery: «Забув PIN» → re-auth через email-magic-link або пароль акаунту → reset.
- Accessibility: `role="dialog"`, focus-trap, ESC-key disabled, screen-reader announce.
- Analytics events з PR-0 (`app_lock_setup_*`, `app_lock_unlock_*`).
- Feature-flag: `app-lock-enabled` (defalt off → reveal через Experimental → on by default після стабілізації).
  **Files:**
- new: `core/security/AppLock.tsx`, `useAppLock.ts`, `lockStorage.ts`
- update: `core/App.tsx` (composer), `core/settings/PrivacySection.tsx` (новий)
- i18n: ~10 нових ключів у `messages.privacy.lock.*`
  **Acceptance:**
- Cold-start після setup → lock-screen.
- 3 невдалих спроби → cooldown 30 sec + warning toast.
- E2E: `pnpm test apps/web/src/core/security`.
- Доступність: NVDA/VoiceOver читає prompt, фокус-trap працює.
- Без biometric-bridge — purely PIN; PR-1b додає окрему capability.
  **Size:** L
  **Depends on:** PR-0
  **Risks:** SubtleCrypto на старих iOS Safari < 14 → потрібен polyfill або bail-out з banner-ом «Браузер не підтримує — використай актуальну версію».

### PR-1b · App-lock biometric add-on [A1 — phase 2/2]

**Items covered:** A1 (biometric portion).
**Scope:**

- Capacitor-адаптер: `@capacitor-community/biometric-auth` (Capacitor 6 plugin) для PWA-через-mobile-shell.
- Web-API fallback: `navigator.credentials` + `WebAuthn` для desktop PWA, де доступно.
- `core/security/BiometricAdapter.ts` — унифікований інтерфейс: `isAvailable()`, `authenticate()`, `register()`.
- Settings → Privacy → «Блокування додатка» додає toggle «Біометрія (Face ID / Touch ID)» доступний лише якщо `isAvailable() === true`.
- Lock-screen: при authentication-prompt — спершу пробує biometric (якщо увімкнено), fallback на PIN.
- Migration: усі users з PR-1a уже мають PIN; biometric — opt-in поверх існуючого PIN, не заміна.
- Analytics: events `biometric_setup_completed`, `biometric_auth_success`, `biometric_auth_failed_fallback_pin`.
  **Files:**
- new: `core/security/BiometricAdapter.ts` + платформ-specific варіанти `BiometricAdapter.web.ts` / `BiometricAdapter.capacitor.ts`
- update: `core/security/AppLock.tsx` (інтеграція)
- update: `apps/mobile-shell/capacitor.config.ts` (плагін реєстрація)
- update: `core/settings/PrivacySection.tsx` (toggle)
- i18n: ~5 нових ключів у `messages.privacy.lock.biometric.*`
  **Acceptance:**
- iOS PWA через mobile-shell: Face ID prompt при unlock, fallback на PIN при cancel.
- Desktop Chrome з WebAuthn: біометрія доступна; без WebAuthn — toggle disabled з tooltip «Не підтримується цим браузером».
- iOS browser (без Capacitor wrapping) → web-API не дає → toggle disabled (graceful).
- Disable-toggle не вимикає PIN — лише biometric-частину.
  **Size:** M
  **Depends on:** PR-1a
  **Risks:** WebAuthn UX непослідовний між браузерами; iOS PWA без shell-у — без біометрії взагалі (документуємо в `docs/security/app-lock.md`).

### PR-2 · Module settings shortcut [A2]

**Items covered:** A2, §1.2.
**Scope:**

- У header кожного модуля додати gear-icon кнопку → відкриває `/?tab=settings#settings-{module}` (hash deep-link уже працює в `HubSettingsPage`).
- Tooltip: «Налаштування Фініка» (переменна за модулем).
- Усі 4 модулі: Finyk, Fizruk, Nutrition, Routine.
  **Files:**
- `modules/finyk/components/finykNav.tsx` (header) + `modules/finyk/FinykApp.tsx` (gear handler)
- `modules/fizruk/shell/FizrukHeader.tsx`
- `modules/nutrition/components/NutritionHeader.tsx`
- `modules/routine/components/*Header.tsx`
- shared: `shared/components/layout/ModuleHeader.tsx` — додати prop `onOpenSettings`
- i18n: `messages.modules.openSettings: "Налаштування модуля"`
  **Acceptance:**
- Тап gear-icon у Фініку → закривається module overlay, відкривається hub з settings tab + scrolled до `#settings-finyk`.
- 4 модулі — однакова поведінка.
- Snapshot-тести `*Header.test.tsx` оновлено.
  **Size:** M
  **Depends on:** PR-0

### PR-3 · Bento subtitles [A3]

**Items covered:** A3, §2.4.
**Scope:**

- На `HubDashboard` bento-картках модулів (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`) додати рядок під назвою:
  - Фінік → «Фінанси та бюджети»
  - Фізрук → «Тренування та тіло»
  - Рутина → «Звички та трекери»
  - Харчування → «Їжа, склад, рецепти»
- Не показувати, якщо є метрика (наприклад «−320 ₴ за тиждень») — тільки коли пусто.
- Verify: `WelcomeScreen.PEEK_CARDS` лишається з фейк-метриками (не торкаємось).
  **Files:**
- `core/hub/HubDashboard.tsx`
- (можливо) `core/hub/ModuleBentoCard.tsx`
- i18n: `messages.hub.modules.{finyk,fizruk,routine,nutrition}Subtitle`
  **Acceptance:**
- Перший вхід (FTUX) — bento показує subtitle на всіх 4 картках.
- Після першого запису у Фінік — subtitle ховається у Фініку, метрика з'являється.
- Snapshot-тест: 2 стани (з метрикою / без).
  **Size:** S
  **Depends on:** PR-0

### PR-4 · Уніфікація landing-табу до «Огляд» [C1] — ✅ DONE [#2103](https://github.com/Skords-01/Sergeant/pull/2103)

**Items covered:** C1, §1.1.
**Scope:**

- 4 модулі — перейменувати label першої вкладки на «Огляд».
  - Фінік: уже «Огляд» — без змін.
  - Харчування: уже «Огляд» — без змін.
  - Фізрук: «Сьогодні» → «Огляд». Значення id-табу залишається `today`/`overview` за поточним route-mapper-ом — переіменовуємо лейбл у `fizrukNav.tsx`. Усередині додати sub-tab `«Сьогодні»` як перший pill, щоб контент не пропав.
  - Рутина: «Календар» → «Огляд». Календар стає основним візуалом overview-сторінки. Зберегти id таба.
- Title в `ModuleHeader` теж синхронізувати (`titleFor` у `FizrukHeader.tsx`).
- Backtitle (back-label у `backLabelFor`) — залишити «Сьогодні» / «Календар» de-facto, бо це те, з чого user пішов.
- Аналітика: PR-0 events `module_landing_tab_clicked`.
  **Files:**
- `modules/fizruk/shell/fizrukNav.tsx`, `FizrukHeader.tsx`, `fizrukRoute.ts`
- `modules/routine/components/RoutineBottomNav.tsx`, `RoutineHeader.tsx`
- snapshot tests
- i18n каталог
  **Acceptance:**
- Bottom-nav у всіх 4 модулях має лейбл «Огляд» першим.
- Routes збережені (`?p=today`, `?p=calendar` працюють для зворотньої сумісності).
- Тести `*Nav.test.tsx` оновлено.
- Не зачіпати hash-deep-links з email-нагадувань (перевірити `notificationDeepLinks.ts`).
  **Size:** M
  **Depends on:** PR-0

### PR-5 · Copy fixes bundle (UA OfflineBanner + DataExport + Pricing) [C2 + C3 + §15] — ✅ DONE commit [`bc4b9251`](https://github.com/Skords-01/Sergeant/commit/bc4b9251) (PR #2102)

**Items covered:** C2, C3, §15 (Pricing «Звички» → «Рутина»).
**Scope:**

- `OfflineBanner.tsx`:
  - `"${syncV2DeadLetterCount} blocked"` → `"${count} ${pluralUa(count,{one:"не синхронізовано",few:"не синхронізовано",many:"не синхронізовано"})}"` або коротше «N помилок синхронізації».
  - `"Retry"` → `messages.actions.retry` («Повторити»).
- `HubBackupPanel.tsx`:
  - «Резервна копія всього Hub (Фінік, Фізрук, Рутина, останній модуль).» → «… (Фінік, Фізрук, Рутина, Харчування) у JSON-файл.»
- `PricingPage.tsx`:
  - «Звички» → «Рутина» в `TIERS[0].features[0]`. Узгодити tone з UI («Усі модулі: Фінік / Фізрук / Харчування / Рутина»).
- Перевірити чи `actions.retry` існує (так, є). Перевірити `pluralUa` сигнатуру.
  **Files:**
- `core/app/OfflineBanner.tsx`
- `core/hub/HubBackupPanel.tsx`
- `core/PricingPage.tsx`
- i18n: 1 новий ключ `messages.sync.deadLetterShort` (або інлайн через pluralUa)
- snapshot-тести `OfflineBanner.test.tsx`, `HubBackupPanel.test.tsx`, `PricingPage.test.tsx`
  **Acceptance:**
- Жодних англомовних strings у трьох цих компонентах (lint-rule `no-cyrillic-jsx-literal` на нових — n/a, але візуальна перевірка).
- E2E `OfflineBanner` блок з `data-state="blocked"` має UA-text.
  **Size:** S
  **Depends on:** —

### PR-6 · HubReports EmptyState [A4 + C16]

**Items covered:** A4, C16, §3.1.
**Scope:**

- Замінити inline `«Немає даних»` (HubReports.tsx:84-90) на `<EmptyState compact>` з:
  - illustration: малий barchart-skeleton-illustration (новий або з існуючої бібліотеки).
  - title: «Поки даних мало»
  - description: «Звіт оживе після ~3 записів цього тижня.»
  - hint / action: посилання-CTA «Додати запис» → відкриває Quick-Add Sheet (за модулем StatCard-у).
- Усі 4 модульні карти Reports (Фінік / Фізрук / Рутина / Харчування) — однаковий стиль empty.
- Module-tinted variant (`<EmptyState module="finyk">`).
  **Files:**
- `core/hub/HubReports.tsx`
- new: `shared/components/ui/EmptyStateIllustrations` — додати `BarchartEmptyIllustration`
- i18n: `messages.empty.reportsNoData`, `messages.empty.reportsNoDataHint`
  **Acceptance:**
- 4 StatCard'и в empty-state мають однакові padding/illustration/CTA.
- Tap на CTA «Додати запис» у StatCard «Фінік» → відкривається `ManualExpenseSheet` (deep-link або redirect).
  **Size:** M
  **Depends on:** PR-0

### PR-7 · Permissions overview в Settings [A5 + R6 + A17]

**Items covered:** A5, R6 (дубльовані permissions toast), A17 (default reminder time), §8.2.
**Scope:**

- `core/settings/PrivacySection.tsx` — нова секція в Settings tab `Загальні`:
  - Notifications (status, request button, посилання на browser-settings deep-link при denied).
  - Microphone (status: not-asked / granted / denied).
  - Camera (status).
  - Geolocation (status, навіть якщо не використовується — для трасту).
- Прибрати трикратний `toastWarning("Без дозволу…")` з `NotificationsSection.tsx` — лишити один на верхньому рівні.
- Default reminder times: Fizruk 19:00, Nutrition 12:00, Routine — per-habit (без default).
  **Files:**
- new: `core/settings/PrivacySection.tsx`
- `core/settings/NotificationsSection.tsx` (видалити дублі toast'ів)
- `modules/fizruk/hooks/useMonthlyPlan.ts` (default 19:00)
- `modules/nutrition/lib/nutritionStorage.ts` (default 12:00)
- i18n: `messages.privacy.permissions.{notifications,microphone,camera,geolocation}*`
  **Acceptance:**
- Settings → Privacy → Permissions показує 4 рядки з кольоровим статусом.
- При першому увімкненні toggle нагадування — використовує default time.
- Toast про permission denied — лише один раз.
  **Size:** M
  **Depends on:** PR-0

---

## Sprint 2 — P1 (empty/error/forms/permissions/perf)

### PR-8 · Hub notifications sub-group [A6]

**Items covered:** A6, §9.5.
**Scope:**

- У `NotificationsSection.tsx` додати новий `SettingsSubGroup` «Хаб (нагадування і дайджест)» з togglе для:
  - Щотижневий дайджест (push)
  - Daily Nudge
  - Re-engagement card
- Зберігати в `hubPrefs.schema.ts` (вже існує — `hubPrefs.ts`).
  **Files:**
- `core/settings/NotificationsSection.tsx`
- `core/settings/hubPrefs.schema.ts` + `hubPrefs.ts`
- `core/onboarding/DailyNudge.tsx`, `core/hub/WeeklyDigest.tsx`, `core/onboarding/ReEngagementCard.tsx` — респект до preference.
- i18n
  **Acceptance:**
- Тогл вимкнено → відповідна секція не рендериться на дашборді.
- Тогл вимкнено → push не надсилається (server-side respect через user_prefs API).
  **Size:** M
  **Depends on:** PR-7

### PR-9 · Reminder-time UI унифікація [C4]

**Items covered:** C4, §5.1.
**Scope:**

- Усі 3 модульні reminder-time-input'и → один `<TimeInput>` shared-компонент (`shared/components/ui/TimeInput.tsx`).
- Базується на `<input type="time">`, але з UA-localized fallback для старих браузерів.
- Nutrition `<input type="number" min={0} max={23}>` → видалити, замінити TimeInput.
- Persist hh:mm у nutritionPrefs (зараз тільки hour).
  **Files:**
- new: `shared/components/ui/TimeInput.tsx`
- `core/settings/NotificationsSection.tsx`
- `modules/nutrition/lib/nutritionStorage.ts` (схема `reminderHour, reminderMinute`)
- `modules/fizruk/hooks/useMonthlyPlan.ts` (вже hh:mm — не міняти)
  **Acceptance:**
- Усі 3 модулі мають однаковий UI.
- Nutrition prefs мігрує `reminderHour=12` → `reminderHour=12, reminderMinute=0`.
- Snapshot тест.
  **Size:** S
  **Depends on:** PR-7

### PR-10 · Sessions: «Цей пристрій» + last-seen у людському форматі [A7]

**Items covered:** A7, §10.3.
**Scope:**

- `SessionsSection.tsx` — для кожної сесії:
  - Якщо `session.id === currentSession.id` → бейдж «Цей пристрій» (brand-tinted).
  - `last_seen_at` → «Хвилину тому» / «Сьогодні о 14:32» / «Вчора» / «3 дні тому».
  - utility: `shared/lib/format/relativeTime.uk.ts` (Intl.RelativeTimeFormat з ru/uk fallback).
- User-Agent → людський формат: «Chrome 132 на Windows», «Safari 17 на iPhone».
  **Files:**
- `core/profile/SessionsSection.tsx`
- new: `shared/lib/format/relativeTime.uk.ts`, `shared/lib/format/userAgent.ts`
  **Acceptance:**
- Тест: 3 mock-сесії → правильні бейджі/часи.
- Знайома назва браузера/OS у списку.
  **Size:** S
  **Depends on:** —

### PR-11 · CSV export + email-mine-data [A8]

**Items covered:** A8, §11.4.
**Scope:**

- `HubBackupPanel.tsx` — додати другу кнопку «Експорт CSV (транзакції Фініка)».
- API: `POST /api/data-export/email-me` → server надсилає zip-архів на email акаунту (Better Auth у нас вже є user.email).
- За потреби — webhook через `apps/server/src/modules/dataExport/`.
  **Files:**
- `core/hub/HubBackupPanel.tsx`
- new: `core/hub/csvExport.ts` (генератор CSV із Mono-tx та Finyk-локальних)
- new: `apps/server/src/modules/dataExport/index.ts`, route, sql-migration `045_data_export_jobs.sql`
- new: `packages/api-client/src/endpoints/dataExport.ts`
- i18n
  **Acceptance:**
- Експорт CSV → файл з заголовками `date,merchant,amount,category,currency`.
- «Email мені копію» → email приходить з `.zip`-архівом (json + csv).
- Rate-limit: 1 запит/добу на user (server-side).
  **Size:** L
  **Depends on:** PR-0

### PR-12 · Keyboard accessibility for dnd-kit reorder [A9]

**Items covered:** A9, §6.4.
**Scope:**

- HubDashboard edit-mode — додати `KeyboardSensor` до `useSensors` у `dnd-kit`.
- Стрілки керують reorder, Space — пікап/драп.
- aria-live announcement при зміні позиції («Фінік пересунуто на позицію 2 з 4»).
  **Files:**
- `core/hub/HubDashboard.tsx`
- `shared/components/ScreenReaderAnnouncer.tsx` — використати existing
  **Acceptance:**
- Tab → focus на handle → Space → arrows → reorder → Space → drop → announcer.
- Vitest з `@testing-library/user-event` keyboard-нав.
  **Size:** S
  **Depends on:** —

### PR-13 · Module-context у sync-error toast [A15] — ❌ OBSOLETE-BY-DRIFT

**Status:** Закрито без реалізації після Stage 7 storage cleanup. Усі файли, які мали бути зачеплені, **вилучені з кодової бази**:

- `core/cloudSync/useSyncErrorToast.ts` — видалено разом з v1 cloudSync engine tree drop ([#2046](https://github.com/Skords-01/Sergeant/pull/2046), commit [`a97b8cc8`](https://github.com/Skords-01/Sergeant/commit/a97b8cc8)).
- Модульні `useCloudSync.ts` (finyk/fizruk/nutrition/routine) — теж видалені у тому ж drop-і.
- `useUnifiedFinanceData.ts` залишився, але це тепер чистий dedupe/merge утиліт без sync-error plumbing.
- `core/cloudSync/index.ts` тепер експортує **лише `useSyncStatus`**.
- Server-side `module_data` table dropped + v1 `syncPush*`/`syncPull*` handler-и видалені (commit [`75dcdd5c`](https://github.com/Skords-01/Sergeant/commit/75dcdd5c), PR #051+#052a з storage-roadmap-у).

**Items covered → переведено на v2 writer-runtime:** якщо v2 sync layer надасть власний error-surface, новий PR можна буде відкрити з нуля (новий toast component + нові i18n keys). До того моменту цей пункт залишається у плані тільки як історичний reference на A15.

### PR-14 · Request-ID в ModuleErrorBoundary [A16]

**Items covered:** A16, §4.2.
**Scope:**

- Перенести `extractRequestId` + `copyRequestId` з `core/ErrorBoundary.tsx` у shared util `core/observability/requestId.ts`.
- `ModuleErrorBoundary.tsx` — використати той же UI: «Помилка в модулі. ID: abc123» з кнопкою «Скопіювати ID».
- analytics: `error_boundary_request_id_copied` (з PR-0).
  **Files:**
- new: `core/observability/requestId.ts`
- `core/ErrorBoundary.tsx` (рефактор — імпорт з нового utility)
- `core/ModuleErrorBoundary.tsx`
  **Acceptance:**
- Module error-fallback показує copy-ID button (якщо requestId є).
- Тест: симульована ApiError → ID скопіювалось.
  **Size:** S
  **Depends on:** PR-0

### PR-15 · Password-strength entropy [C8] — ✅ DONE [#2156](https://github.com/Skords-01/Sergeant/pull/2156)

**Items covered:** C8, §5.2.
**Scope:**

- `apps/web/src/core/auth/AuthPage.tsx` `PasswordStrengthBar` → перейти на entropy-метрику:
  - Char-classes (lowercase / uppercase / digit / symbol)
  - Unique chars / total chars
  - Score = `len * (uniqueRatio) * (classCount / 4)`
- Three levels: <30 weak, 30–60 medium, >60 strong.
- Виносний util: `shared/lib/auth/passwordStrength.ts` (тестопридатний).
  **Files:**
- new: `shared/lib/auth/passwordStrength.ts` + .test.ts
- `core/auth/AuthPage.tsx`
  **Acceptance:**
- `aaaaaaaaaa` (10 символів, 1 унікальний) → "Слабкий".
- `Aa1!Aa1!Aa` (10 символів, 6 унікальних, 4 класи) → "Надійний".
- Snapshot-тест AuthPage.
  **Size:** S
  **Depends on:** —

### PR-16 · Memory Bank → Settings → Асистент [C9]

**Items covered:** C9, §10.4, §3.4 (preview).
**Scope:**

- Перенести `MemoryBankSection.tsx` з `core/profile/` у нову secção `core/settings/AssistantSection.tsx`.
- Додати в Settings нову SettingsGroup «Асистент» з sub-groups:
  - Памʼять (нинішній MemoryBank)
  - AI-Digest (вже є — мерджимо)
  - Каталог (Assistant Catalogue)
- У `Profile` лишити preview-тізер: «Що асистент знає про тебе» з link «→ Налаштування».
- Empty-state у MemoryBank: «AI ще не знає про тебе нічого» + CTA «Розкажи асистенту».
  **Files:**
- `core/profile/ProfilePage.tsx` (видалити section, додати tease-row)
- new: `core/settings/AssistantSection.tsx`
- merge: `core/settings/AIDigestSection.tsx`, `AssistantCatalogueSection.tsx` → під новий group
- `core/settings/HubSettingsPage.tsx` (sections list оновлено)
- migrate hash-deep-link: `#settings-memory` → `#settings-assistant-memory` (зворотня сумісність)
  **Acceptance:**
- Tap «Памʼять» у Profile → редірект до `#settings-assistant-memory`.
- Settings → Асистент → 3 sub-groups.
- Empty-state у MemoryBank без даних.
  **Size:** M
  **Depends on:** PR-0

### PR-17 · Logout primary в Profile [C10] — ✅ DONE [#2153](https://github.com/Skords-01/Sergeant/pull/2153)

**Items covered:** C10, §10.1.
**Scope:**

- Додати кнопку «Вийти» внизу `ProfilePage.tsx` (під «Видалення акаунта»). Variant: `secondary`, не `danger` (logout — нейтральне дія).
- Прибрати дубль з `GeneralSection.tsx` (Settings → General → Cloud sync sub-group). Залишити тільки sync-actions, без logout.
  **Files:**
- `core/profile/ProfilePage.tsx`
- `core/settings/GeneralSection.tsx`
  **Acceptance:**
- Вийти доступне у Profile одним тапом.
- Settings → General більше не має logout-кнопки.
- E2E: logout flow з Profile успішний.
  **Size:** S
  **Depends on:** —

### PR-18 · Tour vs Restart-onboarding copy revamp [C12] — ✅ DONE [#2154](https://github.com/Skords-01/Sergeant/pull/2154)

**Items covered:** C12, §2.3.
**Scope:**

- `GeneralSection.tsx` SettingsSubGroup «Онбординг»:
  - Перейменувати кнопку 1: «Подивитись tour» → «Переглянути екскурсію (read-only)».
  - Перейменувати кнопку 2: «Перезапустити онбординг» → «Скинути підказки FTUX».
  - Description-параграф переписати: «Екскурсія — повторне відтворення вітального екрану без змін у даних. Скидання FTUX — перевибір vibe-picks і повторні підказки першого запуску, дані модулів не зачіпаються.»
- Окрему confirm-modal перед reset.
  **Files:**
- `core/settings/GeneralSection.tsx`
- (можливо) `core/onboarding/seedDemoData.ts`, `vibePicks.ts` (контракт `resetOnboardingState`)
- i18n: 4 нових ключі
  **Acceptance:**
- Текстове розрізнення двох кнопок зрозуміле.
- Reset-кнопка викликає confirm-modal перед `resetOnboardingState`.
  **Size:** S
  **Depends on:** —

### PR-19 · aria-live конфлікти fix [C14]

**Items covered:** C14, §6.2.
**Scope:**

- `OfflineBanner.tsx` `role="status" aria-live="polite"` → `role="status" aria-live="off"` + ручний `aria-live="polite"` тільки на text-зміні стану (через ScreenReaderAnnouncer).
- Toast лишається primary `aria-live="polite"`.
- HubChatBody лишається з власним `aria-live="polite"` для повідомлень — але у `<div role="region">`, щоб не конкурував.
  **Files:**
- `core/app/OfflineBanner.tsx`
- (verify) `shared/components/ui/Toast.tsx`, `core/hub/chat/HubChatBody.tsx`
  **Acceptance:**
- Запуск з NVDA: toast + chat msg + offline-banner — порядок 1) Toast, 2) Chat, 3) Banner (через announcer).
- Жодних подвійних оголошень при зміні offline-стану.
  **Size:** S
  **Depends on:** —

### PR-20 · FTUX bento «Що тут буде» [C15]

**Items covered:** C15, §3.2.
**Scope:**

- Якщо модуль не використано (`hasFirstRealEntry === false` per module), bento-картка показує:
  - illustration: ілюстрація-pattern (можливо існуюча `EmptyStateIllustrations`)
  - 1 рядок: «Сюди ляже твій баланс і витрати за тиждень»
  - CTA-overlay (subtle): «Спробувати»
- Зберегти grid-layout, не ламати existing card-styling.
- Логіка: per-module first-entry flags уже існують у `vibePicks` / `firstActionFlags`.
  **Files:**
- `core/hub/HubDashboard.tsx`
- new: `core/hub/ModuleBentoEmpty.tsx`
- shared/EmptyStateIllustrations — нові 4 (по модулю)
  **Acceptance:**
- FTUX (без записів) — bento картки з emptyState; tap → відкриває модуль.
- Після першого запису у Фініку — bento-Фініка показує метрику; інші 3 — emptyState.
  **Size:** M
  **Depends on:** PR-3 (subtitles)

### PR-21 · Прибрати toast про Reports tab [R1] — ✅ DONE [#2105](https://github.com/Skords-01/Sergeant/pull/2105)

**Items covered:** R1, §1.4.
**Scope:**

- У `HubBottomNav.tsx` логіку `sergeant.hub.reportsTabRevealedAt` залишаємо для bounce-анімації.
- Прибрати toast-call (`useToast().info(...)`) при першому reveal-у.
- Зберегти лише animation + (можливо) короткий tooltip над табом «нова вкладка».
  **Files:**
- `core/app/HubBottomNav.tsx`
  **Acceptance:**
- Bounce грає, toast не з'являється.
- Snapshot-тест оновлено.
  **Size:** S
  **Depends on:** —

### PR-22 · Performance — lazy Insights/Digest + sub-section split у HubDashboard / finyk Overview [§7]

**Items covered:** §7.1, §7.4.

> **Контекст vs. initiative 0006 (frontend routing):** route-level lazy boundaries для цілих модулів (`/finyk/*`, `/nutrition/*`) вже реалізовані у [`core/app/router.tsx`](../../apps/web/src/core/app/router.tsx) (Phase 1+2.b — `lazy: () => import("../../modules/<mod>/route")`). Phase 5 ([0006](../initiatives/0006-frontend-routing-and-code-split.md)) додатково замінить `element: <App />` на `<Lazy>` навколо `<FinykApp />`. Це **інша площина**: 0006 розщеплює per-module page-tree, PR-22 розщеплює **sub-cards усередині вже-mount-нутих сторінок** (Overview, HubDashboard hero) — щоб LCP не блокувався heavy data-fetch-ами в `MonthPulseCard` / `NetworthSection` / `BudgetAlertsList`. Доповнюючі ефекти, не дублюючі.

**Scope:**

- `HubDashboard` — секції Insights / Weekly Digest / Re-engagement → `<Suspense fallback={<Skeleton/>}>` + `lazy(() => import(...))` (component-level, бо HubDashboard — частина основного bundle-а через catch-all route у `router.tsx`).
- `modules/finyk/pages/Overview.tsx` (раніше `FinykOverview`) — `MonthPulseCard` / `NetworthSection` / `BudgetAlertsList` / `PlannedFlowsCard` → lazy. Цей файл уже всередині finyk-route chunk-а ([initiative 0006 Phase 2.b](../initiatives/0006-frontend-routing-and-code-split.md)); тут робимо вторинний split на рівні sub-cards.
- IntersectionObserver як trigger для нижніх секцій (не лише `requestIdleCallback`); `MonthPulseCard` / hero-card — eager.
- Vitest perf-snapshot: bundle-size delta + chunk-list assertion (через `vite-bundle-visualizer` або `rollup-plugin-visualizer` snapshot).
  **Files:**
- `apps/web/src/core/hub/HubDashboard.tsx`
- `apps/web/src/modules/finyk/pages/Overview.tsx`
- new: `apps/web/src/shared/hooks/useInViewport.ts`
  **Acceptance:**
- LCP покращується ≥ 100 ms у Lighthouse profile (mobile slow-3G simul).
- Bundle-stats: `Insights.lazy.js`, `WeeklyDigest.lazy.js`, `BudgetAlertsList.lazy.js`, `PlannedFlowsCard.lazy.js` видно як окремі chunks (через `pnpm --filter web build` + Rollup output analysis).
- Не дублювати `lazy()`-обгортки, що вже є в [`core/app/StandaloneRoutes.tsx`](../../apps/web/src/core/app/StandaloneRoutes.tsx) і `ActiveModuleView.tsx` для FinykApp/NutritionApp/тощо — PR-22 додає **новий** layer, не переписує існуючий.
  **Size:** M
  **Depends on:** PR-3, PR-20

### PR-23 · Layout shift fix on Reports tab reveal [§7.2]

**Items covered:** §7.2.
**Scope:**

- `HubBottomNav.tsx` — резервувати слот для `Звіти` у DOM з `visibility: hidden` + `aria-hidden="true"`, поки `revealed === false`.
- Перехід на `visibility: visible` без рекомпонування grid → нема CLS.
  **Files:**
- `core/app/HubBottomNav.tsx`
  **Acceptance:**
- Lighthouse CLS ≤ 0.05 при першому-запис-event'і.
  **Size:** S
  **Depends on:** PR-21

### PR-24 · Mobile: 100dvh + safe-area-inset-bottom [§12.2]

**Items covered:** §12.2.
**Scope:**

- `HubMainContent.tsx`, `HubHomeView.tsx`, кожен модульний root-`div` — `min-h-svh` (вже є для NotFoundPage), `pb-[env(safe-area-inset-bottom)]`.
- `HubBottomNav` — fixed-bottom з `bottom: env(safe-area-inset-bottom)`.
- Verify iOS Safari (browser-режим): bottom-nav не стрибає.
  **Files:**
- `core/app/HubMainContent.tsx`, `HubHomeView.tsx`
- `core/app/HubBottomNav.tsx`
- 4 модулі — module-root.
  **Acceptance:**
- Manual QA в Safari iOS 17 + iPhone 12 Pro physical-device — bottom-nav не змінює позиції при зміні URL-bar.
  **Size:** S
  **Depends on:** —

### PR-25 · PostHog/Sentry init defer [§7.3]

**Items covered:** §7.3.
**Scope:**

- Перевірити, що `initSentry`, `initPostHog` робляться через `dynamic import` після `window.load`.
- Якщо ні — обернути в `requestIdleCallback` + `import(...)`.
  **Files:**
- `core/observability/sentry.ts`, `analytics.ts`
- (можливо) `core/App.tsx` — boot sequence
  **Acceptance:**
- Bundle stats: `posthog-js` і `@sentry/react` — окремі chunks, не у `main.js`.
- Lighthouse TBT покращується.
  **Size:** S
  **Depends on:** —

---

## Sprint 3 — P2 (polish + tone-of-voice + cleanup)

### PR-26 · Empty-state placeholder в /chat [A12] — ✅ DONE [#2160](https://github.com/Skords-01/Sergeant/pull/2160)

**Items covered:** A12, §3.3.
**Scope:**

- `HubChatBody.tsx` — якщо `messages.length === 0`, рендерити `<ChatEmpty>`:
  - 3-4 chip-suggestions: «Скільки я витратив цього тижня?», «Як мої тренування?», «Що я їв сьогодні?», «Стан моїх звичок».
  - Tap на suggestion → префіл `input` через `setInput`.
- Не перекриває композер.
  **Files:**
- `core/hub/chat/HubChatBody.tsx`
- new: `core/hub/chat/ChatEmpty.tsx`
  **Acceptance:**
- Tap на suggestion → input заповнюється + focus.
  **Size:** S
  **Depends on:** —

### PR-27 · Forgot-password autoclose / "До входу" [A14] — ✅ DONE [#2106](https://github.com/Skords-01/Sergeant/pull/2106)

**Items covered:** A14, §4.5.
**Scope:**

- `AuthPage.tsx` — після `forgotState === "sent"` додати кнопку «Назад до входу» + auto-collapse через 6 сек.
  **Files:**
- `core/auth/AuthPage.tsx`
  **Acceptance:**
- Tap «Назад до входу» закриває forgot-panel.
- Через 6 сек неактивності — auto-collapse.
  **Size:** XS
  **Depends on:** —

### PR-28 · Avatar upload UX [A11]

**Items covered:** A11, §10.5.
**Scope:**

- `PersonalInfoSection.tsx` — додати кнопку «Завантажити аватар»:
  - File-picker (image/\*).
  - Cropper (square 256×256) — використати `react-easy-crop` або simple canvas-crop.
  - PUT `/api/profile/avatar` + bigint→number coercion.
- Server: route `apps/server/src/modules/profile/avatar.ts` + Multer + S3/R2 upload.
- Migration `046_profile_avatar_url.sql`.
  **Files:**
- `core/profile/PersonalInfoSection.tsx`
- new: `shared/components/ui/AvatarCropper.tsx`
- `apps/server/src/modules/profile/avatar.ts`, route, migration
- `packages/api-client/src/endpoints/profile.ts` (avatarUpload)
  **Acceptance:**
- Upload jpg → cropped → server → URL в `user.image`.
- avatar render у HubHeader + Profile.
  **Size:** L
  **Depends on:** —

### PR-29 · Delta arrow ▲▼ для colorblind [A10]

**Items covered:** A10, §6.3.
**Scope:**

- `HubReports.tsx` `Delta` component → додати `<Icon name="trending-up|trending-down">` ліворуч від відсотка.
  **Files:**
- `core/hub/HubReports.tsx`
  **Acceptance:**
- Snapshot: positive → ↑зелений з icon; negative → ↓червоний з icon.
  **Size:** XS
  **Depends on:** —

### PR-30 · Loading-state copy unify [C5]

**Items covered:** C5, §2.6.
**Scope:**

- Уніфікувати `«Зачекайте…»`, `«Підключення…»`, `«Виходимо…»`, `«Зберігаємо…»` → 1-а особа однини («Зберігаю…», «Виходжу…», «Завантажую…», «Підключаюсь…»).
- i18n: новий sub-group `messages.loadingActions.{saving,exiting,downloading,connecting,deleting,refreshing}`.
- Усі компоненти-користувачі переробити.
  **Files:**
- `core/auth/AuthPage.tsx`, `core/profile/*Section.tsx`, `core/settings/GeneralSection.tsx`, `modules/finyk/components/FinykLoginScreen.tsx`, etc.
- i18n: ~6 нових ключів
  **Acceptance:**
- Grep `«Зачекайте\|Виходимо\|Зберігаємо»` → 0 матчів у компонентах (тільки в i18n каталозі).
  **Size:** M
  **Depends on:** —

### PR-31 · «Введи X» zod-каталог unify [C6] — ✅ DONE [#2158](https://github.com/Skords-01/Sergeant/pull/2158)

**Items covered:** C6, §4.4.
**Scope:**

- `shared/i18n/uk.ts` `validation.fieldRequired` deprecation.
- Замінити usage на конкретні «Введи X» / «Обери X».
- `tagNameRequired: "Назва тега не може бути порожньою"` → `"Введи назву тега"`.
- `goalNameRequired: "Вкажіть назву цілі"` → `"Введи назву цілі"`.
  **Files:**
- `shared/i18n/uk.ts`
- усі форми, які юзають deprecated key.
  **Acceptance:**
- 0 використань `messages.validation.fieldRequired` (lint-rule no-unused?).
- Snapshot форм оновлено.
  **Size:** S
  **Depends on:** —

### PR-32 · Mono error: auth vs network розрізнення [C7]

**Items covered:** C7, §5.3.
**Scope:**

- `FinykLoginScreen.tsx` — на catch-блоці перевіряти `err.kind === "http" && err.status === 401` → «Mono відхилив токен. Перевір, чи скопіював правильний.»
- Інакше → «Не вдалось зв'язатись з Mono. Перевір з'єднання.»
- Перевірити `isApiError` helper.
  **Files:**
- `modules/finyk/components/FinykLoginScreen.tsx`
- i18n: 2 нових ключі
  **Acceptance:**
- Mock 401 → toast/inline-error UA з token-wording.
- Mock network-fail → connection-wording.
  **Size:** S
  **Depends on:** —

### PR-33 · PWA reset cache → variant=danger [C11]

**Items covered:** C11, §8.3.
**Scope:**

- `PWASection.tsx` кнопка «Скинути кеш PWA» — `variant="danger"`, додати confirm-modal перед reload.
  **Files:**
- `core/settings/PWASection.tsx`
  **Acceptance:**
- Tap «Скинути кеш» → confirm → reload. Без confirm — нічого не робиться.
  **Size:** XS
  **Depends on:** —

### PR-34 · "Ласкаво просимо!" → "Готово, [name]!" [C13]

**Items covered:** C13, §2.7.
**Scope:**

- `AuthPage.tsx` register success celebration → `«Готово, ${name}! Твої дані тепер з тобою на всіх пристроях.»`
- Items array залишається.
  **Files:**
- `core/auth/AuthPage.tsx`
  **Acceptance:**
- Snapshot тест.
  **Size:** XS
  **Depends on:** —

### PR-35 · "Діагностика SW" — у Experimental, не основний UI [R2]

**Items covered:** R2, §2.5.
**Scope:**

- Перенести «Діагностика SW» з `PWASection` у `ExperimentalSection.tsx`.
- Перейменувати «Скинути кеш PWA» → «Очистити кеш і перезавантажити» (більш human).
  **Files:**
- `core/settings/PWASection.tsx`
- `core/settings/ExperimentalSection.tsx`
  **Acceptance:**
- Звичайний user не бачить «Діагностика SW».
- Experimental section показує її з warning-banner.
  **Size:** S
  **Depends on:** PR-36

### PR-36 · Experimental section warning [§9.3]

**Items covered:** §9.3.
**Scope:**

- `ExperimentalSection.tsx` — додати верхній banner: «Експериментальні функції можуть бути нестабільними. Увімкнення зберігається лише на цьому пристрої.»
- Confirmation-checkbox перед увімкненням («Розумію, що це може зламатись»).
  **Files:**
- `core/settings/ExperimentalSection.tsx`
- i18n
  **Acceptance:**
- Перший раз — checkbox обов'язковий, потім toggle відкритий.
  **Size:** S
  **Depends on:** —

### PR-37 · Прибрати dark-mode дубль у Settings [R3] — ❌ OBSOLETE-BY-DRIFT

**Status:** Закрито без реалізації — дубля немає. Поточний стан main:

- `DarkModeToggle` хостить **рівно одна точка** — `apps/web/src/core/app/HubHeader.tsx` (1 використання).
- У `apps/web/src/core/settings/*` (включно з `DashboardSection.tsx`, який план хотів зачепити) **жоден файл не імпортує** `useDarkMode` чи `DarkModeToggle`. Перевірено `grep -r "useDarkMode\|DarkModeToggle" apps/web/src/core/settings/`.
- Сам `useDarkMode` хук живе у `apps/web/src/shared/hooks/useDarkMode.ts` як shared-utility, але споживає його тільки одна UI-точка.

**Original Scope:** план хотів tri-state «light / dark / system» у Settings + toggle 2-state у header. Якщо цей tri-state у майбутньому захочеться — треба нову прожарку (R-пункт), бо контекст і tone-of-voice 2026-Q2 цей напрямок не покривають як standalone-need.

### PR-38 · Stagger reduce [R4]

**Items covered:** R4, §13.1.
**Scope:**

- `HubDashboard` bento stagger 0/80/160ms → 0/30/60ms.
- Видалити окремі fade-in-slow на dashboard hero.
  **Files:**
- `core/hub/HubDashboard.tsx`
- (можливо) tailwind config для `animate-fade-in-slow`
  **Acceptance:**
- Manual QA: subjective speed-feel "snappier".
  **Size:** XS
  **Depends on:** —

### PR-39 · Bar-grow cap 600 ms [R5]

**Items covered:** R5, §13.2.
**Scope:**

- `HubReports.tsx` — змінити `animationDelay: ${i * 30}ms` → `Math.min(600, i*30)` або `i * (600 / dates.length)`.
  **Files:**
- `core/hub/HubReports.tsx`
  **Acceptance:**
- На 30-day chart останній бар стартує не пізніше 600ms.
  **Size:** XS
  **Depends on:** —

### PR-40 · Permissions denied toast — лише один global [R6]

**Items covered:** R6, §2.8.
**Scope:**

- Зведено в PR-7 (Permissions overview) як частина рефакторингу. Якщо PR-7 не покрив — окремий fix у `NotificationsSection.tsx`.
  **Status:** покривається PR-7. Окремий PR не потрібен.

### PR-41 · MemoryBank empty + Sessions guidance + Avatar tease [§10.4 polish + 3.4]

**Items covered:** §10.4 (вже PR-16), §3.4 polish, §10.5 tease.
**Scope:**

- `MemoryBank` empty-state messaging (вже PR-16, тут polish — pre-fill з vibe-picks).
- Sessions: link «Як змінити пароль на іншому пристрої?» — деп-link на ChangePasswordSection.
- Avatar tease — теж PR-28, polish-копія.
  **Status:** консолідовано в PR-16, PR-10, PR-28.

### PR-42 · Pricing chat-counter [§15]

**Items covered:** §15 (Free 5 msg/day).

> **Update 2026-05-07 (ADR-0051 drift):** Server-side backend частково пре-реалізовано у HEAD commit `30584b1`:
>
> - `apps/server/src/modules/billing/effectiveLimits.ts` — Free = 5 `aiRequestsPerDay`, Pro = unlimited.
> - `apps/server/src/modules/billing/requirePlan.ts` — Express middleware, 402 на locked routes; gated `STRIPE_ENABLED`.
> - **Залишається зробити:** `GET /api/chat/usage` endpoint + frontend `ChatUsageCounter.tsx`.
> - Plus-tier більше немає (ADR-0051 → 2-tier: Free + Pro) — рядок «Plus/Pro: counter ховається» → «Pro: counter ховається».

**Scope:**

- `HubChatHeader.tsx` — додати counter pill `«3/5 повідомлень»` (для Free-tier).
- Server: `GET /api/chat/usage` → `{ remaining, limit, plan }` (використати `effectiveLimits` з billing module).
- Якщо >limit, поведінка вже існує (server-side rate-limit через `requirePlan`), але user-side prompt: «Ліміт повідомлень. Подивитись плани → /pricing».
  **Files:**
- `core/hub/chat/HubChatHeader.tsx`
- new: `core/hub/chat/ChatUsageCounter.tsx`
- `apps/server/src/modules/chat/usage.ts`
- `packages/api-client/src/endpoints/chat.ts`
- migration `047_chat_usage_view.sql` (можливо)
  **Acceptance:**
- Free-user: counter видно, лічить, при 5/5 надсилання disabled з link на pricing.
- Pro: counter ховається.
  **Size:** M (був M, зменшено — backend вже є)
  **Depends on:** PR-0

---

## Cross-cutting (governance + tests)

### PR-X1 · Lint rule: prevent regression на копірайт-баги

**Scope:**

- Розширити custom ESLint plugin (`packages/eslint-plugin-sergeant-design`):
  - rule `no-english-toast-string`: detect `"blocked"`, `"Retry"` (та інші 50+ EN-words) у JSX/TSX-літералах.
- Test fixtures.
  **Files:**
- `packages/eslint-plugin-sergeant-design/rules/no-english-toast-string.js` + tests
- `apps/web/eslint.config.js` (enable rule)
  **Acceptance:**
- Reintroduction PR-5 реѓресії → CI блокується.
  **Size:** S

### PR-X2 · Visual regression на FTUX flow

**Scope:**

- Playwright + visual-regression workflow вже існує (`visual-regression.yml`).
- Додати snapshot-тести для: Login → Hub Dashboard FTUX → Module enter → First entry → Reports reveal.
- Покриває PR-2/3/4/6/20.
  **Files:**
- `apps/web/e2e/ftux.spec.ts`
- screenshots golden у `apps/web/e2e/__screenshots__/ftux/`
  **Acceptance:**
- 8 screenshots golden, CI зелений.
  **Size:** M
  **Depends on:** PR-3, PR-4, PR-6, PR-20

### PR-X3 · Content-style guide

**Scope:**

- `docs/copy/style-guide.uk.md` — фінальні правила tone-of-voice (1-а особа однини, «ти», без «Зачекайте» / «Виходимо»).
- Лінк у `AGENTS.md`.
  **Files:**
- new doc
- `AGENTS.md` (link)
  **Acceptance:**
- Документ затверджено, у PR-30/31 рев'юер посилається на нього.
  **Size:** S

### PR-X4 · UX-roast metrics dashboard

**Scope:**

- PostHog dashboard: activation, time-to-first-value, drop-off, app-lock opt-in, settings-discovery.
- Закомітити dashboard-as-code (jsonl) в `docs/launch/posthog/ftux-uxroast.jsonl`.
  **Files:**
- `docs/launch/posthog/ftux-uxroast.jsonl`
  **Acceptance:**
- Dashboard видно у PostHog, у readme є посилання.
  **Size:** S
  **Depends on:** PR-0

---

## Підсумкова матриця: пункт прожарки → PR

| Pop quiz id | Description                        | PR                                         |
| ----------- | ---------------------------------- | ------------------------------------------ |
| A1          | App-lock                           | PR-1a (PIN) + PR-1b (biometric)            |
| A2          | Module gear-icon                   | PR-2                                       |
| A3          | Bento subtitles                    | PR-3                                       |
| A4          | EmptyState Reports                 | PR-6                                       |
| A5          | Permissions overview               | PR-7                                       |
| A6          | Hub notifications sub-group        | PR-8                                       |
| A7          | Sessions «Цей пристрій»            | PR-10                                      |
| A8          | CSV / email export                 | PR-11                                      |
| A9          | KeyboardSensor dnd-kit             | PR-12                                      |
| A10         | Delta arrow ▲▼                     | PR-29                                      |
| A11         | Avatar upload                      | PR-28                                      |
| A12         | Empty chat state                   | PR-26                                      |
| A13         | Backup copy «Харчування»           | PR-5                                       |
| A14         | Forgot-password autoclose          | PR-27                                      |
| A15         | Module-context sync error          | PR-13 (❌ obsolete — cloudSync v1 dropped) |
| A16         | Request-ID ModuleErrorBoundary     | PR-14                                      |
| A17         | Default reminder time              | PR-7                                       |
| C1          | «Огляд» в усіх модулях             | PR-4                                       |
| C2          | UA «blocked»/«Retry»               | PR-5                                       |
| C3          | DataExport copy                    | PR-5                                       |
| C4          | Reminder-time UI унифікація        | PR-9                                       |
| C5          | Loading-state copy                 | PR-30                                      |
| C6          | «Введи X» в zod                    | PR-31                                      |
| C7          | Mono error розрізнення             | PR-32                                      |
| C8          | Password-strength entropy          | PR-15                                      |
| C9          | MemoryBank → Settings              | PR-16                                      |
| C10         | Logout primary в Profile           | PR-17                                      |
| C11         | PWA reset cache danger             | PR-33                                      |
| C12         | Tour vs Restart copy               | PR-18                                      |
| C13         | «Готово, [name]!»                  | PR-34                                      |
| C14         | aria-live конфлікти                | PR-19                                      |
| C15         | FTUX bento «Що тут буде»           | PR-20                                      |
| C16         | EmptyState в HubReports            | PR-6                                       |
| R1          | Toast про Reports tab              | PR-21                                      |
| R2          | Діагностика SW із UI               | PR-35                                      |
| R3          | Dark-mode дубль                    | PR-37 (❌ obsolete — дубля немає)          |
| R4          | Stagger reduce                     | PR-38                                      |
| R5          | Bar-grow cap                       | PR-39                                      |
| R6          | Дубльовані permissions toast       | PR-7 (consolidated)                        |
| §7.1        | Lazy Insights/Digest               | PR-22                                      |
| §7.2        | Layout shift Reports tab           | PR-23                                      |
| §7.3        | PostHog/Sentry defer               | PR-25                                      |
| §7.4        | finyk Overview lazy-секції         | PR-22 (`modules/finyk/pages/Overview.tsx`) |
| §11.1       | App-lock                           | PR-1a + PR-1b                              |
| §11.2       | Chat privacy explanation           | PR-26 (можна domknути)                     |
| §11.3       | «Token у браузері» — оновити копію | PR-32                                      |
| §11.4       | CSV / email-mine                   | PR-11                                      |
| §12.1       | iOS install banner safe-area       | PR-24                                      |
| §12.2       | 100dvh + safe-area-inset-bottom    | PR-24                                      |
| §12.3       | Dark-mode дубль                    | PR-37 (❌ obsolete — дубля немає)          |
| §13.1       | Stagger reduce                     | PR-38                                      |
| §13.2       | Bar-grow cap                       | PR-39                                      |
| §15         | Pricing chat-counter               | PR-42                                      |
| §15         | Pricing «Звички» → «Рутина»        | PR-5                                       |

**Що додано поза §14 з прожарки:** PR-22, PR-23, PR-24, PR-25 (perf/mobile/observability — §7, §12, §13). PR-X1–X4 (governance/tests) — щоб робота не регресувала.

---

## Запропонований порядок мерджу (dependency graph)

```
PR-0 (telemetry) ─┬─ PR-1a (app-lock PIN) ─→ PR-1b (biometric) ─┐
                  ├─ PR-2 (module gear) ────────────────────────┤
                  ├─ PR-3 (bento subtitles) ─→ PR-20 (FTUX bento) → PR-22 (lazy)
                  ├─ PR-4 (overview unify) ──────────────────────┤
                  ├─ PR-6 (Reports EmptyState) ─→ PR-X2 (visual)
                  ├─ PR-7 (permissions) ─→ PR-8 (hub notif) ─→ PR-9 (time)
                  ├─ PR-11 (CSV export)
                  ├─ PR-14 (Request-ID)
                  └─ PR-X4 (PostHog dashboard)

PR-5 (copy bundle) — standalone, можна першим у спринті 1.

Sprint 3 — переважно standalone XS/S (PR-26..PR-42).

Cross-cutting:
  PR-X1 (eslint rule) — після PR-5, щоб правило знайшло вже-чистий код.
  PR-X3 (style guide) — паралельно, до PR-30/31.
```

---

## Метрики прийнятності всього плану

- **Час до релізу всіх P0 (Sprint 1):** 1.5–2 тижні.
- **Bundle-size (Sprint 2):** −5% gzip після PR-22 + PR-25.
- **Lighthouse mobile-3G:** TTI ≤ 3.5s (зараз очікувано 4–5s).
- **CLS:** ≤ 0.05 на FTUX-сцені.
- **Регресія копірайту:** 0 EN-strings у UA-флоу (PR-X1 enforces).
- **Activation:** +X% week-1 retention (вимірюємо через PR-0 events; baseline закомітити перед мерджем PR-1a).

---

## Що НЕ входить у цей план (свідомо)

- **Онбординг** — за межею скоупу прожарки (виключив user).
- **Mobile (Expo) `apps/mobile/**`\*\* — план web-only. Якщо хочемо паритет, дублюватимемо PR після web-merge.
- **Server-side feature-flags для tri-state theme / digest** — PR-37/PR-8 fallback на client-side; server-side flags — окрема ініціатива.

---

**Готово до початку Sprint 0 (PR-0). Чекаю зеленого світла на PR-1a / PR-5 одразу — це найшвидші victories для FTUX (PR-5 — півдня копірайт-фіксів, PR-1a — base PIN без біометрії, ~3-4 дні).**
