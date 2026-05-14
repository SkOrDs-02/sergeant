# Phase 3 — Native Expo (`apps/mobile`) launch roadmap

> **Last validated:** 2026-05-13 by Devin / @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Draft (research-only, без code-impact). Sequencing: **Web (Phase 1) → Capacitor (Phase 2) → Native (Phase 3, цей файл)**.
>
> **Власник рішень:** `@Skords-01`. Передумова — [ADR-0052](../../adr/0052-mobile-strategy-capacitor-primary.md) (Capacitor primary, Expo parallel; deprecation тригериться окремим ADR за feature parity).
>
> **Cross-refs:**
>
> - [Launch hub](../README.md) ·
>   [Phase 1 — Web](./01-web-launch-with-users.md) ·
>   [Phase 2 — Capacitor](./02-capacitor-launch.md)
> - [`docs/architecture/platforms.md`](../../architecture/platforms.md) — feature-parity матриця (source of truth)
> - [`docs/mobile/react-native-migration.md`](../../mobile/react-native-migration.md) — детальний RN-роадмап
> - [`docs/initiatives/0010-revenue-first-launch.md`](../../initiatives/0010-revenue-first-launch.md) — revenue-first sprint, який зараз фігляє mobile-resource
> - [ADR-0010](../../adr/0010-mobile-dual-track-capacitor-expo.md) — dual-track baseline
> - [`apps/mobile/README.md`](../../../apps/mobile/README.md), [`apps/mobile/AGENTS.md`](../../../apps/mobile/AGENTS.md)

---

## 1. TL;DR + Entry criteria

### 1.1 TL;DR

Native-клієнт `apps/mobile` (Expo SDK 52 + RN 0.76 + Expo Router) — **не для запуску у цьому циклі**. Він на стадії _internal dev-client_: ~18 з 22 рядків parity-матриці у [`docs/architecture/platforms.md`](../../architecture/platforms.md) — ✅, але 2 рядки 🟥 (Nutrition recipes AI, photo-AI) + 2 рядки 🟡 (Hub voice composer, OnboardingWizard AI-customize) лишають Phase 7 і Phase 8 RN-міграції незакритими. Phase 11 (EAS prod + App Store / Play Console) у [`docs/mobile/react-native-migration.md`](../../mobile/react-native-migration.md) — `⏸ Blocked` на Apple Developer Program і Google Play Console (Q2).

Рекомендація: **Сценарій A — sunset apps/mobile у поточному launch-циклі НЕ робити, але і НЕ запускати окремим продуктом**. Закінчити RN-порт у фоні (Phases 7–10 за `react-native-migration.md`), коли parity досягне gating-рівня з ADR-0052 (≥18/22 рядків ✅ + 3 Exit-маяки зелені), активувати окремий ADR «Expo becomes primary» і переключити store-listing з Capacitor shell на Expo native — без двох паралельних store-app-ів для одного користувача. До того часу — Capacitor залишається primary (Phase 2).

**Чому НЕ "native must":** інфраструктура (auth, sync, push, deep links, 4 модулі) на 80% готова; лишилось ~4–8 тижнів роботи до parity; одночасний запуск двох app-ів (Capacitor `com.sergeant.shell` + Native `com.sergeant.app`) на 0-paying-user-product з одним maintainer-ом створює подвійний store-overhead і split-brain analytics без жодного приросту виручки.

### 1.2 Entry criteria (що має бути готово з Phase 1 + Phase 2)

Цей файл вважається _executable_ тільки якщо виконано **усі** з нижче перелічених:

- **[Phase 1 / Web]** — production web-апка live (`apps/web` на Vercel + `apps/server` на Railway, `/api/v1/*` стабільний контракт). Source: [Phase 1 doc](./01-web-launch-with-users.md) + [`platforms.md` §1](../../architecture/platforms.md).
- **[Phase 1 / Web]** — `apps/web` PWA з Service Worker + Web Push (VAPID) — fallback-канал якщо native push-credentials ще не у проді.
- **[Phase 2 / Capacitor]** — `@sergeant/mobile-shell` released хоча б в Internal Testing track Google Play (`com.sergeant.shell`), Apple TestFlight (через `mobile-shell-ios-release.yml`). Хоча б ~10 реальних shell-users у store.
- **[Phase 2 / Capacitor]** — APNs/FCM credentials налаштовані на server (`docs/tech-debt/backend.md#push-credentials` — закрите). Без цього native push з Expo тоже не злетить, бо backend fan-out у `apps/server/src/push/send.ts` спільний.
- **[Phase 1 / Legal]** — Privacy Policy + Terms of Service published за `docs/launch/business/04-launch-readiness.md`. App Store і Play Store не дають approve без них.
- **[Phase 1 / Business]** — pricing + billing працює (`apps/server/src/modules/billing/*`, Stripe webhooks). Без `getUserPlan()` контракту mobile-додаток не може запропонувати Pro-tier features.
- **[Cross-cutting]** — Apple Developer Program ($99/year) і Google Play Console ($25 one-time) оформлені на legal entity власника (`@Skords-01` ФОП track — див. [`docs/initiatives/0010-revenue-first-launch.md`](../../initiatives/0010-revenue-first-launch.md)).

**Hard gate:** якщо хоча б одна entry criterion не закрита — Phase 3 не стартує, повертаємось у Phase 2 і пишемо ROI-аналіз «що дає мені native, чого немає у Capacitor».

---

## 2. Поточний стан Native — parity matrix

### 2.1 Що готово на 2026-05-13

Джерело правди — [`docs/architecture/platforms.md` § Feature-parity матриця](../../architecture/platforms.md). Дублюємо тут тільки RN-стовпчик і виділяємо delta vs Capacitor shell.

| Capability                           | Web | Shell | RN     | Delta-коментар для Native launch                                                             |
| ------------------------------------ | --- | ----- | ------ | -------------------------------------------------------------------------------------------- |
| Auth (Better) — sign in/out + Google | ✅  | ✅    | ✅     | Bearer-контракт, `expo-secure-store`, ASWebAuthenticationSession для Google. Equal parity.   |
| Hub dashboard                        | ✅  | ✅    | ✅     | `apps/mobile/src/core/dashboard/`.                                                           |
| Hub chat (text)                      | ✅  | ✅    | ✅     | Один `/api/v1/coach/*` контракт; RN-композер живе у `app/hub-chat.tsx`.                      |
| Hub voice (STT + TTS)                | ✅  | 🟡    | 🟡     | `useSpeechRecognition` готовий, у `AddMealSheet` wired; HubChat-композер ще не підключено.   |
| Hub search                           | ✅  | ✅    | ✅     | `apps/mobile/src/core/hub/search/` + route `/hub-search`.                                    |
| OnboardingWizard                     | ✅  | ✅    | 🟡     | RN — скорочена версія; AI-customize крок — Phase 7.                                          |
| WeeklyDigestCard                     | ✅  | ✅    | ✅     | `getWeeklyDigest()` через api-client.                                                        |
| Push (web-push VAPID)                | ✅  | 🟡    | n/a    | Native не використовує web-push; не блокер для RN.                                           |
| Push (native APNs/FCM)               | n/a | ✅    | ✅     | `PushRegistrar` шле токен у `/api/v1/push/register`; server fan-out ще без prod credentials. |
| Deep links (`sergeant://`)           | ✅  | ✅    | ✅     | `parseDeepLink()` спільний.                                                                  |
| Universal / App Links (HTTPS)        | ✅  | ✅    | ✅     | AASA + assetlinks розширені на `com.sergeant.app`.                                           |
| CloudSync / offline                  | ✅  | ✅    | ✅     | RN-варіант — MMKV + NetInfo + React Query persist.                                           |
| Фінік — Overview/Tx/Budgets          | ✅  | ✅    | ✅     | 5 сторінок портовано.                                                                        |
| Фізрук — Workouts/Programs           | ✅  | ✅    | ✅     | Phase 6 ✅ Done.                                                                             |
| Рутина — Habits/Heatmap              | ✅  | ✅    | ✅     | Phase 5 ✅ Done.                                                                             |
| Харчування — log/water/meal          | ✅  | ✅    | 🟡     | AddMealSheet + scanner ✅; shopping/pantry ✅; recipes / photo-AI 🟥.                        |
| Харчування — barcode scan            | ✅  | ✅    | ✅     | `expo-camera` + ML Kit.                                                                      |
| Харчування — pantry                  | ✅  | ✅    | ✅     | `useNutritionPantries` + `pages/Pantry`.                                                     |
| Харчування — shopping list           | ✅  | ✅    | ✅     | ручний + AI-генерація з рецептів; weekplan-джерело — TODO.                                   |
| Харчування — recipes (AI)            | ✅  | ✅    | **🟥** | `recipe/[id].tsx` — заглушка, Phase 7. **Блокер parity.**                                    |
| Харчування — photo-AI                | ✅  | ✅    | **🟥** | camera-input → `/api/v1/nutrition/photo` — Phase 7+. **Блокер parity.**                      |
| Detox / e2e on CI                    | n/a | n/a   | ✅     | iOS — full sign-in→module→sign-out × 4 модуля; Android — smoke-only.                         |
| Native UX (haptics, sheets)          | 🟡  | 🟡    | ✅     | RN — `expo-haptics`, native bottom sheets, swipe-back, pull-to-refresh.                      |

**Підсумок:** 18 ✅ + 2 🟡 + 2 🟥. ADR-0052 ставить тригер на ≥18/22 ✅ і всі 3 Exit-маяки зеленими (RN-Nutrition full parity 🟥, RN-Voice 🟥, Detox real e2e ✅). Маємо два 🟥 маяки → Expo ще не primary за визначенням.

### 2.2 Що рідне Native робить КРАЩЕ за Capacitor

Чесно — не _драматично_. Capacitor shell тонкий і скоро отримає аналогічні фічі. Реальний delta:

| Категорія                        | Native (Expo + RN)                                                                                                            | Capacitor shell                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Cold start**                   | RN bridge + Hermes — JS виконується одразу після Native splash (~600–900 ms на mid-range Android).                            | WebView повинен підняти Chromium-runtime + завантажити JS bundle — ~1.2–2.0 s на тому ж пристрої. |
| **Scrolling / list performance** | `@shopify/flash-list` працює прямо з RN renderer, без DOM-overhead. 60–120 fps на довгих списках транзакцій.                  | DOM virtualization (react-window / TanStack Virtual) — деградує на 10k+ items.                    |
| **Haptics + sheets + gestures**  | `expo-haptics` (impact heavy/medium/light), native sheet via Expo Router, native swipe-back з `react-native-gesture-handler`. | `@capacitor/haptics` обмеженіший, sheet — DOM-emulation, swipe-back — `App.backButton` hook.      |
| **Background tasks**             | `expo-task-manager` + `expo-background-task` (планується) можуть запускати JS-код без активного UI.                           | WebView не виконує JS поза lifecycle; sync лише поки UI у foreground або через native plugin.     |
| **App-shortcut + Quick actions** | Native — Android shortcuts + iOS 3D-Touch quick actions (вже у `apps/mobile/app.config.ts`).                                  | Можливо через `@capacitor/app-launcher` + manifests, але DX гірший.                               |
| **Live Activities / Widgets**    | RN може через `expo-modules-core` + native code. Поки нема.                                                                   | Принципово неможливо без виходу за межі WebView.                                                  |
| **Voice-input UX**               | `expo-speech-recognition` — нативний STT з progressive results, без сітки.                                                    | Web Speech API у iOS Safari WebView обмежений (особливо для українського locale).                 |
| **Bundle size on-device**        | RN app ~25–35 MB (Hermes + assets).                                                                                           | WebView shell ~5–10 MB + потім завантажує web-bundle ~1.2 MB.                                     |
| **OTA fixes**                    | `expo-updates` — JS-only update без store-review.                                                                             | Capacitor LiveUpdate / простий redeploy `apps/web` → instant (це shell-перевага, не недолік).     |

**Звідки виходить:** Native виграє у performance-критичних UX (списки, scroll, haptics, voice). Capacitor виграє у швидкості випуску виправлень (web redeploy = миттєвий fix для shell).

### 2.3 Real business case для Native у Sergeant

**За (запускати native):**

- **Sergeant — це daily-driver додаток.** Фінансові tx, тренування, habit-checkmark — короткі сесії, чутливі до cold-start. ~1.5 s delay на Capacitor проти ~700 ms на Native — це **відчутна** різниця, особливо для habit-trackера.
- **Voice composer для HubChat** — основна differentiator-фіча. Native STT якісніший на UA-locale.
- **App Store рейтинг.** Користувачі залишають 1-star за «це не нативно, це сайт у обгортці» (apple-review-comments на shell-apps трапляються). Native — нижчий churn з reasons «не нативно».
- **Live Activities / widgets** — потенційний роадмап (workout-таймер у Dynamic Island; routine widget на home screen). Принципово недоступно у Capacitor.

**Проти (НЕ запускати native окремо):**

- **0 paying users, 0₴ MRR** ([`docs/initiatives/0010-revenue-first-launch.md` § TL;DR](../../initiatives/0010-revenue-first-launch.md)). Native-publish ROI у грошах = 0 поки немає billing-traffic.
- **Один maintainer.** Кожен additional store-listing = +1 release flow, +1 review-cycle pain, +1 crash-triage канал, +1 set screenshots, +1 app review delays.
- **Двосторонній store overhead.** `com.sergeant.shell` + `com.sergeant.app` у Play Console = два data-safety форми, два privacy labels, дві подачі.
- **Apple bundle prefix collision.** Apple перевіряє bundle-prefix; `com.sergeant.shell` і `com.sergeant.app` можуть конфліктувати у Team-rules якщо team той самий. Випадок "two apps, one product" = manual review, додатковий тиждень.
- **Capacitor вже у store з users.** Якщо native — другий додаток (не replace) — є реальний ризик confusion: «який з двох?», support-tickets, duplicate accounts.
- **Phase 7+8 RN-міграції — ~4–8 тижнів роботи**. Якщо у фокусі revenue-first, цей час буде бракувати на Stripe/landing.

### 2.4 Скільки роботи до Native parity

Reality check по [`docs/mobile/react-native-migration.md` §2.0](../../mobile/react-native-migration.md):

| Фаза | Що залишилось                                                                               | Estimate        |
| ---- | ------------------------------------------------------------------------------------------- | --------------- |
| 2    | HubChat composer + HubReports (Hub search ✅).                                              | 1.0–1.5 week    |
| 3    | Sync v2 writer-wiring дописати (sync v1 cut-over).                                          | 0.5 week        |
| 7    | Nutrition recipes AI (`recipe/[id].tsx`) + photo-AI camera → `/api/v1/nutrition/photo`.     | 2.0–2.5 weeks   |
| 8    | HubChat streaming у RN + Voice composer wired у HubChat (server-side Whisper fallback теж). | 1.5–2.0 weeks   |
| 10   | Universal Links published у проді + custom-scheme audit.                                    | 0.5 week        |
| 11   | EAS prod profile + Apple Developer + Play Console setup + privacy labels + Data Safety.     | 1.0–1.5 weeks   |
| 12   | Sentry prod-DSN + PostHog event-набір + crash-free baseline ще 2 тижні після першого білда. | 1.0 week + soak |

**Підсумок:** ~7–10 тижнів _однієї людини_ до GA-готовності Native, **за умови що web/server не вимагають uvагу паралельно**. Це консервативна оцінка з врахуванням App-review-сюрпризів.

---

## 3. Три сценарії продовження + рекомендація

### 3.1 Сценарій A — Sunset `apps/mobile`, фокус на Capacitor

**Що це означає:**

- Зупиняємо роботу над Phases 7–13 RN-міграції.
- `apps/mobile/` залишається у repo як reference/code-archive, але не отримує updates.
- Capacitor shell стає _навічно_ primary mobile.
- ADR-0052 рев'юється на `Reversed`, ADR-0010 теж.

**Pros:**

- Звільняємо 7–10 тижнів інженерного часу.
- Один store-listing на mobile, простіший support.
- Менше Sentry-проектів, менше crash-triage.

**Cons:**

- **Втрачаємо optionality.** Якщо завтра треба voice-композер у HubChat / Live Activities / widgets — або довго будуємо custom Capacitor plugins (зворотна еквівалентність native), або повертаємо `apps/mobile/` назад з cold-start (а команда забула контекст).
- Already-invested капітал у RN-порт (Phases 0–6 + більшість 7) — write-off ~3–4 місяців роботи.
- Конкуренти (LifeShift 360, Phaseo) — на native. Маркетингово важче пояснити «це native» якщо насправді WebView.
- iOS-юзери в App Store частіше скаржаться на «це сайт у обгортці» → нижчий рейтинг → нижчий conversion з App Store search.

**Коли вибирати A:** якщо revenue-first спринт затягнувся, Capacitor проявив у проді високий retention + low complaints і власник вирішує що OS-integration features (widgets, Live Activities, голос) — поза 12-місячним роадмапом.

### 3.2 Сценарій B — Native як premium experience для power users (paid tier?)

**Що це означає:**

- Capacitor залишається у store як основна апка (free + Pro tiers).
- `apps/mobile/` запускається паралельно як **окрема app** з іншим bundle id (вже `com.sergeant.app`).
- Native позиціонується як «Sergeant Pro» — для power users; цінник можливо вищий, або access за окремою рекомендацією.
- Маркетинг: «native version з widgets, Live Activities, voice»; не для всіх.

**Pros:**

- Native — рекламний хук для high-value cohort (high-LTV).
- Можна тримати Capacitor для long-tail users і нативку як «top-of-the-line».
- А/B-вимірюваність: native users vs shell users — порівняти retention, NPS, активність.

**Cons:**

- **Подвійна підтримка назавжди.** Кожна нова фіча — два кліенти. Це і є те, що ADR-0052 явно намагається уникнути.
- Confusion на marketplaces: «який Sergeant завантажити?» — Apple Search Ads показуватиме обидва.
- Дві data-safety форми, дві privacy policy URL, два Sentry-проекти, дві store-review pipelines.
- Існуючим shell-users незрозуміло чи мігрувати; ніхто не любить «зробіть це самі» migration.
- На 1 maintainer — це **не життєздатно** без зайвої найму.

**Коли вибирати B:** має сенс лише якщо у команді з'являється друга людина _виключно на mobile_ і власник свідомо платить вартість dual-track як стратегію диференціації, а не як технічний борг.

### 3.3 Сценарій C — Повний міграційний план Capacitor → Native як next-gen client

**Що це означає:**

- Capacitor shell проголошується «v1 mobile», Native «v2 mobile».
- Pipeline: внутрішній alpha (dev-client) → закритий beta (TestFlight + Internal Testing) → soft launch під _новим_ bundle id `com.sergeant.app` → паралельно `com.sergeant.shell` отримує in-app banner «нова версія Sergeant — оновись» → через ~3 місяці shell deprecate з push-notification і remove-from-store.
- ADR-0052 superseded окремим ADR «Expo becomes primary». Capacitor track замораживается через 90 днів після Native GA.

**Pros:**

- **Найкращий long-term outcome:** один кодовий клієнт, native UX, можливість Live Activities/widgets.
- Чисте посилання маркетингу: «Sergeant на native».
- Технічний борг dual-track зрештою згоряє.
- Існуючі shell-users керовано переходять на native через in-app migration.

**Cons:**

- **Час до прибутку.** ~7–10 тижнів роботи до GA + 90 днів migration window = ~5 місяців відсунення нативного launch назад.
- Migration UX складний: data sync (CloudSync робить це за нас, бо обидва клієнти ходять у той самий sync v2 op-log — _велика_ перевага), push-token re-registration, deep-link redirect.
- Native deps можуть змінюватись (Expo SDK upgrades), вимагати maintenance.
- App Review пилка під «another app from same dev» може попросити обґрунтування.

**Коли вибирати C:** як _eventual outcome_, але **не з самого початку Phase 3**. Спершу Phase 2 повинна бути в проді, працювати з ~100+ реальних users 1–2 місяці. Тільки тоді є legitimний baseline для порівняння retention native vs shell.

### 3.4 Рекомендація

**Гібрид: A для launch-циклу + C як 6-місячний north-star.**

Конкретно:

1. **Зараз (Sprint 1–4):** НЕ запускати Native окремою app. Зосередитись на Phase 1 (Web revenue) і Phase 2 (Capacitor store-listing).
2. **У фоні (Sprint 1–8, low priority):** продовжити RN-порт у Phases 7–10 _малими PR-ами_ (одна особа, 1–2 дні на тиждень). Цілі — закрити обидва 🟥-маяки і вивести parity на ≥20/22 ✅.
3. **Decision gate (Sprint 8–10):** після того як Capacitor proven у проді (≥100 real users, baseline retention/crash-free measured) — оцінити: чи варто інвестувати у Native як replace?
4. **Якщо так (Sprint 10–14):** виконати Сценарій C — Native як v2-клієнт, з migration window 90 днів, sunset shell. Окремий ADR «Expo becomes primary».
5. **Якщо ні (Sprint 14+):** зафіксувати Capacitor як permanent mobile, write-off `apps/mobile/`, прийняти Сценарій A.

**Чому не B:** dual-track назавжди економічно нежиттєздатний для 1-developer проекту. Це або тимчасова фаза (під час migration), або помилка.

---

## 4. Fork-in-roadmap — якщо вирішуємо запускати Native

Цей розділ актуальний _після_ того, як виконано decision gate (§3.4 п.3) і власник свідомо обрав запускати native. Дві альтернативи:

### 4.1 Native як альтернативний клієнт (B-варіант)

- Обидва store-listings live назавжди.
- Дві release pipelines, дві версії, два розгалуження analytics.
- Користувач сам обирає що качати.
- Marketing: «native + WebView як вибір».
- **Не рекомендовано** на цьому етапі — див. §3.4.

### 4.2 Native як next-gen (C-варіант, рекомендований після gate)

- Capacitor shell у store отримує **in-app banner**: «Sergeant 2.0 у native — оновись» з deep-link на App Store / Play Store listing нативної апки.
- Native app встановлюється _поруч_ зі shell (бо різний bundle id), при першому запуску детектить наявність shell-data (через sync v2 — все на сервері) і автоматично авторизує користувача.
- Shell залишається ~90 днів у read-only + force-update mode (`min-supported-version` checks).
- T₀: native GA (новий ADR).
- T₁ = T₀ + 30 днів: shell отримує deprecation banner.
- T₂ = T₀ + 90 днів: shell remove-from-store (`mobile-shell-android-release.yml` + `mobile-shell-ios-release.yml` workflows freeze).
- Existing shell-installs продовжують працювати ще ~6 місяців у read-only до server-side `min-supported-version-bump`.

**Ключове:** оскільки sync v2 op-log + bearer-auth — server-side source of truth, **dual-install режим _безпечний_** — обидва клієнти зчитують ті самі дані. Це уникає migration-headache.

---

## 5. Технічний план (якщо запускаємо Native)

### 5.1 Parity gaps — конкретні задачі

Це виписка з [`docs/mobile/react-native-migration.md` §4 + §5.5](../../mobile/react-native-migration.md):

| Gap                                                                           | Plan                                                                                                                                   | Est.  | Owner skill             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------- |
| Nutrition recipe AI (`apps/mobile/app/(tabs)/nutrition/recipe/[id].tsx` stub) | Port web `useRecipe` + `RecipeView` → RN; reuse `@sergeant/nutrition-domain` schemas.                                                  | 1 w   | `sergeant-mobile-expo`  |
| Nutrition photo-AI                                                            | `expo-camera` + `expo-image-manipulator` → POST `/api/v1/nutrition/photo`; UI mirror з `apps/web/src/modules/nutrition/PhotoCapture`.  | 1.5 w | `sergeant-mobile-expo`  |
| HubChat RN composer + streaming                                               | RN-сумісний `fetch` ReadableStream (RN 0.76 OK); `expo-speech-recognition` wired у composer.                                           | 1.5 w | `sergeant-mobile-expo`  |
| OnboardingWizard AI-customize крок                                            | Phase 7 follow-up; pure-домен у `@sergeant/shared`, тільки UI у RN.                                                                    | 0.5 w | `sergeant-mobile-expo`  |
| Sync v2 writer-wiring (Phase 3 завершення)                                    | `useCloudSync` writer-paths для всіх 4 модулів за `plan 2026-05-06`.                                                                   | 0.5 w | `sergeant-mobile-expo`  |
| Universal Links у проді (AASA/assetlinks routes від `apps/server`)            | Add `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` як public assets у `apps/web/public/` (вже частково є). | 0.3 w | `sergeant-web-ui` + DNS |
| Detox e2e Android full suite (наразі smoke-only)                              | Mirror iOS sign-in→module→sign-out × 4 на Android matrix у `detox-android.yml`.                                                        | 0.5 w | `sergeant-mobile-expo`  |

### 5.2 EAS Build pipeline

[`apps/mobile/eas.json`](../../../apps/mobile/eas.json) уже має 3 profiles. Що додати на launch:

```jsonc
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "ios": { "simulator": true },
      "android": { "buildType": "apk" },
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": { "simulator": true },
      "android": { "buildType": "apk" },
    },
    "production": {
      "distribution": "store",
      "channel": "production",
      "autoIncrement": true,
      "ios": { "resourceClass": "m-medium" },
      "android": { "buildType": "app-bundle" },
    },
    // ДОДАТИ:
    "development-device": {
      "extends": "development",
      "ios": { "simulator": false },
    }, // фіз. iOS
  },
}
```

**Secrets у EAS:**

- `GOOGLE_SERVICES_JSON` (FCM credentials для Android push) — вже згадано у `platforms.md §2`.
- `EXPO_TOKEN` — у GitHub Actions для `eas build --non-interactive --no-wait`.
- `EXPO_PUBLIC_API_BASE_URL` — production = `https://sergeant.2dmanager.com.ua`.
- `EXPO_PUBLIC_SENTRY_DSN` (prod) — Phase 12.

### 5.3 EAS Submit pipeline

За `eas submit` (вже зарезервовано у `eas.json#submit.production`):

- iOS: `eas submit --platform ios --profile production` — потребує `expo.ios.appleId` + `expo.ios.appleTeamId` + ASC API Key (з App Store Connect → Users and Access → Keys).
- Android: `eas submit --platform android --profile production` — потребує service-account JSON у `submit.production.android.serviceAccountKeyPath`.

**Перший раз робиться через `--non-interactive=false`** — EAS CLI запитає credentials і збереже у secure store.

### 5.4 OTA через expo-updates

За `Q-12 / §6.10` RN-migration:

- Channels: `development`, `preview`, `production` (вже у `eas.json#build.*.channel`).
- Runtime version policy у `app.config.ts`: `runtimeVersion: { policy: "appVersion" }` — кожен новий store-білд має свою runtime version, JS-only updates не пропускаються між сумісними версіями.
- `expo-updates` пакет уже у `expo` (transitively), але `EAS_PROJECT_ID` має бути fix у `app.config.ts`.
- `expo publish` deprecated; використовуємо `eas update --channel production --message "fix: …"`.

**OTA strategy:**

1. **Hotfix-only за замовчуванням.** OTA пускаємо тільки для bugfix (single-PR-scope), не для нових фіч (бо store-review не бачив їх → потенційне порушення Apple guidelines 3.2.2).
2. **Канареєчний rollout:** `eas update --channel production --message "hotfix" --rollout 10%` (якщо EAS підтримує — інакше через runtimeVersion buckets).
3. **Rollback path:** `eas update:republish --channel production --rollback` — миттєвий revert.

### 5.5 OTA contraindications

- НЕ використовувати OTA для перемикання native runtime — нові plugins, permissions, app.config.ts native fields завжди вимагають store-rebuild.
- НЕ використовувати OTA на iOS для зміни user-facing screens без перерев'ю Apple — потенційне порушення Guideline 3.2.2.
- НЕ використовувати OTA для emergency security patch — занадто повільний для серйозних інцидентів.

---

## 6. Store strategy — applicationId і user impact

### 6.1 Базовий стан

- Capacitor shell: `com.sergeant.shell` (іще не у Play / App Store згідно з [`platforms.md §3`](../../architecture/platforms.md), готова release pipeline).
- Native Expo: `com.sergeant.app` ([`apps/mobile/app.config.ts`](../../../apps/mobile/app.config.ts) — `ANDROID_PACKAGE = "com.sergeant.app"`).

### 6.2 Варіант A — окремі applicationId (поточний дизайн)

- Google Play: ОК, дозволяє кілька apps від одного dev.
- Apple: ОК, але потрібна окрема app-record у App Store Connect, окремі screenshots, окремі privacy labels, окремий TestFlight.
- **Існуючі shell-users** — не зачіпаються; обидва apps співіснують.
- **Migration UX:** окрема установка нативного, авто-логін через bearer (sync 2 op-log).

### 6.3 Варіант B — replace Capacitor (один applicationId)

Теоретично можна _перенумерувати_ shell з `com.sergeant.shell` на `com.sergeant.app` через Play Console + Apple Connect, але це:

- Google Play: підтримує `app-bundle` migration але вимагає продовжувати signing key. Зміна applicationId від `shell` до `app` — це нова app, а не upgrade — existing users отримають _нову_ установку, не upgrade.
- Apple: змінити bundle id існуючої app — недозволено; це створює нову app-record.
- **Висновок:** technically не "replace" — це завжди створення нового app. Питання тільки чи лишаємо старий у store.

### 6.4 Рекомендована стратегія

- **Окремі applicationId** (поточна архітектура `com.sergeant.shell` і `com.sergeant.app`).
- App names:
  - Capacitor shell: `Sergeant` (display name).
  - Native Expo: `Sergeant Native` _або_ після GA — переіменувати shell на `Sergeant Lite` і native на `Sergeant`.
- Version codes: independent. Shell і native не діляться numbering.
- **Існуючі shell users:**
  1. Після Native GA — in-app banner у shell: «Доступна нова native-версія» + deep-link на store.
  2. Через ~30 днів — full-screen modal у shell на першому запуску («Sergeant зараз має native — оновись зараз»).
  3. Через ~90 днів — shell отримує `min-supported-version-bump` від server: старіші shell-installs продовжують працювати тільки у read-only mode.
  4. Через ~120 днів — shell remove-from-store (`mobile-shell-android-release.yml` + `mobile-shell-ios-release.yml` freeze).

**Наслідки:**

- Хто не оновився за 4 місяці — отримає «read-only» Sergeant.
- Хто завантажив старий APK через sideload — продовжує працювати поки сервер підтримує `min-supported-version`.
- Жодний користувач не втрачає дані (sync v2 — server source of truth).

---

## 7. User testing strategy

### 7.1 Internal alpha (Phase 11 + 1 тиждень)

- **Distribution:** Expo Dev Client + `eas build --profile development`.
- **Audience:** Андрій + 2–3 близьких контакти на physical iOS і Android.
- **Goal:** виявити блокери `app crashes on first launch`, deep-link bugs, push registration failures, sync conflicts.
- **Метрики:** crash-free sessions ≥99%, average session length, push token registration success rate.
- **Duration:** 1 тиждень.
- **Tools:** Sentry + PostHog (`apps/mobile/src/observability/*`), real-DSN-у production-profile.

### 7.2 Closed beta (Phase 11 + 2–4 тижні)

- **Distribution:**
  - iOS — TestFlight (External Testers, до 10 000 tester-ів через invite link).
  - Android — Google Play Internal Testing або Closed Testing track.
- **Audience:** 50–100 power-users з web-апки — запросити через email + in-app banner у web (`apps/web/src/core/banners/NativeBetaInvite`).
- **Selection criteria:**
  - Активні ≥30 днів на web.
  - ≥3 з 4 модулів використовуються.
  - Mobile-first usage pattern (>70% sessions з phone-розмір).
- **Goal:** acquire crash-free 99.5%, retention D1/D7/D30 baseline, NPS score ≥40.
- **Feedback channels:** TestFlight feedback button, in-app `feedback@sergeant.app` mailto, опційний Telegram group для betas.
- **Duration:** 2–4 тижні.

### 7.3 Soft launch (Phase 11 + 4–6 тижнів)

- **Distribution:**
  - iOS — App Store (production), region-limited UA spotlight або UA-only initially.
  - Android — Google Play (production), staged rollout 10% → 25% → 50% → 100% протягом 7 днів.
- **Audience:** general public, але без active marketing — органічний пошук + landing CTA «native iOS/Android».
- **Goal:** validate scale (production server load, push fan-out, AI-quota costs).
- **Метрики:**
  - Crash-free sessions ≥99.5%.
  - D1 retention ≥40% (industry baseline для productivity apps).
  - App Store rating ≥4.0/5.
  - Зростання DAU ≤+30% (щоб server підтримав без auto-scaling-сюрпризів).
- **Rollback path:** Apple — emergency phased release pause; Google — staged rollout halt.

### 7.4 GA (Phase 11 + 6+ тижнів)

- Marketing campaign launches.
- Web banner switches з «PWA + Capacitor» на «native iOS/Android».
- Capacitor shell отримує deprecation banner (див. §6).

---

## 8. Migration plan для Capacitor users

### 8.1 Architecture-level — чому це просто

Ключове: **sync v2 op-log на server-side**. Обидва клієнти (shell + native) — лише view-share на той самий dataset. Тому:

- Не треба «експорт-імпорт» даних — нативний клієнт після логіну отримає той самий op-log.
- Не треба re-authentication: bearer-token з shell є у `@capacitor/preferences` (Keychain / EncryptedSharedPreferences), native — у `expo-secure-store` (також Keychain / Android Keystore). Це **різні storage**, тому користувач повинен зайти знову у native (sign-in flow). Це **прийнятна friction** — раз на life-cycle.

### 8.2 Push tokens

- Capacitor shell push-токен registered під `platform: "capacitor-android" | "capacitor-ios"` у `push_devices` таблиці.
- Native push-токен registered під `platform: "ios" | "android"` через `expo-notifications`.
- **Server-side fan-out** у `apps/server/src/push/send.ts` — обирає ВСІ tokens для user-id (fan-out на всі девайси). Тому після того як юзер ставить native — він отримає push на ОБИДВА девайси (shell + native) поки shell installation активний.
- **Рішення:** додати TTL на shell-push-tokens (наприклад, drop tokens не оновлювалися >30 днів). Це автоматично очистить shell-installs які користувач не запускав давно.

### 8.3 Deep links

- Universal Links / App Links — обидва клієнти claim ті ж самі domains.
- iOS / Android dispatch logic: «найновіше встановлений app виграє» — це OS-deterministic behavior, не контрольований нами.
- **Висновок:** після того як user встановить native — Universal Links відкриватимуться у native; shell залишається доступним через icon-launch.
- Custom scheme `sergeant://` — обидва клієнти зарееструвалися. iOS показує picker «який app відкрити», Android — те саме до Android 12, потім — runtime user-prompt на disambig.
- **Рішення:** у shell додати _final_ release якій delete `<intent-filter android:scheme="sergeant">` — це virtual-deprecation deep-links у shell.

### 8.4 Account-level migration

User flow:

1. Користувач отримує push / email від нас: «Sergeant Native готовий — встанови».
2. Завантажує native з App Store / Play Store.
3. При першому запуску — sign-in flow (Better Auth, той самий email/Google).
4. Native запитує permissions (camera, notifications, microphone).
5. CloudSync v2 автоматично pull-ить весь dataset з server.
6. PushRegistrar реєструє новий native token.
7. Native показує welcome-modal «Це нова native-версія. Можеш видалити Sergeant (shell), якщо хочеш — дані вже синхронізовано».

### 8.5 Coexistence period

Якщо обираємо Сценарій C — рекомендовано тримати **~120 днів** coexistence:

- День 0–30: Native GA. Shell працює нормально.
- День 30–60: Shell отримує banner-prompt у app («new native available»).
- День 60–90: Shell отримує full-screen modal на launch (один раз dismiss).
- День 90: Shell freeze release pipeline (не приймає нові updates).
- День 90–120: Shell працює у read-only через server-side `min-supported-version`.
- День 120: Shell remove-from-store. Existing installs продовжують працювати у read-only до server-side cut-off.

---

## 9. Метрики

### 9.1 Performance — Native vs Capacitor (baseline → target)

| Метрика                                 | Baseline (Capacitor estimate) | Target (Native)          | Source                                                 |
| --------------------------------------- | ----------------------------- | ------------------------ | ------------------------------------------------------ |
| Cold start (Android mid-range, P95)     | ~1.8 s                        | ≤900 ms                  | Sentry mobile performance trace / Firebase Performance |
| Cold start (iPhone 12, P95)             | ~1.2 s                        | ≤700 ms                  | Same                                                   |
| Time-to-interactive Hub dashboard, P95  | ~2.5 s                        | ≤1.5 s                   | Sentry custom trace `dashboard.tti`                    |
| Transaction list scroll FPS (10k items) | ~35–50 fps                    | ≥58 fps (FlashList)      | Sentry performance trace `transactions.scroll`         |
| Bundle size on-device                   | ~5–10 MB shell + 1.2 MB web   | ~30 MB (Hermes + assets) | Play Console / App Store Connect                       |
| App size — Apk download                 | ~10 MB                        | ~35–50 MB                | Same                                                   |

Зауваження: **Bundle size — Native ПРОГРАЄ.** Це trade-off у користь performance.

### 9.2 Retention

- D1 / D7 / D30 retention — порівняти cohorts shell-users vs native-users (PostHog `user_properties.platform`).
- Очікувано native повинна показати **+5–10 пунктів** D7 retention vs shell (через нижчий churn з "це не нативно" rage-quit).
- Якщо native НЕ показує покращення — це сигнал що нативність не була пейном для users і Capacitor was fine.

### 9.3 Crash-free rate

- iOS: target ≥99.5% (Sentry).
- Android: target ≥99.0% (Sentry; Android тримає менший baseline через ширший fragment-spectrum).
- Тригер для emergency-rollback: <98.0% на 1000 sessions.

### 9.4 Інші

- App Store rating ≥4.2 / 5 (target після 100+ reviews).
- Push delivery rate ≥95% (registrar-success).
- AI-quota cost per user — порівняти shell vs native (теоретично однаковий, бо server-side).
- Migration rate: % shell-users які встановили native і залогінилися за 90 днів.

---

## 10. Ризики + mitigation

| Ризик                                                                         | Likelihood | Impact | Mitigation                                                                                                       |
| ----------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Apple App Review reject «no significant difference from shell»                | Medium     | High   | Підкреслити native features (Live Activities, widgets) у app description. Бути готовим до 2–3 review iterations. |
| Expo SDK 53/54 upgrade ламає native plugins                                   | High       | Medium | Тримати на LTS SDK. Plan upgrade ⩾2 weeks before App Store deadline.                                             |
| `react-native-mmkv` 3.x не сумісне з new arch — split brain з sync            | Low        | High   | Wired test suite + sync conflict resolution на server side. (Q3 ADR-0010 закриває.)                              |
| Migration push-storm: 1000 users з shell отримують push, що нативка готова    | Medium     | Medium | Rate-limit migration banners (1 раз на тиждень / user). Не push, а in-app banner.                                |
| iOS `min-supported-version` cut-off ламає shell-users які не можуть оновитись | Low        | High   | Server-side cut-off робиться через ~6 міс після Native GA. До того — повний support обох клієнтів.               |
| Apple Developer Program не оплачено вчасно                                    | Low        | High   | Оформити заздалегідь, ~3 тижні до Phase 11. Entry criterion §1.2.                                                |
| FCM/APNs prod credentials не налаштовані                                      | Medium     | High   | Закрити `docs/tech-debt/backend.md#push-credentials` перед closed beta.                                          |
| PostHog tracking event-schema drift між web/shell/native                      | High       | Low    | Спільний `@sergeant/observability` пакет з event constants. Lint-rule на raw `posthog.capture('…')`.             |
| Sentry source-maps для Hermes bundle не загружені — crash stacks unreadable   | Medium     | Medium | EAS Build hook автоматизує upload (`@sentry/react-native/scripts/expo-upload-sourcemaps`).                       |
| Detox e2e flaky на Android emu — false-positive PR-blocking                   | High       | Low    | `mobile-flaky-verify.yml` (20-run gate) уже існує. Розширити на Android-suite перед закриттям smoke-only.        |
| Apple bundle prefix collision (shell + native у тому ж dev team)              | Low        | Medium | `com.sergeant.shell` і `com.sergeant.app` — два різні bundle, безпечно. Якщо ASC скаржиться — manual review.     |
| User confusion: «який Sergeant завантажити?»                                  | High       | Medium | Очистити store-listings: shell з icon-варіантом «Lite», native — primary. Або відразу прибрати shell з store.    |
| Voice STT не працює на UA-locale через Apple SFSpeechRecognizer обмеження     | Medium     | Medium | Server-side Whisper fallback (`/api/v1/speech/transcribe`) уже згаданий у Q6.                                    |
| Bundle size 50MB лякає Play Store users з повільним інтернетом                | Medium     | Low    | App Bundle (AAB) auto-splits per ABI / DPI; install size зменшується вдвічі.                                     |

---

## 11. Exit criteria для GA (general availability) native build

Переходить у GA коли **усі** виконано:

- [ ] Feature parity ≥20/22 ✅ у `docs/architecture/platforms.md` (поточно 18; +2 закриваємо у Phase 7).
- [ ] Усі 3 Exit-маяки з ADR-0010 § Sunset schedule — ✅:
  - [ ] RN-Nutrition full parity (recipes + photo-AI).
  - [ ] RN-Voice (STT + TTS у HubChat).
  - [ ] Detox real e2e на iOS + Android (Android — full sign-in→module→sign-out × 4).
- [ ] EAS prod profile налаштований, перший `eas build --profile production` успішний для iOS і Android.
- [ ] App Store Connect + Google Play Console — app records create-d, screenshots uploaded, privacy labels filled.
- [ ] Apple Developer Program активний; Google Play Developer акаунт активний.
- [ ] APNs/FCM prod credentials у `apps/server` (`docs/tech-debt/backend.md#push-credentials` — closed).
- [ ] Closed beta: ≥50 unique users, 14 днів, crash-free ≥99.5%, NPS ≥40, ≤5 P1 bug reports.
- [ ] Sentry RN prod-DSN wired, source-maps upload automatized у EAS Build hook.
- [ ] PostHog event-schema validated, `mobile.app_open` / `mobile.session_start` events visible.
- [ ] OTA channel `production` working, dry-run hotfix successfully published і консумлений на test device.
- [ ] Privacy Policy URL і Terms of Use URL у store-listings — live.
- [ ] In-app legal links (Settings → Privacy Policy / Terms) — wired.
- [ ] Universal Links AASA + assetlinks live на `sergeant.2dmanager.com.ua`, тестовано на iPhone і Pixel.
- [ ] Окремий ADR «Expo becomes primary» — created, ADR-0052 superseded.

**Soft criteria (не блокери, але до GA треба):**

- iOS App Tracking Transparency answered (ймовірно NO, ми не track-ємо).
- Apple Privacy Manifest `PrivacyInfo.xcprivacy` — created (iOS 17+ обов'язково).
- Android Data Safety form — filled.
- Marketing landing на `sergeant.2dmanager.com.ua/native` — пояснює відмінність native vs web/Capacitor.

---

## 12. Альтернатива — якщо Native НЕ потрібен зараз (Capacitor v2 focus)

Якщо decision gate (§3.4 п.3) повертає _«не варто»_ — фокус на максимізацію Capacitor shell. Що додати:

### 12.1 Capacitor v2 features

- **Native modules для performance-критичних path-ів:**
  - `@capacitor/preferences` — already used. Розширити для AES-encrypted MMKV-like KV.
  - Custom plugin для biometric auth (`@capacitor/biometric-auth` від community).
  - Custom plugin для Android widgets (Routine widget «сьогодні»).
- **Live Activities на iOS:** через custom Capacitor plugin (можливо, через `capacitor-live-activity` community). Не тривіально, але можливо.
- **Background tasks через `@capacitor/background-runner` (community).**
- **iOS Quick Actions:** через `@capacitor/app` API + manifest config (вже частково покрито).

### 12.2 Performance optimizations у `apps/web`

Якщо WebView — primary mobile runtime назавжди:

- **Бандл shake:** `VITE_TARGET=capacitor` уже вимикає PWA — додати dynamic-imports для модулів, що не використовуються на mobile (наприклад desktop-only screens).
- **Image lazy-loading:** уже у web, але optimize для slow connections.
- **Service Worker offline shell:** wait — `VITE_TARGET=capacitor` вимикає SW. Замість цього — preload essential assets у WebView via `webDir` static files.
- **Native list virtualization:** замість DOM virtualization — попросити Capacitor через `@capacitor/dialog` показувати native sheets для довгих списків.

### 12.3 Trade-offs Capacitor v2 vs Native

| Дилема                     | Capacitor v2 + plugins          | Native Expo                         |
| -------------------------- | ------------------------------- | ----------------------------------- |
| Час до Live Activity       | 2–4 тижні custom plugin         | 1–2 тижні з expo-modules-core       |
| Maintenance custom plugins | Високий — нема official support | Низький — community/Expo підтримує  |
| Cold-start performance     | Не покращується значно          | +30–40% швидше                      |
| Single-codebase з web      | ✅ повний reuse                 | ✅ reuse через `@sergeant/*` пакети |
| App Store «native» feel    | 🟡 шипить як WebView            | ✅ true native                      |

**Висновок:** Capacitor v2 — це **тактичне** рішення на 6–12 міс, але _не_ заміна Native у долгій. Якщо власник свідомо обирає «Capacitor назавжди» — це валідний вибір з мінімально економічним стартом, але закладає технічний борг у формі custom-plugins-зоопарка.

---

## 13. Підсумок і recommended next steps

**Декларація:** Цей файл — research-only deliverable. PR не створюється. ADR-0052 і RN-migration tracker лишаються source of truth.

**Чотири actionable next steps (упорядковано за priority):**

1. **(P0, this sprint)** Залишити Phase 3 у статусі `Deferred` до того, як Phase 1 (Web revenue) і Phase 2 (Capacitor) виконано. Не починати додаткові EAS / App Store кроки до закриття entry criteria §1.2.
2. **(P1, next 2 sprints)** Продовжити Phases 7–8 RN-міграції _малими_ PR-ами, фоновим темпом. Цілі — закрити обидва 🟥-маяки і вивести `recipe/[id]` + photo-AI + HubChat composer.
3. **(P2, sprint 4–6)** Оформити Apple Developer Program + Google Play Developer Console (1-time setup, незалежно від Phase 3 readiness — потрібно і для Phase 2). Якщо ФОП-track ще не активний — заздалегідь.
4. **(P3, sprint 8–10)** Decision gate: чи виконати Сценарій C (native як next-gen) або Сценарій A (sunset apps/mobile). Створити новий ADR на основі real-data з Capacitor-у в проді.

---

## 14. Cross-links / суміжні документи

- [`docs/launch/README.md`](../README.md)
- [`docs/launch/phases/01-web-launch-with-users.md`](./01-web-launch-with-users.md) — Phase 1
- [`docs/launch/phases/02-capacitor-launch.md`](./02-capacitor-launch.md) — Phase 2
- [`docs/architecture/platforms.md`](../../architecture/platforms.md) — feature-parity матриця
- [`docs/adr/0052-mobile-strategy-capacitor-primary.md`](../../adr/0052-mobile-strategy-capacitor-primary.md) — primary decision
- [`docs/adr/0010-mobile-dual-track-capacitor-expo.md`](../../adr/0010-mobile-dual-track-capacitor-expo.md) — baseline dual-track
- [`docs/mobile/react-native-migration.md`](../../mobile/react-native-migration.md) — RN-міграція tracker
- [`docs/mobile/overview.md`](../../mobile/overview.md) — API contract
- [`docs/playbooks/release.md`](../../playbooks/release.md) — release playbook (включно з § Expo)
- [`docs/playbooks/port-web-screen-to-mobile.md`](../../playbooks/port-web-screen-to-mobile.md)
- [`docs/playbooks/sync-rn-migration-progress.md`](../../playbooks/sync-rn-migration-progress.md)
- [`docs/initiatives/0010-revenue-first-launch.md`](../../initiatives/0010-revenue-first-launch.md) — revenue-first context
- [`docs/initiatives/0002-mobile-platform-decision.md`](../../initiatives/0002-mobile-platform-decision.md) — original sunset initiative
- [`apps/mobile/README.md`](../../../apps/mobile/README.md), [`apps/mobile/AGENTS.md`](../../../apps/mobile/AGENTS.md)
- [`apps/mobile-shell/README.md`](../../../apps/mobile-shell/README.md) — для порівняння
