# Глобальна браузерна QA: знахідки

> **Last touched:** 2026-09-04 by @Skords-01. **Next review:** 2026-12-07.
> **Status:** Active

Журнал знахідок прогону за
[`2026-08-04-global-qa-plan.md`](https://github.com/SkOrDs-02/sergeant/blob/77c540d0167180e8a27ca98444be7ed4f576b370/docs/90-work/audits/2026-08-04-global-qa-plan.md).
Середовище: локальний стек (PG16+pgvector 0.8.0, dev:server, dev:web), headless
Chromium. Акаунти A1–A5 створені через UI signup.

## Зведення

| #   | Знахідка                                                                         | Маршрут                   | Severity | Категорія      | Стан           |
| --- | -------------------------------------------------------------------------------- | ------------------------- | -------- | -------------- | -------------- |
| 1   | Інтермітентний фриз рендерера при hard-навігації залогіненого користувача        | `/`, `/finyk/*`, auth     | blocker  | functional     | описано        |
| 2   | Після auth-переходу всі kv_store-записи падають «DB has been closed» до reload   | глобально                 | major    | data-integrity | **виправлено** |
| 3   | Подвійна JSON-серіалізація у jsonb-полях sync-шляху (finyk, fizruk)              | sync v2                   | major    | data-integrity | **виправлено** |
| 4   | Logout не очищає UI: профіль користувача видно після sign-out (сервер вже 401)   | `/profile`                | major    | functional     | **виправлено** |
| 5   | Онбординг-стан не привʼязаний до акаунта: existing user → `/welcome` з демо      | auth-флоу                 | major    | ux             | **виправлено** |
| 6   | Anthropic-401 мапиться у HTTP 401 → UI бреше «Доступ заборонено»                 | `/chat`                   | major    | functional     | **виправлено** |
| 7   | Повернення AI-квоти ламається об check constraint (`23514`) — квота згорає       | server                    | major    | data-integrity | **виправлено** |
| 8   | Deep-link `/finyk/cards` мовчки фолбечиться на «Огляд»                           | `/finyk/cards`            | minor    | functional     | описано        |
| 9   | Після «Завершити» тренування — «Активне тренування не знайдено» замість підсумку | `/fizruk/workout/:id`     | minor    | ux             | описано        |
| 10  | Понадлімітна сума витрати: `aria-invalid` без видимого тексту, submit no-op      | `/finyk`                  | minor    | ux/a11y        | описано        |
| 11  | «Не вдалося отримати план харчування» — без причини і дії                        | `/nutrition/menu`         | minor    | ux-copy        | описано        |
| 12  | Англомовні артефакти: Month/Day/Year, Hours/Minutes/AM/PM, Quick Start, «check»  | profile, settings, fizruk | minor    | ux-copy        | описано        |
| 13  | «перевірте вашу поштову скриньку» — ви-форма всупереч style guide                | `/profile`                | polish   | ux-copy        | описано        |
| 14  | «80 сценаріїв» (`/assistant`) vs «~60 сценаріїв» (`/capabilities`)               | assistant/capabilities    | polish   | ux-copy        | описано        |
| 15  | Подвоєний accessible text у нав-кнопках («ОпераціїОперації»)                     | модулі                    | minor    | a11y           | описано        |
| 16  | `ai-memory/event-sync` спамить 503 при вимкненому AI_MEMORY                      | глобально                 | minor    | perf           | описано        |
| 17  | `send-verification-email` віддає 200 без відправки (RESEND незконфігурований)    | `/profile`                | minor    | functional*    | описано        |
| 18  | Біометрія: date-спінбатони з дефолтними значеннями `0`                           | `/profile`                | polish   | ux             | описано        |

\* env-залежне — потребує звірки на проді.

## Фікс-хвиля 2026-08-04 (знахідки 2, 3, 6, 7)

Виправлено й верифіковано наживо тим самим стеком:

- **2 (kv_store):** `makeSqliteKvStoreClient` тепер перерезолвлює live-handle
  через `getSqliteDb()` на кожен запис і проганяє kv-міграції для свіжої
  партиції. Вериф: логін A2 — **0** ворнінгів «DB has been closed» (було 38);
  диміс банера «Без банку» переживає hard reload.
- **3 (подвійна серіалізація):** `toJsonbParam` пропускає вже серіалізовані
  JSON-обʼєкти/масиви як є; міграція 102 розгорнула існуючі рядки. Вериф:
  стара витрата — `jsonb_typeof='object'`, `->>'amount'` = 347.5; нова
  витрата через UI — одразу object (128.75).
- **6 (chat 401):** `makeAiProviderError` мапить upstream 429→503, решту→502;
  cause несе message. Вериф: POST `/api/chat` → **502**, UI: «Асистент
  тимчасово недоступний. Спробуй пізніше.», лог: `anthropic upstream 401:
invalid x-api-key` (без `[object Object]`).
- **7 (quota refund):** міграція 101 — CHECK `request_count >= 0`. Вериф:
  фейл-запит без `ai_quota_refund_failed`; декремент у 0 проходить.

### Друга хвиля (знахідка 4)

- **4 (logout):** корінь — `navigator.serviceWorker.ready` без стелі
  ([`swControl.ts`](../../../apps/web/src/core/app/swControl.ts)). Без активного
  SW цей await не резолвиться **ніколи**, тож `logout()` вмирав одразу після
  `signOut()`: серверну сесію вбито, а `queryClient.clear()` і редірект уже не
  виконувались. Фікс: `swReady()` зі стелею 2 с + `queryClient.clear()`
  піднято ПЕРЕД best-effort-тірдауном, щоб UI ніколи не залежав від нього.
  Вериф наживо: клік «Вийти» → тост «Ви вийшли з акаунта», редірект геть із
  профілю, імені користувача в DOM немає (0 входжень), `/api/v1/me` → 401.
- **5 (онбординг):** `/welcome` тепер визнаний **анонімною** поверхнею.
  `shouldShowOnboarding()` бачить лише локальний стан, тож рішення для
  залогіненого користувача ухвалює сесія: `HubPage` не редиректить на
  `/welcome`, коли `shell.user` є (і чекає, поки `authLoading` осяде, щоб не
  ухвалити рішення на порожньому `user`), а сам запис `/welcome` у
  `StandaloneRoutes` відбиває залогіненого на `/`. Вериф наживо: очищене
  локальне сховище + логін існуючого A3 → одразу `/` з «Доброго дня, Оля»
  (0 входжень «Це приклад»); deep-link `/welcome` залогіненим → `/`.

---

## Деталі

### 1. Інтермітентний фриз рендерера при hard-навігації (blocker)

**3 репродукції за ~40 хв прогону.** Симптом: після hard-навігації
(`location`-перехід, не SPA) залогіненим користувачем сторінка назавжди лишається
білою — `#root` порожній ≥75 с, головний потік не відповідає (CDP
`Runtime.evaluate` таймаутиться), відновлення немає. CPU при цьому idle — не
busy-loop, схоже на deadlock у boot-послідовності.

- Репро 1: A2, hard reload `/finyk/transactions` одразу після signup→logout→signup ланцюга.
- Репро 2: A3→A4 логаут/логін, навігація `/profile` → `/sign-in`.
- Репро 3: A5, hard-навігація на `/` після серії дій у `/finyk` і `/chat`.

Той самий профіль після рестарту браузера й одного логіну ті самі маршрути
відкриває за ~5 с — фриз недетермінований і корелює з накопиченим станом
kvvfs + кількома auth-переходами (див. знахідку 2). Кожен фриз стається на
кластері сторінок, де в консолі вже сипались `kvStoreBoot`-ворнінги.

Умови середовища: dev-сервер без COOP/COEP → kvvfs поверх localStorage; headless
Chromium. На проді з OPFS шлях інший, але kvvfs — штатний фолбек для будь-якого
не-isolated контексту, тож сценарій реальний.

### 2. kv_store: «DB has been closed» після auth-переходу (major)

Після кожного sign-in / sign-up (і подекуди logout) **усі** подальші upsert-и в
`kv_store` падають з `SQLite3Error: DB has been closed`
([`apps/web/src/core/db/kvStoreBoot.ts:166`](../../../apps/web/src/core/db/kvStoreBoot.ts)) —
аж до hard reload. У чистому профілі одразу після одного логіну — 38 ворнінгів.

Наслідки, підтверджені в прогоні:

- Диміс банера «Без банку — продовжити» не переживає reload — банер повертається.
- Губляться `hub_analytics_log_v1` (analytics ring-buffer), `finyk_quick_stats`,
  `finyk_first_expense_seen_v1`, `sergeant:cross-prompt:*`, `qa_session_count`.

Механізм (підтверджено кодом): при зміні auth-партиції
[`apps/web/src/core/db/sqlite.ts`](../../../apps/web/src/core/db/sqlite.ts)
(≈130–150) скидає singleton і закриває stale handle; нові виклики
`getSqliteDb()` отримують свіжий handle, але довгоживучі writer-и (зокрема
kvStoreBoot-підписники), що захопили старий інстанс, продовжують писати в
закритий handle і не перепідключаються.

### 3. Подвійна JSON-серіалізація у sync-шляху (major)

`jsonb`-поля, які їдуть через `POST /api/v2/sync/push`, зберігаються як
**jsonb-рядок**, а не обʼєкт:

```sql
SELECT jsonb_typeof(data_json) FROM finyk_manual_expenses;  -- 'string'
SELECT jsonb_typeof(groups_json) FROM fizruk_workouts;      -- 'string'
SELECT data_json->>'amount' FROM finyk_manual_expenses;     -- NULL (!)
```

Клієнт-серверний round-trip працює (клієнт парсить рядок назад), але будь-який
серверний консюмер jsonb (аналітика, weekly-digest, coach-контекст, майбутні
SQL-звіти) отримує NULL. `nutrition_meals` не зачеплений — там типізовані
колонки. Корінь: клієнт відправляє `data_json` **уже серіалізованим рядком**
(TEXT-значення з локального SQLite), а
[`toJsonbParam`](../../../apps/server/src/modules/sync/syncV2-core.ts) (syncV2-core.ts:231)
безумовно робить `JSON.stringify(value)` ще раз — рядок загортається в лапки і
стає jsonb-string. Фікс: на сервері parse-if-string перед stringify (плюс
backfill-міграція існуючих рядків), або нормалізувати клієнтський адаптер.

Дотично: `amount: 347.5` зберігається у гривнях з дробом, тоді як домен-інваріант
вимагає мінорні одиниці (копійки) як `number` — звірити з канонами Фініка.

### 4. Logout не очищає UI (major)

Кроки: `/profile` → «Вийти». `POST /api/auth/sign-out` → 200, наступний
`get-session` → порожньо, `/api/v1/me` → 401. Але UI **лишається** на профілі:
привітання «Доброго дня, QA», імʼя, секції профілю — жодного редіректу на
`/sign-in`/`/welcome`, стан не очищено. Користувач вважає себе залогіненим.
Після ручного reload — анонімний Hub.

### 5. Онбординг не привʼязаний до акаунта (major)

Логін **існуючого** користувача (A2 з даними на сервері) на чистому
профілі/пристрої закінчився редіректом на `/welcome`: демо-скрін «Це приклад»,
кнопки «Почати» / «У мене вже є акаунт» (!) — при тому, що юзер щойно увійшов.
Після «Почати» — Hub зі СТАРТ-блоком «Фінік: Додай першу витрату», хоча
sync-pull уже підтягнув 348 ₴ за сьогодні. Поведінка ще й непослідовна: пізніший
логін того ж A2 привів одразу на `/` без `/welcome`.

Окремо: залогіненого користувача з `/sign-in` редіректить на `/welcome`
(анонімний демо-екран) замість `/`.

### 6. Chat: upstream 401 → клієнтський 401 «Доступ заборонено» (major)

З невалідним `ANTHROPIC_API_KEY` Anthropic відповідає 401; сервер
(`module":"chat"`, `code":"ANTHROPIC_ERROR"`) пробрасывает **той самий 401**
клієнту, і UI показує залогіненому користувачу «Помилка: Доступ заборонено.»
Це семантична брехня: користувач думає, що проблема з його акаунтом. Upstream
5xx/401 від AI-провайдера має ставати 502/503 + «Асистент тимчасово
недоступний». Бонус у лог-повідомленні: `…Спробуй пізніше.: [object Object]` —
непроінтерпольований обʼєкт.

### 7. Повернення AI-квоти ламає check constraint (major)

При фейлі Anthropic-виклику сервер робить refund квоти і падає:

```
ai_quota_refund_failed … new row for relation "ai_usage_daily" violates
check constraint "ai_usage_daily_request_count_check" (code 23514)
```

Тобто декремент іде нижче нуля (або UPSERT створює рядок з відʼємним
лічильником) — квота користувача згорає при кожному фейлі провайдера.

### 8–18. Minor / polish

8. `/finyk/cards` рендерить «Огляд» без жодного повідомлення (deep-link з
   тестового набору маршрутів). Або віддавати картки, або 404/redirect.
9. Фізрук: «Завершити» активне тренування залишає користувача на
   `/fizruk/workout/:id` з екраном «Активне тренування не знайдено. Воно вже
   завершене, видалене або ще не завантажилось» — це і є щойно завершене
   тренування; очікується підсумок або перехід у журнал.
10. `СУМА ₴` = `99999999999.99` → submit мовчки не працює; `aria-invalid=true`
    виставляється, але видимого тексту помилки немає (`:r0:-amount-helper`
    порожній). Межа працює: 1 000 000 — ок, «Сума має бути більше 0» для
    відʼємних — ок.
11. Генерація дня в Nutrition без AI-ключа і з порожньою коморою: тост
    «Не вдалося отримати план харчування ×» — без причини і наступного кроку
    (style guide вимагає action-prompt-closed errors).
12. Англомовні артефакти в укр. UI: біометрія — спінбатони «Month/Day/Year»
    (дефолт `0`); налаштування нагадувань — «Hours/Minutes/AM/PM» (та AM/PM у
    24-год локалі Europe/Kyiv); Фізрук — кнопка «Quick Start»; Рутина —
    aria-label «Деталі: check Ранкова зарядка» (сирий тип звички).
13. «Email не підтверджено — перевірте вашу поштову скриньку» — ви-форма;
    style guide `ти`-звертання.
14. `/assistant`: «80 сценаріїв» у хедері; `/capabilities`: «~60 сценаріїв».
15. Нав-кнопки модулів дублюють текст в accessible name («ОпераціїОперації»,
    «ОглядОгляд») — скрінрідер читає двічі.
16. `POST /api/ai-memory/event-sync` регулярно шле запити і отримує 503, коли
    `AI_MEMORY_ENABLED=false` — клієнт має гейтити фічу, а не бомбити сервер.
17. «Надіслати» (verification email) повертає 200 і виглядає успішним без
    налаштованого RESEND — листа немає, фідбеку про це немає (env-залежне).
18. Біометрія: дата народження стартує з `0/0/0` у спінбатонах.

### Спостереження без вердикту

- `GET /api/v1/me` періодично 401 на standalone-сторінках у залогіненому стані
  (можливо, запит без credentials у якомусь層і) — потребує звірки.
- Ім'я з `<script>alert(1)</script>` зберігається на сервері дослівно і
  рендериться безпечно (React escaping). XSS у web немає; перевірити
  екранування у email-шаблонах / PDF-експорті / AI-промптах, куди імʼя
  інтерполюється. Ліміту довжини імені немає.
- Playwright/CDP-кліки часто не тригерять React-хендлери (клік «проходить», але
  обробник не спрацьовує) — у цьому прогоні обходилось DOM-`click()`. Причина не
  зʼясована (headless?); якщо відтворюється у реальних браузерах — це окремий
  великий дефект, але наразі кваліфікується як артефакт автоматизації.

### Що працює добре (перевірено)

- Валідація auth-форм: «Некоректний формат email», «Мінімум 10 символів»,
  індикатор сили пароля; кирилиця/лапки в паролі, емодзі в імені — ок.
- 404-guard: `/some-random-bogus-path`, `/finykfoo`, `/help`, `/coach` → чесна
  404 з CTA.
- Ізоляція даних: A2 не бачить звичок A3 та їжі A4 (перевірено перелогіном).
- Синк на сервер: finyk (`finyk_manual_expenses`), fizruk (`fizruk_workouts`),
  routine (`routine_habits` + `routine_entries`), nutrition (`nutrition_meals`) —
  усі записи доїжджають; **блокер `hab_<uuid>` з прогону 2026-08-02 виправлено**.
- Sync-pull відновлює дані на новому пристрої (348 ₴ після чистого логіну).
- Draft форми витрати переживає закриття модалки.
- Empty states з CTA у всіх модулях; reset-password з простроченим токеном дає
  чесне повідомлення з дією; `/status`, `/legal/*`, `/design` живі.
- Кросс-модульна підказка «Додати прийом їжі з кафе?» після витрати в кафе.

## Read-only код-діагностика (Workflow web-ux-cycle, 64 агенти)

Паралельно з браузерним прогоном фан-аут прочитав код маршрутів `/`, `/finyk`,
`/fizruk`, `/routine`, `/nutrition` і повернув **47 верифікованих знахідок**
(0 critical/high — усі medium/low). Вони доповнюють браузерні: це системні
патерни якості коду, а не окремі падіння. Зведення за патернами:

**Medium (16):**

- **ARIA-семантика без клавіатурної механіки** — `role="menu"` у NotificationBell без фокус-меню (`NotificationBell.tsx:112`), aria-modal без focus-trap у BentoCardPeek (`BentoCard.tsx:446`), `role="radiogroup"` без roving tabindex у HabitForm (`HabitForm.tsx:224`), `role="tablist"` без стрілок у Nutrition SubTabs (`SubTabs.tsx:32`).
- **SR-спам від таймерів** — aria-live оновлюється щосекунди в активному тренуванні (`HeroCard.tsx:295`) і RestTimerOverlay (`RestTimerOverlay.tsx:27`).
- **Клавіатурний reorder сітки модулів захардкоджений на 2 колонки** при 3–4 фактичних (`HubModulesGrid.tsx:37`).
- **Поля без accessible name** — reminder-time у Рутині (`ReminderPresets.tsx:75`), portion/refine у PhotoAnalyzeCard (`PhotoAnalyzeCard.tsx:276`).
- **«Скинути» зносить усі 4 КБЖВ-цілі без підтвердження/undo** (`DailyPlanCard.tsx:241`).
- **Ex-Hard Rule #13, retired ADR-0081 (порушення дизайн-конвенції) на весь модуль Nutrition** — сирі light/dark пари замість токенів (`NutritionHeader.tsx:20`).
- Стейл-копі у delete-confirm Рутини (`HabitDetailSheet.tsx:552`), кліп лейбла «Прогрес і заміри» без ellipsis (`fizrukNav.tsx:45`) — **виправлено 2026-08-08**: підпис вкорочено до «Прогрес» (нижня навігація тримає підпис на `max-w-[88px]`, тобто ≈13 символів; вхід у заміри лишається першою карткою на самій сторінці), плюс `text-ellipsis` у `ModuleBottomNav` як запобіжник проти обриву посеред слова, диміс-контрол зі стрілкою «→» (`InsightCard.tsx:227`), невидимий для AT kcal-чарт (`LogCardAnalytics.tsx:97`), дроп-зона фото без фокус-індикатора (`PhotoAnalyzeCard.tsx:125`).

**Low (31), домінантні патерни:**

- **Ex-Hard Rule #14, retired ADR-0081**: відсутній/неканонічний focus-visible ring у ~10 місцях (dashboardCards, FirstInsightBanner, SyncStatusBadge, Dashboard Фізрука, RoutineFilterChips, RoutineCalendarPanel, NutritionDashboard…).
- **Ex-Hard Rules #13/#16, retired ADR-0081, і радіуси**: сирі палітрові класи (`routineConstants.ts:52`, `MonthPulseCard.tsx:106`), 10px-текст нижче 12px-floor (`HabitForm.tsx:387`, `MacroRings.tsx:72`), заборонені tier-и радіусів (`DayReportSheet.tsx:132`, `HabitDetailSheet.tsx:511`, `NotificationBell.tsx:123`).
- **Стан**: таймер ActiveWorkoutBanner рахує від mount, не від старту тренування (`ActiveWorkoutBanner.tsx:8`); `<button>` без `type="button"` (`StatusStrip.tsx:59`).
- **Копі**: стейл empty-state «формою вище» без форми (`ActiveHabitsSection.tsx:87`), грамroot-помилка в sync-error тості без action-prompt (`FinykApp.tsx:125`).
- Решта — aria-expanded без aria-controls, selection тільки кольором, зламаний порядок заголовків `<h3>` перед `<h1>`, відсутній `min-w-0`.

Повний JSON з evidence по кожній — у сесійному артефакті Workflow
(`wf_d5f23f12-dbf`); сюди винесено зведення, бо 47 позицій — це матеріал для
серії дрібних фікс-PR (групувати за патерном: focus-ring pass, aria-pass,
token-pass), а не для одного.

### Скріншоти

`a1-hub.png` (Hub A1), `a2-tx-reload.png` (білий екран, знахідка 1),
`a5-profile-long-name.png` (обрізання довгого імені) — у сесійному scratchpad;
ключові стани задокументовані текстом вище.
