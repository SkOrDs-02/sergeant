# Аудит сиротілого коду, елементів і таблиць — 2026-08-05

> **Поточні статуси перенесених знахідок:** [єдиний реєстр верифікації](verification/findings.json). Цей документ зберігає історичні результати; нові спроби та виправлення ведуться в реєстрі.

> **Last touched:** 2026-09-05 by @Skords-01. **Next review:** 2026-12-27.
> **Status:** Active

> **Governing skill:** `sergeant-tech-debt` · **Playbook:** [`cleanup-dead-code.md`](../../00-start/playbooks/cleanup-dead-code.md).
> Це read-only аудит: у цьому PR нічого не видаляється. Кожна знахідка отримує клас, докази («чому воно осиротіло») і рекомендацію. Самі видалення — окремими PR-ами за класами боргу (політика skill-у: не змішувати dead-code, lint-cleanup і декомпозицію в одному PR).

## TL;DR

Усі штатні гейти чистоти **зелені** — `pnpm knip`, `pnpm dead-code:files`, `check:dualwrite-residue`, `docs:check-links`, `lint:ai-legacy` не бачать жодної проблеми. Справжні сироти живуть у **сліпих зонах цих гейтів**: вимкнені категорії `exports`/`types` у `knip.json`, маска `apps/mobile` (весь `src/**` оголошений entry — knip фізично не може знайти там мертвий файл), і крос-системні зв'язки, які жоден лінтер не бачить (Postgres ↔ server-код ↔ n8n ↔ PostHog).

Ключові числа:

| Зріз                                          | Всього        | Сиріт / підозрілих                                                                                 |
| --------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Таблиці Postgres (живі після 103 міграцій)    | 113           | **29** (6 повних сиріт, 17 never-wired, інші — write-only/read-only аномалії)                      |
| Реєстрації роутів на сервері                  | 137           | **~35** (20 never-wired під неіснуючі n8n WF + 15 після decommission OpenClaw)                     |
| Методи `packages/api-client`                  | 59 + 14 хуків | **6 методів + 10 хуків** без споживачів                                                            |
| Аналітичні події в реєстрі                    | 122           | **35 ніколи не стріляли** в прод (з них 10 — placeholder-и віком 3+ міс без call sites)            |
| Експорти / типи (сліпі зони knip)             | —             | **28** експортів + **16** типів                                                                    |
| `apps/web`                                    | —             | 1 незмонтована сторінка, 8 ghost-методів RQ-фабрик, 4 never-wired компоненти, 1 сирота в `public/` |
| `apps/mobile`                                 | 699 файлів    | **~35 файлів / ~6.3k LOC** недосяжні (83% — UI-kit «на виріст»)                                    |
| Пакети                                        | 12            | **0**                                                                                              |
| CI-воркфлоу                                   | 27            | **0** (сироти лишились на боці `scripts/` — 3 шт., і n8n — 1 мертвий тригер)                       |
| Feature flags (web `FLAG_REGISTRY` + PostHog) | 3 + 0         | **0** мертвих                                                                                      |

**П'ять знахідок — не про мертвий код.** Це незакриті контури, які виглядають як сироти, але лікуються підключенням, а не видаленням; винести з cleanup-черги в окрему перевірку:

1. **Видалення акаунта не скасовує платну підписку** в Stripe/LiqPay/Plata — живий шлях іде повз `deleteUserData` (§ 3). ✅ Закрито 2026-09-03 (`beforeDelete` → `deleteUserData`).
2. **Сесійне вікно 5 хв лишилось відкритим на найчутливіших поверхнях** — `getFreshSessionUser` написаний саме для експорту даних, видалення акаунта й привʼязки банку, і не викликається жодною з них (§ 7а). ✅ Закрито 2026-09-03 (`requireFreshSession()`).
3. **HubChat у проді не відповідає жодного разу** за тиждень бети: 6 відправок, 6 HTTP-помилок, 0 відповідей (§ 9).
4. **Метрика `syncConflictsTotal` ніколи не інкрементується** — дашборд показує «конфліктів нема» незалежно від реальності (§ 7б).
5. **Ротація секрету Monobank-вебхука, ймовірно, зупинена** — її викликач жив на виведеному з експлуатації Railway (§ 3).

Показово, що жодну з них не видно зсередини коду: №1, 2 і 4 знайшлись на зіставленні «хто кого викликає», №3 — на зіставленні реєстру подій із живим PostHog. Аудит, який перевіряє репозиторій лише сам проти себе, пройшов би повз усі п'ять.

Головні кореневі причини (докладно у [§ 11](#11-чому-так-стається-root-causes)): інфраструктура «на виріст» під n8n-воркфлоу, які так і не створили; v0-батчі UI-компонентів web і mobile; decommission-хвилі ADR-0075/0081/0082, що свідомо лишили таблиці; registry-first телеметрія без зворотного прибирання; конфіг-маски knip.

## Методологія

- **Механічні інструменти:** `pnpm knip` (raw + `--include exports` + `--include types`), `pnpm dead-code:files` (marker-aware wrapper), `pnpm check:dualwrite-residue`, `pnpm docs:check-links`, `pnpm lint:ai-legacy`, `pnpm snapshot`.
- **Жива телеметрія:** PostHog prod (`sergeant-prod`, EU) — SQL по `events` за 120 днів (повне життя проєкту) + `feature-flag-get-all`. Примітка: список event definitions (`read-data-schema`) виявився неповним (~55 подій із 87 реальних) — істина бралася з SQL.
- **Git-форензика:** `git log -S` для датування появи/зникнення call sites. Обмеження: клон у сесії shallow (історія від ~2026-07-27), тому старші дати верифіковані через хедери міграцій, PR-номери в docstring-ах, freshness-маркери і GitHub API.
- **6 паралельних read-only проходів:** таблиці БД, server-ендпоінти/контракти, web, mobile/shell/landing, пакети/скрипти/CI/конфіги, індивідуальний тріаж 28 unused exports. Вибіркові твердження перевірені повторно вручну (нуль-згадки `openclaw_decisions`, недосяжність `StrategyPage`, сирітство mobile ui-барелю, відсутність `check:dualwrite-residue` у CI, нуль референсів `ui-audit.html`).
- **Жива Postgres-БД не перевірялась**: `postgres` MCP у `.mcp.json` зав'язаний на `SERGEANT_PG_READONLY_URL`, якого нема в цьому середовищі. Аналіз таблиць — статичний (міграції ↔ код).

**Таксономія класифікації** (використовується в усіх таблицях):

- `legacy-replaced` — застаріле, замінене новим шляхом (заміна названа).
- `never-wired` — збудоване, але так і не підключене.
- `dead-consumer-removed` — колись працювало; споживача видалили, залишок живе.
- `write-only` / `read-only` — таблиця з одностороннім трафіком (окремо: навмисні append-only логи).
- `intentional-scaffold` — свідомий заділ із валідним маркером/планом (Hard Rule #10).
- `one-shot-done` — одноразовий скрипт/кодмод, що відпрацював.
- `false-positive` — насправді живе (пояснено, як саме).

## 1. Стан механічних гейтів і їхні сліпі зони

| Гейт                                | Результат                        | Сліпа зона                                                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm knip` (CI «Dead Code (Knip)») | ✅ чисто                         | `knip.json` exclude-ить категорії `exports`, `types`, `duplicates`, `unresolved` → 28 експортів і 16 типів (§ 7–8) невидимі для CI                                                                                                  |
| `pnpm dead-code:files`              | ✅ «No unmarked unused files»    | поважає `@scaffolded` — навмисно; але не бачить mobile (нижче)                                                                                                                                                                      |
| knip для `apps/mobile`              | —                                | `knip.json` оголошує `"entry": ["app/**", "src/**"]` → **кожен src-файл є entry, сирітські файли в mobile принципово невидимі** (~35 файлів у § 5)                                                                                  |
| `check:dualwrite-residue`           | ✅ clean (1613 files)            | **не підключений ні до CI, ні до turbo** — лише ручний npm-script (грепи по `.github/workflows` і `turbo.json` — нуль збігів)                                                                                                       |
| `docs:check-links`                  | ✅ 5161 internal + 1480 external | не ловить посилання код→док (напр. docstring-и на видалені доки, § 4–5)                                                                                                                                                             |
| `lint:ai-legacy`                    | ✅ 3 маркери, всі fresh          | усі 3 без issue-ref `#NNN` (сам гейт це і показує warn-ом): `scripts/billing/grant-beta-pro.mjs`, `scripts/telegram/broadcast-waitlist.mjs`, `scripts/telegram/send-survey.mjs` — тимчасова інфра закритої бети, expires 2026-10-31 |
| Конфіг-залишок                      | —                                | `knip.json` → `apps/landing` entry `middleware.ts` **не існує** (слід минулого стека; єдиний configuration hint у прогоні)                                                                                                          |

Окремо: `scripts/check-schema-drift.mjs` (гейт Drizzle↔SQL↔SQLite) має allowlist `SQL_ONLY_TABLES` на ~60 server-only таблиць — **усі 6 повних таблиць-сиріт із § 2 значаться саме там**, тож гейт їх легалізує, а не ловить.

### Структурна вада: `check-governance-sync` карає активні аудити за їхню суть

Знайдено під час CI цього ж PR, тож фіксую як знахідку. `scripts/check-governance-sync.mjs` (Check 3, «dangling source refs») вважає помилкою будь-яке backtick-посилання на `apps|packages|scripts/…`, якщо файлу немає, — і активні аудити в `docs/90-work/audits/*.md` під це підпадають. Але **аудит за визначенням посилається на те, чого немає**: «цей файл мертвий», «конфіг вказує на неіснуючий скрипт» — це і є знахідка, а не застаріла дока.

Автори чекера цю проблему вже усвідомили — і вирішили її рівно на одну теку глибше:

```js
// `docs/90-work/audits/archive/` holds superseded/completed audits — they
// document a point-in-time snapshot (dead code found, links then-broken),
// so their concrete refs are historical by design…
if (relPath.startsWith("docs/90-work/audits/archive/")) return true;
```

Той самий аргумент повністю чинний для аудиту **до** архівації: він теж є знімком стану на дату.

Живий приклад стався під час цього аудиту. `security-comprehensive-2026-08-04.md` документував, що MCP-запис `sergeant-agent-find` вказує на скрипт у `scripts/agent/`, якого не існує, — і чекер прочитав цитований із конфігу шлях як зламане посилання, зробивши `main` червоним на `check`. Це був не дефект того аудиту, а дефект гейта: аудит правдиво описував стан.

Інцидент закрито 2026-08-05 (`main` @ `df09b4b2`) тим, що знахідку **прибрали як застарілу** — запис `sergeant-agent-find` видалили з `.mcp.json`, лишилось три сервери (`github`, `postgres`, `codebase-memory`), тож описувати стало нічого. Тобто конкретний симптом зник разом із предметом, **а не тому, що гейт полагодили**: `isAspirational` у `scripts/check-governance-sync.mjs` не змінювався. Наступний аудит, який чесно назве неіснуючий файл, спіткнеться так само.

Доказ, що вада структурна, а не одноразова: **цей абзац сам її відтворив**. Поки шлях у попередньому реченні стояв у backtick-ах, `pnpm lint:governance-sync` рахував уже дві помилки замість однієї — другу в цьому файлі. Довелося зняти backtick-и у власному тексті, щоб описати проблему, не спричинивши її. Тобто гейт активно тисне на автора аудиту, аби той **не називав** відсутній файл — рівно навпаки до того, для чого аудит пишеться.

**Рекомендація:** поширити `isAspirational` на активні аудити (`docs/90-work/audits/*.md`, не лише `archive/`) — з тим самим обґрунтуванням, що вже записане в коді для архіву. Знімати backtick-и в кожному новому аудиті — лікування симптому, яке лишає пастку наступному авторові; це рівно той антипатерн «гейт, що охороняє не те», який описує § 11 п. 4.

## 2. Таблиці БД (Postgres)

Всього за історію міграцій створено 115 іменованих таблиць, 2 дропнуто явно (`module_data` у `046`, `billing_subscriptions` у `083` — канонічний зразок two-phase DROP з аудитом читачів/писарів і founder-confirm). **Живих 113, підозрілих 29.**

### 2а. Нуль runtime-згадок (єдина згадка — allowlist `check-schema-drift.mjs`)

| Таблиця                                                                             | Створена                                  | Класифікація                   | Чому так                                                                                                                                                                                              | Рекомендація                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `webhook_events`                                                                    | `011_webhook_events.sql`                  | `legacy-replaced`              | Замінена трьома спеціалізованими: `stripe_webhook_events` (057, у хедері прямо «Dedicated table (vs generic webhook_events from 011)»), `n8n_webhook_events` (061), `billing_webhook_events` (072)    | Two-phase DROP за зразком 083; фаза «0 writers/readers» фактично давно настала                 |
| `openclaw_decisions`                                                                | `028_openclaw.sql` (ADR-0031, 2026-05-02) | `legacy-replaced`              | OpenClaw-гейтвей децommission-ований [ADR-0075](../../04-governance/adr/0075-openclaw-gateway-decommissioned.md) (2026-07-20, ~200 файлів видалено); таблиці «свідомо лишаються — міграції immutable» | Тримати per ADR-0075 **або** гігієнічний DROP-пакет за зразком 083 (pre-launch, даних мінімум) |
| `openclaw_write_audit`                                                              | `030` (ADR-0037)                          | `legacy-replaced`              | Уся поверхня `/api/internal/openclaw/write/*` видалена ADR-0075                                                                                                                                       | Те саме; плюс прибрати мертве посилання на `write/*` з `ops/n8n-workflows/REPORTING-MATRIX.md` |
| `openclaw_reminders`                                                                | `055`                                     | `legacy-replaced`              | Читач (n8n cron-poller → `/reminders/list-due`) видалений разом з ендпоінтом                                                                                                                          | Те саме                                                                                        |
| `openclaw_approval_nonce`                                                           | `080` (security review 2026-07-09)        | `legacy-replaced`              | Прожила < 2 тижнів: створена 09.07, поверхня видалена 20.07 (ADR-0075)                                                                                                                                | Те саме                                                                                        |
| `apple_iap_receipts` (+ колонка `subscriptions.apple_original_transaction_id`, 071) | `070` (ініціатива 0010)                   | `never-wired` (свідомий заділ) | План 0010: «Stripe для web, Apple IAP для iOS»; App Store submission відкладений до «web-launch + 50 paid»                                                                                            | **Не дропати** — заділ активної ініціативи; wire пізніше                                       |

### 2б. Never-wired: таблиця + internal-ендпоінт існують, але викликати їх нікому

Хедери міграцій 018–021 прямо називають n8n-воркфлоу-споживачів: «WF-50…WF-55» (SEO), «WF-60…WF-66» (growth), «WF-70…WF-86» (marketing), «WF-93» (governance). **У `ops/n8n-workflows/` реально існують лише WF-60 і WF-63.** Решта не існували ніколи (нуль згадок і в docs).

| Таблиці (17)                                                                                                                                                      | Міграція                   | Мертвий ingestion-шар                                                                                      | Рекомендація                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `seo_keywords`, `seo_gsc_daily`, `seo_pagespeed_daily`, `seo_backlinks`, `seo_competitors`, `seo_competitor_snapshots`, `seo_sitemap_health`, `seo_keyword_ranks` | `018_seo_tables.sql`       | `routes/internal/seo.ts` (7×INSERT, 1×SELECT) — викликів 0                                                 | Продуктове рішення: створити WF-50…55 **або** пакетний two-phase DROP + видалення роуту |
| `growth_cohorts`, `revenue_daily`, `feature_adoption_weekly`                                                                                                      | `019_growth_tables.sql`    | `/api/internal/growth/{cohorts,revenue,feature-adoption}` — викликів 0 (n8n кличе лише funnel/acquisition) | Те саме                                                                                 |
| `brand_mentions`, `social_mentions`, `social_channels_daily`, `app_store_reviews`                                                                                 | `020_marketing_tables.sql` | `routes/internal/marketing.ts` — WF-70…86 не існують                                                       | Те саме                                                                                 |
| `email_events`                                                                                                                                                    | `020`                      | INSERT-ендпоінт у `routes/internal/email.ts:109`; Resend-webhook не заведений                              | Wire (Resend events) або drop                                                           |
| `hard_rules_violations`                                                                                                                                           | `021_governance_audit.sql` | «Записи вставляє WF-93» — WF-93 ніколи не існував                                                          | Wire або drop разом із `routes/internal/governance.ts`                                  |

### 2в. Односторонній трафік

| Таблиця                                           | Стан                                                                                                                                                               | Класифікація              | Рекомендація                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------- |
| `growth_funnel_daily`, `growth_acquisition_daily` | пишуть n8n WF-60/WF-63 (обидва `status: experimental`), читачів 0 (Grafana має лише Prometheus datasource)                                                         | `write-only`              | Перевірити цінність experimental-кронів; інакше вимкнути              |
| `push_send_audit`                                 | INSERT-only з `modules/push/audit.ts`                                                                                                                              | `write-only`, намір       | **keep-as-log**                                                       |
| `telegram_beta_survey_responses`                  | INSERT з `waitlistBot.ts:421`; founder читає SQL-ем (задизайнено так у хедері 091)                                                                                 | `write-only`, намір       | **keep-as-log**                                                       |
| `feedback_entries`                                | INSERT з `POST /api/v1/feedback` (093, Created 2026-07-31 — власний sink багрепортів бети)                                                                         | `write-only`, намір       | **keep-as-log**                                                       |
| `openclaw_mute_state`                             | **читається** guard-ом alerts-shipper (`modules/alerts/mute-state.ts`), але писаря (slash `/mute` гейтвею) видалено ADR-0075 → **мут фізично неможливо ввімкнути** | `read-only`, писар-сирота | Wire новий writer або задокументувати, що guard завжди «не заглушено» |

### 2г. Перевірені й чисті (false positives)

Пари «стара/нова», що виявились обидві живими: `push_subscriptions` (web push) + `push_devices` (iOS/Android — розведені за платформою); `waitlist_entries` (email-вейтліст web) + `telegram_waitlist` (TG-бот) — різні продукти. `openclaw_invocations` — жива всупереч назві (пише invocation-audit `ai-memory /forget`, читає `/status`, чистить `logRetention` — ADR-0075 свідомо переніс helper-и). `email_campaigns_log` (FTUX-drip) і `sync_audit_log` — живі. `packages/db-schema` сиріт не має: 12 pg-моделей ↔ виключно живі таблиці; доменні таблиці server читає raw SQL-ем — задекларований дизайн.

### 2д. Dual-write residue — закритий

«Dual-write era» — це **клієнтська** міграція LS/MMKV → SQLite (ADR-0073), не Postgres. `packages/dualwrite-core` — живий і спожитий усіма 4 модулями web+mobile. Postgres-слід ери закритий повністю (`module_data` → DROP у 046, v1-ендпоінти → 410 Gone). Гвард `scripts/dualwrite-residue.ts` тримає baseline (~35 файлів «Phase 5 teardown» в allowlist), але — див. § 1 — **у CI не підключений**.

## 3. API-ендпоінти і контрактний шар

Реєстрацій роутів на сервері **137** (84 публічних + 53 `/api/internal/**` за bearer `INTERNAL_API_KEY`); в `packages/api-client` — 59 методів у 17 неймспейсах + 14 React-хуків. Сиротами виявились **~35 серверних реєстрацій** і **6 методів + 10 хуків** клієнта.

> ⚠️ **Спочатку — дві не-cleanup знахідки, що виринули з цього проходу.** Вони не про мертвий код, а про мовчазно розірвані живі контури; обидві варті окремої перевірки поза цим аудитом.
>
> 1. **Видалення акаунта не скасовує платну підписку в платіжного провайдера.** `DELETE /api/me` (→ `modules/me/dataRights.ts:242 deleteUserData`) не викликає ніхто: web видаляє акаунт через Better Auth (`core/profile/DangerZoneSection.tsx:35` → `/api/auth/delete-user`), а `me.deleteAccount` в api-client має нуль споживачів.
>
>    Перевірено вручну, бо початкове формулювання («GDPR-прогалина, доменні дані не чистяться») **не підтвердилось**: `deleteUserData` сам завершується `DELETE FROM "user"`, а доменні таблиці мають `ON DELETE CASCADE` на `"user"(id)` у 31 міграції — включно з `ai_memories` (`025:73`) і `subscriptions` (`056:6`). Better Auth видаляє той самий рядок `user`, тож каскад спрацьовує однаково. **Дані таки видаляються.**
>
>    Реальний розрив вужчий і грошовий: `deleteUserData` перед транзакцією викликає `notifyProvidersCancel` — best-effort скасування підписки у Stripe / LiqPay / Plata. На живому шляху цей крок **не виконується ніколи**: `auth.ts:284` має `deleteUser: { enabled: true }` без `beforeDelete`/`afterDelete`, а `databaseHooks.user` містить лише `create`/`update`. Тобто акаунт і дані зникають, а рекурентне списання в провайдера лишається активним — користувач продовжує платити за віддалений акаунт.
>
>    Полагодити: хук `beforeDelete` у Better Auth, який кличе `notifyProvidersCancel` (або перевести DangerZone на `DELETE /api/me`). Контракт-тест на `DELETE /api/me` проходить — і саме тому розрив був невидимий.
>
>    ✅ **Закрито 2026-09-03.** `auth.ts` → `user.deleteUser.beforeDelete` виконує САМ `deleteUserData` (а не лише `notifyProvidersCancel`): один шлях для `POST /api/auth/delete-user` і `DELETE /api/me`, тож на живому шляху тепер спрацьовують і provider-cancel, і `subscriptions → canceled`, і purge `ai_usage_daily`, і enqueue у `gdpr_cleanup_queue`. Fail-safe: збій `deleteUserData` → pino `error` (`auth.user.delete.before_hook_failed`, `user_id_hash`) + `APIError ACCOUNT_DELETE_FAILED`, Better Auth не доходить до власного `DELETE` — акаунт лишається цілим, а не напіввидаленим мовчки. Тести: `auth.test.ts`.
>
> 2. **Ротація секрету Monobank-вебхука могла зупинитись.** `POST /api/internal/mono/webhook/rotate` у хедері вказує викликача — «Railway/n8n cron»; Railway виведено з експлуатації ([ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md)), відповідного n8n-воркфлоу в git немає. Якщо ручного крона в Coolify теж нема — ротація просто перестала відбуватись (з репо це не підтвердити). Перевірити в Coolify.

### 3а. Never-wired: ендпоінт під n8n-воркфлоу, який не приїхав (20)

Один коміт `10ba8b02` (2026-05-01) з чесною назвою «n8n base — **no workflows yet**» створив 16 internal-ендпоінтів під WF-50…93. Воркфлоу так і не з'явились (git `--diff-filter=D` порожній — їх навіть не видаляли, вони не існували), тож ендпоінти дзеркалять таблиці з § 2б і мають ту саму долю.

| Ендпоінти                                                                                                                   | Файл                                    | Обіцяний споживач                                     |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| 7× SEO (`gsc-snapshot`, `rank-snapshot`, `pagespeed`, `backlinks`, `sitemap-health`, `competitor-snapshot`, `GET keywords`) | `routes/internal/seo.ts:78–375`         | WF-50…55                                              |
| 3× marketing (`mention`, `review`, `social-channel`)                                                                        | `routes/internal/marketing.ts:52–227`   | WF-70…76                                              |
| 2× email (`sent`, `event`)                                                                                                  | `routes/internal/email.ts:36,85`        | WF-80/81                                              |
| `GET /api/internal/users/cohort`                                                                                            | `routes/internal/users.ts:17`           | WF-80 (drip)                                          |
| `POST /api/internal/governance/audit`                                                                                       | `routes/internal/governance.ts:40`      | WF-93                                                 |
| 3× growth (`cohort`, `feature-adoption`, `revenue/snapshot`)                                                                | `routes/internal/growth.ts:125,158,261` | WF-61…66 (живі лише WF-60 funnel і WF-63 acquisition) |

Ще три never-wired поза цим комітом: `POST /api/ai-memory/ingest` (`routes/ai-memory.ts:58`, 2026-05-02 — клієнт-driven ingestion, якого клієнт так і не отримав; діаграма в `ai-memory.md § Ingest flow` його не містить, хоча recall і event-sync там є), `POST /api/internal/alerts/send` (dedup-pipeline увімкнеться «лише після міграції n8n WF» — жоден із 22 WF не мігрував, усі шлють через власні `sendMessage`-ноди), `GET /api/v2/sync/stream` (SSE — **лишити**: `sync-client-wiring.md:83` явно тримає його як Phase 3 з позначкою «NO CONSUMER»).

### 3б. Dead-consumer-removed: споживача знесла хвиля ADR-0075 (OpenClaw), роут лишився (15)

| Ендпоінти                                                                           | Файл                                       | Що було споживачем                                                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6× strategic (`goals`, `goals/list`, `list`, `goal`, `goals/status`, `goals/carry`) | `routes/internal/strategic.ts:129–208`     | Telegram-команди `/strategy …` OpenClaw-бота. `weekly-checkin` — **живий** (WF-26), не чіпати                                                            |
| 3× debug-window (`enable`, `disable`, `status`)                                     | `routes/internal/debug-window.ts:34,53,59` | хедер прямо: «Callers: tools/openclaw `/debug-window`»                                                                                                   |
| `POST /api/internal/alerts/history`                                                 | `routes/internal/alerts.ts:283`            | slash-команда `/alerts history` founder-бота                                                                                                             |
| `GET /api/internal/prompts/:namespace/:slug`                                        | `routes/internal/prompts.ts:11`            | console-ера роздача `ai-prompts/*.md`                                                                                                                    |
| `POST /api/internal/categorize`                                                     | `routes/internal/categorize.ts:175`        | WF-06 категоризує власним AI-node; функція `categorizeTransaction` **жива** in-process (`modules/mono/enrichmentWorker.ts`) — знімати лише HTTP-обгортку |
| `GET                                                                                | POST /api/internal/ai-usage`               | `routes/internal/ai-usage.ts:20,83`                                                                                                                      | apps/console + OpenClaw-агенти (обидва retired); `ai_usage_daily` пишеться in-process. **Спірний**: файл активно розвивається (2026-08-04, «облік AI-вартості») — рішення власника, можливо звузити до GET-звіту |
| `POST /api/internal/mono/webhook/rotate`                                            | `routes/internal/mono.ts:43`               | див. попередження вище — **верифікувати, а не видаляти**                                                                                                 |

### 3в. api-client: 6 методів + 10 хуків без споживачів

| Сутність                                                                                                                                                                                                                                                      | Класифікація                                                 | Чому                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `push.subscribe` / `push.unsubscribe` (`endpoints/push.ts:131,133`)                                                                                                                                                                                           | `legacy-replaced`                                            | Того ж дня (2026-04-20) уніфіковано на `register`/`unregister`. Сервер тримає `POST                                                                                                                                            | DELETE /api/push/subscribe` як deprecation-proxy для старих PWA-клієнтів (логує deprecation) — **проксі лишити, клієнтські методи зняти** |
| `privat.balanceFinal`                                                                                                                                                                                                                                         | `dead-consumer-removed`                                      | Прод-викликів 0, але живуть **stale-моки** у 4 тестах `core/settings/FinykSection*.test.tsx` — компонент цього методу не викликає (тести мокають привида)                                                                      |
| `me.deleteAccount`                                                                                                                                                                                                                                            | `never-wired` — **кандидат на підключення, не на видалення** | Див. попередження вище: разом із рішенням по скасуванню підписки                                                                                                                                                               |
| `webVitals.send` + `createWebVitalsEndpoints` + alias `webVitalsApi`                                                                                                                                                                                          | `never-wired`                                                | Web шле web-vitals напряму `navigator.sendBeacon` — і **принципово не може інакше**: sendBeacon не вміє custom-headers, які додає api-client. Обгортку видалити, серверний endpoint (beacon) живий                             |
| `nutrition.postJson`                                                                                                                                                                                                                                          | `never-wired`                                                | Generic escape hatch у публічному інтерфейсі, який не кличе навіть сам пакет                                                                                                                                                   |
| 10 із 14 React-хуків (`useCoachMemory`, `useCoachInsightMutation`, `useChatMutation`, `useVapidPublicKey`, `useSubscribePushMutation`, `useUnsubscribePushMutation`, `useFoodSearch`, `useBarcodeLookup`, `usePrivatBalanceFinal`, `useWeeklyDigestMutation`) | `replaced-by-local`                                          | Апки будують власні хуки поверх методів (web `meal-sheet/useFoodSearch.ts`, `useCoachInsight.ts`; mobile `useBarcodeProductLookup`). Живі лише `useUser` (17 імпортів), `useApiClient` (11), `usePushRegister/Unregister/Test` |

### 3г. Контрактний шар (Hard Rule #3) і OpenAPI

- **Мертвих шляхів у згенерованому OpenAPI — 0.** Дрейф в інший бік: **16 серверних method-level шляхів відсутні в spec** (`DELETE /api/me`, `GET /api/me/export`, `GET|PATCH /api/me/preferences`, `GET /api/mono/jars`, `GET /api/status`, `GET /api/sync/audit`, `POST|GET|GET /api/v2/sync/{push,pull,stream}`, `POST /api/ai-memory/{ingest,event-sync}`, `POST /api/csp-report`, `GET /api/email/unsubscribe`, `POST /api/finyk/manual-expenses`, `POST /api/telegram/webhook`). Freshness-гейт `pnpm api:check-openapi` це не ловить **за конструкцією**: він звіряє spec із джерелом `packages/shared/src/openapi/routes.ts`, а не з реальним router-графом — якщо шлях не описали в джерелі, гейт мовчить.
- **Контракт-тест на неіснуючий ендпоінт:** `routes/account-recovery.contract.test.ts` (2026-05-14) навмисно фіксує wire-контракт «before implementation» — але висить 2,5 місяця; сам роут `/api/account/recovery` не існує.
- **Мертві шляхи в конфігу Sentry:** `sentry.ts:43` семплить `/api/internal/openclaw/write/` (поверхня видалена ADR-0075), `:55` — `/api/account/recovery` (не існує); обидва зафіксовані асертами в `__tests__/sentry-sampler.test.ts:62-70`, тож тест захищає мертві правила.
- Doc-drift: `ops/n8n-workflows/REPORTING-MATRIX.md` досі містить рядок WF-25 (`25-morning-briefing-cron.json` видалено).
- Чистий приклад для наслідування: `syncV1Sunset.test.ts` — навмисний tombstone-guard після видалення v1 sync.

### 3д. False positives (не чіпати)

`/health`-родина + `/livez /readyz /startupz /healthz /metrics` (Coolify healthcheck + Prometheus scrape); вебхуки зовнішніх систем — `POST /api/mono/webhook(/:secret)` (секрет у path — єдиний транспорт Mono API), `/api/telegram/webhook`, `/api/billing/{stripe-webhook,plata-webhook,liqpay-callback}`; `POST /api/csp-report` (браузер), `GET /api/email/unsubscribe` (лінк у листі); `POST /api/push/send` і решта alerts/growth/strategic-weekly/webhook-events — закомічені n8n WF (01–19, 26, 60, 63, 98, 99, 103–106); `eval/rag-weekly`, `ai-memory/backfill/*`, `ai-memory-dlq/*` — ops-скрипти; `/api/internal/billing/{upgrade,downgrade}` — ручний інструмент founder-а для comp-акаунтів; `GET /api/sync/audit` — admin-gated security-probe; `ALL /api/auth/{*splat}` — Better Auth. Пари `/api/waitlist` + `/api/v1/waitlist`, `/api/feedback` + `/api/v1/feedback` — навмисні alias-и.

## 4. apps/web

Роутер (`core/app/router.tsx` + 19 standalone-шляхів) здоровий: усі page-компоненти модулів підключені. Сиротілий шар — точковий, але показовий.

### 4а. Незмонтована вертикаль strategic mode

**Найбільший «завислий» шматок web.** `apps/web/src/pages/strategy/StrategyPage.tsx` (створена 2026-05-13, PR-34) — свідомо не змонтована в роутер (`@scaffolded` + `@nextStep PR-35+`), при цьому **повна серверна половина існує і обслуговується**: міграція 062, `apps/server/src/lib/strategicGoals.ts`, internal-роути, n8n WF-26, RQ-фабрика `strategicKeys` (див. 4в). PR-35 не рухається ~12 тижнів; дизайн-аудит 2026-05-18 виніс сторінку за межі дизайн-системи («entirely outside design system, out of v2 scope»), QA-аудит (`web-qa-pre-beta.md:160`) зафіксував використання неіснуючих токенів (`bg-background` тощо). **Рекомендація:** рішення власника — або дедлайн `TODO(NNNN): дата` на PR-35, або прибрати UI в архів до реального старту (серверна половина від цього не залежить).

### 4б. Feature flags — чисто

У `FLAG_REGISTRY` 3 прапорці (`app-lock-enabled`, `hub_command_palette`, `ftux_outcome_card_v1`) — усі з живими call sites і тумблерами в `ExperimentalSection`. Мертвих 0. Два історичні прапорці (`finyk_subscriptions_category`, `feature.finyk.sqlite_v2.mono_mirror`) видалені раніше і залишили лише пояснювальні коментарі — зразкове прибирання. У PostHog feature-флагів 0 — сиріт нема.

### 4в. RQ key-фабрики: 8 ghost-методів у `queryKeys.ts`

11 фабрик / 44 методи; живі опущено. Тести над ghost-методами — coverage поверх фабрики (додані 2026-06), а не захист споживачів, тож видалення безпечне (Hard Rule #2 вимагає фабрики для живих ключів, а не збереження мертвих).

| Метод                                                                            | Класифікація           | Чому                                                                                                                                                                                  | Рекомендація                                         |
| -------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `finykKeys.monoClientInfo`, `.monoStatements`, `.monoStatement`, `.monoAccounts` | `legacy-replaced`      | Легасі direct-poll шлях Monobank видалено після webhook-cutover (#705→#708); `useMonobank.ts` — тонкий re-export `useMonobankWebhook`                                                 | Видалити методи + їх key-shape тести                 |
| `finykKeys.privat`, `.privatAccounts`, `.privatStatement`                        | `never-wired`          | `usePrivatbank.ts` не використовує RQ взагалі (useState/LS-кеш); фіча вимкнена хардкодом `PRIVAT_ENABLED = false` (`FinykApp.tsx:59`). Ключі оголошені під RQ-версію, якої не сталося | Видалити або маркер із прив'язкою до вмикання Privat |
| `nutritionKeys.pushStatus`                                                       | `legacy-replaced`      | Пуш-статус переїхав у `pushKeys.status`/`vapid`; у nutrition згадок `push-status` не лишилось                                                                                         | Видалити                                             |
| `strategicKeys.goalsForWeek`                                                     | `intentional-scaffold` | Єдиний споживач — незмонтована `StrategyPage` (4а)                                                                                                                                    | Доля разом зі сторінкою                              |
| `*.all`-префікси без прямих викликів (6 шт.)                                     | `false-positive`       | Конвенційні invalidation-префікси за дизайном фабрик                                                                                                                                  | Лишити                                               |

### 4г. Scaffolded-барелі з `knip.json` ignore — 8/8 досі без споживачів + дрейф маркерів

Дисципліна Hard Rule #10 загалом працює (усі 8 із `@scaffolded`+`@nextStep`; `injuryRepository` отримав `TODO(0589-injury-repo): 2026-09-15` у день мержа). Але виріс **дрейф другого порядку**:

| Барель / файл                                       | Стан                                                  | Проблема                                                                                                                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/fizruk/lib/injuryRepository.ts`            | scaffold ADR-0083, дедлайн 2026-09-15                 | ОК — нічого до дедлайну                                                                                                                                                                             |
| `modules/{finyk,fizruk,nutrition,routine}/index.ts` | 0 споживачів з 2026-04-29                             | finyk-барель сам каже «Intentional asymmetry, **not pending work**» — а `@nextStep` при цьому обіцяє крок; узгодити текст (це постійна політика, не борг). fizruk/routine не торкалися ~3.2 міс     |
| `core/errors/index.ts`                              | стагнує ~2.7 міс                                      | За барелем **два повністю мертві екрани**: `ServerErrorPage.tsx` і `OfflinePage.tsx` — 0 прод-імпортів; обіцяне підключення (error boundary + SW fallback) так і не сталося. Підключити або дедлайн |
| `core/profile/index.ts`                             | 0 споживачів (сама `ProfilePage` жива deep-імпортами) | Референс «Tracked in dead-code roast 2026-05-13» — документ прибрано з docs; посилання бите                                                                                                         |
| `shared/lib/insights/index.ts`                      | **маркер описує вже виконаний крок**                  | Обіцяне «wire in PR-8» фактично сталося 2026-05-19, але повз барель (deep-імпорти). Зняти тег; барель видалити або мігрувати імпорти                                                                |
| `core/billing/index.ts`                             | **зворотний false-positive**                          | Носить `@scaffolded` («Once consumers exist, drop this tag») при **живих споживачах барелю** (`HubMainContent.tsx:22`, `HubReports.tsx:22`, `PlanSection.tsx:9`) — тег треба зняти                  |
| `shared/components/ui/ProgressCircle.tsx`           | 0 споживачів                                          | Шапка стверджує «Status: Active» — **маркер бреше** (Hard Rule #10)                                                                                                                                 |

### 4д. Never-wired компоненти (v0-батчі 2026-04-28)

| Компонент                  | Вік                                 | Чому сирота                                                                                                                                                                                                 | Рекомендація                                                      |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ui/AnimatedList.tsx`      | ~99 днів, 0 споживачів з народження | v0-батч «mobile-web parity» (#1060); не показаний навіть у DesignShowcase; без маркерів — Knip не ловить лише завдяки export через барель                                                                   | `@deprecated`+`@removeBy` або підключити                          |
| `ui/KeyboardAccessory.tsx` | з 2026-04-28                        | Єдина згадка — dev-only demo у DesignShowcase/proposals; при цьому тричі інвестували (i18n, touch-targets, типографіка) без появи споживача                                                                 | Рішення власника: підключити до форм швидкого вводу або маркувати |
| `ui/ProgressCircle.tsx`    | з 2026-05-13                        | Дублює живий `ProgressRing`                                                                                                                                                                                 | Злити з `ProgressRing` чи маркувати; виправити «Status: Active»   |
| `ui/OptimizedImage.tsx`    | з 2026-04-28                        | Валідний scaffold («…once we have a CDN/loader story»), але без дедлайну, ~3.2 міс без руху. Історія показова: видалений knip-чисткою 2026-04-29 і відновлений того ж дня комітом-засновником Hard Rule #10 | Дати дедлайн або прив'язку до CDN-ініціативи                      |

### 4е. Активи

- **`apps/web/public/ui-audit.html`** — `dead`: одноразовий v0-мокап «UI Audit — До / Після» (#441, 2026-07-24); нуль посилань у репо, **але `public/` копіюється в прод** — сторінка деплоїться на прод-домен і тягне Google Fonts із зовнішнього хоста (всупереч духу CSP застосунку). Видалити (за потреби — перенести в `docs/05-design/`).
- Ілюстрації `SuccessCelebrationIllustration`, `NoResultsIllustration` — 0 прод-споживачів, але це кураторський DS-набір зі статусом Active — лишити, згадати при DS-аудиті.
- Решта `public/**` (іконки, `.well-known`, robots/sitemap) — false-positive: wired через manifest/vercel.json/конвенції.

## 5. apps/mobile, apps/mobile-shell, apps/landing

### 5а. apps/mobile: ~35 сирітських файлів, ~6 270 LOC

Import-граф від коренів expo-router: 699 файлів, 46 роутів, 482 досяжні. Навігація здорова — всі 5 модулів (finyk 7 роутів, fizruk 12, nutrition 8, routine 3, hub) змонтовані. Сироти концентруються в чотирьох кластерах:

**(1) UI-kit «на виріст» — 83% сирітського обсягу (~5 225 LOC).** З каталогу примітивів реально імпортуються 11 (Button 54×, Card 49×, Toast, Sheet, Input, SectionHeading, BackButton, SwipeToAction, ConfirmDialog, VoiceMicButton, EmptyState). **Нуль споживачів** у: `FloatingActionButton` (550 LOC), `CoachTip` (439), `AnimatedCheckbox` (405), `ProgressIndicator` (389), `ProgressRing` (384), `Tooltip` (377), `StreakFlame` (350), `Badge` (280), `Tabs` (247), `KeyboardAccessory` (228), `ListItem` (213), `AnimatedCounter` (188), `LoadingOverlay` (187), `FormField` (173), `Stat` (120), `Banner` (74), `PageSkeleton` (271), `OfflineBanner` (156; глобальний offline-банер ніде не змонтований — дешевий win: змонтувати в root `_layout` або видалити). Сам барель `ui/index.ts` **ніким не імпортується** (єдина згадка `@/components/ui` — його власний docstring). Рекомендація: пакетне видалення або свідоме підключення; передумова — зняти маску `src/**`-entry в `knip.json`, інакше кластер виросте знову.

> **Пастка для того, хто чиститиме:** перевіряти треба саме `import`-стейтменти, а не голий `grep` по імені. Наївний пошук `Tabs` дає збіг у `app/(tabs)/_layout.tsx` — але це `import { Tabs } from "expo-router"`, зовсім інший `Tabs`; плюс сам `(tabs)`-сегмент роутера в шляхах. Так само `OfflineBanner` «знаходиться» в `sync/hook/useSyncStatus.ts:12`, де він лише згаданий у коментарі. Обидва — сироти; поіменний греп сказав би протилежне.

**(2) Заглушки, пережиті реальними екранами** (`legacy-replaced`, видалити): `modules/finyk/pages/PageStub.tsx` («until real content is ported» — всі 4 роути вже монтують реальні сторінки; docstring ще й посилається на видалений `ModuleStub`), `modules/fizruk/pages/PagePlaceholder.tsx` (всі 12 fizruk-роутів реальні), `modules/routine/components/RoutineTabPlaceholder.tsx` (+тест), `modules/finyk/components/TxListItem.tsx` (+тест; екран приземлився через `TransactionsFeedItem`), `modules/fizruk/FizrukApp.tsx` (33-рядковий re-export «для 1:1 назв із web», роут імпортує `pages/Dashboard` напряму), `modules/fizruk/shell/fizrukNav.ts` (каталог bottom-nav під консюмера, якого не створили).

**(3) Порти з web, які не домонтували** (`never-wired`): `core/onboarding/SplashStep.tsx` + `VibeChipRow.tsx` — порт web-компонента, **якого у web уже не існує** (web перейшов на WelcomeOneScreen/GoalFirstScreen; джерело порту видалене — видалити), `core/onboarding/ModuleChecklist.tsx`, `core/hub/search/searchCache.ts` (портована перф-оптимізація, не викликана в `performSearch` — підключити або видалити), `hooks/useScreenReader.ts`, барелі `hooks/index.ts`, `lib/voice/index.ts`, `sync/index.ts`, `fizruk/components/progress/index.ts` (усі споживачі ходять deep-шляхами).

**(4) Scaffold із битим референсом:** `modules/fizruk/hooks/usePlanTemplate.ts` — повністю підключений до SQLite/dual-write, бракує лише UI-споживача; лишити, але додати `@scaffolded` і виправити посилання на неіснуючий `docs/planning/storage-roadmap.md`.

**Процесний корінь:** knip осліплений (`src/**` як entry) **плюс** jest mobile виключений з основного CI (`test:ci` фільтрує `!@sergeant/mobile`) — єдиний dead-code-гейт репо фізично не бачить цього кластера.

**Парність web↔mobile:** усі 5 модулів мають mobile-відповідник у навігації. Док `platforms.md` відстав у песимістичний бік (рядок Фінік «RN рендерить лише Overview» — застарів: transactions/budgets/analytics/assets уже реальні, є e2e). Справжні never-started гепи (без заглушок, не сироти): підключення банку, billing/Pricing, Strategy, whatsNew, legal, DesignShowcase.

### 5б. apps/mobile-shell — false-positive (це не legacy)

Гіпотеза «shell застарів відносно apps/mobile» **інвертована документами**: [ADR-0052] (Accepted 2026-05-06) — Capacitor shell = **primary mobile product** (у сторі), Expo/RN — паралельний трек до feature parity (тригер ≥18/22 ✅ у `platforms.md`). Shell живий: 4 CI-воркфлоу (debug/release Android + iOS/TestFlight), unit-тести в основній CI-матриці, web споживає адаптери динамічними імпортами за `isCapacitor()` (`main.tsx:289`, `bearerToken.ts:37`, `pushNative.ts`, `useBarcodeScanner.ts:55`). Дві косметичні знахідки: `apps/mobile-shell/src/platform.ts` — test-only експорт (web бере `isCapacitor` із `@sergeant/shared`) — видалити або задокументувати; README декларує ширші CI-тригери, ніж фактичний workflow (doc-drift).

### 5в. apps/landing — чистий

Vite + React (не Next), 17 файлів, повністю підключений граф; сиротілих сторінок/секцій нуль. `apps/landing/scripts/generate-og.mjs` — false-positive (свідомо не в білді: og.png закомічений, скрипт — для відтворення). Єдиний залишок — стейл knip-entry `middleware.ts` (§ 1).

### 5г. Спільні пакети очима mobile

Всі заявлені workspace-залежності реально імпортуються (shared 147×, api-client 94×, fizruk-domain 86×, db-schema 85×, finyk-domain 60×, routine-domain 40×, nutrition-domain 37×, dualwrite-core 13×, design-tokens 7×), **крім `@sergeant/insights` — 1 імпорт** (лише recents-хелпери). Пакет задекларований як «DOM-free пошук для web і майбутнього mobile», але mobile-пошук реалізований локально (`useSearchEngine` → власний `performSearch`). Мігрувати mobile-search на insights-ядро або зафіксувати в README пакета фактичний обсяг споживання.

## 6. Пакети, скрипти, tools, CI, конфіги

### 6а. Пакети — сиріт немає (0 з 12)

Усі 12 пакетів мають реальних імпортерів. Три гіпотези завдання спростовані фактами:

- **`dualwrite-core` — ера НЕ закінчилась.** 15 імпортерів у web, 13 у mobile; [ADR-0073](../../04-governance/adr/0073-dualwrite-generic-framework.md) робить його canonical-ядром 4 SQLite-writer пайплайнів. «Phase 5 teardown» прибрав лише старий web-shim, не ядро.
- **`insights` — компактний, але живий:** усі три гілки барелю споживаються (`search` → hubSearchEngine/hubSearchRecents, `Recommendations` → recommendationEngine + financeContext, `activation` → useActivationV2). Єдине зауваження — асиметрія mobile (§ 5г).
- **`eslint-plugin-sergeant-design` — false-positive:** нуль ES-імпортів, але підключений строкою в 7 flat-конфігах, а його тести — обов'язкова ланка `pnpm lint`.

Решта (shared 249 імпортерів у web, fizruk-domain 112, finyk-domain 106, db-schema, api-client, routine/nutrition-domain, design-tokens, config) — активні без застережень.

### 6б. Скрипти: три сироти з одного коміту

**Спільний корінь:** коміт `cc2bdae2e` (2026-07-30, ADR-0082) видалив 38 workflow-файлів, але **лишив скрипти, які ті workflow викликали**. Класичний односторонній decommission.

| Скрипт                                                                                 | Класифікація                   | Чому осиротів                                                                                                                                                                                                                                               | Рекомендація                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `scripts/flaky-tests/` (aggregate.mjs + .test.ts + vitest.config.ts)                   | `legacy-replaced`              | Єдиний викликач — `flaky-tests-dashboard.yml`, видалений ADR-0082 §4 (amendment його не відновлює); `mobile-flaky-verify.yml` цей скрипт не використовує                                                                                                    | Видалити папку                                                                             |
| `scripts/report-shell-tax.mjs` <!-- removed -->                                        | `legacy-replaced`              | Викликач `shell-tax-report.yml` видалений; при цьому предмет живий — sunset ADR-0010 (T₂ 2026-12-30), просто ручний запуск ніде не заплановано                                                                                                              | Рішення власника: видалити або вписати ручний цикл у `docs/02-engineering/mobile/shell.md` |
| `scripts/rag-eval-weekly.mjs` <!-- removed -->                                         | `legacy-replaced`              | Планувальник `rag-quality-gate.yml` (працював у mock-режимі) видалений; лишився ручний `pnpm eval:rag:weekly`                                                                                                                                               | Видалити разом із мертвим n8n-тригером (6г) або перевести на живий виклик                  |
| `scripts/__tests__/provision-cron.test.mjs` <!-- removed -->                           | `dead`                         | Тестує `ops/openclaw/provision-cron.mjs`, видалений 2026-07-20 (ADR-0075) — тест пережив предмет                                                                                                                                                            | Видалити                                                                                   |
| `scripts/check-bundle-size.mjs` <!-- removed --> (+ тест, + аліаси `build:check-size`) | `legacy-replaced`              | Власні gzip-бюджети; canonical enforcement — `size-limit` (brotli) + `ci/check-eager-bundle.mjs`. **Парадокс:** сам скрипт не викликає ніхто, а його unit-тест ганяється в обов'язковому `pnpm lint` (`lint:bundle-size-guard`) — гейт охороняє мертвий код | Видалити скрипт + тест + 2 pnpm-аліаси                                                     |
| `scripts/audits/validate-user-story-ledger.mjs` <!-- removed -->                       | `never-wired`                  | Валідатор `user-story-ledger.csv` (csv існує), але жоден package.json/CI/doc його не кличе                                                                                                                                                                  | Wire у lint-ланцюг або видалити                                                            |
| `scripts/archive-module-data-partitions.sh` <!-- removed -->                           | `never-wired`                  | Детач+дамп партицій `module_data` (Stage 6 storage-roadmap); ні викликів, ні згадок у runbook-ах — при тому що сама `module_data` дропнута в 046                                                                                                            | Залінкувати з operations-runbook або видалити                                              |
| `scripts/ci/vitest.config.mjs` <!-- removed -->                                        | `never-wired`                  | `@scaffolded` з `@nextStep` «wire у ci.yml»; nextStep посилається на `posthog-release-annotation.test.mjs`, **видалений ADR-0082 §2** — маркер описує неможливий крок                                                                                       | Оновити nextStep (лишився тільки pipeline-duration-p95.test) або видалити                  |
| `scripts/docs/backfill-adr-freshness.mjs` <!-- removed -->                             | `one-shot-done`                | Власний хедер: «Запускати один раз… після rebump скрипт можна видалити»                                                                                                                                                                                     | Виконати власний `@nextStep`                                                               |
| `scripts/codemods/strip-js-extensions/`                                                | `one-shot-done` (за політикою) | `@deprecated` + `@removeBy 2026-09-01` — зразкове маркування                                                                                                                                                                                                | ✅ Видалено 2026-09-03 (гілка `claude/repo-tasks-blockers-status-wngp4o`)                  |
| `scripts/codemods/i18n-burndown/`                                                      | `intentional`                  | Хедер прямо: «re-runnable burndown codemod (NOT one-shot)»                                                                                                                                                                                                  | Лишити                                                                                     |

**Системна прогалина:** ~30 тест-файлів у `scripts/**` і `tools/**` **не запускає жоден runner** — `scripts/` не є pnpm-workspace, а `node --test` у CI wired адресно (13 тестів + 3 глоби). Не ганяються, зокрема, тести `replay-dlq`, `replay-webhook`, `ai-memory-backfill`, `strict-coverage`, `db-index-audit`, `lint-migrations`, 10× `check-*`, `ci/audit-exceptions`, `ci/pipeline-duration-p95`, `docs/bump-last-validated`, `tools/tsconfig-guard/__tests__/check.test.mjs`. Це не сироти в сенсі мертвого коду — це **написані й покинуті тести**, що створюють ілюзію покриття. Фікс — один job `node --test scripts/**` або vitest-project для `scripts/`.

**pnpm-аліаси-сироти в root:** `build:check-size`, `ai-legacy:dashboard`, `dedupe:check` (CI інлайнить `pnpm dedupe --check`), `eval:skills:test`, `eval:playbooks:test`, `harness:bench:test` — визначені, ніким не викликаються.

Ручні ops/growth-скрипти (`billing/grant-beta-pro`, `telegram/*`, `seed-strategic-goals`, `replay-webhook`, `replay-dlq`, `ai-memory-backfill`, `posthog/import-founder-pulse`, `db-index-audit`, `n8n/n8n-workflows` та ін.) — **не сироти**: кожен залінкований із playbook/runbook. Так само `dualwrite-residue.ts` і `eslint-print-config-diff.mjs` — документовані ручні цикли, але обидва варті CI-wiring (§ 1).

### 6в. Tools — чисто

`tools/agent-snapshot/snapshot.mjs` (обов'язковий §0.1 стартового скіла) і `tools/tsconfig-guard/check.mjs` (у `pnpm lint`) живі. `tools/entropy-janitors` видалено чисто за ADR-0081 §3 — залишків у чекауті нема. Єдине — тест tsconfig-guard не запускається (див. прогалину вище).

### 6г. CI — здоровіший, ніж очікувалось

27 workflow-файлів: **0 посилань на неіснуючі скрипти** (усі 15 referenced-шляхів існують), **0 `if: false`**, 0 disabled. Retired-и ADR-0082 видалені начисто — сироти лишились тільки на боці `scripts/` (вище) і n8n (нижче). Два випадки, що виглядають підозріло, але навмисні:

- `mutation-testing.yml` — видалений 2026-07-30 і **відновлений 2026-08-02** (`1c2fbd2a6`) за amendment до ADR-0082 на прямий запит founder-а.
- `docs-daily-brief.yml` — dispatch-only; cron знято свідомо 2026-07-09 із застереженням у файлі «Do NOT re-add `schedule:` without an explicit maintainer decision».

**Єдиний активний мертвий тригер у репо:** `ops/n8n-workflows/29-rag-eval-weekly-cron.json` — щопонеділка о 06:00 Kyiv б'є `workflow_dispatch` по `rag-quality-gate.yml`, якого не існує з 2026-07-30. Один із 26 n8n-воркфлоу, що посилається на неіснуючий GH-workflow → щотижнева тиха 404. Деактивувати в n8n і прибрати з репо.

### 6д. Конфіги

| Сутність                                                   | Стан                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.codex/` (21 файл = 19 agents + config.toml + hooks.json) | ✅ узгоджений з AGENTS.md; `pnpm codex:status` відпрацьовує, бачить 23 repo-skills                                                                                                                                                            |
| `.kilo/harness-versions.json`                              | ✅ current 3.0.1, 19 versions, `abExperiments: {}` — рівно як після зняття A/B (ADR-0082)                                                                                                                                                     |
| `patches/@expo__cli@0.22.28.patch`                         | ✅ актуальний — версія збігається зі встановленою, гейт `lint:patches` у lint-ланцюзі                                                                                                                                                         |
| `turbo.json`                                               | ✅ усі 6 tasks викликаються                                                                                                                                                                                                                   |
| `docker-compose.yml`                                       | живий (`pnpm db:up`), але коментар досі перелічує `visual-regression.yml` серед воркфлоу з тим самим SHA — файл видалено ADR-0082                                                                                                             |
| `.github/dependabot.yml`                                   | живий; коментар посилається на `dependabot-automerge.yml`, видалений ADR-0082 §3                                                                                                                                                              |
| `ops/scripts/backup-n8n-db.ps1`, `restore-n8n-db.ps1`      | `dead` (ймовірно `legacy-replaced`): PowerShell-скрипти від 2026-04-29, жодної згадки в docs/runbook-ах; бекап n8n нині покритий n8n-воркфлоу `04-daily-backup-verification.json` + `db-backup-verify.yml`. Підтвердити у власника й видалити |

### 6е. Осиротілий deploy-таргет: четвертий Vercel-проєкт

Знайдено в CI цього PR, тож фіксую тут — це єдина сирота, що живе **не в репо**, а в зовнішньому сервісі, і тому невидима для будь-якого локального інструмента.

До репозиторію під'єднані **чотири** Vercel-проєкти, а не три. Три очікувані належать команді `skords-01s-projects` і мають коректний `rootDirectory` — `sergeant` (→ `apps/web`), `sergeant-landing` (→ `apps/landing`), `beta` (→ `apps/web`); на docs-only комітах вони справно дають `Ignored`. Четвертий — теж на ім'я `sergeant`, але в **іншій команді** (`robotwildmoose-3254s-projects`), з `rootDirectory: null` і міткою `v0: true`, тобто збирається з кореня монорепо і **падає на кожному коміті** незалежно від змісту.

Класифікація: `never-wired` (створений, ймовірно, автоматично через v0.app і не доведений до робочого стану). Докази, що це не наслідок конкретних змін: він упав однаково на PR [#629](https://github.com/Skords-01/Sergeant/pull/629) (уже в `main`) і на кожному з чотирьох комітів цієї гілки, тоді як три «справжні» проєкти на тих самих комітах були `Ready`/`Ignored`.

Ціна не нульова: постійно червоний обов'язковий статус `Vercel – sergeant` привчає ігнорувати червоне на PR — те саме «червоний завжди = гейт вимкнено», що вже описано в AGENTS.md про бандл-бюджети. Плюс кожен коміт запускає марну збірку.

**Рекомендація:** від'єднати проєкт від репозиторію в налаштуваннях Vercel або задати йому `rootDirectory`. Дія — поза репо, у Vercel-дашборді; кодом це не лікується.
| `ops/grafana-alloy/`, `ops/prometheus/`, `ops/grafana/`, `ops/posthog/` | ✅ живі (деплой поза CI через Coolify; posthog-манифести гейтяться `lint:posthog-manifests`) |
| `.mcp.json` | ✅ github / postgres / codebase-memory — canonical discovery-шлях ADR-0081 §1 |

## 7. Невикористані експорти (28) — сліпа зона `exclude: ["exports"]`

`knip --include exports` дає 28 символів. Перевірено по import-графу (`import`-стейтменти, не голий греп): **реальних імпортерів нуль в усіх**. Два «збіги», що спершу виглядали як споживачі, виявились хибними — рядок про `SectionHeader` є коментарем у самому файлі, а обидва `createDocument` — це імпорти однойменної функції з пакета `zod-openapi`, не локального експорту.

Два з цих 28 — не прибирання, а **незакриті контури**; решта розкладається на чотири буденні класи.

### 7а. `getFreshSessionUser` — security-хелпер, написаний і не підключений

`apps/server/src/auth.ts:761`. Це резолв сесії в обхід 5-хвилинного `session.cookieCache`, щоб **відкликана сесія переставала проходити негайно, а не за кеш-вікно**. Його docstring сам називає поверхні, заради яких він існує: «повний експорт даних, видалення акаунта, привʼязка банку».

Жодна з них його не викликає. `/api/me/export` і `DELETE /api/me` йдуть через `requireSession()` → `getSessionUser()`, тобто **кешований** варіант (`routes/me.ts:48` це прямо документує). Отже на трьох найчутливіших поверхнях відкликаний або вкрадений сеанс лишається робочим до 5 хвилин — рівно те вікно, яке цей хелпер мав закрити. Класифікація: `never-wired`, але рекомендація — **підключити, а не видаляти**.

✅ **Підключено 2026-09-03.** Новий middleware `requireFreshSession()` (`http/requireSession.ts`, спільна фабрика з `requireSession()`, той самий 401/500-контракт і CORP=same-origin) резолвить сесію через `getFreshSessionUser`. Стоїть на `GET /api/me/export`, `DELETE /api/me`, `POST /api/mono/connect|disconnect`, `POST /api/privat/connect|disconnect`; решта роутів лишається на кешованому варіанті. Тести stale-сесії (кеш живий, у БД відкликано → 401; `GET /api/me` як контроль → 200): `routes/fresh-session.route.test.ts`, `http/requireSession.test.ts`.

### 7б. `syncConflictsTotal` — метрика, яку ніхто не інкрементує

`apps/server/src/obs/metrics/domain.ts:244` — Prometheus `Counter`, реекспортований через `metrics.ts:37` і на цьому все: жодного `.inc()` у кодовій базі. Метрика присутня у `/metrics` і назавжди дорівнює нулю, тож будь-який дашборд чи алерт на конфлікти синхронізації показує «конфліктів не було» — не тому що їх нема, а тому що їх не рахують. `metric-defined-never-incremented`: або інкрементувати в conflict-гілці `syncV2-core`, або прибрати, щоб не створювати оманливого сигналу.

### 7в. Тест-хелпери, яких не використовують навіть тести (5)

`__resetCounterpartyNamesCache` (`lib/counterpartyNames.ts:48`), `__resetToolsPayloadCache` (`modules/chat/promptCache.ts:238`), `__test__` (`modules/mono/crypto.ts:158`), `__resetForTests` (`core/observability/posthog.ts:207`), `__PLAN_SECTION_PORTAL_UNAVAILABLE` (`core/settings/PlanSection.tsx:252`). Конвенція `__`-префікса означає «експортовано лише заради тестів» — але імпортерів нуль і серед тестів, тобто подвійні сироти: публічна поверхня, розкрита заради споживача, який не з'явився (або зник разом зі своїм тестом). _Застереження:_ якщо якийсь тест дістає їх через namespace-імпорт (`import * as …`) чи `vi.mock`, import-граф цього не побачить — перед видаленням прогнати відповідний тест-файл.

### 7г. Другого порядку — експорти всередині вже мертвих компонентів (5)

`WEIGHT_CHIPS_KG`, `REP_CHIPS`, `WATER_CHIPS_ML` (`ui/KeyboardAccessory.tsx:137,148,157`) живуть у компоненті, який сам never-wired (§ 4д) — вони осиротіли не окремо, а разом із ним. Так само `default`-експорт `StrategyPage.tsx:330` мертвий тому, що мертва вся сторінка (§ 4а), і `SectionHeader` (`ui/SectionHeading.tsx:223`) — alias, доданий «щоб споживачі могли імпортувати `SectionHeader`», яким жоден споживач не скористався. Доля цих п'яти вирішується разом із їхніми носіями, окремих рішень не потребує.

### 7д. Решта: дизайн-система й дрібний осад (16)

`SkeletonHeroCard` (`ui/Skeleton.tsx:403`), `SliderTicks` (`ui/Slider.tsx:479`), `useScrollParallax` (`shared/hooks/useScrollParallax.ts:35`), `useHubBus` (`shared/lib/modules/hubBus.ts:123`), `useModuleChecklistVisible` (`core/onboarding/ModuleChecklist.tsx:348`), `resetDashboardOrder` (`core/hub/dashboard/dashboardStore.ts:32`), `isRoutineDualWriteRegistered` (`modules/routine/lib/sqliteWriter/index.ts:105`), `NOTE_MAX_LEN` (`shared/lib/text/limits.ts:17`), `pruneOldNotifiedKeys` (`sw/notifiedKeys.ts:124`), `webVitalsApi` (`shared/api/index.ts:59` — той самий wrapper, що й у § 3в), `CLOCK_SKEW_FORWARD_MS` (`modules/sync/syncV2-core.ts:28`), `setTraceId` (`obs/requestContext.ts:54`), `classifyDispatchOutcome` (`email/ftuxDripMail.ts:391`), `createDocument` (`packages/shared/src/openapi/registry.ts:395`), плюс `default`-експорти `HubChatOverlay.tsx:111` і `BackfillProgressPill.tsx:106` (named-варіант — те, що реально споживають; дуальний експорт — усвідомлений стиль репо, тому `duplicates` і виключені в `knip.json`).

Це звичайний «розширив API про запас» — прибирати попутно, коли працюєш у відповідному файлі, окремим PR-ом не варте. Головний висновок § 7 інший: **глобальний `exclude: ["exports"]` у `knip.json` ховає не лише шум, а й такі речі, як 7а і 7б.** Точковий ignore замість категорійного повернув би сигнал, не повертаючи потоку false positives.

## 8. Невикористані типи (16) — сліпа зона `exclude: ["types"]`

`knip --include types`: `GoldenQuery` (`server/lib/ragEval/golden.ts:57`), `ClientDrivenMemorySource` (`ai-memory/ingestRoute.ts:54`), `TgAlertSnoozeDuration` (`alerts/types.ts:34`), `ChatPayloadTool` (`chat/toolSearch.ts:118`), `PoolClient` (`sync/syncV2-core.ts:261`), `IllustrationName` (`web assets/illustrations/index.ts:34`), `HabitState` ×2 (`chatActions/types.routine.ts:82`, `hubChatContext/types.ts:96`), `InfoCache`/`TxCache` (`hubChatContext/types.ts:30,35`), `NutritionDay`/`NutritionPrefs` (`hubChatContext/types.ts:116,120`), `ModuleFirstRunId` (`useModuleFirstRun.ts:51`), `AccountVisualInput` (`finyk/lib/accountVisual.ts:107`), `IdRow` (`finyk/lib/sqliteReader.ts:454`), `Logger` (`shared/lib/log/logger.ts:157`). Нижчий пріоритет, ніж експорти (типи безкоштовні в runtime), але це теж мертва API-поверхня — прибрати попутно з роботою у відповідних файлах.

## 9. Телеметрія: реєстр подій ↔ PostHog prod

Реєстр (`packages/shared/src/lib/analyticsEvents.ts` + `analyticsEvents.valueLoops.ts`): **122 event-константи**. У прод (120 днів SQL по `events`) стріляли **87**. Зворотний дрейф — **0**: жодної події в PostHog поза реєстром (канон «Never inline raw strings» тримається бездоганно). Ніколи не стріляли — **35**, три класи:

### 9а. Placeholder-и без call sites, вік 3+ місяці (10) — справжні never-wired

| Події                                                                                                                                                                                                           | Додані     | Джерело                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `biometric_auth_failed_fallback_pin`, `biometric_auth_success`, `biometric_setup_completed`, `error_boundary_retried`, `module_landing_tab_clicked`, `permission_status_changed`, `permissions_settings_opened` | 2026-05-07 | `f8a4bdefe` «ux-roast 2026-Q2 analytics events» — задекларовані аудитом, не підключені                                                                                                                                      |
| `hubchat_tool_invoked`, `sync_conflict_resolved`                                                                                                                                                                | 2026-04-27 | `6c26d4bbf` — коміт сам каже «+ subscription **placeholders**»                                                                                                                                                              |
| `landing_email_captured`                                                                                                                                                                                        | 2026-05-13 | Лендінг перейшов на Telegram-вейтліст 2026-07-26 (#487) — email-ера скасована; **коментар у `apps/landing/src/lib/analytics.ts` досі обіцяє цю подію** (і політика приватності лендінга перелічує її поіменно — перевірити) |

Рекомендація: видалити з реєстру (або поставити прив'язку до конкретної ініціативи). Реєстр-констант без call site гейтами не ловиться ніяк.

### 9б. Consumer-removed: подія стріляла, споживача видалили, константа лишилась (5)

| Події                                           | Стріляли до | Споживача видалено                                              |
| ----------------------------------------------- | ----------- | --------------------------------------------------------------- |
| `sync_started`, `sync_succeeded`, `sync_failed` | 2026-05-06  | `24bfda9ee` 2026-05-06 «chore(web): remove cloudSync v1 engine» |
| `hint_clicked`, `hint_completed`                | 2026-06-02  | `7b26a8f32` 2026-07-17 «founder feedback remediation (#303)»    |

Рекомендація: видалити константи (плюс `SYNC_CONFLICT_RESOLVED` з 9а — та сама cloudSync-ера).

### 9в. Call sites живі, у прод не досяжні (~20)

Здебільшого — **навмисно pre-wired** під незапущені поверхні: білінг-кластер (`checkout_opened`, `payment_failed`, `subscription_started/renewed/canceled`, `waitlist_submitted` — воронка pricing), permissions (`permission_requested/granted/denied`), PWA-встановлення (`pwa_install_accepted`, `pwa_installed`), `mono_token_migrated`, `onboarding_skipped`, `activation_v2_hit`, `celebration_shown`, `streak_milestone_reached`, `value_signal_dismissed`, `whats_new_cta_clicked`, `error_boundary_request_id_copied`; свіжі (#589, 2026-08-02, чекати): `fizruk_rest_timer_done`, `fizruk_workout_discarded`. Це не сироти — але список варто тримати як «інструментація, що чекає фічу».

Аномалії, варті перевірки інструментації (подія-пара стріляє, а ця — ні): **`feedback_submitted`** (widget_opened 8×, submitted 0 — або ніхто не досилає, або зламаний сабміт), **`hubchat_response_received`** (див. сайдбар нижче), **`fizruk_injury_marked`** (`fizruk_injury_cleared` стріляє 2×, а mark — жодного: clear без mark), `app_lock_unlock_failed` (success 30×).

### 9г. Dormant-кластери: стріляли, мовчать 1.5+ місяця

| Кластер                                                                                                                                                                                                                   | Last seen   | Що сталося                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Онбординг v1: `onboarding_started`, `onboarding_step_viewed/completed`, `onboarding_goal_set`, `onboarding_goal_first_shown/picked`, `ftux_preset_picked`, `experiment_exposed`, `daily_nudge_action`, `auth_after_value` | ≤2026-05-19 | Флоу замінено v2 (`onboarding_first_action_*`, `vibe_picked` — живі). Call site `ONBOARDING_STARTED` досі в `useOnboardingWizardState.ts:178` — **код wizard-а живий, потік недосяжний або вкрай рідкісний**; вирішити, чи wizard v1 ще потрібен |
| `bank_connect_started/success`                                                                                                                                                                                            | 2026-05-01  | Клієнтський bank-connect флоу заглух (mono переїхав на webhook/сервер); константи і call sites — ревізувати                                                                                                                                      |
| `whats_new_shown/dismissed`                                                                                                                                                                                               | 2026-06-16  | What's-new мовчить 1.5 міс (`whats_new_cta_clicked` — ніколи); фіча жива, але контент не публікується?                                                                                                                                           |
| `hint_shown/dismissed`                                                                                                                                                                                                    | 2026-07-16  | Наступного дня (#303, 2026-07-17) хінти утилізовані founder-remediation — консистентно з 9б                                                                                                                                                      |

### Сайдбар (поза скоупом аудиту, але критично)

Прод-числа 2026-07-31…08-05: `hubchat_message_sent` = 6, `hubchat_error` = 6, `hubchat_response_received` = **0** — тобто **жодна відправка в HubChat не дійшла до відповіді**.

Перевірено, що це не артефакт телеметрії: `HUBCHAT_RESPONSE_RECEIVED` має живий емітер (`core/hub/chat/useChatSend.ts:604`) і покритий тестом `useChatSend.telemetry.test.tsx`. Розбивка помилок за `kind` не лишає місця для доброякісного пояснення — усі 6 подій це `kind: "http"`, жодного `aborted` (користувач пішов) чи `parse`:

| kind   | n   | first_seen | last_seen  |
| ------ | --- | ---------- | ---------- |
| `http` | 6   | 2026-07-31 | 2026-08-05 |

Це не сирота, а живий прод-інцидент у флагманській AI-фічі, який триває тиждень бети. Розбирати окремо від cleanup-роботи.

**Перетин із паралельним аудитом — врахувати перед діагностикою.** Того ж дня у `main` приїхав [`ai-abuse-2026-08-05.md`](./ai-abuse-2026-08-05.md) (PR #629), який серед іншого **додав `requireSession()` до `/api/chat`**. Наведені вище прод-числа зібрані **до** цієї зміни, тож вони її не відображають. Для того, хто візьметься за розслідування, це працює в обидва боки: причину 6/6 `http` треба шукати в стані ДО фіксу, а свіжу телеметрію після нього читати вже як інший режим — і окремо перевірити, що новий session-гейт не перетворив ці помилки на 401 для анонімних користувачів, яким HubChat у беті доступний (сам конфлікт трактувань «анонім у AI-чаті: навмисно чи ні» зафіксований у тому аудиті проти [`web-qa-pre-beta.md`](https://github.com/SkOrDs-02/sergeant/blob/d8a478b6e61ed57669aa86129433bd5cf69166f1/docs/90-work/audits/web-qa-pre-beta.md) і не вирішений).

## 10. `.telemetry/` і аналітичний state

- Задум: state-as-files від skill pack `product-tracking-*` — **жодного з 8 названих скілів нема в `.agents/skills/`** (жили в глобальному конфігу харнесу поза репо). Каталог осиротів від свого генератора.
- `current-state.yaml`: знімок 2026-05-17 («catalog_size: 94, live: 94, orphaned: 0») — реєстр з того часу виріс до 122, фактичних never-fired 35 (§ 9). Знімок відстав на ~3 місяці і суперечить сьогоднішнім фактам.
- README самого каталогу позначає `product.md`/`delta.md`/`instrument.md` як «(future)», хоча файли вже існують.
- Рекомендація: або повторний прогін аудиту аналітики (якщо skill pack ще доступний власнику), або зафіксувати каталог як Reference зі стелею дати, щоб не вводив в оману.

## 11. Чому так стається (root causes)

1. **Інфраструктура «на виріст» під плани, які не відбулись.** Найбільший клас: 17 таблиць + 5 internal-роутів під n8n WF-50…93, з яких створили лише 2 воркфлоу; strategic mode із серверною вертикаллю без UI; Apple IAP під відкладений App Store. Патерн: буд-мо чекаючи фічу → фіча зсувається → заділ висить без дедлайна.
2. **v0/AI-батчі UI-компонентів.** Обидва найбільші кластери never-wired компонентів (web 2026-04-28 «mobile-web parity», mobile UI-kit ~2026-07) — згенеровані пакетами «на майбутнє», підключені вибірково. Причому в непідключені компоненти продовжують інвестувати механічні свіпи (i18n, touch-targets, типографіка) — доглянуті сироти виглядають живими.
3. **Decommission односторонній: зносять споживача, лишають того, кого він викликав.** Це найпродуктивніше джерело сиріт після п.1 і воно повторилось тричі поспіль. ADR-0075 (OpenClaw) видалив ~200 файлів коду — лишились 5 таблиць, читач-сирота `openclaw_mute_state`, **15 internal-роутів**, тест `provision-cron.test.mjs` і два правила семплінгу в Sentry. ADR-0082 одним комітом `cc2bdae2e` видалив 38 workflow-файлів — лишились **3 скрипти**, які ті workflow викликали, і живий n8n-крон, що досі щопонеділка стукає у видалений `rag-quality-gate.yml`. Хвиля прибирання зупиняється на межі свого шару: workflow ≠ скрипт, бот ≠ роут, код ≠ міграція.
4. **Гейт може охороняти мертве.** Побічний ефект попереднього: тест переживає предмет і починає видавати мертвий код за живий. `lint:bundle-size-guard` — обов'язкова ланка `pnpm lint` — тестує `check-bundle-size.mjs`, який не викликає ніхто (canonical бюджети рахує `size-limit`); `sentry-sampler.test.ts` асертить правила для двох неіснуючих шляхів; 4 тести `FinykSection*` мокають `privat.balanceFinal`, якого компонент не викликає; контракт-тест `DELETE /api/me` проходить — ендпоінт справний, тому ніщо не сигналізувало, що живий UI ним не користується. Симетрично: ~30 тестів у `scripts/`/`tools/` не запускає жоден runner — покриття, якого нема.
5. **Registry-first телеметрія без зворотного прибирання.** Політика «спершу константа в реєстрі» працює ідеально в бік запису (0 inline-подій у проді), але немає симетричного кроку «видалив call site → видали константу» (cloudSync v1, hints) і «задекларував в аудиті → підключи або зітри» (ux-roast батч 2026-05-07).
6. **Гейти з масками.** `knip.json` вимикає `exports`/`types` цілком (а не точково), оголошує mobile `src/**` entry-ями, тримає stale-записи (`middleware.ts`); `check:dualwrite-residue` не в CI; `check-schema-drift.mjs` легалізує таблиці-сироти через allowlist; `api:check-openapi` звіряє spec із власним джерелом, а не з router-графом, тож 16 незадокументованих шляхів для нього невидимі. Кожна маска колись була прагматичною; сукупно вони й утворюють сліпі зони цього аудиту.
7. **Shallow-історія ускладнює форензику.** Поточні сесійні клони shallow — датування сиріт вимагає GitHub API або хедерів; це варто пам'ятати при наступних аудитах.

**Спільний знаменник п.1, 3 і 5** — асиметрія кроків: підключити щось коштує один PR, від'єднати — теж один, а от «прибрати за собою з іншого боку межі» не належить нікому і не має гейта. Саме тому найдешевша системна дія — не разове видалення, а два-три checklist-рядки в decommission-практиці (знести споживача → пройти його викликами) і зняття масок із § 1.

## 12. Пріоритезований план дій

Окремими PR-ами за класами боргу (політика `sergeant-tech-debt`); перед будь-яким видаленням — lifecycle-guard із playbook (`@scaffolded` не чіпати, < 90 днів — маркувати, не видаляти).

| Пріоритет                            | Дія                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Обсяг                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **P0 — не сироти, а розриви**        | 1) Розібрати HubChat: 6/6 відправок падають з `kind: "http"`, 0 відповідей за тиждень бети (§ 9); 2) ✅ 2026-09-03 — хук `beforeDelete` у Better Auth виконує `deleteUserData` (з `notifyProvidersCancel` усередині) — до цього видалений акаунт продовжував оплачуватись (§ 3); 3) ✅ 2026-09-03 — `getFreshSessionUser` підключено через `requireFreshSession()` до `/api/me/export`, видалення акаунта й привʼязки банку (§ 7а); 4) інкрементувати або прибрати `syncConflictsTotal` (§ 7б); 5) перевірити в Coolify ротацію секрету Mono-вебхука (§ 3); 6) перевірити інструментацію пар `feedback_submitted` / `fizruk_injury_marked` | розслідування й точкові фікси, не cleanup |
| P1 (гейти — найдешевша системна дія) | Зняти маску mobile у `knip.json` (entry лише `app/**`), прибрати stale `middleware.ts`-entry; підключити `check:dualwrite-residue` до CI; один job `node --test scripts/**` для ~30 непрогонюваних тестів; деактивувати мертвий n8n-крон `29-rag-eval-weekly-cron.json`; розглянути точкові ignore замість глобального exclude `exports`                                                                                                                                                                                                                                                                                                   | 1–2 config-PR                             |
| P1 (рішення власника)                | Долі кластерів: strategic mode (wire до дедлайна чи в архів — UI + 6 роутів + `strategicKeys`), SEO/growth/marketing/governance (створити WF-* чи two-phase DROP 17 таблиць + 16 роутів), openclaw-осад (keep per ADR-0075 чи гігієнічний DROP-пакет: 5 таблиць + 15 роутів + 2 правила Sentry), `openclaw_mute_state` (новий writer чи задокументувати no-op), `account-recovery` (імплементувати чи зняти контракт-тест)                                                                                                                                                                                                                 | продуктові рішення                        |
| P2 (безпечні видалення)              | `ui-audit.html` з `public/` (деплоїться на прод!); 8 ghost RQ-методів + тести; 6 api-client методів + 10 хуків; mobile-заглушки (PageStub, PagePlaceholder, RoutineTabPlaceholder, TxListItem, FizrukApp, fizrukNav); SplashStep/VibeChipRow; реєстр-константи 9а+9б (15 шт.); 3 скрипти-сироти ADR-0082 + `provision-cron.test.mjs` + `check-bundle-size.mjs` з тестом; `webhook_events` two-phase DROP                                                                                                                                                                                                                                   | 4–5 dead-code PR-ів                       |
| P2 (маркери й доки)                  | Зняти stale `@scaffolded` з `core/billing/index.ts`; виправити «Status: Active» у `ProgressCircle`; узгодити `@nextStep` finyk/insights-барелів і `scripts/ci/vitest.config.mjs` <!-- removed -->; биті референси (profile-барель → roast, `usePlanTemplate` → storage-roadmap); doc-drift коментарі (docker-compose, dependabot, README mobile-shell, REPORTING-MATRIX WF-25); issue-ref до 3 AI-LEGACY маркерів                                                                                                                                                                                                                          | 1 markers-PR                              |
| P3 (backlog)                         | Mobile UI-kit: підключати чи видаляти пакетом (після зняття knip-маски); `OfflineBanner` — дешевий win змонтувати; 16 unused types (§ 8); 16 шляхів без OpenApi-опису; insights-ядро для mobile-search; оновити `platforms.md` (finyk-рядок) і `.telemetry/`; `report-shell-tax` і `.ps1`-бекапи n8n — підтвердити долю у власника                                                                                                                                                                                                                                                                                                         | backlog                                   |

**Порядок має значення:** P1-гейти йдуть перед P2-видаленнями. Інакше mobile UI-kit (найбільший кластер за обсягом) виросте знову — його не бачить жоден інструмент, і саме тому він і виріс.

## Обмеження аудиту

- Жива Postgres-БД недоступна в сесії (`SERGEANT_PG_READONLY_URL` відсутній) — не перевірялись фактичні row counts таблиць-сиріт і дрейф schema↔migrations на проді.
- Динамічні виклики через string-конкатенацію шукались, але гарантії повноти нема (для таблиць — перевірено, конкатенацій не знайдено).
- `packages/*` внутрішні експорти глибоко не тріажились (лише knip-зріз і споживання пакетів як цілого).
- Дати старші за ~2026-07-27 — з хедерів/PR-номерів/GitHub API (shallow clone).
