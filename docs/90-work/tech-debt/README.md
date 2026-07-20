# Технічний борг

> **Last validated:** 2026-07-20 by @cursoragent (post-waves docs sync). **Next review:** 2026-10-18.
> **Status:** Active — живі реєстри: `backend.md` / `frontend.md` / `mobile.md` / `tech-debt-assessment-2026-07-01.md`. Закриті плани у [`archive/`](./archive/).

> **Оновлено 2026-07-20 (post-waves).** Після reconcile [#345](https://github.com/SkOrDs-02/Sergeant/pull/345) агентські хвилі закрили: ManualExpenseSheet [#348](https://github.com/SkOrDs-02/Sergeant/pull/348), TxRow [#350](https://github.com/SkOrDs-02/Sergeant/pull/350), mobile exhaustive-deps catalog [#349](https://github.com/SkOrDs-02/Sergeant/pull/349), Privat body scrub [#347](https://github.com/SkOrDs-02/Sergeant/pull/347), storage-key WHY [#351](https://github.com/SkOrDs-02/Sergeant/pull/351), NotificationsSection Phase 6 [#352](https://github.com/SkOrDs-02/Sergeant/pull/352), non-null burndown [#353](https://github.com/SkOrDs-02/Sergeant/pull/353). Живі реєстри синхронізовано з `main`. Blocked — нижче § «Blocked простими словами».

Living-реєстри технічного боргу.

## Активні

| Документ                                                                     | Опис                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| [`frontend.md`](./frontend.md)                                               | Фронтенд tech-debt (`apps/web`)                   |
| [`backend.md`](./backend.md)                                                 | Бекенд tech-debt (`apps/server` + migrations)     |
| [`mobile.md`](./mobile.md)                                                   | Mobile (`apps/mobile` Expo + `apps/mobile-shell`) |
| [`tech-debt-assessment-2026-07-01.md`](./tech-debt-assessment-2026-07-01.md) | Актуальний burndown / assessment                  |

## Архів

Закриті плани й історичні оцінки — [`archive/`](./archive/) (Batch 2026-07-20, 90-day gate skipped; JSON snapshot доархівовано в тому ж reconcile):

| Документ                                                                               | Опис                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`priority-1-executive.md`](archive/priority-1-executive.md)                           | Зведення P1-спринту (критичний борг)           |
| [`syncV2-engineering-ticket.md`](archive/syncV2-engineering-ticket.md)                 | Тікет: поділ `syncV2.ts`                       |
| [`syncV2-refactor-plan.md`](archive/syncV2-refactor-plan.md)                           | План рефакторингу Stage 2                      |
| [`syncV2-refactor-execution.md`](archive/syncV2-refactor-execution.md)                 | Звіт виконання рефакторингу                    |
| [`technical-assessment-2026-06-05.md`](archive/technical-assessment-2026-06-05.md)     | Історичний аудит 2026-06-05                    |
| [`technical-assessment-2026-06-05.json`](archive/technical-assessment-2026-06-05.json) | Машиночитабельний зріз того ж аудиту           |
| [`express-5-migration-plan.md`](archive/express-5-migration-plan.md)                   | Express 4→5 план (виконано; asyncHandler done) |

Кожен **живий** файл має CI freshness-gate ([`scripts/check-tech-debt-freshness.mjs`](../../../scripts/check-tech-debt-freshness.mjs))
з порогом 60 днів. Маркер `> **Оновлено YYYY-MM-DD.**` у заголовку
треба вручну оновлювати при кожному audit-passе.

## Статус-маркери — що можна брати зараз, а що ні

Щоб заблоковані/«не-готові» таски не плуталися з тими, які можна робити
прямо зараз, кожен **не-actionable** пункт несе явний токен
`🚫 Blocked-reason: <category>`. Actionable-таски токена не мають.

| Category         | Значення                                                                   | Що потрібно для розблокування                                    |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `data-gated`     | Код готовий/частково готовий, але рішення впирається у збір даних з прода. | Накопичити дані (напр. ≥ 7 днів RUM-телеметрії) і прийняти call. |
| `external-infra` | Потрібна провізія в зовнішньому сервісі (Apple/Google/Sentry/Coolify).     | Створити ресурс / виставити секрет поза репо.                    |
| `dep-blocked`    | Чекає на оновлення залежності чи платформи.                                | Бамп блокуючої залежності (напр. Expo SDK).                      |
| `owner-decision` | Потребує архітектурного рішення власника (не механічний фікс).             | Рішення `@Skords-01` (allowlist vs міграція, тригер ініціативи). |
| `by-design`      | Навмисний scaffold / lifecycle-маркер — не видаляти.                       | Дочекатися `@nextStep` / `@removeBy` з маркера файлу.            |

**Знайти всі не-готові таски одразу:**

```bash
grep -rn "Blocked-reason" docs/90-work/tech-debt/
```

Усе, що НЕ потрапило у цей grep, вважається actionable.

## Blocked простими словами

Нижче — усі поточні **blocked** пункти з реєстрів. Агент / PR у коді їх **не закриє сам**: потрібні секрети, рішення власника, нова залежність або тригер інфраструктури.

### 1. Coolify env-var audit trail

- **У чому суть:** у репо є перевірка конфігів деплою (`Dockerfile`, `vercel.json` тощо), але **зміну змінних середовища в Coolify UI** git не бачить. Хтось може ввімкнути `*_DISABLE` / `*_BYPASS` у dashboard — і в репо не залишиться сліду.
- **Який блок:** `owner-decision` — не баг у коді, а проєкт «операційна видимість».
- **Що треба:** рішення власника стартувати ініціативу (після інциденту з env або планового SOC2). Дизайн уже накиданий у `backend.md`: періодичний snapshot env (лише ключі + хеші) → diff → алерт у Slack/Sentry.
- **Варіанти:** (а) cron + Coolify API як у докі; (б) винести секрети в Vault/Doppler (важче); (в) нічого не робити, поки не буде інциденту / аудиту.

### 2. Push APNs / FCM credentials

- **У чому суть:** сервер уже вміє слати push на iOS (APNs) і Android (FCM). Без ключів у Coolify гілки просто вимкнені (`apns_disabled` / `fcm_disabled`) — web-push може працювати окремо.
- **Який блок:** `external-infra` — секрети живуть поза репо (і не повинні туди потрапити).
- **Що треба:** Apple `.p8` + Key/Team/Bundle ID; Firebase service-account JSON (base64) → env у Coolify. Чек-ліст — `backend.md` § Push credentials.
- **Варіанти:** виставити credentials зараз (розблокує native push); лишити no-op до першого App Store / Play релізу.

### 3. Mobile Sentry DSN (M7)

- **У чому суть:** у mobile вже є `initObservability()` / `captureError`. Без `EXPO_PUBLIC_SENTRY_DSN` у EAS Secrets Sentry просто не стартує — помилки з телефонів не збираються.
- **Який блок:** `external-infra`.
- **Що треба:** створити Sentry-проєкт для RN і виставити DSN у Expo EAS Secrets. Код дописувати не треба.
- **Варіанти:** увімкнути зараз; відкласти до стабільного beta-каналу.

### 4. Expo SDK 53 (M9)

- **У чому суть:** mobile на Expo **52** / RN 0.76. Оновлення до 53 — великий platform bump (див. ADR-0063), не «дрібний chore».
- **Який блок:** `dep-blocked`.
- **Що треба:** окремий PR/ініціатива: bump Expo + суміжні пакети + регрес-тести на пристроях. Не змішувати з feature-PR.
- **Варіанти:** тримати 52, поки немає блокуючого API від Expo; або свідомо виділити sprint на M9.

### 5. `sync_op_log` партиціювання

- **У чому суть:** таблиця sync-логів росте; план (ADR-0065) — партиції + fan-out через PG `LISTEN/NOTIFY`, коли з’явиться **кілька інстансів** API.
- **Який блок:** gated на multi-instance trigger (поки один інстанс — пріоритет низький).
- **Що треба:** рішення «йдемо в horizontal scale» → імплементація за ADR-0065.
- **Варіанти:** лишити як є на одному інстансі; або почати retention/архів раніше без повного партиціювання (окреме рішення).

### 6. `OptimizedImage.tsx` «unused»

- **У чому суть:** файл виглядає мертвим, але позначений `@scaffolded` — навмисний каркас під майбутній UX.
- **Який блок:** `by-design`.
- **Що треба:** нічого — **не видаляти**. Дочекатися `@nextStep` / `@removeBy` з маркера файлу.
- **Варіанти:** підключити в UI коли буде задача; або зняти scaffold лише за маркером lifecycle.

### 7. Mobile hub-context Phase 8 (`useChatSend`)

- **У чому суть:** мобільний чат зараз шле `context = ""` (порожній рядок). Серверу це безпечно («немає даних»), але асистент не бачить зведення модулів як на web (`buildContextMeasured`).
- **Який блок:** `owner-decision` — треба вирішити, чи підіймати shared builder з web, чи писати окремий mobile path.
- **Що треба:** архітектурне рішення + Phase 8 implementation.
- **Варіанти:** (а) shared lift web-builder у package; (б) тонкий mobile-only builder; (в) лишити empty context до продуктового пріоритету.

### 8. HubReports billing / WeeklyDigestCard

- **У чому суть:** у mobile Reports є TODO на paywall і на картку тижневого дайджесту. Немає готової mobile entitlement / `PaywallModal` поверхні як на web.
- **Який блок:** `owner-decision` (продукт + UX поверхня).
- **Що треба:** дизайн paywall на mobile + wiring billing flags; окремо — H4 digest card.
- **Варіанти:** тримати `useFlag` gate; портувати web paywall; або відкласти Reports-монетизацію на mobile.

### 9. `exportReport` + `expo-print`

- **У чому суть:** зараз звіт можна поділитися як HTML через `expo-sharing`. «Справжній» PDF потрібен пакет `expo-print`.
- **Який блок:** `dep-blocked` — нова залежність; **не** змішувати з Expo 53 bump.
- **Що треба:** окремий PR: додати `expo-print`, згенерувати PDF, зберегти interim HTML path як fallback.
- **Варіанти:** лишити HTML share; додати print лише коли PDF стане продуктовою вимогою.

### Soft / не blocked, але великі (не плутати з Blocked)

| Пункт                           | Чому не «blocked»                         | Коли брати                         |
| ------------------------------- | ----------------------------------------- | ---------------------------------- |
| UI primitives consolidation     | Можна кодити будь-коли; просто великий PR | Design-цикл / bandwidth            |
| Mobile coverage floor 30→↑      | Не чекає секрету; чекає headroom у CI     | Після стабільного запасу coverage  |
| Подальший `!` / eslint burndown | Opportunistic                             | Поруч з фіксами в тих самих файлах |
