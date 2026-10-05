# Аудит 2026-10-01 · Приватність і відповідність

> **Status:** Active. 38 кластерів (48 знахідок) за першопричиною. Загальний план, метод і обмеження — у [README](./README.md).
> **Last validated:** 2026-10-02
> **Next review:** 2026-11-02
> **Spec-lint:** skip. Реєстр знахідок аудиту, не специфікація реалізації.

Приватність — одна з найслабших зон застосунку. На спільному пристрої обіцянки не працюють на жодному шляху: вихід не стирає SQLite і не знімає push-підписку; протухла сесія взагалі нічого не чистить і переносить чужі медичні факти в серверний профіль наступного користувача; легасі kvvfs і IndexedDB модуля Їжа живуть вічно; PIN-блокування вимикається після перезавантаження і обходиться 10 спробами. На сервері головний ризик — Sentry: транзакції везуть паролі, текст чату й cookie, а токени скидання пароля і секрети вебхуків осідають в атрибутах URL. Друга лінія — розрив між політикою приватності і кодом: health-гейт пропускає алергії і тренування, AI-події PostHog ігнорують відмову від аналітики, чат іде до нерозкритих субпроцесорів, фото чеків відправляються без обіцяного попередження, а експорт і видалення даних неповні. Більшість фіксів локальні (S), тож п'ять high-кластерів реально закрити за кілька днів; жоден із них не виправлено комітами після c7c09607.

Кластер — це одна першопричина, яку закриває один фікс; усередині лежать знахідки, що її показали, з доказами. Виправив — зміни рядок «Стан» кластера на `виправлено в #<PR>` (або `не відтворюється на <коміт>`), ключ не чіпай.

| Серйозність | Кластерів |
| ----------- | --------- |
| critical    | 0         |
| high        | 5         |
| medium      | 13        |
| low         | 15        |
| info        | 5         |

## high

<a id="priv-01"></a>

### `priv-01` [high] Sentry-транзакції везуть сире тіло запиту (паролі входу, текст чату) і розпарсені session-cookie

- **Стан:** виправлено в #1328 (змерджено 2026-10-03)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: observability (Sentry)
- **Де:** apps/server/src/sentry.ts:266-268 (applyBeforeSend), :379-403 (applyBeforeSendTransaction), :51-55 і :76-81 (семплінг /api/auth/ = 1.0, /api/chat = 0.5), :476 (sendDefaultPii)
- **Першопричина:** applyBeforeSendTransaction редагує лише url, headers, transaction, extra, contexts і spans. На відміну від applyBeforeSend, він не видаляє event.request.data і event.request.cookies. @sentry/node 8.55 збирає тіло кожного вхідного запиту (до 1 МБ), requestDataIntegration за замовчуванням включає data і cookies, а sendDefaultPii:false цього не вимикає.
- **Вплив:** Коли на проді заданий SENTRY_DSN, кожен вхід, реєстрація і зміна пароля (/api/auth/ семплюється на 100%) відправляють пароль відкритим текстом у Sentry (США). Для 50% запитів чату туди ж іде повний текст розмов і фото разом із session-cookie. Будь-хто з доступом до проєкту Sentry отримує облікові й чутливі дані користувачів, що прямо суперечить політиці приватності.
- **Що зробити:** У applyBeforeSendTransaction видаляти request.data, request.cookies і request.query_string так само, як у applyBeforeSend. Додатково вимкнути захоплення тіла на рівні SDK: requestDataIntegration({include:{data:false,cookies:false}}) та ignoreIncomingRequestBody. Додати тест на transaction-подію з тілом і cookie. Після фіксу вичистити наявні події в Sentry і розглянути примусову ротацію сесій.
- **Примітка:** Скептик не спростував і відтворив витік на прод-подібному esbuild-бандлі. Залежить від прод-конфігу: SENTRY_DSN активний на Coolify (docs/work/specs/tech-debt/backend.md:99). Дефолтний Data Scrubber проєкту Sentry, ймовірно, маскує ключі password/token і cookie з auth/token у назві, тож сценарій захоплення акаунта може бути пом'якшений. Текст чату, біометрію і sync-пейлоади він не маскує. Частково перетинається з відкритим SECURITY-20260804-F6. Суміжні прогалини редакції URL і заголовків винесено в priv-07. На HEAD 7611f169 не виправлено.
- **Повторна перевірка на свіжому `main`:** так, досі є, серйозність high. Проблема на поточному HEAD (cf057000, у ньому змерджено свіжий main 8d570b70) лишилась. Відтворив її ще раз. 1) Код не змінювався. `git log c7c09607..HEAD -- apps/server/src/sentry.ts` порожній, і на origin/main нових комітів у цьому файлі теж немає. `applyBeforeSend` (apps/server/src/sentry.ts:266-268) видаляє `event.request.data` і `event.request.cookies`. `applyBeforeSendTransaction` (sentry.ts:379-403) редагує лише request.url (:382-384), headers (:385), transaction (:386-388), extra/contexts (:389-390) і spans (:391-401). data і cookies він не чіпає. `Sentry.init` (:439-486) не задає `integrations`, тож працює дефолтний `requestDataIntegration` з `include: { cookies: true, data: true, query_string: true }` (apps/server/node_modules/@sentry/core/build/cjs/integrations/requestdata.js, DEFAULT_OPTIONS). `sendDefaultPii: false` (:477) цього не вимикає. Коментар над ним (:476, «Приберемо request body») вводить в оману. 2) SDK захоплює тіло безумовно. У @sentry/node 8.55.2 (apps/server/node_modules/@sentry/node) `SentryHttpInstrumentation.patchRequestToCaptureBody` перехоплює `req.on('data')` до 1 МБ і кладе тіло в `normalizedRequest.data`. Опції, яка б це вимикала, у 8.55 немає: `ignoreIncomingRequestBody` у build відсутній, з'являється лише у v9. Тож частина фіксу з кластера «ignoreIncomingRequestBody» на цій версії неприйнятна. 3) Спроба спростувати не вдалася. Better Auth (`r.all("/api/auth/{*splat}", toNodeHandler(auth))`, routes/auth.ts:33) отримує вже розпарсене тіло: дефолтний `express.json` на `/` (http/bodySizePolicy.ts, правило `pathPrefix: "/"`) монтується в app.ts:147 до registerRoutes і читає потік через `on('data')`. Отже патч SDK тіло бачить. 4) Живе відтворення на HEAD. Зібрав esbuild-бандл з опціями прод-білду (реальні sentry.ts і applyBodySizePolicy), лежить у &lt;scratch&gt;/agents/recheck-priv-01. Транзакція `POST /api/auth/sign-in/email` при sample_rate 1 несе `data: {"email":"victim@example.com","password":"Hunter2-SuperSecret"}`. Транзакції `POST /api/chat` при sample_rate 0.5 несуть повний текст повідомлень і `cookies: {"__Secure-better-auth.session_token":"SESSIONTOKEN123.sig"}`; заголовок cookie при цьому замасковано, а розпарсені cookies ні. 5) Severity high правильна. /api/auth/ семплюється на 1.0 (sentry.ts:51-55), /api/chat, analyze-photo і refine-photo на 0.5 (:76-105), решта на fallback 0.05. Отже вхід, реєстрація, зміна і скидання пароля, текст AI-чату, фото їжі та чеків, sync-пейлоади зі здоров'ям і фінансами йдуть третій стороні (Sentry, США). За docs/work/specs/tech-debt/backend.md:99 SENTRY_DSN на проді активний. Пом'якшення є лише одне: дефолтний серверний Data Scrubber Sentry. Він, ймовірно, маскує ключі password і cookie зі словами auth/token у назві, але працює вже після передачі, вимикається в налаштуваннях проєкту і не чіпає чат, біометрію, фото й sync. Тому знижувати до medium не варто. 6) Пов'язане. Доки помилково позначають це як OK (backend.md:99, :764, :771). Тесту на transaction-подію з data чи cookies в apps/server/src/sentry.test.ts:409-452 немає. `request.query_string` у transaction-подіях теж не редагується, але це вже скоуп priv-07.
- **Мінімальний фікс:** Обидві зміни перевірив на тому самому бандлі. Кожна окремо прибирає data і cookies з transaction-подій, а варіант (b) ще й заголовок cookie. Ставити варто обидві, як захист у глибину. (a) apps/server/src/sentry.ts, на початку `applyBeforeSendTransaction` (рядок ~382) додати те саме, що в `applyBeforeSend`: `ts if (event.request?.data) delete event.request.data; if (event.request?.cookies) delete event.request.cookies; if (event.request?.query_string) delete event.request.query_string; ` (b) Там само в `Sentry.init({...})` (рядки 439-486) вимкнути збір на рівні SDK: `ts integrations: [Sentry.requestDataIntegration({ include: { data: false, cookies: false, query_string: false } })], ` Опції `ignoreIncomingRequestBody` у @sentry/node 8.55 немає, вона з'являється лише у v9. Коментар біля `sendDefaultPii` (рядок 476) виправити: тіло він не прибирає. (c) apps/server/src/sentry.test.ts, блок `describe("applyBeforeSendTransaction")`: додати тест на подію `{type:"transaction", request:{data:'{"password":"x"}', cookies:{"__Secure-better-auth.session_token":"t"}, query_string:"token=t"}}`, що в результаті немає ні data, ні cookies, ні query_string. (d) docs/work/specs/tech-debt/backend.md:99, :764, :771: прибрати твердження «beforeSend стрипає body/cookies — OK» або уточнити, що тепер це покривають обидва хуки. Після деплою власнику варто вичистити наявні транзакції в Sentry (Discover → delete або retention) і розглянути відкликання сесій.

Знахідок у кластері: 1.

#### [high] Sentry transaction-події везуть сире тіло запиту (паролі, чат, токени) і session-cookie: applyBeforeSendTransaction не чистить request.data/cookies

- **ID:** `server-static/privacy-logging#1` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Серйозність від шукача:** critical
- **Де:** apps/server/src/sentry.ts:379-403 (applyBeforeSendTransaction) vs :266-268 (applyBeforeSend); sampling sentry.ts:51-55 (/api/auth/ = 1.0), :76-81 (/api/chat = 0.5), fallback 0.05; SDK: @sentry/node 8.55.2 build/esm/integrations/http/SentryHttpInstrumentation.js:9,101,303-353 (patchRequestToCaptureBody, MAX_BODY 1MB), @sentry/core requestdata.js DEFAULT_OPTIONS include.data/cookies=true
- **Вплив:** При заданому SENTRY_DSN (прод-налаштування, 90-денний retention у Sentry, США) кожен sign-in/sign-up/reset/change-password (100% семплінг /api/auth/) відправляє пароль відкритим текстом у Sentry; 50% чат/коуч/фото-запитів — повний вміст розмов і фото (до 1 МБ), 5% решти — Monobank/Privat токени при підключенні, біометрію, sync-пейлоади. Разом із session-cookie це дає захоплення будь-якого акаунта кожному, хто має доступ до Sentry або його витоку. Пряме порушення GDPR Art.5/32 і обіцянок privacy policy.
- **Рекомендація:** У applyBeforeSendTransaction дзеркально до applyBeforeSend: `delete event.request.data; delete event.request.cookies; delete event.request.query_string` (або редагувати). Додатково вимкнути захоплення тіла на рівні SDK: Sentry.init({ integrations: [Sentry.requestDataIntegration({ include: { data: false, cookies: false } })] }) і httpIntegration({ ignoreIncomingRequestBody: () =&gt; true }) якщо доступно. Ротувати BETTER_AUTH_SECRET-сесії/попросити скидання паролів, якщо DSN був увімкнений; вичистити наявні події в Sentry (Data Scrubbing rules + delete). Додати тест на applyBeforeSendTransaction з request.data/cookies.

**Докази:**

```text
applyBeforeSend: `if (event.request?.data) delete event.request.data; if (event.request?.cookies) delete event.request.cookies;` — у applyBeforeSendTransaction цих рядків немає (лише url/headers/transaction/extra/contexts/spans). E2E на реальному @sentry/node 8.55 + express + хуках репо (scratch sentry-e2e-cookie.cjs, вивід sentry-e2e-output.txt):
TX POST /api/auth/sign-in/email request.data = "{\"email\":\"victim@example.com\",\"password\":\"Hunter2-SuperSecret\"}"
TX POST /api/chat request.data = "{\"messages\":[{...\"content\":\"в мене депресія і борг 50000\"}]}", request.cookies = {"__Secure-better-auth.session_token":"SESSIONTOKEN123.sig"} (header cookie редагується, а розпарсений request.cookies — ні). Попередній аудит F6 (security-comprehensive-2026-08-04) просив додати beforeSendTransaction — додано, але без видалення body/cookies.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-privacy-logging/sentry-e2e-cookie.cjs — ініціалізує Sentry з хуками з src/sentry.ts і transport-перехоплювачем, шле POST sign-in з паролем і POST /api/chat з cookie, друкує transaction-конверти.
```

**Верифікатор:**

```text
Відтворено самостійно. applyBeforeSend видаляє event.request.data і event.request.cookies (sentry.ts:267-268), а applyBeforeSendTransaction (sentry.ts:379-403) не видаляє ні те, ні інше. @sentry/node 8.55.2 збирає тіло запиту через patchRequestToCaptureBody (SentryHttpInstrumentation.js:303-354, req.on('data') proxy, ліміт 1 МБ). Це спрацьовує, бо глобальний express.json з applyBodySizePolicy (app.ts:147) читає потік і для /api/auth/*. requestDataIntegration за замовчуванням має include.data/cookies=true (core requestdata.js:4-18), і processEvent виконується для всіх типів подій, транзакції теж. sendDefaultPii:false на data і cookies у v8 не впливає. Коментар у sentry.ts:476 («Приберемо request body зі звітів») показує, що намір був протилежний. Мій прогін зі справжнім top-level Sentry.init із src/sentry.ts (tracesSampler, хуки) і bodySizePolicy відправив transaction-події з request.data для POST /api/auth/sign-in/email: email і пароль відкритим текстом. Те саме з POST /api/auth/reset-password (newPassword + token) і POST /api/chat: текст повідомлення плюс розпарсений request.cookies з `__Secure-better-auth.session_token` (cookie у заголовку при цьому [redacted]). За docs/work/spec …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Свій прогін: cd apps/server && SENTRY_DSN=http://pub@127.0.0.1:39893/1 node --import tsx <scratch>/agents/verify-server-static-privacy-logging/v2/e2e-real-init.mts. Вивід: `TX POST /api/auth/sign-in/email {..."data":"{\"email\":\"victim@example.com\",\"password\":\"Hunter2-SuperSecret\"}"}`; `TX POST /api/auth/reset-password {..."data":"{\"newPassword\":\"NewPass-Secret-999\",\"token\":\"RESETTOKENabc\"}"}`; `TX POST /api/chat {"cookies":{"__Secure-better-auth.session_token":"SESSIONTOKEN123.sig",...},"data":"{\"messages\":[...\"борг 50000 #1\"...]}","cookieHdr":"[redacted]"}`. Схоже питання частково зачіпає F6 у security-comprehensive-2026-08-04 («beforeSendTransaction відсутній»): хук відтоді додали, але без видалення body і cookies, тож саме цей витік ніде не трекається. docs/governance …[обрізано]
```

**Скептик:** не спростував, оцінка high.

```text
I couldn't refute it. My strongest angle failed, and the code path holds end to end.

1. Code. applyBeforeSend deletes event.request.data and event.request.cookies (apps/server/src/sentry.ts:267-268). applyBeforeSendTransaction (sentry.ts:379-403) only redacts url, headers, transaction, extra, contexts and spans. It never touches request.data or request.cookies. Both are wired in Sentry.init (sentry.ts:483-484). The only control meant to strip bodies is `sendDefaultPii: false`, whose comment says "Приберемо request body" (sentry.ts:476). In 8.55.2 that flag does not gate data or cookies.

2. SDK path. In @sentry/node 8.55.2, SentryHttpInstrumentation.js:96 calls patchRequestToCaptureBody on every incoming request. It proxies req.on('data'/'end') and stores up to 1 MB in isolationScope normalizedRequest.data (lines ~303-354). requestDataIntegration in @sentry/core 8.55.2 (build/esm/integrations/requestdata.js:4-18) defaults include.data and include.cookies to true. Its processEvent is a client event processor, so it also runs for transactions, and it runs before beforeSendTransaction.

3. The body really gets read. applyBodySizePolicy is mounted at app.ts:147. It mounts express.json for "/" with a 128kb limit (bodySizePolicy.ts, last rule) and 1mb for /api/chat. That happens before CORS, CSRF (app.ts:167) and the Better Auth mount (routes/auth.ts:33). raw-body attaches a 'data' listener, so /api/auth/* and /api/chat bodies are captured, even for requests the CSRF check later r …[обрізано]
```

<a id="priv-02"></a>

### `priv-02` [high] Сесія, що закінчилась без «Вийти», не запускає очищення: наступний акаунт бачить медичні факти попереднього, і вони потрапляють у його серверний профіль

- **Стан:** частково виправлено в #1337 (змерджено 2026-10-03) (лишилось: BroadcastChannel для інших вкладок; стирання SQLite-партиції попередника — priv-05)
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: auth / локальне сховище
- **Де:** apps/web/src/core/auth/AuthContext.tsx:382-401 (identity-wipe), :548-697 (teardown у logout); apps/web/src/core/profile/memoryBank.ts:245-251; apps/web/src/core/profile/profileWriteThrough.ts:165-170, 459-498; apps/web/src/shared/lib/storage/storage.ts:299-321
- **Першопричина:** Сесія може закінчитися без кнопки «Вийти»: протухла, відкликана або зник cookie. Ефект зміни ідентичності в AuthContext (user→anon) у такому разі чистить лише RQ-кеш, чат і quick-stats. purgeAppOwnedLocalData, wipeSqliteDb і swClearCaches викликає тільки logout(). readMemoryEntries() читає hub_user_profile_v1 без перевірки ownerId. Перший же запис наступного користувача перештамповує ownerId і пушить увесь банк пам'яті на сервер.
- **Вплив:** На спільному пристрої після 7-денного протухання сесії чи «вийти на всіх пристроях» наступна людина бачить у «Пам'яті» чужі дані про здоров'я (діагнози, ліки). AI-чат вважає їх її фактами. Після першої правки ці дані назавжди копіюються в серверний профіль іншої людини і синхронізуються на її пристрої. Біометрія, email, тариф і повна SQLite-копія попереднього користувача теж лишаються на пристрої.
- **Що зробити:** Будь-який перехід user→anon або user→user, виявлений на старті чи через 401, обробляти тим самим teardown, що й logout(): purgeAppOwnedLocalData, стирання SQLite-партиції після спроби flush, swClearCaches. Читання банку пам'яті й біометрії фільтрувати за ownerId === currentUserId і не пушити записи з чужим ownerId. Інші вкладки сповіщати через BroadcastChannel.
- **Примітка:** Скептик відтворив на свіжих користувачах і оцінив як high, на нижній межі. Витік у UI стається лише тоді, коли в наступного користувача на сервері ще немає memoryBank. data-isolation-browser#5 об'єднано сюди, бо фікс той самий; окремо його оцінено як low, бо там дані попереднього користувача доступні лише через DevTools. Повний фікс залежить від виправлення стирання в priv-05.
- **Повторна перевірка на свіжому `main`:** так, досі є, серйозність high. Проблема на HEAD cf057000 є. Від c7c09607 жоден потрібний файл не змінювався: `git diff c7c09607..HEAD` по AuthContext.tsx, core/profile/, shared/lib/storage/, hubChatSessions, sqlite.ts, swControl.ts і memoryHandlers.ts порожній. Код я перечитав, спростувати не вдалося. 1) apps/web/src/core/auth/AuthContext.tsx:382-401. Ефект зміни identity викликає `reconcileChatOwnerOnAuthChange` (hubChatSessions.ts:251-273, стирає лише ключі чату), `clearHubQuickStatsSnapshots`, а при `prevOwnerWasUser` ще `queryClient.clear()`, `clearPersistedQueryCache()` і `reload()`. Ні `purgeAppOwnedLocalData`, ні `swClearCaches`, ні `wipeSqliteDb` тут немає. Grep знаходить їх тільки в `logout()` (AuthContext.tsx:619, 648, 663). Обробника 401, який викликав би `logout()`, немає: queryClient.ts:66 лише не ретраїть 401. Отже після протухання сесії (7 днів), відкликання сесії або втрати cookie локальний teardown не запускається. 2) apps/web/src/core/profile/memoryBank.ts:245-251. `readMemoryEntries()` читає `hub_user_profile_v1` через `safeReadLSDurable` (storage.ts:299-321, спершу плаский LS-mirror) і `ownerId` не перевіряє. Ту саму функцію використовують MemoryBankSection.tsx:43 і чат-тули memoryHandlers.ts:18-67, тож Y бачить факти X в UI і в контексті AI. 3) apps/web/src/core/profile/profileWriteThrough.ts:470-475. Якщо в Y на сервері ще немає memoryBank, а локальний `ownerId` чужий, функція просто робить `return`: не пушить, але й не чистить. Після першої ж правки Y `writeMemoryEntries` (memoryBank.ts:307-317) ставить `ownerId` Y і пушить увесь список. `readMemoryBankForWire` (profileWriteThrough.ts:165-170) додає банк і до пушу біометрії, тож факти X осідають у серверному профілі Y. 4) Прямий перехід X→Y (cookie-switch) теж не захищений: reload відбувається, але локальне сховище лишається тим самим. Severity high підтверджую, на нижній межі. Потрібні спільний профіль браузера і відсутність memoryBank на сервері Y. З іншого боку, це спецкатегорія даних (здоров'я), витік стається сам від неактивності, без зловмисника, а дані назавжди забруднюють чужий серверний профіль і AI-контекст. Verifier і skeptic відтворили це в браузері на двох парах свіжих користувачів. Частину member data-isolation-browser#5 про те, що чужу SQLite-партицію й SW api-cache видно лише через DevTools, окремо оцінено як low.
- **Мінімальний фікс:** Мінімальний фікс у трьох місцях: 1) apps/web/src/core/auth/AuthContext.tsx, ефект на рядках 382-401. У гілці `prevOwnerWasUser` (X→anon і X→Y) до `window.location.reload()` викликати `purgeAppOwnedLocalData()` (динамічний import, як у logout:661-663), `swClearCaches()` і `swSetActiveUser(null)`, кожен у try/catch. Тоді попередника можна позначити як user, бо anon-чернеток для міграції тут немає. SQLite-партицію X без сесії не стирати: flush неможливий, і несинхронізований outbox пропаде. Вона per-user, у UI Y її не видно; стирання залежить від priv-05. 2) apps/web/src/core/profile/profileWriteThrough.ts, `reconcileMemoryBankWithServerProfile` (≈рядок 466) і так само `reconcileBiometricsWithServerProfile`. Це страховка для X→Y без reload і для гонок. Якщо `localMeta.ownerId !== null &amp;&amp; localMeta.ownerId !== currentUserId`, спершу скинути локальну копію (`writeMemoryEntriesFromServer(serverMemoryBank?.entries ?? [], serverMemoryBank?.updatedAt ?? MEMORY_BANK_META_EPOCH)`), а вже потім робити LWW. `ownerId: null` (legacy або anon) не чіпати, щоб не зламати міграцію. 3) У profileWriteThrough.ts:165-170 `readMemoryBankForWire` не має віддавати записи, якщо meta.ownerId чужий і ненульовий; у такому разі слати порожній або серверний банк. Тест: vitest на AuthContext. Стан LS `hub_user_profile_v1` + meta.ownerId=X, /me повертає 401 → після ефекту ключа немає. Плюс unit-тест reconcile: foreign ownerId і сервер без memoryBank → локальні записи очищено, push не було. Окремий пункт, не обов'язковий для мінімального фіксу: сповіщати інші вкладки про вихід через BroadcastChannel.

Знахідок у кластері: 2.

#### [high] Сесія завершилась без кнопки «Вийти» (протухла, відкликана, cookie зник): наступний акаунт бачить медичні факти попереднього

- **ID:** `client-static/web-storage-session#4` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** apps/web/src/core/auth/AuthContext.tsx:382-401; apps/web/src/core/profile/memoryBank.ts:245-251; apps/web/src/shared/lib/storage/storage.ts:299-307; apps/web/src/core/profile/profileWriteThrough.ts:459-498
- **Вплив:** Протухла 7-денна сесія, «вийти на всіх пристроях» або очищені cookies на спільному пристрої означають, що наступна людина бачить чужі факти про здоровʼя в «Памʼяті». Чат-тули (`myProfile`) і контекст AI беруть їх як факти Y. Перша ж правка банку памʼяті від Y ставить `ownerId` Y і відкриває гілку push (`localBelongsToCurrentUser`), тож чужі факти можуть потрапити в серверний профіль Y.
- **Рекомендація:** Будь-яку зміну ідентичності (user -&gt; anon, user -&gt; user), яку виявлено на старті чи через 401, обробляти тим самим teardown, що й `logout()`: purgeAppOwnedLocalData, стирання партиції, SW-кеші. Читання банку памʼяті й біометрії фільтрувати за `ownerId === currentUserId`. Повідомляти інші вкладки про вихід через BroadcastChannel.

**Докази:**

```text
Браузер (expire3.mjs): X через «Памʼять» -> «Заповнити вручну» додав «MEMSECRET діабет 1 типу, антидепресанти». Сесія закінчилась без logout (`ctx.clearCookies()`): `after session end: LS has MEMSECRET: true`. Y увійшов у тому ж браузері: `Y sees X's memory fact: true`. Скрін shots/client-static-web-storage-session/expire3-y-memory.png: у профілі Y видно «Цілі: MEMSECRET діабет 1 типу, антидепресанти». Ефект identity-wipe (AuthContext:382-401) чистить лише RQ-кеш, чат і quick-stats; app-owned LS і SQLite-партицію не чіпає. `readMemoryEntries()` читає `hub_user_profile_v1` через durable-LS без перевірки `ownerId`. Після відкликання сесії на сервері (expire2.mjs) звичка X так само лишилась в OPFS.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-storage-session/expire3.mjs <newX> wss-share-y
```

**Верифікатор:**

```text
Відтворено повністю, двома парами свіжих користувачів. X додав факт памʼяті, cookies очищено (сесія закінчилась без logout), LS досі містить факт. Y увійшов і бачить «VMEMSECRET діабет 1 типу, антидепресанти» в секції «Памʼять» свого профілю (скрін v4-y-memory.png). Окремо перевірено ланцюжок на сервер: щойно Y додає свій факт («Додати» → «Вручну»), `GET /api/v1/me/profile` для Y містить факт X (`V2MEMSECRET: true`), до правки його там не було. Причина за кодом: identity-wipe ефект (AuthContext.tsx:382-401) лише чистить RQ і робить reload, LS не чіпає. Перехід anon → user навмисно мʼякий. `readMemoryEntries` читає durable-LS без перевірки `ownerId`, а `writeMemoryEntries` ставить власником поточного користувача, після чого write-through пушить увесь список.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v4-expire.mjs: `Y sees X's memory fact: true`. v4b-expire.mjs: `Y server profile contains V2MEMSECRET: 200 false` до правки, `after Y edit: Y server profile contains V2MEMSECRET: 200 true YFACT: true`. Скріни shots/verify-client-static-web-storage-session/v4-y-memory.png і v4b-y-memory.png. Аудит 2026-08-08 L-8 стосується протилежного (банк гине при logout), не цього.
```

**Скептик:** не спростував, оцінка high.

```text
I could not refute this. I traced the code path and reproduced the issue myself with two fresh pool users.

Code path:
1. When a session ends without logout, `/me` returns 401 and `user` becomes null. The identity-wipe effect calls `reconcileChatOwnerOnAuthChange(null)`, which records the change X→anon with prevOwnerWasUser=true (AuthContext.tsx:382-401, hubChatSessions.ts:251-273). On that path it only removes the chat keys, clears quick-stats, runs `queryClient.clear()`, purges the RQ snapshot and reloads.
2. `purgeAppOwnedLocalData()` and `wipeSqliteDb()` are called only from `logout()` (AuthContext.tsx:648, 661-663). A grep finds no other call sites, and the web app has no 401 handler that forces `logout()`.
3. When Y then signs in, the transition is anon→Y. `prevOwnerWasUser` is false, so only quick-stats are cleared. This soft path is intentional for anon-data migration.
4. The memory bank uses the durable helpers. `safeReadLSDurable` reads the flat, non-partitioned `localStorage` mirror first (storage.ts:299-321). `readMemoryEntries()` does not check `ownerId` (memoryBank.ts:245-251).
5. `reconcileMemoryBankWithServerProfile` (profileWriteThrough.ts:459-498) only partly protects. If Y's server profile has no `memoryBank` and the local `ownerId` is not Y, the function returns without pushing and without clearing local data. X's facts stay visible to Y.
6. Y's next local write calls `writeMemoryEntries`, which re-stamps `ownerId` with Y's id (memoryBank.ts:62-80, 300+) a …[обрізано]
```

#### [low] Протухла чи відкликана сесія (без натискання «Вийти») не запускає жодного локального wipe: дані X лишаються, поки пристроєм користується інша людина

- **ID:** `browser-crosscut/data-isolation-browser#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/auth/AuthContext.tsx:383-401 (ефект зміни identity: лише queryClient.clear + clearPersistedQueryCache + reload, без swClearCaches/wipeSqliteDb/purgeAppOwnedLocalData); teardown є тільки в logout() (AuthContext.tsx:551-697)
- **Вплив:** Після протухання сесії на спільному пристрої лишаються ідентифікатори X (email, імʼя), біометрія, налаштування, тариф і повна SQLite-копія. Їх можна прочитати DevTools-ом, поки пристроєм користується наступна людина.
- **Рекомендація:** При переході authenticated → unauthenticated (prevOwnerWasUser) щонайменше чистити SW api-cache і user-scoped ключі localStorage. Для SQLite показувати вибір: «увійти знову» або «стерти дані з пристрою» (після спроби flush), а не лишати все мовчки.

**Докази:**

```text
27-run.log: сесію X прибрано (cookies очищено, як при протуханні або «вийти з усіх пристроїв») → reload → анонімний хаб. Хіти в сховищі: OPFS '/sergeant-PGQL4sLE….db :: SECRET-X'; Cache Storage api-cache: `/api/v1/me?__u=4f01… :: {"user":{"id":"PGQL4sLE…","email":"dib_x_964@example.com","name":"Audit dib-x"}}`, `/api/v1/me/profile … "weightKg":81.5 … memoryBank`, /me/preferences, /billing/status, /ai-memory/list; localStorage hub_biometrics_v1 {"weightKg":81.5,…,"ownerId":"PGQL4sLE…"}, hub_user_profile_meta_v1. Усе це лишилось і після входу Y (27-dump-y.json). У UI Y даних X не видно: діє фільтр ownerId і SW-партиція __u.
```

**Відтворення:**

```text
1) Увійти як X, відвідати /, /finyk/transactions, /?tab=profile. 2) Видалити cookie сесії (або відкликати сесію з іншого пристрою) і перезавантажити. 3) Подивитись Cache Storage, localStorage і OPFS. Скрипт: 27-revoke-path.mjs.
```

**Верифікатор:**

```text
Поведінку підтверджено. Ефект зміни identity (AuthContext.tsx:383-401) при переході X → null робить лише `queryClient.clear()`, `clearPersistedQueryCache()` і reload. swClearCaches, wipeSqliteDb і purgeAppOwnedLocalData виконує тільки `logout()`. Severity я знизив, бо після протухання сесії доступ до даних X лише звужується. До протухання будь-хто з доступом до пристрою мав повний доступ через сам застосунок, а після нього дані можна прочитати тільки DevTools-ом. UI наступного користувача їх не показує: SW-партиція `__u`, фільтр ownerId і окремий SQLite-файл. Безумовний wipe при протуханні сесії знищив би незасинхронізовану офлайн-чергу, а `logout()` навмисно робить flush перед wipe. Тобто це прогалина defense-in-depth (найпомітніша при віддаленому «вийти з усіх пристроїв»), а не прямий витік.
```

**Додаткові докази верифікатора:**

```text
v5-run.log (v5-expiry.mjs, vdib_exp_943): після clearCookies і reload застосунок анонімний («Доброго ранку · Пʼятниця…» без імені). Проте api-cache досі тримає '/api/v1/me?__u=ed1f44e9… [email]', /me/profile, /me/preferences, /billing/status, /ai-memory/list, а OPFS — '/sergeant-NhoE9SqW….db' (1 495 040 Б). quick-stats частково прибрано: зник finyk_quick_stats.
```

<a id="priv-03"></a>

### `priv-03` [high] PIN-блокування мовчки вимикається після перезавантаження чи холодного старту: прапорці читаються до буту SQLite і кешуються як вимкнені

- **Стан:** виправлено в #1340 (змерджено 2026-10-04)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: блокування застосунку / feature flags
- **Де:** apps/web/src/shared/lib/storage/typedStore.ts:196-201, 253-255; apps/web/src/shared/lib/storage/storage.ts:151-155; apps/web/src/main.tsx:194-213; apps/web/src/core/lib/featureFlags.ts:93-99, 128-130; apps/web/src/core/security/useAppLock.ts:51, 66-76
- **Першопричина:** main.tsx монтує застосунок до bootstrapKvStore(). Тому useAppLock → useFlag → flagsStore.get() читає сирий localStorage, де hub_flags_v1 немає: значення лежить у SQLite kv_store. typedStore.get() назавжди кешує це перше читання. Підписка onChange прив'язана до LS-стора, тож значення з SQLite так і не підхоплюється.
- **Вплив:** Блокування працює лише до першого перезавантаження. Після перезапуску PWA чи в новій вкладці застосунок відкривається без PIN, хоча UI обіцяє захист Mono-токена й медичних даних. З тієї ж причини скидаються всі прапорці FLAG_REGISTRY, а будь-який наступний setFlag назавжди перезаписує збережене app-lock-enabled: true.
- **Що зробити:** Після bootstrapKvStore()/markStorageReady() перечитувати всі typedStore (або не кешувати читання, зроблені до буту). Блокування не повинно залежати від прапорця: на холодному старті блокувати, якщо hasPinSet(userId) === true. Додати e2e-тест: увімкнути PIN → reload → чекати екран «Введи PIN».
- **Примітка:** Скептик відтворив окремим скриптом на іншому користувачі й лишив high. Спека sqlite-opfs-worker.md:157 («читають після boot-у») застаріла після зміни порядку буту. Разом із priv-14 і priv-15 PIN-блокування зараз не дає реального захисту.
- **Повторна перевірка на свіжому `main`:** так, досі є, серйозність high. Проблема на HEAD cf057000 нікуди не ділась. Від c7c09607 гілка має 78 комітів, але `git diff c7c09607..HEAD` по apps/web/src/shared/lib/storage, core/db, core/lib/featureFlags.ts, core/security, Providers.tsx і main.tsx не зачіпає жодного рядка ланцюга. Змінено лише HubBottomNav, WelcomeModulePicker, NotificationBell і shared/utils/date. Ланцюг на HEAD такий: (1) main.tsx:198-200: `markStorageBooting(); void initSentry(); mountApp();`. `bootstrapKvStore` запускається тільки потім, в async IIFE (main.tsx:215), а `markStorageReady()` стоїть у finally (main.tsx:271). (2) Providers.tsx:69 монтує `AppLockProvider` без гейта storageReady. `useStorageReady` викликають тільки HubPage, useModuleFirstRun і momentsStore, тому useAppLock.ts:51 `useFlag("app-lock-enabled")` (featureFlags.ts:153, useSyncExternalStore → getFlag:115 → flagsStore.get()) читає прапорець на першому рендері, ще до буту. (3) storage.ts:151-155: поки `getActiveSqliteKvStore()===null`, `resolveStore()` повертає сирий localStorage. Після буту записи йдуть уже в SQLite kv_store (kvStoreBoot.ts: activeSqliteKvStore), тож копії `hub_flags_v1` в LS немає. (4) typedStore.ts:195-200: `get()` один раз ставить `cachedLoaded=true` і кешує `{}`. Повторного читання немає: grep не знаходить жодного `flagsStore.reload()` чи загального reload після `markStorageReady()`. (5) typedStore.ts:255: `webKVStore.onChange(key, reload)` прив'язується при ініціалізації модуля до того стора, який резолвився тоді, тобто до LS. `replaceCache` і BroadcastChannel SQLite-стора (packages/shared/src/storage/kv.ts:620) сповіщають лише власних підписників. (6) useAppLock.ts:65, 77, 93, 106: кожен ефект починається з `if (!enabled) return;`. Тому cold-start lock, visibilitychange і idle-таймер не вмикаються ніколи, хоча хеш PIN в IndexedDB лишається. (7) setFlag (featureFlags.ts:125) робить `{...flagsStore.get(), [id]:v}` від закешованого `{}` і пише в SQLite. Отже будь-який наступний тумблер назавжди затирає збережене `app-lock-enabled: true`. Спростувати не вийшло. seedFromLocalStorage у kvStoreBoot копіює LS у warm-cache, а не навпаки, і на кеш typedStore це не впливає. Живий прогін двох незалежних агентів (v01-lock-reload, skeptic k1) зроблено на білді c7c09607, а відповідний код відтоді не змінювався, тож результат чинний і для HEAD. Severity high обґрунтована: рекламований захист «Mono-токена і медичних даних» мовчки перестає працювати після першого reload чи перезапуску PWA, а заразом скидаються всі прапорці FLAG_REGISTRY. Нижче critical її тримає модель загрози: потрібен фізичний доступ до вже розблокованого пристрою, віддаленої витоку даних немає.
- **Мінімальний фікс:** Мінімальний фікс, у трьох місцях. (1) apps/web/src/shared/lib/storage/typedStore.ts. Завести реєстр усіх створених стор-ів (`const registry = new Set&lt;TypedStore&lt;unknown&gt;&gt;()`) і експортувати `reloadAllTypedStores()`. Для кожного стора ця функція викликає `reload()` (воно ж робить notify) і перепідписує `onChange`: зберегти unsubscribe від `webKVStore.onChange(key, …)`, зняти стару LS-підписку і підписатися заново, вже на SQLite-стор. Додатково в `get()` не ставити `cachedLoaded=true`, поки `getActiveSqliteKvStore()===null &amp;&amp; !isStorageReady()`. (2) apps/web/src/main.tsx, блок finally. Викликати `reloadAllTypedStores()` одразу після `storageManager.runAll()` і до `markStorageReady()`. (3) apps/web/src/core/security/useAppLock.ts. Cold-start ефект (рядки 63-73) не має залежати від прапорця: прибрати `if (!enabled) return` і блокувати, якщо `hasPinSet(userId)===true`. disablePin і так стирає хеш, тому наявність PIN рівнозначна увімкненому блокуванню. Те саме варто зробити з обробником visibilitychange. Тести: unit-тест у typedStore.test.ts (get до буту → активувати SQLite-стор → reloadAll → значення з SQLite) і e2e у apps/web/tests (увімкнути PIN → reload → видно екран «Введи PIN»). Окремо оновити docs/work/specs/sqlite-opfs-worker.md:157: твердження «читають після boot-у» застаріло.

Знахідок у кластері: 1.

#### [high] PIN-блокування мовчки вимикається після будь-якого перезавантаження або холодного старту (прапорці hub_flags_v1 читаються до буту SQLite і кешуються як false)

- **ID:** `browser-surfaces/hub-shell#1` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `privacy`
- **Де:** apps/web/src/shared/lib/storage/typedStore.ts:196-201 (get() кешує перше читання назавжди); apps/web/src/shared/lib/storage/storage.ts:151-155 (resolveStore падає на localStorage до буту); apps/web/src/main.tsx:194-196 (mountApp до bootstrapKvStore); apps/web/src/core/lib/featureFlags.ts:93-99; apps/web/src/core/security/useAppLock.ts:51,66-76; URL http://127.0.0.1:4173/?tab=profile (Безпека → Блокування застосунку)
- **Вплив:** Основний сценарій блокування (хтось бере телефон і відкриває застосунок, або PWA перезапускається після вивантаження з памʼяті) не захищений взагалі: блокування працює лише до першого перезавантаження сторінки, і користувач не отримує жодного попередження. При цьому UI обіцяє захист «для Mono-токена і медичних даних». Та сама причина скидає всі прапорці FLAG_REGISTRY («Швидкі команди», «Картка результату для новачків», «Нагадування залити документи»): налаштування в розділі «Експериментальне» не переживають reload.
- **Рекомендація:** Після bootstrapKvStore()/markStorageReady() викликати reload() для всіх typedStore (або хоча б flagsStore), або не кешувати читання, зроблені до буту (cachedLoaded=false, поки getActiveSqliteKvStore() === null). Для app-lock не залежати від прапорця в kv: на cold start блокувати, якщо hasPinSet(userId) === true, незалежно від useFlag. Додати e2e: увімкнути PIN → reload → очікувати екран «Введи PIN».

**Докази:**

```text
v01-lock-reload.out: 'enable -> true', 'IDB keys: [v1:JUiP0Q…]', 'lock-now in same session: {lock:true}', далі reload: 'reload timeline: 269ms {lock:false}', 'IDB keys after reload: [v1:JUiP0Q…]' (PIN на місці), 'switch after reload: false | lock-now buttons: 0', 'after tab switch + visibilitychange: {lock:false}', 'cold start new tab /finyk: lock:false'. v12-opfs-flag.out: у файлі OPFS SQLite '/sergeant/sqlite/.opaque/…' лежить 'hub_flags_v1{"__v":1,"data":{"app-lock-enabled":true}}', а localStorage hub_flags_v1 = null. s14-flags.out: 'LS log: 938ms GET hub_flags_v1 -> null', тумблер «Картка результату» true → після reload false; s13: «Швидкі команди (Ctrl/⌘+K)» true → після reload false. Код: typedStore.get(): `if (!cachedLoaded) { cached = readFromStorage(); cachedLoaded = true; }`, onChange підписаний на LS-стор при ініціалізації модуля, тож значення з SQLite ніколи не підхоплюється.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-hub-shell/v01-lock-reload.mjs (користувач hubshell-lock): Профіль → Безпека → Блокування застосунку → увімкнути, PIN 1357 двічі → F5 (або відкрити нову вкладку /finyk). Застосунок не заблокований, тумблер показує «вимкнено», хоча PIN лежить в IndexedDB sergeant_app_lock, а прапорець true лежить у SQLite kv_store. Скріншот: <scratch>/shots/hub-shell/v01-after-reload.png, v01-coldstart-finyk.png
```

**Верифікатор:**

```text
Підтверджено і в коді, і наживо. main.tsx викликає mountApp() ДО bootstrapKvStore(). RootLayout рендерить useAppLock(), а той через useFlag викликає flagsStore.get(), поки getActiveSqliteKvStore() === null. Тому resolveStore() повертає сирий localStorage, де hub_flags_v1 немає, і typedStore.get() назавжди кешує {} (cachedLoaded=true). Підписку webKVStore.onChange(key) теж зроблено при ініціалізації модуля проти LS-стора, тож replaceCache() у SQLite-сторі (він сповіщає лише власних підписників) typedStore не перезавантажує. Ніде в коді немає reload() для flagsStore після буту. Гейт storageReady захищає лише HubPage, useModuleFirstRun і momentsStore, але не RootLayout і не useAppLock. Спека sqlite-opfs-worker.md §2.2 прямо стверджує, що «для звичайного прапорця це непомітно: його і пишуть, і читають після boot-у». Для app-lock-enabled це хибно: його читають до буту.
```

**Додаткові докази верифікатора:**

```text
Власний прогін <scratch>/agents/verify-browser-surfaces-hub-shell/v1-lock-reload.mjs, свіжий юзер vhs-lock, 1280×900: 'switch after enable: true', 'LS hub_flags_v1 (raw localStorage): null' (прапорець пішов у SQLite), 'lock-now: {lock:true}', далі reload → 'reload timeline: 296ms {lock:false}' (15 с без екрана PIN), повторний goto /?tab=profile → 'switch after reload: false lock-now btns: 0', нова вкладка /routine → '{lock:false}'. Скріншот v1-after-reload.png. Код: typedStore.ts:196-201 (кешування), :253-255 (onChange привʼязаний до стора, що резолвиться при створенні), storage.ts:151-155, main.tsx:198-200 (markStorageBooting → mountApp → async boot).
```

**Скептик:** не спростував, оцінка high.

```text
Я не зміг це спростувати. Пройшов код від початку до кінця і окремо відтворив у живому застосунку власним скриптом і на іншому користувачі.

**Що відбувається в коді**
1. `apps/web/src/main.tsx:198-200` викликає `markStorageBooting()`, потім `mountApp()`. Тільки після цього в окремому async IIFE запускається `bootstrapKvStore()` (рядок ~213). Так зроблено навмисно (коментар на :134-147): щоб route-гарди малювали сплеш, а не порожній `#root`.
2. `AppLockProvider` стоїть у `Providers.tsx:69`. Сам `Providers` монтується одразу в корені роутера (`router.tsx:41`), без lazy і без гейта. Тож `useAppLock()` (`useAppLock.ts:51`) викликає `useFlag("app-lock-enabled")` → `getFlag` → `flagsStore.get()` вже на першому рендері, коли `getActiveSqliteKvStore()` ще `null`.
3. `storage.ts:151-155`: `resolveStore()` у цей момент повертає сирий localStorage. Після буту прапорець лежить тільки в SQLite `kv_store`, а в localStorage `hub_flags_v1` немає.
4. `typedStore.ts:196-201`: `get()` кешує перше прочитане значення (`{}`) і більше не перечитує (`cachedLoaded=true`).
5. `typedStore.ts:253-255`: `webKVStore.onChange(key, reload)` підписується при ініціалізації модуля на той стор, що резолвився тоді, тобто на localStorage. `replaceCache` або BroadcastChannel SQLite-стора сюди не доходять.
6. Ніде немає `flagsStore.reload()` після `markStorageReady()`; grep по `.reload()` нічого такого не знаходить.
7. Гейт `storageReady` (`storageReady.ts`) використовують лише `HubPage`, `useModuleFirstRun`, `mom …[обрізано]
```

<a id="priv-04"></a>

### `priv-04` [high] Вихід з акаунта не знімає web-push підписку: банківські пуші попереднього користувача далі приходять на спільний пристрій

- **Стан:** частково виправлено в #1341 (змерджено 2026-10-03) (клієнт: `logout()` знімає web-push підписку до `signOut()`, best-effort з таймаутом, скидає мітку тумблера; лишилось: прив'язка підписки до сесії і soft-delete при завершенні сесії на сервері (M), native-токен FCM/APNs при виході, відсікання пушів у service worker без активного користувача)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: auth + server: push
- **Де:** apps/web/src/core/auth/AuthContext.tsx:548-697; apps/web/src/shared/hooks/usePushNotifications.ts:224-256; apps/web/src/shared/hooks/usePushNotifications.webpush.ts:71-77; apps/server/src/modules/push/push.ts:33-56, 134-142; apps/server/src/modules/push/send.ts:103-110; apps/server/src/modules/mono/webhook.ts:130-154, 467-471
- **Першопричина:** logout() не викликає pushManager.getSubscription().unsubscribe() і api.push.unregister: відписка є лише в тумблері. На сервері push_subscriptions прив'язана тільки до user_id, хука на завершення сесії немає. SW показує кожен пуш без перевірки активного користувача.
- **Вплив:** Після явного виходу A наступна людина на пристрої безстроково бачить у системних сповіщеннях суми, мерчантів і доступний баланс A з Monobank-вебхука. A не може прибрати це віддалено, а текст 409 у push.ts хибно обіцяє, що вихід звільняє пристрій.
- **Що зробити:** У logout() до signOut() отримати підписку і викликати api.push.unregister({platform:'web', endpoint}) та sub.unsubscribe() (best-effort, з таймаутом). На сервері зберігати session_id під час реєстрації і робити soft-delete підписки при завершенні сесії.
- **Примітка:** Живцем не відтворено, бо локально немає VAPID (register → 503); код-шлях перевірено повністю. На проді VAPID за чеклістом заданий у Coolify. Скептик пропонував medium: розкриття пасивне, потрібен той самий профіль браузера, увімкнені пуші й підключений Monobank. Лишаю high, бо це крос-юзер витік фінансових даних, і наступній людині не треба нічого робити, щоб його побачити. Серверна прив'язка до сесії — окремий крок обсягом M.

Знахідок у кластері: 1.

#### [high] Вихід з акаунта не знімає web-push підписку: банківські пуші попереднього користувача далі приходять на спільний пристрій

- **ID:** `client-static/service-worker-pwa#1` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** apps/web/src/core/auth/AuthContext.tsx:548-697 (logout без push unregister); apps/web/src/shared/hooks/usePushNotifications.ts:112-113, 224-253; apps/web/src/shared/lib/storage/purgeLocalData.ts:59-60; apps/server/src/modules/push/push.ts:50-56; apps/server/src/modules/mono/webhook.ts:130-154, 468; apps/server/src/auth.ts:449-560
- **Вплив:** На спільному/сімейному пристрої після явного виходу A наступна людина бачить суми, мерчантів і доступний баланс A, а також його нагадування. Це обходить головну межу приватності, яку logout() старанно будує (SQLite, LS, SW-кеші).
- **Рекомендація:** У logout() до signOut() отримати pushManager.getSubscription(), викликати api.push.unregister({platform:'web', endpoint}) і sub.unsubscribe() (best-effort, з таймаутом). Додатково на сервері: при видаленні сесії / sign-out soft-delete push_subscriptions, створені з цієї сесії (зберігати session_id при register), або прив'язати підписку до сесії.

**Докази:**

```text
logout(): signOut() → queryClient.clear() → swClearCaches() → swSetActiveUser(null) → wipeSqliteDb() → purgeAppOwnedLocalData() → location.assign(SIGN_IN_PATH). Ні pushManager.getSubscription().unsubscribe(), ні api.push.unregister тут немає (getSubscription викликається лише в unsubscribeFromWebPush, usePushNotifications.webpush.ts:73, тобто лише з тумблера). На сервері push_subscriptions прив'язана лише до user_id (OWNERSHIP_SAFE_WEB_UPSERT), хука на видалення сесії немає (databaseHooks: лише user.create/update і session.create). purgeAppOwnedLocalData стирає префікс `hub_`, тож прапорець `hub_push_subscribed` зникає і наступний користувач бачить «сповіщення вимкнено». Монобанк-вебхук шле sendToUserQuietly(userId, {title: amountStr, body: `${description} · доступно ${balanceStr}`}).
```

**Відтворення:**

```text
Потрібен налаштований VAPID (локально /api/v1/push/vapid-public = 503, тому живцем не відтворено). 1) Користувач A вмикає пуші в браузері і має підключений Monobank. 2) A натискає «Вийти». 3) У тому ж браузері працює B (або нікого). 4) Нова транзакція A → вебхук → sendToUser(A) → пуш доставляється на endpoint цього браузера: «−500,00 ₴ / Сільпо · доступно 12 345,67 ₴».
```

**Верифікатор:**

```text
Перевірено в коді. logout() (AuthContext.tsx:548-697) робить flush → signOut → queryClient.clear → swClearCaches → swSetActiveUser(null) → wipe SQLite → purgeAppOwnedLocalData → location.assign. pushManager.getSubscription()/unsubscribe() і api.push.unregister у ньому не викликаються. В apps/web/src їх кличе лише unsubscribeMutation з тумблера (usePushNotifications.ts:239-253, usePushNotifications.webpush.ts:71-77). На сервері push_subscriptions має лише user_id/endpoint/keys, колонки сесії немає (перевірив через psql \d). databaseHooks в auth.ts містять тільки user.create/update і session.create, хука на видалення сесії чи sign-out немає. Тож після явного виходу рядок лишається за A: sendToUser(A) далі шле на endpoint браузера банківські пуші з mono-вебхука (webhook.ts:130-154: сума, мерчант, «доступно <баланс>») і нагадування (reminders/sweep.ts вибирає за push_subscriptions). Через purge префікса `hub_` зникає `hub_push_subscribed`, і наступний користувач бачить «Вимкнено». Захисту, який би це гасив, не знайшов. OWNERSHIP_SAFE_WEB_UPSERT переносить підписку на B лише тоді, коли B сам увімкне пуші. Текст 409 («Вийди з того акаунта на цьому пристрої й увімкни сповіщення знову») на …[обрізано]
```

**Додаткові докази верифікатора:**

```text
push.ts:121-125 (web register 503 без VAPID, тому без живого прогону). psql: push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at,deleted_at), session_id немає. push.ts:136-142, текст 409: «Вийди з того акаунта на цьому пристрої й увімкни сповіщення знову», хоча logout підписку не знімає. purgeLocalData.ts:59-60 APP_OWNED_LS_PREFIXES містить "hub_".
```

**Скептик:** не спростував, оцінка medium.

```text
I couldn't refute it. The mechanism holds end to end, but I'd rate it medium, not high.

Each step I checked:
1. Client logout, apps/web/src/core/auth/AuthContext.tsx:551-696, runs in this order: flushPendingSyncOpsBeforeLogout, reconcileChatOwnerOnAuthChange, clearHubQuickStatsSnapshots, setSignedOut, signOut, queryClient.clear, swClearCaches, swSetActiveUser(null), origin-id reset, wipeSqliteDb, purgeAppOwnedLocalData, then location.assign at :689. Nothing in that chain calls pushManager.getSubscription, sub.unsubscribe or api.push.unregister.
2. The signOut wrapper (authClient.ts:194-202) only clears the bearer token, and only under Capacitor.
3. Across apps/web/src there are no calls to registration.unregister(). If there were, the browser would drop the push subscription. The only unsubscribe path is the toggle mutation, usePushNotifications.ts:239-256 → usePushNotifications.webpush.ts:71-77.
4. The service worker shows every push it receives, with no check on the active user or partition: sw.ts:136-157 calls showNotification unconditionally. SW_SET_USER (sw/messages.ts:97-106) only changes the cache partition.
5. The server has no sign-out hook. auth.ts `hooks.before` handles only /change-password (:597-605), and databaseHooks cover only user.create/update and session.create.
6. Sending is keyed on the user alone: send.ts:103-110 selects `push_subscriptions WHERE user_id=$1 AND deleted_at IS NULL`, and sendToUser has no session or preference gate.
7. The Monobank webhoo …[обрізано]
```

<a id="priv-05"></a>

### `priv-05` [high] Вихід і видалення акаунта не стирають локальну SQLite-базу: close() вбиває воркер раніше, ніж до нього доходить wipe()

- **Стан:** частково виправлено в #1335 (змерджено 2026-10-03) (wipe до close для воркерного бекенду + тест на справжньому sqliteWorkerClient; лишилось: повтор стирання на наступному старті, прибирання осиротілих `sergeant-*.db` на пристроях, де вже виходили, e2e «після виходу файлу немає»)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: локальна БД (OPFS-воркер)
- **Де:** apps/web/src/core/db/sqlite.ts:235-249, 515-522; apps/web/src/core/db/sqliteWorkerClient.ts:150-151, 223-226, 255-264; apps/web/src/core/db/sqliteWorker.ts:152-160; apps/web/src/core/auth/AuthContext.tsx:646-652; apps/web/src/core/profile/DangerZoneSection.tsx:41-48
- **Першопричина:** wipeSqliteDb() для воркерного бекенду (opfs-sahpool, безумовний основний шлях) спершу викликає stale.close(). Клієнт воркера у finally робить terminate() і ставить dead. Тому наступний conn.wipe() одразу відхиляється, помилку ковтає logger.warn, і pool.unlink так і не виконується. Тести мокають wipe і цю регресію не ловлять.
- **Вплив:** Після «Вийти» і навіть після видалення акаунта файл sergeant-&lt;userId&gt;.db з фінансами, звичками, їжею і вагою лишається в OPFS відкритим текстом. Діалог виходу при цьому обіцяє, що дані з пристрою зітруться. Файл читається DevTools-ом чи будь-яким скриптом на origin, тож гарантія ізоляції F17 і обіцянка стирання не виконуються.
- **Що зробити:** Для воркерного бекенду викликати conn.wipe() до close(): обробник 'wipe' у воркері сам закриває БД перед unlink. terminate() робити після нього. Додати інтеграційний тест на справжньому sqliteWorkerClient і e2e-перевірку, що після виходу файлу sergeant-&lt;id&gt;.db немає. Збій стирання показувати людині або повторювати на наступному старті.
- **Примітка:** Дві незалежні знахідки плюс окремий живий прогін скептика. Скептик і другий верифікатор оцінили medium, бо UI наступного користувача файл A не відкриває. Лишаю high з трьох причин: збій детермінований і тихий у всіх сучасних браузерах; порушено обіцянку стирання при видаленні акаунта; разом із priv-02, priv-16 і priv-17 жоден шлях не стирає локальні дані повністю.
- **Повторна перевірка на свіжому `main`:** так, досі є, серйозність medium. Проблема на поточному HEAD (cf057000) є. Після аудиту (c7c09607) жоден коміт не чіпав apps/web/src/core/db/*, AuthContext.tsx чи DangerZoneSection.tsx: `git log c7c09607..HEAD` за цими шляхами порожній. Ланцюжок на HEAD: 1) apps/web/src/core/db/sqlite.ts:209-250, функція wipeSqliteDb(). До close() стирання виконується лише для kvvfs (рядки 228-234). Далі `await stale.close()` (235-240), і тільки потім `open.wipe()` для всіх VFS, крім kvvfs (243-249). 2) stale.close() веде в handle.close() → `driver.conn.close()` (sqlite.ts:387-388). Для воркерного бекенду це SqliteWorkerConnection.close() (sqliteWorkerClient.ts:255-261): `call({kind:"close"})`, а у `finally` викликається terminate(). terminate() (223-226) кличе killAll(), той ставить `dead`, і воркер вбивається. 3) open.wipe() для воркера = `() =&gt; conn.wipe()` (sqlite.ts:521). Це `call({kind:"wipe"})`, а send() одразу повертає `if (dead) return Promise.reject(dead)` (sqliteWorkerClient.ts:151). Помилку ковтає logger.warn (sqlite.ts:247), тож обробник "wipe" з pool.unlink (sqliteWorker.ts:152-160) не виконується ніколи. 4) Відтворив це на справжньому sqliteWorkerClient.ts з фейковим Worker, у тому самому порядку, що й у wipeSqliteDb (скрипт у scratchpad/agents/recheck-priv-05/probe.mts). Результат: `{"seen":["open","close"],"terminated":true,"wipeRejected":"Error: sqlite-worker: connection closed"}`. Повідомлення "wipe" у воркер так і не надходить. 5) Воркерний бекенд тут основний шлях: «БЕЗУМОВНИЙ основний шлях», sqlite.ts:419-420. Головнопотоковий OPFS у браузері не піднімається, бо `Missing required OPFS APIs` (sqliteWorker.ts:8-12). Отже на сучасних браузерах стирання при виході не спрацьовує ніколи. На kvvfs-фолбеку і на головнопотоковому OPFS стирання працює, бо там інший порядок. 6) Виклики: logout → wipeSqliteDb (AuthContext.tsx:646-652); видалення акаунта → onLogout (DangerZoneSection.tsx:49). purgeLocalData.ts:23-25 навмисно не чіпає OPFS-файл і покладається на wipeSqliteDb. Діалог виходу обіцяє «Дані з цього пристрою зітруться» (ProfilePage.tsx:264). 7) Чому тести мовчать. sqlite.workerBackend.test.ts:52-53 мокає close/wipe як незалежні vi.fn. sqlite.peruser.test.ts:95-108 перевіряє лише головнопотоковий фейк, де wipe сам викликає pool.unlink. sqliteWorkerClient.test.ts не має кейсу close→wipe. Що пробував спростувати і не вийшло. Інших шляхів видалення OPFS немає: purgeLocalData поза скоупом, unlink є лише в sqlite.ts:816 і sqliteWorker.ts:159. Reload після виходу файл не прибирає. Якби stale був null, сингльтона теж не було б, а отже і currentOpen, тож стирати було б нічого. Severity: пропоную medium, а не high. Збій детермінований і тихий, обіцянка стирання (і при видаленні акаунта) порушена. Але сесія наступного користувача відкриває свій sergeant-&lt;B&gt;.db, і UI файлу A не показує. Щоб прочитати цей файл, потрібні DevTools або OPFS API на origin, а sahpool до того ж зберігає файли під непрозорими іменами. Тобто треба локальний технічний доступ або XSS, а XSS і так читає живу базу. Для порівняння, priv-04 (пуші попереднього користувача видно без жодних навичок) обґрунтовано high. Обидва верифікатори в кластері теж ставили medium. Якщо командна шкала вважає порушену обіцянку стирання при видаленні акаунта за high, то high теж можна захистити.
- **Мінімальний фікс:** Мінімальна правка: для воркерного бекенду викликати wipe ДО close. Обробник "wipe" у воркері вже сам робить db.close() і тільки потім pool.unlink (sqliteWorker.ts:152-160), тож інваріант «unlink після close» зберігається всередині воркера. 1) apps/web/src/core/db/sqlite.ts: - в інтерфейс OpenedDb (≈рядок 627) додати поле `readonly wipeBeforeClose: boolean` (або `wipeClosesItself`); - в attemptWorkerBackedDb (рядки 516-522) поставити `wipeBeforeClose: true`, у головнопотоковий OPFS (811-818) і memory поставити `false`, у kvvfs поставити `true`; - у wipeSqliteDb (228-249) замінити умову `open.vfs === "kvvfs"` на `open.wipeBeforeClose`, а останній блок на `!open.wipeBeforeClose`. 2) apps/web/src/core/db/sqliteWorkerClient.ts:262-264: `async wipe() { try { await call({ kind: "wipe" }); } finally { terminate(); } }`, щоб після wipe воркер теж гасився. Наступний stale.close() на мертвому з'єднанні впаде тихо і буде проковтнутий (sqlite.ts:238-239). Щоб не шуміло в логах, можна зробити close() ідемпотентним: `if (dead) return`. 3) Тести: - у sqlite.workerBackend.test.ts перевірити, що wipe викликано раніше за close (порядок викликів через mock.invocationCallOrder); - у sqliteWorkerClient.test.ts додати кейс із справжнім клієнтом і фейковим Worker: після wipeSqliteDb-послідовності у `seen` є "wipe"; - бажано додати e2e: після виходу в OPFS-пулі немає файлу sergeant-&lt;id&gt;.db. 4) Окремий follow-up: на пристроях, де люди вже виходили з акаунта, лишились осиротілі файли. Лідер на старті може прибрати через pool.getFileNames()/unlink усі `sergeant-*.db`, крім активного і `sergeant-anon.db`. Це заодно звільнить слоти пулу (див. AI-DANGER біля SAH_POOL_INITIAL_CAPACITY).

Знахідок у кластері: 2.

#### [high] Вихід і видалення акаунта не стирають локальну SQLite-БД користувача: wipe іде у воркер, який уже завершено через close()

- **ID:** `browser-crosscut/data-isolation-browser#1` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `privacy`
- **Де:** apps/web/src/core/db/sqlite.ts:235-249 (wipeSqliteDb: спершу stale.close(), потім open.wipe()), sqlite.ts:521 (wipe: () =&gt; conn.wipe()), apps/web/src/core/db/sqliteWorkerClient.ts:151,223-226,255-264; виклики: core/auth/AuthContext.tsx:646-651, core/profile/DangerZoneSection.tsx:41-48; URL http://127.0.0.1:4173/profile → «Вийти» / «Видалення акаунта»
- **Вплив:** На спільному пристрої вся локальна копія даних X (фінанси, звички, їжа, вага з нотатками, рецепти) лишається після «Вийти» і навіть після видалення акаунта. Її читає будь-хто з доступом до DevTools або будь-який скрипт на origin. Гарантія ізоляції F17 і текст діалогу виходу не виконуються, а записи, про які діалог каже «зникнуть назавжди», насправді лишаються.
- **Рекомендація:** Для воркерного бекенду не викликати close() перед wipe(): обробник 'wipe' у sqliteWorker.ts сам закриває БД перед unlink. Тобто для vfs 'opfs-sahpool' (worker) треба викликати conn.wipe(), а terminate() робити вже після нього. Додати інтеграційний тест на справжній sqliteWorkerClient (зараз wipe замокано vi.fn у sqlite.workerBackend.test.ts) і перевірку «файлу sergeant-&lt;id&gt;.db після logout немає». Не ковтати помилку wipe мовчки: показувати її в UI або повторювати спробу на наступному старті.

**Докази:**

```text
Код: close() робить call({kind:'close'}), а у finally terminate() → killAll() ставить dead; далі wipe() → send(): `if (dead) return Promise.reject(dead)`. Помилку ловить `logger.warn('[sqlite] storage wipe failed')`, і unlink так і не виконується.
Живо (22-run.log): шпигун на Worker.postMessage від кліку «Вийти» до /sign-in показав ["/#28 close","/#30 open:sergeant-PGQL4sLE…db","/sign-in#1 open:sergeant-anon.db"], has wipe: false. OPFS після виходу: "z63x8xa9ky 1495040 /sergeant-PGQL4sLE4u5lC7lsxme0Ryw3OJn9kWmA.db".
Файл витягнуто (agents/browser-crosscut-data-isolation-browser/21-egyj-x-after-logout.db) і прочитано через sqlite3: finyk_manual_expenses 'SECRET-X-egyj-777 аптека' 777, routine_habits 'SECRET-X-egyj-habit', nutrition_meals, nutrition_pantry_items, fizruk_daily_log 81.5 + 'SECRET-X-egyj-body нотатка', nutrition_recipes, fizruk_custom_exercises.
Видалення акаунта (32-run.log): після тосту «Акаунт видалено» → /sign-in, cookies [], а в OPFS лишився '/sergeant-l6BiTSkEZZnHfNn31CFOFy5HXCtUfLis.db' з SECRET-DEL-nqgv.
Діалог виходу при цьому обіцяє: «Дані з цього пристрою зітруться» (shots/.../22-logout-dialog.png).
```

**Відтворення:**

```text
1) Увійти через UI як X, створити витрату/звичку. 2) /profile → «Вийти» → «Вийти». 3) На /sign-in виконати navigator.storage.getDirectory() → sergeant/sqlite/.opaque і прочитати перші 512 байт кожного файлу: є '/sergeant-<X-id>.db' розміром ~1.5 МБ з усіма даними X. Скрипти: agents/browser-crosscut-data-isolation-browser/22-wipe-trace.mjs, 21-full.mjs, 32-delete-account-local.mjs.
```

**Верифікатор:**

```text
Код підтверджує причину. Для воркерного бекенду (`vfs: "opfs-sahpool"`) `wipeSqliteDb()` спершу викликає `stale.close()` (sqlite.ts:235-240), а `handle.close()` іде в `driver.conn.close()`. У sqliteWorkerClient.ts:255-261 `close()` після `call({kind:'close'})` у `finally` викликає `terminate()`, а той через `killAll()` ставить `dead`. Наступний виклик `open.wipe()` → `conn.wipe()` → `send()` одразу повертає `Promise.reject(dead)` (рядок 151). Помилку ковтає `logger.warn('[sqlite] storage wipe failed')`, тож повідомлення 'wipe' до воркера взагалі не доходить, і `pool.unlink` (sqliteWorker.ts:152-160) не виконується. Обробник 'wipe' у воркері сам закриває БД перед unlink, тобто зовнішній `close()` тут зайвий і шкідливий. Видалення акаунта (DangerZoneSection → onLogout → `logout()`) іде тим самим шляхом. Нейтралізатора немає: інших місць з unlink чи очищенням OPFS у core/db нема. У purgeLocalData.ts:24-25 OPFS-файл прямо названо відповідальністю `wipeSqliteDb()`. Відтворено наживо на свіжому користувачі.
```

**Додаткові докази верифікатора:**

```text
v1-run.log (agents/verify-browser-crosscut-data-isolation-browser/v1-logout-wipe.mjs, user audit_pool95): перед виходом звичка 'VSEC-6f3n-habit' лежить у /sergeant-6YXCX1A…db. Повідомлення воркеру після кліку «Вийти»: ["/profile close","/profile open:sergeant-6YXCX1A….db","/profile diagnostics","/ close","/ open:sergeant-6YXCX1A….db","/ open:sergeant-6YXCX1A….db","/sign-in open:sergeant-anon.db",…], has wipe msg: false. Після виходу і ще одного reload OPFS усе одно має '/sergeant/sqlite/.opaque/yi319gtdex (/sergeant-6YXCX1A….db) :: VSEC-6f3n'. Діалог обіцяв «Дані з цього пристрою зітруться». Окреме спостереження: після `close` БД користувача, який виходить, ще раз відкривається (`open:sergeant-<X>.db`) до `setSqliteUser(null)`. Тому навіть після перестановки close/wipe треба перевірити, що …[обрізано]
```

**Скептик:** не спростував, оцінка medium.

```text
Я не зміг спростувати цю знахідку. Механізм підтверджено і в коді, і моїм власним незалежним живим прогоном. Severity, на мою думку, трохи завищена: high -> medium.

КОД (повний шлях):
- Воркерний бекенд є безумовним основним шляхом. sqlite.ts:349 openWorkerBackedDb(); коментар на sqlite.ts:410-417 каже: «Від стадії 3 це БЕЗУМОВНИЙ основний шлях: прапорця більше немає». На реальних браузерах (Chrome/Firefox/Safari 17+) усі йдуть сюди.
- Вихід викликає wipeSqliteDb(): AuthContext.tsx:646-648. У wipeSqliteDb для vfs != kvvfs спершу виконується `await stale.close()` (sqlite.ts:235-240), а потім `open.wipe()` (sqlite.ts:243-248).
- stale.close() -> handle.close() -> driver.conn.close() (sqlite.ts:387-388) -> sqliteWorkerClient.ts:255-261: call({kind:'close'}), а у finally terminate() (рядки 223-226) -> killAll() ставить `dead`.
- open.wipe() = `() => conn.wipe()` (sqlite.ts:521) -> call({kind:'wipe'}) -> send(): `if (dead) return Promise.reject(dead)` (sqliteWorkerClient.ts:151). Повідомлення 'wipe' до воркера не доходить, тож `pool.unlink` (sqliteWorker.ts:152-160) не виконується.
- Помилку ковтає logger.warn('[sqlite] storage wipe failed') (sqlite.ts:247). У prod logger.warn пише лише Sentry-breadcrumb (logger.ts:9-10), тобто збій повністю тихий.
- Іншого механізму очищення немає: grep по apps/web/src на unlink/removeEntry/getDirectory поза тестами дає нуль у core/db. purgeLocalData.ts:24-25 прямо покладає OPFS-файл на wipeSqliteDb(). Тести (sqlite.peruser.test.ts) ганяють голо …[обрізано]
```

#### [medium] Вихід не видаляє локальну SQLite-базу користувача: `close()` вбиває воркер раніше, ніж доходить до `wipe()`

- **ID:** `client-static/web-storage-session#3` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Серйозність від шукача:** high
- **Де:** apps/web/src/core/db/sqlite.ts:235-249,515-522; apps/web/src/core/db/sqliteWorkerClient.ts:150-151,223-226,255-264; apps/web/src/core/auth/AuthContext.tsx:646-652; apps/web/src/core/profile/ProfilePage.tsx:262-265
- **Вплив:** Після виходу, а також після видалення акаунта (DangerZone теж іде через `logout()`), уся локальна копія фінансів, здоровʼя й черги синхронізації лишається на диску спільного пристрою відкритим текстом. Гарантія ізоляції page-audit-10 F17 на основному OPFS-шляху з 3-ї стадії не працює. Пул SAH до того ж росте на кожен акаунт.
- **Рекомендація:** Для воркерного бекенду викликати `conn.wipe()` до `close()` (воркерний `wipe` сам закриває БД) і лише потім `terminate()`. Або зробити `close()` воркера без terminate, поки не виконано `wipe`. Додати e2e-перевірку, що після виходу у файлі OPFS немає рядка, записаного до виходу. Помилку стирання не ковтати мовчки: показати людині, що дані не стерто.

**Докази:**

```text
Браузер (share2.mjs): користувач X додав звичку «QWOPFS психіатр щочетверга». `OPFS hits BEFORE logout: ["/sergeant/sqlite/.opaque/yy2x4rim12 size=1495040 @1166906"]`, після виходу через UI ті самі байти: `OPFS hits AFTER logout: [... yy2x4rim12 size=1495040 @1166906]`. Рядок лишається й після входу користувача Y. Причина: `wipeSqliteDb` для не-kvvfs спершу викликає `stale.close()`, а клієнт воркера в `close()` робить `finally { terminate() }`, тобто `killAll` і `dead = Error('connection closed')`. Наступний `open.wipe()` -> `send()` -> `if (dead) return Promise.reject(dead)`. Відмову ковтає `logger.warn('[sqlite] storage wipe failed')`, тож `pool.unlink` не виконується ніколи. Діалог виходу при цьому обіцяє: «Дані з цього пристрою зітруться».
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-storage-session/share2.mjs <newX> wss-share-y: додати звичку, вийти через Профіль -> Вийти -> Вийти, після чого перебрати файли OPFS (`navigator.storage.getDirectory()`) і знайти текст звички.
```

**Верифікатор:**

```text
Підтверджено і кодом, і в браузері. sqlite.ts:235-249: для не-kvvfs спершу `stale.close()`, тобто `driver.conn.close()`. Клієнт воркера в `finally` викликає `terminate()` (sqliteWorkerClient.ts:255-260 → killAll ставить `dead`), і наступний `conn.wipe()` → `send()` відразу відхиляється (`if (dead) return Promise.reject(dead)`, :151). Відмову ковтає logger.warn, у prod тихо. Живий прогін з інструментованим Worker.postMessage показав під час виходу `POST close` → `RESP close ok` → `TERMINATE`, а повідомлення `wipe` до воркера не дійшло жодного разу. Заголовок SAH-слота після виходу досі `assoc="/sergeant-<userId>.db"`, і рядок звички лежить на тому ж зсуві, тобто файл не відвʼязано. Діалог виходу при цьому обіцяє: «Дані з цього пристрою зітруться». Severity знижено до medium: у UI іншого акаунта дані не потрапляють (партиція за імʼям файлу), прочитати їх можна лише через devtools або доступ до файлів OPFS.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v3-logout-opfs.mjs. До виходу: `/sergeant/sqlite/.opaque/wp1dedoe7pr assoc="/sergeant-fc3eR8...db" NEEDLE@1166917`. Після виходу ідентично. Журнал воркера: `POST close id=110`, `RESP close ok`, `TERMINATE`, `wipe` відсутній. Попутно видно гонку: після close відкриття тієї ж партиції падає з `Access Handles cannot be created...`. У чеклісті docs/work/specs/audits/2026-09-01-product-audit/checklists.md:262 перевірка «локальна БД порожня» стоїть невідміченою, як дефект не зафіксована.
```

## medium

<a id="priv-06"></a>

### `priv-06` [medium] Гейт згоди на дані про здоров'я пропускає алергії, дієту, тренування й цілі з вагою: вони йдуть у LLM і в RAG без healthDataConsent

- **Стан:** виправлено в гілці claude/fix-priv-06-09-ai-health-consent
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: AI-шар (chat, ai-memory)
- **Де:** apps/server/src/modules/chat/healthGate.ts:53-54, 139-146; apps/server/src/modules/ai-memory/healthRows.ts:28-30; apps/server/src/modules/ai-memory/profileMirror.ts:356; apps/web/src/core/lib/hubChatContext/sections.ts:283-297; apps/web/src/core/legal/privacyDocument.ts:57-59
- **Першопричина:** Health-фільтри розпізнають лише категорію «Здоров'я»: регекси PROFILE_HEALTH_LINE/ENTRY, classifyToolUse('remember') і isHealthMemoryRow перевіряють тільки category === 'health'. Категорії allergy, diet, training і цілі з вагою вважаються нечутливими. Спільного переліку health-категорій для клієнта і сервера немає.
- **Вплив:** Дані спеціальної категорії (ст. 9 GDPR) людей, які згоди не давали, потрапляють у system-блок, у my_profile, а через profileMirror ще й в ai_memories і Voyage. Це суперечить політиці: «без згоди Сержант не бачить тренувань, ваги, харчування».
- **Що зробити:** Винести перелік health-категорій (health, allergy, diet, training, ціль з вагою) в @sergeant/shared. Використати його в stripHealthContext, redactHealthToolResults/classifyToolUse і isHealthMemoryRow/profileMirror. Додати тест на кожну категорію.

Знахідок у кластері: 1.

#### [medium] Гейт згоди на дані про здоровʼя пропускає алергії, дієту й тренування з профілю: вони йдуть у LLM і в RAG без healthDataConsent

- **ID:** `server-static/ai-layer#5` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/modules/chat/healthGate.ts:53-54, 139-146; apps/server/src/modules/ai-memory/healthRows.ts:28-30; apps/server/src/modules/ai-memory/profileMirror.ts:356; apps/web/src/core/legal/privacyDocument.ts:57-59
- **Вплив:** Дані спеціальної категорії (GDPR Art. 9: алергії, дієтичні обмеження, тренування) передаються стороннім LLM-вендорам і Voyage без явної згоди, всупереч тексту політики конфіденційності.
- **Рекомендація:** Вважати health-категоріями allergy, diet, training (і, ймовірно, goal з вагою) у всіх трьох місцях: PROFILE_HEALTH_LINE/ENTRY за мітками «Алергії|Дієта|Тренування|Здоровʼя», classifyToolUse для remember/my_profile, isHealthMemoryRow і healthData у profileMirror. Винести перелік health-категорій в @sergeant/shared, щоб клієнт і сервер не розходились.

**Докази:**

```text
PROFILE_HEALTH_LINE = /^\s+Здоров.я:/ і PROFILE_HEALTH_ENTRY = /\[Здоров.я\]/ ловлять лише категорію health; classifyToolUse('remember') блокує лише category==='health'; isHealthMemoryRow для profile -- лише metadata.category==='health'. Запуск (<scratch>/agents/server-static-ai-layer/healthgate.mts): stripHealthContext лишає `  Алергії: алергія на арахіс / Дієта: вегетаріанка, 1800 ккал / Тренування: бігаю 3 рази на тиждень, жим 100 кг`; redactHealthToolResults лишає `[Алергії] на арахіс\n[Тренування] жим 100 кг` у my_profile і `Запамʼятав: алергія на арахіс` у remember; isHealthMemoryRow profile/allergy|diet|training = false. Політика обіцяє: «Без згоди Сержант не бачить тренувань, ваги... харчування й калорій» і що такі дані «не потрапляють ні у відповіді, ні в довгу памʼять».
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-ai-layer/healthgate.mts. У продукті: без згоди додати в Профіль факти категорій «Алергії», «Дієта», «Тренування» і написати в чат -- вони їдуть у system-блок, у my_profile і (через profileMirror) у ai_memories/RAG.
```

**Верифікатор:**

```text
Відтворено незалежно, на реальному форматі контексту з apps/web/src/core/lib/hubChatContext/sections.ts:283-297 (рядки виду «  <label>: факти»). stripHealthContext прибирає лише рядок «Здоровʼя», а «Алергії», «Дієта», «Тренування» і «Цілі» (схуднути до 70 кг) лишаються. redactHealthToolResults лишає [Алергії] і [Тренування] у my_profile без категорії і з category=allergy, а також відповідь remember з category=allergy. isHealthMemoryRow для profile/allergy|diet|training повертає false, тож ці факти без згоди йдуть у ai_memories і RAG. Це не задокументований свідомий виняток. Рішення власника 2026-09-29 (hub-coach.md:795) явно називає лише «категорію профілю Здоровʼя», але сам перелік даних, що гейтяться, включає тренування і записи про їжу. Політика конфіденційності прямо обіцяє: «без згоди Сержант не бачить тренувань… харчування». Коментар у profileMirror.ts пояснює виключення інших категорій прикладом із кавою, а алергії й тренування там не розглянуто. Виняток політики («те, що пишеш у чаті чи голосом») профіль не покриває. Medium: дані спецкатегорії GDPR Art. 9 (алергії, тренування) йдуть до LLM-вендорів усупереч задекларованому гейту.
```

**Додаткові докази верифікатора:**

```text
verify-server-static-ai-layer/healthgate-v2.mts: STRIPPED CONTEXT лишає «Алергії: алергія на арахіс / Дієта: вегетаріанка / Тренування: жим 100 кг / Цілі: схуднути до 70 кг», прибрано лише рядок «Здоровʼя». isHealthMemoryRow profile/allergy=false, diet=false, training=false, health=true. memoryBank.ts:83-91 CATEGORY_META визначає ці категорії.
```

<a id="priv-07"></a>

### `priv-07` [medium] Прогалини редакції URL і заголовків у Sentry: токен скидання пароля в path, query_string, атрибути root-span, http.query і секрет Telegram-вебхука

- **Стан:** виправлено в #1328 (змерджено 2026-10-03)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: observability (Sentry)
- **Де:** apps/server/src/sentry.ts:258 (SPAN_URL_ATTRIBUTES), 266-282, 349-369, 379-403; apps/server/src/obs/sensitiveUrl.ts:144-147, 177; packages/shared/src/lib/pii.ts:49-120; apps/server/src/routes/mono-webhook.ts:62; apps/server/src/modules/nutrition/food-search.ts:127
- **Першопричина:** Хуки редагують request.url, url.full і span-атрибути зі списку. Поза редакцією лишаються event.request.query_string, contexts.trace.data (туди OTel кладе http.url і http.target root-span), а також http.query/url.query у breadcrumbs і spans. sensitiveUrl знає лише шлях /api/mono/webhook/, а в REDACT_KEY_NAMES немає x-telegram-bot-api-secret-token та OAuth-ключів.
- **Вплив:** /api/auth/ трасується на 100%, тож кожен клік за посиланням скидання пароля кладе в Sentry дійсний (близько 1 год) токен. Для будь-кого з доступом до проєкту це захоплення акаунта. Там само осідають секрет Monobank-вебхука в path, Telegram webhook-secret, OAuth-код Сільпо і ключ USDA.
- **Що зробити:** В обох хуках редагувати query_string через redactSensitiveQueryParams і проганяти redactUrlForSink по contexts.trace.data (http.url, http.target, url.full, url.query). Додати url.query/http.query у SPAN_URL_ATTRIBUTES і beforeBreadcrumb, а /api/auth/reset-password/ — у SENSITIVE_PATH_PREFIXES. Розширити REDACT_KEY_NAMES: x-telegram-bot-api-secret-token, access_token, refresh_token, id_token, client_secret, api_key, code_verifier.
- **Примітка:** Ті самі хуки, що в priv-01, але поля й фікс інші; варто робити одним PR. Залежить від активного SENTRY_DSN на проді.

Знахідок у кластері: 1.

#### [medium] Sentry: прогалини редакції URL/заголовків — query_string, root-span http.url/http.target, reset-password токен у path, http.query/url.query, x-telegram-bot-api-secret-token

- **ID:** `server-static/privacy-logging#2` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/sentry.ts:266-282, 379-403 (SPAN_URL_ATTRIBUTES :258), apps/server/src/obs/sensitiveUrl.ts:144-147,177, packages/shared/src/lib/pii.ts:49-120, apps/server/src/routes/mono-webhook.ts:62, apps/server/src/modules/nutrition/food-search.ts:127, barcode.ts:284
- **Вплив:** /api/auth/ трасується на 100%: кожен клік по reset-лінку кладе дійсний (≈1 год) токен скидання пароля в Sentry → захоплення акаунта для будь-кого з доступом до Sentry. Секрет Monobank-вебхука (path), Telegram webhook-secret, OAuth-код Сільпо і ключ USDA також осідають у третьої сторони.
- **Рекомендація:** У обох хуках: редагувати event.request.query_string через redactSensitiveQueryParams; проганяти redactUrlForSink по contexts.trace.data[http.url|http.target|url.full|url.query]; додати url.query/http.query у SPAN_URL_ATTRIBUTES і в beforeBreadcrumb; додати /api/auth/reset-password/ у SENSITIVE_PATH_PREFIXES; додати x-telegram-bot-api-secret-token, access_token, refresh_token, id_token, client_secret, api_key, code_verifier у REDACT_KEY_NAMES. Переносити USDA-ключ у заголовок, якщо API дозволяє.

**Докази:**

```text
Прямий виклик хуків (scratch sentry-scrub.mts, sentry-ctx.mts, sentry-hdr.mts):
- error event: url ...callback?code=[redacted]&state=[redacted], але query_string:"code=AUTHCODE123&state=STATE456" — не чиститься (і для verify-email ?token=<JWT>).
- transaction contexts.trace.data (куди @sentry/opentelemetry кладе атрибути root-span) не редагується: "http.url":".../api/auth/reset-password/AbCdEf...?callbackURL=..", "http.target":"/api/silpo/callback?code=AUTHCODE123&state=STATE456"; так само /api/mono/webhook/:secret.
- Better Auth reset-лінк = `${baseURL}/reset-password/${token}` — sensitiveUrl.ts знає лише /api/mono/webhook/, тож токен лишається і в request.url.
- breadcrumb data["http.query"]:"?query=...&api_key=REALUSDAKEY123456" і span data["url.query"] — не чистяться (url.full чиститься).
- headers: "x-telegram-bot-api-secret-token":"TG_WEBHOOK_SECRET_abc123" не в REDACT_KEY_NAMES; snake_case access_token/refresh_token у extra теж не маскуються.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-privacy-logging/sentry-scrub.mts (а також sentry-ctx.mts, sentry-hdr.mts).
```

**Верифікатор:**

```text
Підтверджено прямим викликом хуків із реалістичними (абсолютними) URL і e2e на справжньому SDK. (1) applyBeforeSend редагує request.url, але query_string не чіпає: `code=AUTHCODE&state=ST` лишається як є. (2) applyBeforeSendTransaction проганяє contexts лише через scrubPII, який рядкові значення не інспектує, тому contexts.trace.data[http.url/http.target/http.query] лишаються сирими. (3) Посилання на скидання пароля Better Auth 1.6.23 має форму `${baseURL}/reset-password/${token}?callbackURL=` (password.mjs:72). Цей GET іде на /api/auth/*, де семплінг 1.0, а токен живе, доки його не використали в POST. Шляху reset-password у SENSITIVE_PATH_PREFIXES немає, тож токен потрапляє в request.url, transaction і trace.data. (4) span.data url.query/http.query і breadcrumb data['http.query'] (USDA api_key у query, food-search.ts:127, barcode.ts:284) не редагуються. (5) Заголовок x-telegram-bot-api-secret-token і snake_case access_token/refresh_token відсутні в REDACT_KEY_NAMES. Знайшов і гіршу річ, яку фіндер пропустив: C1-редакція mono-webhook-секрету в Sentry не працює взагалі. redactSensitiveUrl перевіряє pathPart.startsWith('/api/mono/webhook/'), а в Sentry request.url абсолютний (https:/ …[обрізано]
```

**Додаткові докази верифікатора:**

```text
node --import tsx <scratch>/agents/verify-server-static-privacy-logging/v2/hooks-direct.mts → `MONO-TX {"transaction":"POST /api/mono/webhook/MONOSECRET","request":{"url":"https://api.sergeant.app/api/mono/webhook/MONOSECRET"}}`, `MONO-ERR` так само без змін; TX: `"transaction":"GET /api/auth/reset-password/RESETTOK123"`, `"x-telegram-bot-api-secret-token":"TGSECRET"`, `"http.target":"/api/silpo/callback?code=AUTHCODE&state=ST"`, `"url.query":"?api_key=USDAKEY"` (url.full відредаговано); ERR: `"query_string":"code=AUTHCODE&state=ST"`, `"access_token":"AT","refresh_token":"RT"`; BC: `"http.query":"?query=x&api_key=USDAKEY"`. Попередній e2e-прогін (e2e-urls.out.txt) теж показує MONOSECRET у $.request.url/$.transaction/$.contexts.trace.data. Хіти inbound-URL у breadcrumbs у тому прогоні є арт …[обрізано]
```

<a id="priv-08"></a>

### `priv-08` [medium] Service Worker кешує приватні відповіді /api/v1/* з no-store, а партиція користувача скидається в спільне anon: у сесії B SW може віддати /me користувача A

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: service worker
- **Де:** apps/web/src/sw/cache.ts:22, 52-118, 151-175; apps/web/src/sw/messages.ts:97-107; apps/web/src/sw/cachePolicy.ts; apps/web/src/core/app/swControl.ts:97-99, 146-160; apps/web/src/core/auth/AuthContext.tsx:382-402, 728-733
- **Першопричина:** activeUserKey живе в пам'яті SW і після idle-kill (близько 30 с) повертається в anon. SW_SET_USER надсилається лише при зміні user.id за життя сторінки. Тому boot-запити всіх користувачів пишуться в спільну партицію, а /me нового користувача може лягти під ключ попереднього. CacheableResponsePlugin кешує будь-яку 200, ігноруючи Cache-Control: no-store, а identity-wipe не викликає swClearCaches.
- **Вплив:** Профіль, email, тариф, AI-пам'ять і біометрія лежать у CacheStorage відкритим текстом до 30 хв, зокрема після протухання сесії. На повільній мережі (тайм-аут NetworkFirst 5 с) чи офлайн застосунок B отримав від SW /api/v1/me користувача A. Чи покаже це UI, залежить від гонки з RQ-снапшотом.
- **Що зробити:** Не кешувати відповіді з no-store/private (плагін cacheWillUpdate) або звузити runtime-кеш до allowlist несекретних GET. Ключ партиції брати з персистентного джерела (IDB) чи з самого запиту; поки ключа немає, кеш не читати й не писати. Повторно слати SW_SET_USER на controllerchange і на кожному старті, а в identity-wipe викликати swClearCaches().
- **Примітка:** Коментар AuthContext.tsx:728-733 визнає відкат на __u=anon як обмеження. Але Chrome вбиває простійний SW приблизно за 30 с, тож у довгій сесії партиціювання майже не діє. Кешування автентифікованих GET задумане, дефект — у партиції та в ігноруванні no-store. Очищення при identity-wipe частково перетинається з priv-02.

Знахідок у кластері: 2.

#### [medium] SW кешує приватні відповіді /api/v1/* (no-store), а партиція __u деградує в спільне `anon`: у сесії B Service Worker віддає /api/v1/me користувача A

- **ID:** `client-static/service-worker-pwa#2` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** apps/web/src/sw/cache.ts:52-118 (activeUserKey/userPartitionPlugin), 151-175 (NetworkFirst API); apps/web/src/sw/messages.ts:97-107; apps/web/src/core/auth/AuthContext.tsx:382-402 (identity-wipe без swClearCaches), 731; apps/web/src/core/app/swControl.ts:146-160
- **Вплив:** activeUserKey скидається в `anon` при кожному перезапуску SW (браузер вбиває idle-SW через ~30 с), а SW_SET_USER приходить лише після резолву /me — тож boot-запити всіх користувачів ідуть у спільну партицію, а /me нового користувача пишеться під ключем попереднього. Протухла/відкликана сесія і перемикання акаунта не чистять SW-кеш (identity-wipe робить лише queryClient.clear + reload). На повільній мережі (NetworkFirst timeout 5 с) або офлайн застосунок B може отримати профіль, тариф, AI-памʼять A; auth-статус виводиться саме з /api/v1/me. У моєму прогоні UI показав B (персистентний RQ-снапшот встиг першим) — UI-рівень залежить від гонки.
- **Рекомендація:** Не кешувати в SW відповіді з Cache-Control no-store/private (cacheWillUpdate-плагін) або звузити runtime-кеш до явного allowlist несекретних GET. Ключ партиції брати не з памʼяті SW, а з самого запиту (наприклад, заголовок/cookie-hash, який SW може прочитати) або персистити в IDB; поки ключа немає — не читати і не писати кеш. У identity-wipe ефекті (AuthContext.tsx:382) і при переході user→unauthenticated викликати swClearCaches().

**Докази:**

```text
exp1.log: кешовані з `cache-control: private, no-store` → api-cache: /api/v1/me, /me/profile, /me/preferences, /me/deletion-status, /billing/status, /chat/usage, /coach/memory, /ai-memory/list. Після ServiceWorker.stopAllWorkers (імітація idle-kill): `/api/v1/me?__u=anon` з email/id/name користувача. exp4.log (A=pool49, B=pool50, той самий профіль браузера, сесія A закінчилась без logout):
1) A: [["3d60db4b","audit_pool49"],["anon","audit_pool49"]]
2) після входу B: [["anon","audit_pool49"],["3d60db4b","audit_pool50"],["6e69c2f5","audit_pool50"]]  ← /me B записано під ключем A
3) мережа недоступна + SW перезапущено, fetch /api/v1/me у сесії B → 200 {"email":"audit_pool49@example.com",...}  ← профіль A
```

**Відтворення:**

```text
PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node <scratch>/agents/client-static-service-worker-pwa/exp4-crossuser-route.mjs (лог exp4.log). Ключові кроки: A користується застосунком; SW зупиняється (idle) → boot-запити A пишуться під __u=anon; cookie A зникає без logout(); входить B; SW знову зупиняється; мережа падає/таймаут >5 с; GET /api/v1/me через SW повертає A.
```

**Верифікатор:**

```text
Відтворено незалежно (v2-partition.mjs). activeUserKey живе в памʼяті SW (cache.ts:52) і після перезапуску SW скидається в "anon". swSetActiveUser викликається лише на переході user.id у межах життя сторінки (AuthContext.tsx:~731), тому після idle-kill запити до наступного mount пишуться під __u=anon. CacheableResponsePlugin кешує будь-яку 200, ігноруючи Cache-Control: no-store. 401 після закінчення сесії не кешується, тож anon-запис із даними A не перезаписується. Identity-wipe ефект (AuthContext.tsx:382-402) не викликає swClearCaches. Коментар у swControl.ts прямо спирається на те, що signOut чистить кеші як «справжня межа», а сесія, що закінчилась без logout() (TTL, відкликання з іншого пристрою), цю межу обходить. Мій прогін, B на тому ж профілі, мережа недоступна, SW перезапущено: GET /api/v1/me через SW → 200 з email A. Severity medium: потрібні спільний профіль браузера, кінець сесії без logout і офлайн чи мережа повільніша за 5 с. UI у прогоні фіндера показав B через персистентний RQ-снапшот.
```

**Додаткові докази верифікатора:**

```text
v2.log (A=audit_pool49, B=audit_pool50):
P1 A cached: ["/api/v1/me","3d60db4b",A],["/api/v1/billing/status","anon",...],["/api/v1/me","anon","audit_pool49@example.com"]
P2 after A session ended without logout (url /welcome): SW caches still hold the same A entries, nothing cleared
P3 B online /me via SW: [200,"audit_pool50@example.com"]
P4 B, net down + SW restarted, /me via SW => [200,"audit_pool49@example.com"]
Script: <scratch>/agents/verify-client-static-service-worker-pwa/v2-partition.mjs (PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1)
```

#### [low] SW кешує автентифіковані API-відповіді (/me, /me/profile, /ai-memory) у CacheStorage, а ключ партиції скидається в `anon`

- **ID:** `client-static/web-storage-session#10` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** apps/web/src/sw/cache.ts:22,55-72,98-115; apps/web/src/sw/cachePolicy.ts (VOLATILE_API_PREFIXES); apps/web/src/core/app/swControl.ts:97-99; apps/web/src/core/auth/AuthContext.tsx:728-733
- **Вплив:** Профіль, email, факти AI-памʼяті й тариф лежать у CacheStorage відкритим текстом. Партиціювання частково не діє: записи `__u=anon`.
- **Рекомендація:** Не кешувати в runtime-кеші SW автентифіковані користувацькі ендпоінти (`/api/v1/me*`, `/ai-memory`, `/billing`): allowlist лише публічних і довідкових GET. Ключ партиції брати з персистентного джерела, а не з памʼяті SW, або повторно надсилати `SW_SET_USER` при `controllerchange` і на кожному старті.

**Докази:**

```text
Браузер (share1.mjs), інвентар для залогіненого користувача: `api-cache-v...: [/api/v1/ai-memory/list?..., /api/v1/me?__u=<hash>, /api/v1/me/profile?..., /api/v1/billing/status?...]`. Після входу Y є запис `"/api/v1/me?__u=anon"`, тобто відповідь `/me` залогіненого користувача збережено в анонімній партиції: перший `/me` іде до `swSetActiveUser`, а `activeUserKey` живе в памʼяті SW і після рестарту SW повертається в `anon`, повторного надсилання немає. UI-вихід кеш чистить (після виходу лишився лише `/sign-in?__u=anon`), але при завершенні сесії без виходу відповіді живуть до 30 хв. Офлайн-повтор `/me` після втрати cookie не відтворився: застосунок пішов на /sign-in.
```

**Відтворення:**

```text
Залогінитись, відкрити кілька сторінок, потім у DevTools перевірити `caches.keys()` -> `api-cache-*` -> URL-и `/api/v1/...`.
```

**Верифікатор:**

```text
NetworkFirst-кешування автентифікованих GET /api/* (30 хв, партиція __u і очищення при виході) зроблене за задумом, тож саме кешування дефектом не є. Відкат партиції на `anon` реальний, і я відтворив його. Коментар у AuthContext.tsx:728-733 визнає обмеження («SW restart will fall back to __u=anon until next mount re-posts»), але Chrome вбиває простійний SW приблизно за 30 с, тож у довгій сесії партиціювання практично не діє. Ефект identity-wipe на протухлій сесії не викликає swClearCaches. Повтор чужого /me між користувачами потребує збою мережі; ні автор, ні я його не відтворили, тому severity лишаю low.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v6-swrestart.mjs. До зупинки SW усі записи мають __u=<hash>. Після CDP ServiceWorker.stopAllWorkers і SPA-навігації без reload у кеші з'являється `/api/v1/ai-memory/list?limit=20&__u=anon`. Попутно: VOLATILE_API_PREFIXES (sw/cachePolicy.ts) містить лише `/api/coach`, `/api/weekly-digest`, `/api/sync/`, а api-client переписує шляхи на `/api/v1/*` (httpClient.ts DEFAULT_API_PREFIX). Тому, наприклад, GET /api/v1/coach/memory (coach.ts:18) іде через runtime-кеш, хоча задум був його виключити.
```

<a id="priv-09"></a>

### `priv-09` [medium] Серверні події PostHog $ai_generation/$ai_span шлються з distinctId = userId без перевірки згоди на аналітику

- **Стан:** виправлено в гілці claude/fix-priv-06-09-ai-health-consent
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: AI observability (PostHog)
- **Де:** apps/server/src/lib/posthogAi.ts:228-270; apps/server/src/lib/anthropic.ts:209, 395; apps/server/src/lib/llm/provider.ts:383; apps/server/src/modules/chat/chat.ts:578; apps/server/src/modules/me/dataRights.ts:55
- **Першопричина:** captureAiGeneration і captureAiSpan не читають user_preferences.analytics (дефолт false), а posthog-node за замовчуванням створює person profile. Спека 0025 виходить з хибного припущення, що цей userId і так пов'язаний з продуктовими подіями. Для тих, хто відмовився від аналітики, клієнт identify не робить.
- **Вплив:** Для людей, які прямо відмовились від аналітики, у PostHog (третя сторона) складається профіль використання AI, включно з фактом користування health-функціями (аналіз фото їжі). Це обробка без підстави за ст. 6(1)(a) GDPR і всупереч політиці («аналітика вмикається лише після «Дозволити»»).
- **Що зробити:** Перед capture перевіряти analytics-згоду (кешовану з user_preferences). Без згоди слати подію з анонімним distinctId і $process_person_profile: false. Альтернатива — оформити це як legitimate interest у політиці з окремим opt-out.
- **Примітка:** Залежить від POSTHOG_AI_OBSERVABILITY_KEY на проді; за спекою 0025 власник виставив його в Coolify.

Знахідок у кластері: 1.

#### [medium] PostHog $ai_generation/$ai_span шлються з distinctId = userId без перевірки згоди на аналітику

- **ID:** `server-static/privacy-logging#6` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/lib/posthogAi.ts:228-270; виклики apps/server/src/lib/anthropic.ts:209,395; apps/server/src/lib/llm/provider.ts:383; apps/server/src/modules/chat/chat.ts:578; apps/web/src/core/legal/privacyDocument.ts:72
- **Вплив:** Обробка за Art.6(1)(a) без згоди: у PostHog (третя сторона) формується профіль використання AI, включно з фактом користування health-функціями (аналіз фото їжі), для людей, які прямо відмовились від аналітики.
- **Рекомендація:** Перед capture перевіряти analytics-згоду (кеш user_preferences), а без неї слати з distinctId='server' / анонімним хешем і `$process_person_profile: false`; або описати це як legitimate interest у політиці й дати opt-out.

**Докази:**

```text
captureAiGeneration: `ph.capture({ distinctId: input.userId || AI_SYSTEM_DISTINCT_ID, event: "$ai_generation", properties: buildAiGenerationProperties(input) })` — жодного звернення до user_preferences.analytics (grep 'analytics' у posthogAi.ts/anthropic.ts/provider.ts/chat.ts — 0). Властивість `feature` = endpoint (chat, vision-nutrition, digest...). Спека 0025 обґрунтовує: «той самий проєкт PostHog уже повʼязує цього ж userId з продуктовими подіями» — це хибно для тих, хто відмовився (клієнт їх не identify-ть). Політика: «Аналітика вмикається лише після відповіді «Дозволити»». Дефолт user_preferences.analytics = false (dataRights.ts:55).
```

**Відтворення:**

```text
Статично: прочитати posthogAi.ts:228-270 і callers; у проді з POSTHOG_AI_OBSERVABILITY_KEY кожен AI-виклик користувача без згоди створює/оновлює його person у PostHog.
```

**Верифікатор:**

```text
Підтверджено статично. captureAiGeneration і captureAiSpan (posthogAi.ts:228-270) шлють distinctId = userId без жодної перевірки user_preferences.analytics, і в серверному коді немає жодного читання analytics-згоди поза modules/me. posthog-node за замовчуванням створює person profile. Ключ на проді задано: спека 0025, «Фази 1–2 працюють у проді», «Власник виставив POSTHOG_AI_OBSERVABILITY_KEY у Coolify». Клієнтський PostHog, навпаки, гейтиться згодою (AnalyticsConsentGate, useAnalyticsConsentBoot). Дефолт analytics=false з міграції 111. Спека 0025 §«Ідентичність» (рядок 51) свідомо вибрала userId з посилкою, що «той самий проєкт уже повʼязує цей userId з продуктовими подіями». Для тих, хто від аналітики відмовився, ця посилка хибна. Тобто намір задокументований, але спирається на хибне припущення й суперечить політиці («Аналітика вмикається лише після відповіді «Дозволити»»). Контенту в подіях немає, лише метадані й feature (зокрема vision-nutrition), тому medium, а не вище.
```

**Додаткові докази верифікатора:**

```text
docs/work/specs/initiatives/0025-posthog-ai-observability.md:51 (рішення щодо distinctId), :4 (у проді); apps/web/src/core/legal/privacyDocument.ts:72 (аналітика за згодою). Легітимний інтерес у політиці покриває «діагностику помилок … агреговану статистику», а не персональні профілі в PostHog.
```

<a id="priv-10"></a>

### `priv-10` [medium] Політика приватності розходиться з реальними потоками даних: чат іде через OpenRouter до Google, Z.ai і DeepSeek, tool_result-и за замовчуванням отримує нерозкритий TypeSafe, а «дані Monobank лишаються в Україні» — неправда

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: legal + server: AI-маршрутизація
- **Де:** apps/web/src/core/legal/legalShared.ts:33-58; apps/web/src/core/legal/privacyDocument.ts:81, 91, 117; apps/server/src/env/chatModels.ts:11, 130-141; apps/server/src/env/env.ts:117, 141; apps/server/src/modules/chat/injectionShadowJev.ts:46-56; apps/server/src/modules/chat/prepareToolResults.ts:78-84; apps/server/src/lib/anthropic.ts:103-125; apps/server/src/modules/mono/batchEnrichmentWorker.ts:130-135
- **Першопричина:** Перелік AI_PROCESSORS і текст privacyDocument не синхронізовані з кодом. CHAT_VIA_OPENROUTER_DEFAULT = true веде чат на google/gemini, z-ai/glm і deepseek. CHAT_INJECTION_JEV_SHADOW = true шле кожен tool_result на typesafe/jev-1.13. Транзакції Monobank лежать у Hetzner (ЄС) і категоризуються в США. provider {zdr:true, data_collection:'deny'} передає лише JEV-запит, основні запити до OpenRouter — ні. Сільпо і ПриватБанк у політиці не згадані.
- **Вплив:** Користувачі не знають, що повідомлення чату, фінансовий знімок і результати інструментів (за згоди й дані про здоров'я) обробляють Z.ai, DeepSeek, Google і TypeSafe. Обіцяне повідомлення за 30 днів до нового субпроцесора не надсилалось. Без data_collection: deny OpenRouter може маршрутизувати на провайдерів, що зберігають промпти. Це ризик невідповідності ст. 13, 28 і 44 GDPR.
- **Що зробити:** Оновити AI_PROCESSORS, llm-subprocessors.md і абзац про Monobank (зберігання в ЄС і маскована передача в США), додати Сільпо, ПриватБанк і TypeSafe. До оновлення політики вимкнути JEV-shadow за замовчуванням. До всіх запитів через OpenRouter додавати provider {data_collection:'deny', zdr:true}. Зв'язати перелік у політиці з chatModels.ts тестом.
- **Примітка:** Верифікатор оцінив кожну частину окремо як low. Разом це системне розходження: кілька нерозкритих субпроцесорів отримують фінансові дані за замовчуванням, тому кластер піднято до medium. Оновлення legal-доків 2026-10-01 (після аудиту) змінило лише дати, перелік субпроцесорів не виправлено. grep на HEAD: data_collection є лише в injectionShadowJev.ts.

Знахідок у кластері: 3.

#### [low] Перелік субпроцесорів у політиці не відповідає дефолтній маршрутизації: чат іде через OpenRouter до Google/Z.ai/DeepSeek, а tool_results за замовчуванням ідуть ще й у TypeSafe (JEV)

- **ID:** `server-static/ai-layer#7` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/legal/legalShared.ts:33-54; apps/server/src/env/chatModels.ts:11, 130-141; apps/server/src/env/env.ts:141; apps/server/src/modules/chat/injectionShadowJev.ts:46-56; apps/server/src/modules/chat/prepareToolResults.ts:78-84; apps/server/src/lib/anthropic.ts:103-125
- **Вплив:** Користувачі не поінформовані, що повідомлення чату, фінансовий знімок і результати інструментів (а за згоди й дані про здоровʼя) обробляють Z.ai, DeepSeek, Google і TypeSafe; без data_collection: deny OpenRouter може маршрутизувати на провайдерів, що зберігають промпти (залежить від налаштувань акаунта, які я не бачу). Ризик невідповідності GDPR (прозорість, Art. 9).
- **Рекомендація:** Оновити AI_PROCESSORS (чат через OpenRouter, перелік кінцевих вендорів і юрисдикцій, TypeSafe) або вимкнути JEV-shadow за замовчуванням до оновлення політики. Додавати `provider: { data_collection: "deny", zdr: true }` (або ignore-список) до всіх запитів через OpenRouter у pickTransport/LLM-провайдері. Звʼязати перелік у політиці з chatModels.ts тестом.

**Докази:**

```text
Політика: Anthropic -- «AI-чат, поради коуча...», OpenRouter -- «поради коуча, тижневий дайджест, планування харчування, категоризація транзакцій... зокрема Google Gemini»; чату через OpenRouter, Z.ai, DeepSeek і TypeSafe у списку немає (а текст каже «Перелік нижче охоплює всіх, хто може отримати твої дані»). Код: CHAT_VIA_OPENROUTER_DEFAULT = true; first turn `google/gemini-3.7-flash`, synthesis `z-ai/glm-5.2`, standard (тир Free) `deepseek/deepseek-v4-flash`. env.ts:141 `CHAT_INJECTION_JEV_SHADOW: boolFromEnv(true)` -> кожен рядковий tool_result (фінанси; дані про здоровʼя за згоди) надсилається на `typesafe/jev-1.13`. Лише JEV-запит має `provider: { zdr: true, data_collection: "deny" }`; основні chat-запити до OpenRouter (pickTransport у lib/anthropic.ts) таких обмежень не передають.
```

**Відтворення:**

```text
Порівняти AI_PROCESSORS у legalShared.ts з defaultChatModel() у chatModels.ts і з isJevShadowEnabled() (дефолт true за наявності OPENROUTER_API_KEY). grep 'data_collection' по apps/server/src -- єдиний збіг у injectionShadowJev.ts.
```

**Верифікатор:**

```text
Розбіжність підтверджено в коді. CHAT_VIA_OPENROUTER_DEFAULT=true; чат за замовчуванням іде через OpenRouter на google/gemini-3.7-flash, z-ai/glm-5.2 (синтез) і deepseek/deepseek-v4-flash (standard). CHAT_INJECTION_JEV_SHADOW=boolFromEnv(true) шле кожен рядковий tool_result на typesafe/jev-1.13. У AI_PROCESSORS (legalShared.ts:33-54) чат приписано Anthropic; OpenRouter описано як маршрут для коуча, дайджесту, харчування й категоризації («зокрема Google Gemini»); TypeSafe, Z.ai і DeepSeek не названо. Політика водночас каже, що «перелік нижче охоплює всіх» і що про нового субпроцесора попереджають email-ом за 30 днів. Код JEV сам називає TypeSafe «новим субпроцесором». Internal docs/governance/security/llm-subprocessors.md кінцевих вендорів за шлюзом перелічує (Gemini, GLM, DeepSeek), але TypeSafe не згадує і він. provider {zdr, data_collection: deny} передається лише в JEV-запиті; у pickTransport для основного чату такого немає. Чи стоїть обмеження на рівні акаунта OpenRouter, з репо не перевірити. Severity знижую до low: це дрейф декларації, а не витік. OpenRouter і факт upstream-юрисдикції в політиці частково розкрито, а юридичні документи досі бета-чернетка (CONTROLLER_PLACEHOLDE …[обрізано]
```

**Додаткові докази верифікатора:**

```text
injectionShadowJev.ts:52-55: «TypeSafe - новий субпроцесор даних; власник погодив…», provider: { zdr: true, data_collection: deny }. grep data_collection по apps/server/src дає лише цей збіг. chatModels.ts:141-146 моделі synthesis/standard. privacyDocument.ts:80 «Перелік нижче охоплює всіх, хто може отримати твої дані». feature-flags.md:77 підтверджує, що JEV увімкнений за замовчуванням. Споріднений, але інший пункт: 2026-07-31-legal-docs-beta-readiness.md § 6 п.3 «Звірити перелік субпроцесорів із prod-env» (там лише платіжні провайдери, логи й Voyage).
```

#### [low] Нерозкритий субпроцесор TypeSafe (Jev) отримує tool_result-и чату за замовчуванням

- **ID:** `server-static/privacy-logging#7` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/env/env.ts:141 (CHAT_INJECTION_JEV_SHADOW: boolFromEnv(true)); apps/server/src/modules/chat/injectionShadowJev.ts:20-56,70-72; apps/server/src/modules/chat/prepareToolResults.ts:80-84; apps/web/src/core/legal/legalShared.ts:33-58; privacyDocument.ts:90
- **Вплив:** Фінансові/побутові дані користувачів передаються новому субпроцесору без розкриття в політиці й без обіцяного повідомлення — невідповідність GDPR Art.13/28.
- **Рекомендація:** Або вимкнути CHAT_INJECTION_JEV_SHADOW за замовчуванням до оновлення політики, або додати TypeSafe (через OpenRouter, ZDR) у AI_PROCESSORS, llm-subprocessors.md і розіслати повідомлення.

**Докази:**

```text
isJevShadowEnabled() = env.CHAT_INJECTION_JEV_SHADOW && Boolean(env.OPENROUTER_API_KEY); прапорець за замовчуванням true. Кожен tool_result (операції, звички, комора — уже маскований, але з сумами/назвами) відправляється POST https://openrouter.ai/api/v1/systemone {model:"typesafe/jev-1.13", state: content}. Код: «TypeSafe - новий субпроцесор даних; власник погодив». grep -ri typesafe по apps/web/src/core/legal і docs/governance/security/llm-subprocessors.md — 0 збігів. AI_PROCESSORS перелічує лише Anthropic, OpenRouter (з ролями коуч/дайджест/харчування/категоризація), Groq, Voyage. Політика: «повідомляємо email-ом за 30 днів до додавання нового субпроцесора».
```

**Відтворення:**

```text
grep -n CHAT_INJECTION_JEV_SHADOW apps/server/src/env/env.ts; grep -ri typesafe apps/web/src/core/legal docs/governance/security
```

**Верифікатор:**

```text
Підтверджено. env.ts:141 CHAT_INJECTION_JEV_SHADOW: boolFromEnv(true); isJevShadowEnabled() = прапорець && OPENROUTER_API_KEY, а цей ключ на проді є, бо OpenRouter використовується для коуча й дайджесту. prepareToolResults.ts:80-84 на кожен tool_result викликає shadowScanToolResult, і той POST-ить маскований вміст на https://openrouter.ai/api/v1/systemone з model typesafe/jev-1.13. Спека planning/jev-injection-shadow.md:29 і коментар у коді прямо кажуть, що «TypeSafe стає новим субпроцесором даних, і власник це погодив». Проте TypeSafe/Jev немає в AI_PROCESSORS (legalShared.ts), у privacyDocument і в llm-subprocessors.md (grep повертає 0 збігів). Опис ролі OpenRouter перелічує коуча, дайджест, харчування й категоризацію, але не чат-tool_result-и. Обіцянку повідомляти за 30 днів про нового субпроцесора порушено. Severity low замість medium: запит іде з provider {zdr:true, data_collection:'deny'}, контрагенти масковані, маршрут через уже розкритий OpenRouter. Це прогалина розкриття й комплаєнсу, прямої шкоди немає.
```

**Додаткові докази верифікатора:**

```text
grep -rni 'typesafe|jev' apps/web/src/core/legal docs/governance/security/llm-subprocessors.md → порожньо. injectionShadowJev.ts:20-21 (JEV_MODEL/JEV_URL), :53-56 (ZDR-коментар «TypeSafe - новий субпроцесор даних; власник погодив»).
```

#### [low] Політика приватності містить хибні твердження про потоки даних (Monobank «лишається в Україні», не вказані Сільпо/ПриватБанк)

- **ID:** `server-static/privacy-logging#8` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/web/src/core/legal/privacyDocument.ts:116; apps/web/src/core/legal/legalShared.ts:33-58,79-140; apps/server/src/modules/mono/batchEnrichmentWorker.ts; apps/server/src/modules/silpo/*; apps/server/src/modules/mono/privat.ts
- **Вплив:** Користувач отримує неправдиву інформацію про транскордонну передачу банківських даних; інтеграції Сільпо і ПриватБанку не розкриті.
- **Рекомендація:** Переписати речення: дані Monobank зберігаються в ЄС (Hetzner) і частково передаються AI-провайдерам у США (з маскуванням). Додати Сільпо і ПриватБанк у перелік підключуваних інтеграцій.

**Докази:**

```text
privacyDocument.ts:116: «Дані Monobank залишаються в Україні й обробляються з дотриманням банківської таємниці.» Але той самий документ (legalShared AI_PROCESSORS) каже, що Anthropic/OpenRouter (США) роблять «категоризацію транзакцій Monobank», а бекенд і БД — Hetzner «ЄС (Німеччина)». Зовнішні хости в коді: auth.silpo.ua, mcp.silpo.ua, receipt.silpo.elkasa.com.ua, acp.privatbank.ua — жоден не згаданий у переліку субпроцесорів/інтеграцій (Monobank згаданий).
```

**Відтворення:**

```text
grep -rhoE 'https://[a-z0-9.-]+' apps/server/src | sort -u; порівняти з legalShared.ts.
```

**Верифікатор:**

```text
Головне твердження підтверджується в коді. privacyDocument.ts:116 каже: «Дані Monobank залишаються в Україні». Але той самий набір документів (legalShared.ts INFRA_PROCESSORS) називає Hetzner, ЄС (Німеччина), хостингом бекенду і PostgreSQL, де лежать транзакції mono. AI_PROCESSORS прямо кажуть, що Anthropic і OpenRouter (США) категоризують транзакції Monobank. batchEnrichmentWorker.ts:130-135 шле батчі транзакцій з невідомим MCC провайдеру з `getLLMProvider({provider: env.LLM_MONO_PROVIDER, openrouterModel: env.OPENROUTER_MONO_MODEL})`. Отже речення хибне і суперечить решті документа. Частина про нерозкриті Сільпо і ПриватБанк значно слабша. Сільпо закрите серверним kill-switch `SILPO_ENABLED` (env.ts:353, за замовчуванням false). PrivatBank merchant-інтеграцію вимкнено на клієнті: `const PRIVAT_ENABLED = false` у FinykApp.tsx:65, а секція налаштувань стоїть за `VITE_PRIVAT_ENABLED` з коментарем «не вмикай без нового рішення власника». Тобто зараз жодна з цих двох інтеграцій користувачам недоступна. Їх треба внести в політику перед увімкненням, але сьогодні це не розбіжність. Severity low коректна. Рекомендацію варто звузити до виправлення речення про Monobank.
```

**Додаткові докази верифікатора:**

```text
legalShared.ts: Hetzner region «ЄС (Німеччина)»; OpenRouter role «...категоризація транзакцій Monobank», region «США». batchEnrichmentWorker.ts:18-19,130-135 (виклик LLM для mono). Гейти: env.ts:353 `SILPO_ENABLED: boolFromEnv(false)`; FinykApp.tsx:65 `const PRIVAT_ENABLED = false`; FinykSection.tsx:27-28. У docs/work/specs/audits/** і docs/open-work.md речення «залишаються в Україні» / «банківської таємниці» не згадується.
```

<a id="priv-11"></a>

### `priv-11` [medium] Фото чеків і скріни банкінгу йдуть в AI без обіцяного попередження «Куди їде фото»

- **Стан:** виправлено в гілці claude/fix-priv-11-finyk-photo-notice
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік (vision-імпорт)
- **Де:** apps/web/src/modules/finyk/components/receiptScan/ReceiptScanSheet.tsx:132-135; apps/web/src/modules/finyk/components/bulkImport/BulkImportSheet.tsx (handleScreenshotSelected → POST /api/v1/finyk/import/screenshot/analyze); apps/web/src/modules/nutrition/components/PhotoPrivacyNotice.tsx; apps/web/src/shared/i18n/uk.dataDisclosure.ts:31
- **Першопричина:** PhotoPrivacyNotice з ack-ключем sergeant.nutrition.photoPrivacyAck.v1 реалізовано лише в модулі Їжа. ReceiptScanSheet і BulkImportSheet одразу після вибору файлу викликають analyzeReceipt чи analyzeImportScreenshot, без жодного попередження.
- **Вплив:** На чеках і скрінах банку є адреса магазину, цифри картки, баланс та імена контрагентів. Усе це їде стороннім AI-провайдерам без попередження, яке екран «Дані та приватність» прямо обіцяє («Перед першим фото ми про це попереджаємо»). Задекларована обробка розходиться з фактичною (ст. 13 GDPR).
- **Що зробити:** Винести PhotoPrivacyNotice у спільний компонент із глобальним ack-ключем і гейтити ним усі vision-шляхи: чек, пакетні чеки, скрін банкінгу, їжа. До підтвердження аналіз стартує лише явним тапом.
- **Примітка:** Free-тариф має 5 сканів на тиждень, тож фото шлють і безкоштовні користувачі.

Знахідок у кластері: 1.

#### [medium] Фото чеків і скріни банкінгу відправляються в AI без обіцяного попередження «Куди їде фото»

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `privacy`
- **Де:** apps/web/src/modules/finyk/components/receiptScan/ReceiptScanSheet.tsx:132-135 (analyzeReceipt одразу після вибору файлу); finyk «Додати документи → Скрін банкінгу» (POST /api/v1/finyk/import/screenshot/analyze); обіцянка в apps/web/src/shared/i18n/uk.dataDisclosure.ts:31
- **Вплив:** На чеку й скріні банку є найчутливіші дані: адреса магазину, останні цифри картки, баланс, імена контрагентів. Вони їдуть стороннім AI-провайдерам (Anthropic) без попередження, яке політика й екран приватності прямо обіцяють. Це розходження між задекларованою і фактичною обробкою (прозорість за GDPR Art. 13).
- **Рекомендація:** Винести PhotoPrivacyNotice у спільний компонент із глобальним ack-ключем і гейтити ним усі vision-шляхи (finyk receipt, bulk receipts, screenshot import, nutrition): до підтвердження аналіз стартує лише явним тапом. Або уточнити текст розкриття.

**Докази:**

```text
s38 (новий користувач, нуль підтверджень): /finyk → «Додати» → «Сканувати чек» → вибір зображення. Без жодного діалогу через 13,9 с іде `POST /api/v1/finyk/receipts/analyze`. Текст діалогу: «Сканувати чек / Завантажити фото / Можна вибрати одразу кілька фото…», попередження про відправку немає. s48: «Додати документи → Скрін банкінгу» одразу шле `POST /api/v1/finyk/import/screenshot/analyze`. Налаштування → Дані та приватність кажуть: «Фото – виняток… воно їде цілим. Перед першим фото ми про це попереджаємо.» Попередження (PhotoPrivacyNotice, ключ sergeant.nutrition.photoPrivacyAck.v1) реалізоване лише в модулі Їжа; s39 його там бачить.
```

**Відтворення:**

```text
Новий акаунт: /finyk → «Додати» → «Сканувати чек» → «Завантажити фото» → будь-яке зображення. Запит на AI-розпізнавання відходить одразу, попередження немає. Те саме для «Додати документи» → «Скрін банкінгу». Скрипти: s38-receipt-scan.mjs, s48-screenshot-import.mjs
```

**Верифікатор:**

```text
Verified in code beyond doubt. In ReceiptScanSheet.handleFileSelected the order is QR (if enabled) → visionPaywall.requireAccess() (a quota check, and Free gets 5 scans a week, so Free users do send photos) → readReceiptImageFile → analyzeReceipt. There is no privacy notice anywhere in that chain. BulkImportSheet.handleScreenshotSelected sends the banking screenshot straight to analyzeImportScreenshot. PhotoPrivacyNotice and its ack key are used only in nutrition (PhotoAnalyzeCard/PhotoStep). The user-facing disclosure (uk.dataDisclosure.ts photoNote) makes a general promise: «Перед першим фото ми про це попереджаємо». llmRedactionCoverage.test.ts deliberately registers receipts/import visionClient with a review-screen badge («розпізнано з фото, перевір суми») in place of masking. That badge is about accuracy, is shown after sending, and is not a pre-send privacy notice. Also, docs/governance/security/llm-subprocessors.md lists only «Фото страви цілком» and does not mention receipt photos or banking screenshots at all.
```

**Додаткові докази верифікатора:**

```text
grep: PhotoPrivacyNotice/photoPrivacyAck appear only in apps/web/src/modules/nutrition/**. No privacy or Anthropic text in finyk receiptScan or bulkImport components. llmRedactionCoverage.test.ts:78-81 names a post-send badge as the mitigation for both finyk vision paths.
```

<a id="priv-12"></a>

### `priv-12` [medium] GDPR-експорт неповний: біометрія профілю, пам'ять коуча, чеки з позиціями, Сільпо, банківські підключення, фідбек та інше не потрапляють у файл і не перелічені у винятках

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: права на дані (/api/me/export)
- **Де:** apps/server/src/modules/me/dataRights.ts:268-325 (MODULE_EXPORT_TABLES), 329-370 (EXPORT_EXCLUSIONS), 417-520 (buildMeExport); apps/server/src/modules/me/exportTables.drift.test.ts:16
- **Першопричина:** buildMeExport читає фіксований MODULE_EXPORT_TABLES і кілька окремих таблиць. Drift-гейт exportTables.drift.test.ts перевіряє лише таблиці з префіксами finyk_/fizruk_/nutrition_/routine_. Тому таблиці без префікса мовчки випадають: user_profile, coach_memory, receipts, receipt_items, silpo_*, mono_jar, privat_connection, import_batches, feedback_entries тощо.
- **Вплив:** Право доступу й переносимості (ст. 15/20 GDPR) виконується частково. Людина не отримує свою біометрію, фіскальні чеки з позиціями, дані інтеграцій і історію імпортів, а експорт посилається на receipt_id, яких у ньому немає. Секція excluded про ці пропуски не каже.
- **Що зробити:** Додати в buildMeExport user_profile, coach_memory, receipts і receipt_items, silpo_*, mono_jar, privat_connection (без шифротексту), import_batches, feedback_entries, sergeant_nudge_cache, метадані session/account і email_unsubscribes. Те, що свідомо не експортується, явно перелічити в EXPORT_EXCLUSIONS з причиною. Розширити drift-тест на всі таблиці з user_id, з явним allowlist винятків.
- **Примітка:** Дві незалежні знахідки (статичний аналіз сервера і живий API), обидві відтворено наживо маркерами в профілі, фідбеку і чеках.

Знахідок у кластері: 2.

#### [medium] GDPR-експорт неповний: біометрія профілю, памʼять коуча, чеки, Сільпо, банки, фідбек та ін. не потрапляють у файл

- **ID:** `server-static/privacy-logging#3` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/modules/me/dataRights.ts:268-322 (MODULE_EXPORT_TABLES), :331-365 (EXPORT_EXCLUSIONS), :417-505 (buildMeExport); apps/server/src/modules/me/exportTables.drift.test.ts:16; apps/web/src/core/legal/privacyDocument.ts:122-124
- **Вплив:** Право доступу/переносимості (GDPR Art.15/20) виконується частково: людина не отримує власних введених даних про здоровʼя (біометрія), фінансових чеків і даних інтеграцій, а файл не каже, що їх бракує (секція excluded їх не згадує). Privacy policy обіцяє «копію у машино-читному форматі».
- **Рекомендація:** Додати в buildMeExport user_profile, coach_memory, receipts(+items), silpo_*, mono_jar, privat_connection (без шифротексту), import_batches, feedback_entries, sergeant_nudge_cache, метадані session/account, email_unsubscribes; або чесно перелічити їх у EXPORT_EXCLUSIONS. Розширити drift-тест на всі таблиці з колонкою user_id (через міграції) з явним allowlist винятків.

**Докази:**

```text
Живий тест (scratch export-probe.mjs): PUT /api/me/profile {biometrics:{heightCm:181,weightKg:79,PROBE:"PROFILE_PROBE_7731"}} → 200 і рядок у user_profile; POST /api/feedback "FEEDBACK_PROBE_7731" → 200; GET /api/me/export → 200, PROFILE_PROBE_7731=false, FEEDBACK_PROBE_7731=false, data keys = [moduleData, finyk, fizruk, nutrition, routine, mono, billing, push, excluded]; excluded = [syncLog, nutritionBackups, aiMemories, aiUsage].
Таблиці з даними користувача поза експортом і поза `excluded`: user_profile (біометрія, memoryBank), coach_memory (тижневі дайджести, інсайти), receipts+receipt_items, silpo_receipts/silpo_receipt_items/silpo_tx_receipt_links/_rejections/silpo_connection, mono_jar, privat_connection, import_batches, feedback_entries, sergeant_nudge_cache, session (IP-префікс, UA), account (привʼязані провайдери), email_unsubscribes, waitlist_entries. Drift-гейт перевіряє лише /^(finyk|fizruk|nutrition|routine)_/.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-privacy-logging/export-probe.mjs; psql ... -c "select table_name from information_schema.columns where column_name='user_id'" і порівняти з dataRights.ts.
```

**Верифікатор:**

```text
Відтворено наживо на власному pool-користувачі. PUT /api/me/profile з біометрією (маркер VPROF_9911) повертає 200, і GET /api/me/profile цей маркер віддає. POST /api/feedback (VFEED_9911) теж повертає 200. А GET /api/me/export (200, 2443 байти) не містить жодного з маркерів. data keys = moduleData, finyk, fizruk, nutrition, routine, mono, billing, push, excluded; у excluded лише sync_op_log/sync_audit_log, nutrition_backups, ai_memories, ai_usage_daily. buildMeExport (dataRights.ts:417-505) не читає user_profile, coach_memory, receipts, silpo_*, mono_jar, privat_connection, import_batches, feedback_entries, sergeant_nudge_cache і session/account, і в EXPORT_EXCLUSIONS вони теж не названі. Через це файл не виконує власного контракту «межа файлу названа в ньому самому» (спека honest-export-and-first-screen). Курйоз: finyk_tx_receipt_links в експорт іде, а самих receipts, на які ці лінки вказують, там немає. Локальний HubBackupPanel це не компенсує: hubBackup.ts не містить профілю і серверних чеків.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-privacy-logging/v2/export-v2.mjs → `profile put 200 ...VPROF_9911`, `profile get 200 true`, `feedback 200 {"ok":true,"id":11}`, `export 200 len 2443 VPROF false VFEED false`. psql: user_profile(user_id,payload), coach_memory(user_id,data), receipts(...,raw_payload), silpo_receipts(...,raw), feedback_entries(message,user_agent) мають user_id і в експорт не потрапляють. Пункт G із rada-skeptykiv закрито 2026-09-20 лише для 4 модулів.
```

#### [medium] GDPR-експорт /api/me/export не віддає власні чеки (receipts, receipt_items) та import_batches, хоча експортує посилання на них і не згадує їх у excluded

- **ID:** `api-live/idor-cross-user#3` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `privacy`
- **Серйозність від шукача:** low
- **Де:** apps/server/src/modules/me/dataRights.ts:268-325 (MODULE_EXPORT_TABLES), :329-337 (лише finyk_tx_receipt_links), EXPORT_EXCLUSIONS ~:340-370; GET /api/me/export
- **Вплив:** Право на доступ (GDPR ст. 15 / ЗУ «Про захист ПД») виконується неповно: людина не отримує свої фіскальні чеки з позиціями та сирим payload (зокрема зображення-аналізи vision) і історію імпортів виписок. Експорт при цьому посилається на receipt_id, яких у ньому немає. Це суперечить задекларованому в коді принципу «людина має бачити межу того, що забрала». Знахідка поза основним виміром IDOR, але спостережена наживо.
- **Рекомендація:** Додати до експорту receipts і receipt_items (через receipts.user_id), import_batches, а також silpo_receipts, silpo_receipt_items і coach_memory, якщо їх теж немає. Інакше явно перелічити ці таблиці в EXPORT_EXCLUSIONS з причиною. Тест dataRights.test.ts варто розширити на всі таблиці з user_id.

**Докази:**

```text
A зберіг 2 чеки: POST /api/finyk/receipts → 201, receipt.id 23 (dps, fiscalNum FNrmuq4mcnl) і 24 (vision); psql: 23|lm1o…|A_STORE_rmuq4mcnl, 24|lm1o…|A_STORE_rmuq4mcnl.
GET /api/me/export (idorA) → 200; data keys: moduleData,finyk,fizruk,nutrition,routine,mono,billing,push,excluded. finyk_tx_receipt_links: [{"receipt_id":23,…},{"receipt_id":24,…}], але в експорті немає fiscal_num (FNrmuq4mcnl: false), позицій (A_ITEM_rmuq4mcnl: false), store_tax_id і raw_payload. data.excluded містить лише syncLog, nutritionBackups, aiMemories, aiUsage. Назва магазину трапляється тільки в похідній manual-expense.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-idor-cross-user/30-rest.mjs (A створює чеки), потім node 33-export-receipts.mjs та 34-export-detail.mjs.
```

**Верифікатор:**

```text
buildMeExport (me/dataRights.ts:423-520) reads the fixed MODULE_EXPORT_TABLES plus mono, subscriptions, push, preferences and the finyk_tx_receipt_links join. It never reads receipts, receipt_items or import_batches, and EXPORT_EXCLUSIONS does not list them. The export therefore contains receipt_id references to receipts it does not include.

The drift gate meant to prevent this, exportTables.drift.test.ts, only scans tables matching /^(finyk|fizruk|nutrition|routine)_/, so every unprefixed table slips past it. The gap is wider than reported. Live tables with a user_id column that are neither exported nor listed in `excluded` include user_profile (the profile payload, including memoryBank), coach_memory (used live by chat/coach.ts), silpo_receipts, silpo_receipt_items, silpo_tx_receipt_links, mono_jar and import_batches; all of them hold rows locally.

The honest-export spec and the code comment both say the person must see the boundary of what they took, and this contradicts that. Because the omission now covers profile and coach-memory personal data, I raised the severity from low to medium as an incomplete-DSAR compliance gap. It is not a security exploit.
```

**Додаткові докази верифікатора:**

```text
Script v3-export.mjs, output in v3-out.txt, run as idorA, who owns receipts 23 (FNrmuq4mcnl) and 24, with 2 receipt_items rows. GET /api/me/export returns 200. finyk keys list finyk_tx_receipt_links with receipt_id [23,24], but the fiscal_num is not in the export, and neither the 'receipt_items' nor the 'import_batches' key appears. excluded contains only [sync_op_log, sync_audit_log], [nutrition_backups], [ai_memories], [ai_usage_daily]. Local row counts: coach_memory 9, user_profile 11, receipts 12, import_batches 22. The registry entry SECURITY-20260804-GDPR in docs/work/specs/audits/verification/findings.json ("Видалення й експорт не охоплюють модульні дані", status open/unrated) is the historical, broader predecessor. It was largely closed by honest-export-and-first-screen.md for pref …[обрізано]
```

<a id="priv-13"></a>

### `priv-13` [medium] Черга GDPR-очищення безстроково зберігає email видалених користувачів: рядок stripe без customer_id ніколи не завершується

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: GDPR cleanup worker
- **Де:** apps/server/src/modules/gdpr/externalDelete.ts:113-120; apps/server/src/modules/gdpr/cleanupWorker.ts:178-181, 220-231, 279-318; apps/server/src/modules/gdpr/cleanupQueue.ts
- **Першопричина:** deleteStripeCustomer повертає 'skipped' в обох випадках: коли немає ключа і коли немає stripe_customer_id. cleanupWorker трактує 'skipped' для всіх сервісів, крім posthog, як «чекаємо конфіг» і переносить рядок на годину вперед. Email обнуляється лише при завершенні, тож для більшості користувачів (без Stripe) рядок з email живе вічно. Exhausted-рядки email теж зберігають.
- **Вплив:** Email і user_id практично кожного видаленого акаунта лишаються в БД безстроково. Це суперечить ADR-0016 («redact PII the moment the row is done») і ст. 17 GDPR. Черга при цьому лінійно росте і щогодини перепрацьовує всі такі рядки.
- **Що зробити:** Для stripe трактувати відсутній customerId як not_found (рядок завершено), а відсутній ключ обробляти окремо. Ввести стелю для waitingOnConfig з редагуванням email і редагувати email також у exhausted-рядках. Додати тест «stripe без customer_id → completed_at і email = NULL».
- **Примітка:** Перевірено на HEAD: externalDelete.ts:118 і cleanupWorker.ts:279 без змін.

Знахідок у кластері: 1.

#### [medium] Черга GDPR-очищення назавжди зберігає email видалених користувачів (рядок stripe без customer_id ніколи не завершується)

- **ID:** `server-static/db-migrations#1` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/modules/gdpr/externalDelete.ts:117-119; apps/server/src/modules/gdpr/cleanupWorker.ts:178-181, 279-299, 301-318, 335-352, 220-231; apps/server/src/modules/gdpr/cleanupQueue.ts (ALL_SERVICES)
- **Вплив:** Email (і user_id) практично кожного видаленого акаунта лишається в БД безстроково, всупереч ADR-0016 «redact PII the moment the row is done» і GDPR Art.17. Додатково черга лінійно росте і щогодини перепрацьовує всі такі рядки.
- **Рекомендація:** Для stripe трактувати `!customerId` як `not_found`/completed (нема чого видаляти), а skip через відсутній ключ — окремо. Ввести стелю для `waitingOnConfig` (напр. N днів) з редагуванням email, і редагувати email також у exhausted-рядках. Додати тест «stripe без customer_id -&gt; completed_at і email=NULL».

**Докази:**

```text
enqueueGdprCleanup створює 4 рядки (stripe/sentry/posthog/resend) з email у plaintext. externalDelete.ts:118 `if (!secretKey || !customerId) return { outcome: "skipped" }` (тест externalDelete.test.ts:22 'skips when there is no stripe_customer_id'). cleanupWorker.ts:179 `SKIP_MEANS_COMPLETE = new Set(["posthog"])`; :279 `if (result.outcome === "skipped" && !SKIP_MEANS_COMPLETE.has(row.service))` -> `SET next_attempt_at = NOW() + 1 hour` + `continue` — completed_at не ставиться ніколи. Email обнуляється лише в гілці completion (:313 `SET completed_at = NOW(), email = NULL, stripe_customer_id = NULL`), а purge (:226) видаляє лише `completed_at IS NOT NULL`. Exhausted-рядки паркуються з `next_attempt_at='infinity'` і теж зберігають email назавжди.
```

**Відтворення:**

```text
Статично: користувач без Stripe-підписки (усі на LiqPay/Plata або free) -> DELETE /api/me -> через 30 днів purgeUserData -> gdpr_cleanup_queue отримує рядок service='stripe', stripe_customer_id NULL -> кожну годину dispatch -> skipped -> reschedule +1h. Рядок (user_id, email) живе вічно; те саме для sentry/resend, якщо токени не задані.
```

**Верифікатор:**

```text
Verified in code. enqueueGdprCleanup (cleanupQueue.ts) always inserts 4 rows, including service='stripe' with stripe_customer_id NULL for users who never had a Stripe subscription (purgeUserData selects provider='stripe' only). deleteStripeCustomer returns {outcome:'skipped'} when `!secretKey || !customerId` (externalDelete.ts:118), so the two cases are merged. cleanupWorker.ts: SKIP_MEANS_COMPLETE = {posthog} only; any other 'skipped' goes to `next_attempt_at = NOW() + 1 hour` and `continue`, never reaching the completion UPDATE that nulls email/stripe_customer_id. purgeExpiredCompletedRows deletes only `completed_at IS NOT NULL`. So a stripe row for a non-Stripe user never completes, even with STRIPE_SECRET_KEY configured, and keeps the email forever. The module docs describe 'skipped' as 'operator has not configured the token', and ADR-0016 §5 allows holding email only 'до завершення vendor-cleanup'. For the no-customer case there is nothing left to complete, so this is a bug, not the intended wait-for-config behaviour. The worker tests only cover the stripe row WITH cus_1 and no key. Nothing covers 'key set, no customer'.
```

**Додаткові докази верифікатора:**

```text
cleanupWorker.test.ts:215 tests only `stripe_customer_id: 'cus_1'` + unset key; externalDelete.test.ts:22 asserts 'skips when there is no stripe_customer_id, even with a configured key', which the worker then treats as wait-for-config. These rows never bump `attempts`, so the 'stuck' gauge/alert (`completed_at IS NULL AND attempts > 5`, cleanupPoller.ts / ops/prometheus/rules/gdpr.yml) never flags them. The poller is wired and on by default (index.ts GdprCleanupPoller), so this is the live path. Exhausted rows (`next_attempt_at='infinity'`) also keep their email. Local gdpr_cleanup_queue is empty, so I did not reproduce it at runtime; the code path is unambiguous.
```

<a id="priv-14"></a>

### `priv-14` [medium] 10 неправильних PIN знімають блокування: «стирання» видаляє лише PIN і пускає в застосунок з усіма даними

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: блокування застосунку
- **Та сама першопричина, що й** [`sec-12`](./security.md#sec-12): Одна поведінка: після 10 невдалих PIN lockStorage стирає лише креденшел, а useAppLock переводить стан в idle і пускає в застосунок. Фікс один: вихід зі стиранням або вимога пароля акаунта.
- **Де:** apps/web/src/core/security/useAppLock.ts:163-175; apps/web/src/core/security/lockStorage.ts:55-65, 226-233
- **Першопричина:** Після MAX_FAILED_UNLOCK_ATTEMPTS=10 lockStorage стирає лише облікові дані блокування, а useAppLock при result.wiped переводить стан у idle («Drop the lock so the user gets back into the app»). Наростаючої затримки немає, одна спроба коштує лише ~1,2 с PBKDF2.
- **Вплив:** Будь-хто з фізичним доступом до розблокованого пристрою обходить PIN приблизно за 12 секунд і бачить фінанси, звички і медичні записи. Задумане «стирання» працює як кнопка обходу.
- **Що зробити:** Після 10 невдалих спроб розлогінювати і стирати локальні дані (logout і purge, після виправлення priv-05) або вимагати пароль акаунта для скидання PIN. Додати наростаючу затримку між спробами. «Забув PIN?» зробити дією: вихід і повторний вхід.
- **Примітка:** Поведінка задумана (Decision #4), але сам задум небезпечний: коментар у lockStorage обіцяє захист від нападника з фізичним доступом, а насправді дає йому доступ. Severity знижено з high до medium, бо потрібен фізичний доступ до розблокованого пристрою з активною сесією. Поведінку після 10 спроб має вирішити власник.

Знахідок у кластері: 1.

#### [medium] Блокування знімається 10 неправильними PIN за ~12 секунд: «wipe» стирає лише PIN і пускає в застосунок з усіма даними

- **ID:** `browser-surfaces/hub-shell#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `privacy`
- **Серйозність від шукача:** high
- **Де:** apps/web/src/core/security/useAppLock.ts:163-174 (result.wiped → setState("idle")); apps/web/src/core/security/lockStorage.ts:226-233 (deleteCred після MAX_FAILED_UNLOCK_ATTEMPTS=10); екран блокування на будь-якому URL
- **Вплив:** Будь-хто з фізичним доступом до розблокованого пристрою обходить PIN за кілька секунд і бачить фінанси, звички, медичні записи. Задумане «стирання після 10 спроб» стирає лише облікові дані блокування, а не дані, тож воно діє як кнопка обходу. Разом із попередньою знахідкою PIN-блокування не дає реального захисту.
- **Рекомендація:** Після 10 невдалих спроб не відкривати застосунок. Варіанти: (а) розлогінити й стерти локальні дані (purgeLocalData + logout), щоб повернутися можна було лише з паролем акаунта; (б) вимагати пароль акаунта для скидання PIN. Додати наростаючу затримку між спробами. Підказку «Забув PIN?» зробити дією (вихід з акаунта / повторний вхід).

**Докази:**

```text
s21-lock-session.out: 'attempt 1..9: locked=true err=Неправильний PIN', 'attempt 10: locked=false err= t=12506ms', 'after 10 wrong: {lock:false,url:/}', 'now on: http://127.0.0.1:4173/ main: Головна Фінік Фізрук Рутина Їжа …' (хаб з даними користувача). Скріншот <scratch>/shots/hub-shell/21-after-10-wrong.png: відкритий хаб. Коментар у коді: «Drop the lock so the user gets back into the app». Затримки між спробами немає (лише ~1,2 с PBKDF2). Підказка на екрані «Забув PIN? Скинь через відновлення акаунту.» не має жодної дії.
```

**Відтворення:**

```text
Увімкнути блокування (Профіль → Безпека), натиснути «Заблокувати зараз», 10 разів ввести 0000 + «Відкрити». На 10-й спробі оверлей зникає, застосунок відкритий. Скрипт: <scratch>/agents/browser-surfaces-hub-shell/s21-lock-session.mjs
```

**Верифікатор:**

```text
Наживо відтворено: після 10-ї неправильної спроби оверлей зникає, і відкривається профіль з даними. Поведінка задумана: «Decision #4 / 10-attempt wipe … Drop the lock so the user gets back into the app» (useAppLock.ts:168-175, lockStorage.ts:55-65). Але сам задум небезпечний. Коментар у lockStorage стверджує, що wipe «protects … against an online adversary with physical access», а на ділі саме такий нападник отримує доступ: стирається лише PIN, а не дані. Наростаючої затримки немає, одна спроба коштує ~1,4 с (PBKDF2). Severity знижено до medium: потрібен фізичний доступ до розблокованого пристрою з відкритим застосунком, PIN-блокування опційне (за замовчуванням вимкнене), а поки не виправлено #1, той самий нападник обходить блок ще простіше, через F5. Попередній аудит L-11 трекає інше: тумблер лишається ON після wipe. Сам обхід там не описано.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v2-lock-bypass.mjs (режим wipe, юзер vhs-lock): спроби 1-9 → 'Неправильний PIN. Спробуй ще раз.', 'attempt 10: {lock:false} t=14461ms', 'final: {lock:false,url:/?tab=profile}', у body видно профіль з email. Скріншот v2-after-10-wrong.png.
```

<a id="priv-15"></a>

### `priv-15` [medium] Під час активного блокування Ctrl+K відкриває глобальний пошук поверх екрана PIN з приватними даними; Ctrl+/ і g-хорди теж працюють

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: блокування застосунку / hub shell
- **Та сама першопричина, що й** [`sec-13`](./security.md#sec-13): useHubKeyboardShortcuts не перевіряє стан замка, тому Ctrl+K відкриває пошук поверх PIN-екрана. Швидкий гейт гарячих клавіш і повний фікс (не рендерити дерево під замком) зручно робити одним PR.
- **Де:** apps/web/src/core/app/RootLayout.tsx:439-447; apps/web/src/core/hub/search/HubSearch.tsx:63-66
- **Першопричина:** useHubKeyboardShortcuts у RootLayout не перевіряє appLock.state. HubSearch має той самий z-шар (200), що й AppLock, але монтується пізніше в DOM і тому опиняється зверху. Єдиний захист — isEditableTarget, а він перестає діяти, щойно фокус переходить на цифрову кнопку.
- **Вплив:** Людина без PIN з клавіатури читає назви звичок (зокрема ліків), операцій і все, що індексує пошук. Вона також може вводити текст у чат і змінювати маршрут під замком. Стосується десктопу з фізичною клавіатурою.
- **Що зробити:** У useHubKeyboardShortcuts (і в useDemoCommands/CommandPalette) ігнорувати гарячі клавіші, поки appLock.state дорівнює locked, setup або change. Винести AppLock в окремий найвищий z-шар і не монтувати пошук і чат, поки застосунок заблоковано.

Знахідок у кластері: 1.

#### [medium] Під час активного блокування Ctrl+K відкриває глобальний пошук ПОВЕРХ екрана PIN і показує приватні дані; Ctrl+/ та g-хорди теж працюють

- **ID:** `browser-surfaces/hub-shell#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `privacy`
- **Де:** apps/web/src/core/app/RootLayout.tsx:439-447 (useHubKeyboardShortcuts без перевірки appLock.state); apps/web/src/core/hub/search/HubSearch.tsx:63-66 (z-200, той самий шар, що z-modal=200 у AppLock, але пізніше в DOM)
- **Вплив:** Людина без PIN читає назви звичок, операцій, налаштувань і будь-що, що індексує глобальний пошук, просто з клавіатури. Блокування, яке обіцяє захист медичних даних, витікає через гарячі клавіші.
- **Рекомендація:** У useHubKeyboardShortcuts (і в useDemoCommands/CommandPalette) нічого не робити, поки appLock.state === "locked" | "setup" | "change". Зробити AppLock найвищим шаром (окремий z-tier вище за modal/search) і не монтувати пошук/чат, поки застосунок заблокований.

**Докази:**

```text
v02-lock-bypass.out: 'locked: {lock:true,title:Введи PIN}'; фокус на клавіші «1» (так буває після кліку по цифровій клавіатурі) → Ctrl+K: 'search dialog over lock: 1', 'topmost at search input: INPUT Пошук по всіх модулях', 'results: … Рутина Антидепресанти ПРИВАТНО 50мг daily …', 'lock still mounted: {lock:true}'. Ctrl+/: 'chat input count while locked: 1', поле чату приймає текст (під оверлеєм). 'after g f: http://127.0.0.1:4173/finyk' (маршрут змінюється під замком). Скріншот <scratch>/shots/hub-shell/v02-locked-search-leak.png: результати пошуку з назвою приватної звички на весь екран.
```

**Відтворення:**

```text
Desktop 1280×900, користувач hubshell-lock: увімкнути PIN → «Заблокувати зараз» → клікнути будь-яку цифру на клавіатурі блокування → Ctrl+K → ввести «приват». Скрипт: <scratch>/agents/browser-surfaces-hub-shell/v02-lock-bypass.mjs
```

**Верифікатор:**

```text
У useHubKeyboardShortcuts немає перевірки стану блокування, а RootLayout:439-447 передає обробники безумовно. Єдиний захист — isEditableTarget: поки фокус у прихованому input PIN, Ctrl+K ігнорується. Але після кліку по цифровій кнопці фокус переходить на кнопку. HubSearch має z-200, той самий шар, що z-modal AppLock, і монтується пізніше в DOM, тож опиняється зверху. Severity medium доречна: потрібна фізична клавіатура (desktop), а на мобільному сценарію немає.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v2-lock-bypass.mjs (режим shortcuts, hubshell-lock, 1280×900): 'locked: {lock:true,title:Введи PIN}', з фокусом у PIN-input Ctrl+K дає 0 діалогів (захист працює), після кліку по «1» 'activeElement: BUTTON Видалити' → Ctrl+K → 'dialogs: [app-lock-title z200, Глобальний пошук z200]', 'topmost at (640,40): INPUT Пошук по всіх модулях', запит «приват» → 'Рутина Антидепресанти ПРИВАТНО 50мг daily …', 'lock still mounted: true'; 'after g f: url:/finyk' під замком; Ctrl+/ → 'chat inputs while locked: 1'. Скріншот v2-locked-search.png показує результати пошуку на весь екран.
```

<a id="priv-16"></a>

### `priv-16` [medium] Після виходу власні продукти (IDB nutrition_foods) і AI-пропозиції рецептів (sessionStorage) попереднього користувача бачать анонім і наступний акаунт

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа / очищення при виході
- **Де:** apps/web/src/shared/lib/storage/purgeLocalData.ts:23-37, 115-131; apps/web/src/modules/nutrition/lib/recipeCache.ts:55-75
- **Першопричина:** purgeAppOwnedLocalData чистить лише localStorage, warm-cache і RQ-снапшот. IndexedDB-сховища nutrition_foods, nutrition_barcodes, nutrition_meal_thumbs і nutrition_recipes спільні в sergeant-db і не мають userId. sessionStorage переживає location.assign у тій самій вкладці. Ключ кешу рецептів рахується з комори і prefs, без userId.
- **Вплив:** Наступна людина на пристрої бачить у пошуку продуктів і на сторінці рецептів харчові дані попереднього користувача: його власні продукти і рецепти під його комору й алергени. За кодом це стосується і фото страв.
- **Що зробити:** При logout (і при identity-wipe з priv-02) після flush очищати app-owned ключі sessionStorage і nutrition-сховища IndexedDB або розділити їх за userId. Додати userId у ключ кешу рецептів.

Знахідок у кластері: 1.

#### [medium] Після виходу кастомні продукти X (IDB nutrition_foods) і AI-пропозиції рецептів (sessionStorage) бачать анонім і наступний користувач

- **ID:** `browser-crosscut/data-isolation-browser#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `privacy`
- **Де:** apps/web/src/shared/lib/storage/purgeLocalData.ts:23-37,115-131 (чиститься лише localStorage і RQ-снапшот; nutrition IDB і sessionStorage не чіпаються), apps/web/src/modules/nutrition/lib/recipeCache.ts:55-75 (ключ = хеш складу комори і prefs, без userId); URL http://127.0.0.1:4173/nutrition/log («Додати прийом їжі» → Пошук), /nutrition/menu/recipes
- **Вплив:** Наступна людина на пристрої бачить харчові дані попереднього користувача: власні продукти і рецепти, підібрані під його комору й алергени. Те саме, за кодом, стосується сховищ nutrition_meal_thumbs (фото їжі) і nutrition_barcodes.
- **Рекомендація:** При logout очищати app-owned ключі sessionStorage і nutrition-сховища IndexedDB (nutrition_foods, nutrition_recipes, nutrition_meal_thumbs, nutrition_barcodes) після flush або розділити їх за userId. Додати userId у ключ кешу рецептів.

**Докази:**

```text
21-run.log: Y відкриває «Звідки страва? → Пошук», вводить 'SECRET-X-egy' і бачить 'SECRET-X-egyj-food равіолі 350 ккал Б 12 г · Ж 6 г · В 60 г' (shots/.../21-egyj-y-meal-search.png). Y rq_cache: queryKey ["nutrition","food-search","local",…]. 10-run.log: те саме бачить анонім одразу після виходу X (10-bdnt-anon-meal-sheet-search.png).
30-run.log: X2 отримав AI-пропозицію рецепта, нічого не зберігав → «Вийти» → Y2 увійшов у тій самій вкладці → /nutrition/menu/recipes одразу показує 'SECRET-X2-ffu2-suggest (не збережено)' з підписом «(є кеш сеансу…)», жодного запиту recommend-recipes від Y2 не було (shots/.../30-ffu2-y2-recipes.png). Після виходу в sessionStorage: 'nutrition_recipes_cache_v1 :: SECRET-X2-ffu2'.
```

**Відтворення:**

```text
1) X: /nutrition/log → «Додати прийом їжі» → «Своє» → створити продукт; або /nutrition/menu/recipes → «Запропонувати рецепти». 2) «Вийти». 3) Анонімно або як Y: у пошуку продуктів ввести назву продукту X; відкрити /nutrition/menu/recipes. Скрипти: 21-full.mjs, 30-ai-suggest-cache.mjs.
```

**Верифікатор:**

```text
purgeAppOwnedLocalData() чистить лише localStorage, warm-cache і RQ-снапшот. sessionStorage і nutrition-сховища IDB (`nutrition_foods`, `nutrition_barcodes`, `nutrition_meal_thumbs`, `nutrition_recipes`) не чіпає, бо вони спільні для всього `sergeant-db` без userId. Logout робить `location.assign` у тій самій вкладці, тож sessionStorage живе далі. Ключ кешу рецептів (recipeCache.ts `buildRecipeCacheKey`) рахується лише з id комори, назв продуктів і prefs, userId у ньому немає. Для витоку AI-пропозиції в UI потрібен збіг ключа (наприклад, обидві комори порожні), а пошук продуктів показує кастомні продукти X будь-кому, хто введе схожу назву. Медіум обґрунтований: дані видно в UI наступного користувача, але вони менш чутливі, ніж фінанси чи здоров'я.
```

**Додаткові докази верифікатора:**

```text
v4-run.log (v4-foods.mjs): після виходу X 'VFX-n777' знайдено в {"ss":["nutrition_recipes_cache_v1"],"idb":["nutrition_foods"]}. Y увійшов і відкрив «Додати прийом їжі» з пошуком: 'Продукт VFX-n777-food равіолі 350 ккал Б 12 г · Ж 6 г · В 60 г на 100 г' (v4-n777-y-search.png). На /nutrition/menu/recipes Y бачить AI-пропозицію X 'VFX-n777-suggest' з підписом «(є кеш сеансу…)» (v4-n777-y-recipes.png), хоча сам Y запиту recommend-recipes не робив.
```

<a id="priv-17"></a>

### `priv-17` [medium] Легасі-сховище kvvfs (kvvfs-local-*) з повною базою всіх акаунтів пристрою ніколи не стирається, а вихід ламає маркери перелиття

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: локальна БД (kvvfs → OPFS)
- **Де:** apps/web/src/core/db/kvvfsHandoff.ts:16-27, 47-71, 115-150; apps/web/src/core/db/sqlite.ts:227-233, 477-507, 838-876; apps/web/src/shared/lib/storage/purgeLocalData.ts:26-34, 55-70
- **Першопричина:** Після переїзду на OPFS старий kvvfs-стор навмисно не чіпається. APP_OWNED_LS_PREFIXES не містить kvvfs-, а рядковий DELETE у wipeSqliteDb виконується лише для open.vfs === 'kvvfs'. Водночас purge стирає всі ключі sergeant.*, зокрема маркери sergeant.storage.opfsHandoff.v1.&lt;userKey&gt;, а pruneForeignPartitionRows не чистить kv_store.
- **Вплив:** На кожному давньому пристрої в localStorage відкритим текстом лежить знімок фінансів, здоров'я і sync_op_outbox усіх акаунтів, і вихід його не прибирає. Новий акаунт може отримати у свій файл чужі KV-значення, зокрема біометрію, а далі вони йдуть write-through на сервер. При збої воркера застосунок знову відкриває мертвий kvvfs-стор.
- **Що зробити:** Зробити стадію 3 (видалення kvvfs-local-* після підтвердженої доставки outbox) блокером. При виході видаляти рядки акаунта з kvvfs або, після flush, весь стор. Виключити sergeant.storage.opfsHandoff. з purge. У pruneForeignPartitionRows чистити і kv_store.
- **Примітка:** Стадія 3 вже описана в docs/work/specs/sqlite-opfs-worker.md, але не як блокер приватності. Повністю відтворюється лише на пристрої, що користувався застосунком до стадій 1-2: у Chromium аудиту kvvfs-даних немає. Стирання маркерів при виході підтверджено живцем.

Знахідок у кластері: 1.

#### [medium] Легасі-сховище kvvfs (`kvvfs-local-*`) з повною базою всіх акаунтів ніколи не стирається, а вихід ламає інваріант перелиття

- **ID:** `client-static/web-storage-session#7` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Уже відстежується:** docs/work/specs/sqlite-opfs-worker.md
- **Де:** apps/web/src/core/db/kvvfsHandoff.ts:16-27,47-71,115-150; apps/web/src/core/db/sqlite.ts:227-233,838-876,477-507; apps/web/src/shared/lib/storage/purgeLocalData.ts:55-70
- **Вплив:** На кожному давньому пристрої в localStorage відкритим текстом лежить знімок фінансів, здоровʼя й `sync_op_outbox` усіх акаунтів, і вихід його не прибирає. Новий акаунт на такому пристрої отримує в свій файл чужі KV-значення (налаштування, кеші, біометрію), які далі можуть поїхати write-through на сервер. Після виходу і збою воркера людина бачить старі дані й пише в мертвий стор.
- **Рекомендація:** Стадію 3 (видалення `kvvfs-local-*` після підтвердженої доставки outbox) зробити блокером. При виході для акаунта, що виходить, видаляти його рядки з kvvfs або весь kvvfs-стор після flush. Маркери перелиття не стирати при виході (виключити `sergeant.storage.opfsHandoff.` з purge). У `pruneForeignPartitionRows` очищати й `kv_store`.

**Докази:**

```text
Статично. До стадії 1 основним сховищем «для всіх» був kvvfs (sqlite.ts:52-53), і після переїзду його навмисно не чистять («Старе сховище тут НЕ чіпається»). Вихід його теж не чистить: `APP_OWNED_LS_PREFIXES` не містить `kvvfs-`, а рядковий DELETE у `wipeSqliteDb` виконується лише коли `open.vfs === "kvvfs"`, чого після перелиття не буває. Водночас вихід видаляє всі ключі `sergeant.*`, зокрема маркери `sergeant.storage.opfsHandoff.v1.<userKey>` (у браузері: після виходу лишається лише `...v1.anon`, бо його перезаписав новий бут). Наслідки: (1) для акаунта без OPFS-файла `needsHandoff` знову імпортує весь kvvfs-знімок, а `pruneForeignPartitionRows` чистить лише таблиці з колонкою `user_id`, тож `kv_store` попередніх акаунтів переїжджає у файл нового; (2) при збої воркера гілка `persistent && !isHandoffDone(userKey)` знову відкриває мертвий kvvfs-стор, хоча AI-DANGER у sqlite.ts:838-845 це прямо забороняє.
```

**Відтворення:**

```text
Статичний аналіз; у Chromium відтворити неможливо, бо OPFS працює і kvvfs-даних немає. Потрібен пристрій, що користувався застосунком до стадії 1/2, тобто будь-який старий iOS чи Android.
```

**Верифікатор:**

```text
Ключові твердження перевірено кодом, частину — живцем. (a) Після перелиття `open.vfs` = `opfs-sahpool`, тож рядковий DELETE у kvvfs (sqlite.ts:227-233) не виконується, а `kvvfs-` у префіксах purge немає. Коментар purgeLocalData.ts:26-34 обіцяє, що kvvfs-рядки користувача, який виходить, стирає `wipeSqliteDb`, і після стадії 2 це вже неправда. (b) Маркери `sergeant.storage.opfsHandoff.v1.<userKey>` стираються при виході через префікс `sergeant.`. Живий прогін: до виходу є маркери `anon` і `<userId>`, після лише `anon`. (c) `pruneForeignPartitionRows` пропускає таблиці без `user_id`, тобто `kv_store`. Коментар :108-111 це визнає, але в kvvfs `kv_store` був спільним для всіх акаунтів, тож новий акаунт на старому пристрої успадковує чужі KV. (d) Головнопотокова OPFS-гілка за власним коментарем «не спрацьовує НІКОЛИ» (sqlite.ts:48-55). Отже, якщо впаде воркер, а маркер стертий, відкривається kvvfs, і AI-DANGER :838-845 саме це забороняє. Уточнення: автор пише про перезапис наявного файлу, але воркер імпортує знімок лише коли файлу ще немає (sqliteWorker.ts:103), тож повторний імпорт стосується тільки нових акаунтів або видалених файлів. Відтворити неможливо (у Chromium kvvfs-даних немає …[обрізано]
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v7-markers.mjs: `before logout: ["sergeant.storage.opfsHandoff.v1.anon","sergeant.storage.opfsHandoff.v1.qeLh..."]`, `after logout+reboot: ["sergeant.storage.opfsHandoff.v1.anon"]`. Утримання kvvfs описане як план у docs/work/specs/sqlite-opfs-worker.md:116 («Прибирання — стадія 3, окремим рішенням»). Розриву гарантії виходу і стирання маркерів там немає.
```

<a id="priv-18"></a>

### `priv-18` [medium] Гість не може відкликати згоду на аналітику в Налаштуваннях: замість тумблера «Увійди в акаунт» і марна «Спробувати ще»

- **Стан:** виправлено в #1369 (змерджено 2026-10-03)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: налаштування приватності
- **Де:** apps/web/src/core/settings/PrivacySection.tsx:99-103, 241-251
- **Першопричина:** PrivacySection рендерить тумблери лише після успішного GET /me/preferences. Для гостя це 401 → loadFailure 'auth'. Локального тумблера аналітики немає, хоча згода гостя зберігається локально.
- **Вплив:** Гість, який натиснув «Дозволити», не має обіцяного шляху відкликання («Передумати можна в Налаштуваннях»), а це суперечить ст. 7(3) GDPR. Зараз проблему маскує інший баг: рішення не зберігається, і банер питає знову. Щойно його виправлять, гість лишиться зі згодою без способу її відкликати.
- **Що зробити:** Для гостя рендерити локальний тумблер аналітики: setAnalyticsConsent без серверного запису, з pendingServerSync. Серверні тумблери пам'яті й здоров'я ховати з поясненням. Для loadFailure === 'auth' не показувати «Спробувати ще».

Знахідок у кластері: 1.

#### [medium] Гість не може відкликати згоду на аналітику в Налаштуваннях: замість тумблера «Увійди в акаунт…» і марна «Спробувати ще»

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `privacy`
- **Де:** apps/web/src/core/settings/PrivacySection.tsx:99-103 і 241-251; http://127.0.0.1:4173/?tab=settings&amp;group=advanced → «Дані та приватність»
- **Вплив:** Відкликати згоду має бути так само легко, як її дати (GDPR Art. 7(3)), але гість, який натиснув «Дозволити», не має обіцяного шляху відкликання. Зараз це частково маскує баг із незбереженням рішення: банер просто питає знову. Щойно той баг виправлять, гість лишиться зі згодою без способу її відкликати.
- **Рекомендація:** Для гостя рендерити локальний тумблер аналітики (setAnalyticsConsent без серверного запису, з pendingServerSync), а серверні тумблери памʼяті й здоровʼя ховати з поясненням. Не показувати «Спробувати ще» для loadFailure==='auth'.

**Докази:**

```text
s41 (гість, /welcome → «Почати» → «Дозволити»): розділ «Згода та дані» показує «Увійди в акаунт, щоб керувати налаштуваннями згоди на сервері.» і кнопку «Спробувати ще». Тумблерів «Аналітика продукту» немає (found:false), бо GET /api/v1/me/preferences → 401. Тим часом крок згоди й банер обіцяють: «Передумати можна в Налаштуваннях, у розділі приватності.», а privacyDocument/cookiesDocument називають перемикач у Налаштування → Дані та приватність. Скриншот: shots/onb-ai-bill/anon-privacy-section.png
```

**Відтворення:**

```text
Чистий профіль: /welcome → «Почати» → «Дозволити» → Налаштування → «Додатково» → «Дані та приватність». Тумблера аналітики нема, «Спробувати ще» знову дає 401. Скрипт: s41-anon-privacy-toggle.mjs
```

**Верифікатор:**

```text
Reproduced. PrivacySection renders the toggles only when preferencesLoaded is true. For a guest, GET /me/preferences returns 401, which classifies as loadFailure 'auth', so the section shows «Увійди в акаунт, щоб керувати налаштуваннями згоди на сервері.» and a «Спробувати ще» button. That button just repeats the 401. A guest has no local analytics toggle, yet the banner and onboarding copy say «Передумати можна в Налаштуваннях, у розділі приватності». A guest who chose «Дозволити» gets cachedAnalyticsConsent=true for the session, so trackEvent and PostHog opt in. Right now finding #1 hides most of this: after a reload the grant is gone and the banner asks again, so «Ні» is accidentally reachable that way. Once #1 is fixed, a guest has no way to withdraw consent.
```

**Додаткові докази верифікатора:**

```text
v6-anon-privacy.mjs: guest → /welcome → «Почати» → «Дозволити» → SPA navigation to ?tab=settings&group=advanced → «Дані та приватність». «Аналітика продукту» count=0, «Спробувати ще» present, and clicking it gives 401 on /api/v1/me/preferences again.
```

## low

<a id="priv-19"></a>

### `priv-19` [low] Маскування PII перед LLM пропускає звичні формати: телефони з пробілами, дужками чи дефісами, картку без пробілів, IBAN з пробілами, email з дефісом у домені

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: AI-шар (pii-mask)
- **Де:** apps/server/src/lib/pii-mask.ts:14-25; apps/server/src/lib/llmRedaction.ts:121-133; apps/web/src/core/legal/privacyDocument.ts:96
- **Першопричина:** Регекси в pii-mask.ts покривають лише компактні форми: телефон (?:\+380|0)\d{9}, IBAN UA\d{27} без пробілів, картку 4x4 з роздільниками і домен email без дефіса.
- **Вплив:** Телефони, номери карток, IBAN і адреси в тому вигляді, як їх вводять люди і показують банки, потрапляють у промпти OpenRouter, Google, DeepSeek, Z.ai, TypeSafe і Voyage без маскування. Політика обіцяє протилежне.
- **Що зробити:** Розширити регекси: телефони з роздільниками і префіксом +38, картки 13-19 цифр з опційними роздільниками і перевіркою Луна, IBAN з пробілами, домени з дефісами. Додати ці кейси в llmRedactionCoverage.test.ts.
- **Примітка:** Severity знижено з medium до low: компактні формати маскуються, а маскування — запобіжник, а не єдиний захист.

Знахідок у кластері: 1.

#### [low] Маскування PII класу А пропускає поширені формати: телефони з пробілами/дужками/дефісами, номер картки без пробілів, IBAN з пробілами, e-mail з дефісом у домені

- **ID:** `server-static/ai-layer#6` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/lib/pii-mask.ts:14-25 (використовується lib/llmRedaction.ts:121-133 на всіх шляхах до LLM і Voyage)
- **Вплив:** Телефони, номери карток, IBAN і e-mail у звичному написанні (так їх і вводять люди та так їх показують банки) потрапляють у промпти OpenRouter/Google/DeepSeek/Z.ai, TypeSafe і Voyage немасованими, всупереч обіцянці в політиці.
- **Рекомендація:** Розширити регекси: телефон `(?:\+?38)?[\s(-]*0\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}`, картки 13-19 цифр з опційними роздільниками + перевірка Луна, IBAN `UA\d{2}(?:\s?\d{4}){6}\s?\d` з пробілами, домен e-mail з дефісами. Додати ці випадки в llmRedactionCoverage.test.ts.

**Докази:**

```text
Патерни: email `@[a-z0-9.]+\.` (без дефіса), IBAN лише `\bUA\d{27}\b`, картка лише 4x4 з роздільниками, телефон лише `(?:\+380|0)\d{9}\b`. Запуск maskUserText/maskMachineText (<scratch>/agents/server-static-ai-layer/mask.mts, mask2.mts): `"+380 67 123 45 67"` -> без змін; `"067-123-45-67"` -> без змін; `"+38 (067) 123-45-67"` -> без змін; `"картка 4111111111111111"` -> без змін; `"IBAN UA21 3223 1300 0002 6007 2335 6600 1"` -> `"IBAN UA21 [card] 2335 6600 1"`; `"olena@my-company.com.ua"` -> без змін. Політика (privacyDocument.ts:96) обіцяє: «Перед відправкою ми маскуємо пошту, телефон, IBAN, номер картки та ІПН».
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-ai-layer/mask.mts
```

**Верифікатор:**

```text
Відтворено незалежно на maskUserText і maskMachineText (lib/llmRedaction.ts → pii-mask.ts). Не маскуються такі формати: +380 67 123 45 67, 067-123-45-67, +38 (067) 123-45-67, 067 123 4567, картка 4111111111111111 без пробілів, olena@my-company.com.ua (дефіс у домені). IBAN з пробілами маскується частково: «UA21 [card] 2335 6600 1». Компактні формати (+380671234567, 0671234567, UA+27 цифр, 4x4 з пробілами, 10-значний ІПН) маскуються. Політика (privacyDocument.ts:96) обіцяє маскувати пошту, телефон, IBAN, картку й ІПН, тож прогалина реальна. Severity знижую до low. Маскування - best-effort шар понад договірних субпроцесорів, і internal llm-subprocessors.md сам пише, що це не GDPR-відповідність. Здебільшого витікає те, що людина сама набрала в AI-чаті, тобто свідомо передала асистенту. Прямого експлойту немає, є лише неповне виконання обіцянки.
```

**Додаткові докази верифікатора:**

```text
verify-server-static-ai-layer/mask-v2.mts: «+380 67 123 45 67» без змін; «067-123-45-67» без змін; «картка 4111111111111111» без змін; «IBAN UA21 3223 1300 0002 6007 2335 6600 1» дає «IBAN UA21 [card] 2335 6600 1»; «olena@my-company.com.ua» без змін. Регекс email: [a-z0-9.]+ у домені, без дефіса. Телефон: (?:+380|0) і рівно 9 цифр підряд.
```

<a id="priv-20"></a>

### `priv-20` [low] Персональні дані поза каскадом видалення і без строку зберігання: сирі payload-и LiqPay і Stripe, push-аудит, журнал розсилок, фідбек, відписки і waitlist

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: білінг / права на дані / міграції
- **Де:** apps/server/src/modules/billing/liqpay.ts:470-476; apps/server/src/modules/billing/stripeWebhook.ts:31-35; apps/server/src/modules/webhooks/retentionPoller.ts:126-130; apps/server/src/modules/me/dataRights.ts:652-734; apps/server/src/migrations/041_push_send_audit.sql:14-16; apps/server/src/migrations/093_feedback_entries.sql:34; apps/server/src/migrations/043_email_unsubscribes.sql:39; apps/server/src/migrations/009_waitlist.sql:12; apps/server/src/migrations/**tests**/141-142-user-scoped-cascade.test.ts:42-55, 227
- **Першопричина:** Частина таблиць тримає ідентифікатор чи PII без FK на user (feedback_entries, email_unsubscribes, email_campaigns_log.recipient_id, push_send_audit.target_user_id), waitlist_entries має ON DELETE SET NULL. Гейт каскаду шукає лише колонку з іменем user_id. LiqPay і Stripe пишуть увесь колбек у JSONB без редакції (для Plata є redactPlataPayload). Retention-поллер чистить лише n8n_webhook_events, а purgeUserData явно чистить тільки ai_usage_daily і ai_memory_ingest_failed.
- **Вплив:** Після остаточного видалення акаунта лишаються вільний текст фідбеку з user_id і UA, email у waitlist та ідентифікатори в журналах розсилок і push-аудиті. Після запуску платежів безстроково зберігатимуться ім'я, маска картки й IP платника. Це суперечить політиці («каскадно чистить наші бази», «журнали вебхуків: 30 днів») і ADR-0016 §4.
- **Що зробити:** Обрізати payload LiqPay і Stripe до allowlist полів (order_id, payment_id, action, status, amount, currency, дата), як для Plata. Розширити retention-поллер на billing_webhook_events, stripe_webhook_events, push_send_audit, email_campaigns_log і ip:-рядки ai_usage_daily. У purgeUserData чистити feedback_entries, email_unsubscribes (або лишати хеш), email_campaigns_log, push_send_audit і waitlist_entries. Розширити гейт-тест на колонки *_user_id і recipient_id.
- **Примітка:** Частина таблиць свідомо в NO_FK_ALLOWLIST за ADR-0016, тому privacy-logging#4 знижено до low. Фіскальні записи законно зберігаються до 5 років (privacyDocument.ts:153), але сирого PII у payload це не виправдовує. Платежі в беті вимкнені, тож білінгова частина ризику поки відкладена.

Знахідок у кластері: 4.

#### [low] Дані поза каскадом: payload-и вебхуків, аудит пушів, лог розсилок і waitlist переживають видалення акаунта і не мають ретенції

- **ID:** `server-static/db-migrations#5` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/modules/billing/liqpay.ts:471-476; apps/server/src/modules/billing/stripeWebhook.ts:31-34; apps/server/src/migrations/041_push_send_audit.sql:14-16; apps/server/src/email/ftuxDripMail.ts:77-98; apps/server/src/migrations/009_waitlist.sql:12; apps/server/src/modules/chat/aiQuota.ts:281-283; apps/server/src/migrations/**tests**/141-142-user-scoped-cascade.test.ts:227
- **Вплив:** Після видалення акаунта лишаються ідентифікатор користувача, IP, платіжні метадані (імʼя/телефон/маска картки від LiqPay) і email у waitlist — безстроково. Це суперечить інваріанту ADR-0016 §4 «немає таблиці з user даними поза каскадом».
- **Рекомендація:** Редагувати LiqPay payload до мінімуму (order_id/status/action/payment_id), як для Plata; задати ретенцію (напр. 90-180 днів) для billing/stripe/push_send_audit/email_campaigns_log і ip:-рядків ai_usage_daily; у purgeUserData чистити email_campaigns_log/push_send_audit/waitlist_entries за user_id/email; розширити гейт-тест на колонки *_user_id, recipient_id.

**Докази:**

```text
LiqPay: `INSERT INTO billing_webhook_events (...payload) VALUES ('liqpay', $1, $2, $3)` з `JSON.stringify(cb)` — повний callback (order_id = srg_<hex(userId)>_..., поля sender_*/card mask, ip), тоді як Plata редагується redactPlataPayload. Stripe: `payload` = весь event. push_send_audit.target_user_id без FK; 041: «retention ... caller TBD» — DELETE для неї в коді немає. email_campaigns_log: recipient_id (= user id) + 12-hex unsalted sha256 email + raw. waitlist_entries: FK ON DELETE SET NULL, email лишається. ai_usage_daily: `ip:${getIp(req)}` subject для запитів без сесії, DELETE лише в purgeUserData. Гейт каскаду шукає лише колонку з іменем `user_id` (`a.attname = 'user_id'`), тож target_user_id/recipient_id/payload його оминають.
```

**Відтворення:**

```text
grep `DELETE FROM` по apps/server/src: для billing_webhook_events, stripe_webhook_events, push_send_audit, email_campaigns_log (крім release claim), ai_usage_daily (крім purge) прибирання немає; FK-список з pg_constraint.
```

**Верифікатор:**

```text
Each sub-claim checks out in code and schema. (1) liqpay.ts writes JSON.stringify(cb), the full callback, into billing_webhook_events.payload, while Plata goes through redactPlataPayload. (2) stripeWebhook.ts stores JSON.stringify(event). (3) push_send_audit.target_user_id and email_campaigns_log.recipient_id have no FK: pg_constraint shows only waitlist_entries_user_id_fkey (ON DELETE SET NULL) among these tables. (4) A grep finds no retention DELETE for billing_webhook_events, stripe_webhook_events or push_send_audit. email_campaigns_log is deleted only in the releaseLogRow claim rollback, and ai_usage_daily only in purgeUserData (`u:` keys), so `ip:` rows are never removed. Migration 041 says 'retention ... caller TBD'. (5) The cascade gate test joins on `a.attname = 'user_id'` only, so target_user_id/recipient_id escape it. Low is right: ADR-0016 'Pending policy' explicitly leaves log and vendor retention as open ops work, and waitlist_entries holds an email given separately and voluntarily. The un-redacted LiqPay payload, kept forever, is the most concrete part.
```

**Додаткові докази верифікатора:**

```text
psql FK query: only `waitlist_entries|waitlist_entries_user_id_fkey|FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL`; email_campaigns_log has recipient_id TEXT and recipient_email_hash (12-hex unsalted sha256, trivially linkable to a known email); push_send_audit has target_user_id TEXT and caller_ip inet. ADR-0016 §Pending policy: 'Retention для логів, backups і даних кожного external vendor лишається policy/operations роботою', which partially acknowledges this.
```

#### [low] Видалення акаунта лишає персональні дані-сироти, хоча політика обіцяє «каскадно чистить наші бази»

- **ID:** `server-static/privacy-logging#4` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/modules/me/dataRights.ts:652-734 (purgeUserData); migrations 093_feedback_entries.sql:34, 043_email_unsubscribes.sql:39, 009_waitlist.sql:12 (ON DELETE SET NULL), 041_push_send_audit.sql:15,51, 020_marketing_tables.sql (email_campaigns_log); apps/web/src/core/legal/privacyDocument.ts:125
- **Вплив:** Після остаточного видалення лишаються вільний текст фідбеку з user_id і UA, email у waitlist, ідентифікатор у журналах розсилок і push-аудиті — порушення права на стирання (GDPR Art.17) і неправдиве твердження в політиці.
- **Рекомендація:** У purgeUserData видаляти/анонімізувати feedback_entries, email_unsubscribes (або лишати лише хеш), email_campaigns_log, push_send_audit, waitlist_entries за user_id/email; або додати FK ON DELETE CASCADE міграцією. Додати тест-гейт: кожна таблиця з user_id має або FK CASCADE, або явний крок у purgeUserData.

**Докази:**

```text
pg_constraint: таблиці з user_id БЕЗ FK на "user": feedback_entries (user_id, message, user_agent), email_unsubscribes (user_id), email_campaigns_log (recipient_id, recipient_email_hash, raw), push_send_audit (target_user_id, caller_ip inet); waitlist_entries — FK ON DELETE SET NULL (email лишається). purgeUserData явно чистить лише ai_usage_daily і ai_memory_ingest_failed, далі `DELETE FROM "user"`. Жодного `DELETE FROM feedback_entries|email_unsubscribes|push_send_audit|waitlist_entries` у коді немає; у push_send_audit «retention ... caller TBD». Політика (privacyDocument.ts:125): «Видалення акаунта каскадно чистить наші бази».
```

**Відтворення:**

```text
psql postgresql://hub:hub@127.0.0.1:5432/hub -c "select distinct conrelid::regclass, confdeltype from pg_constraint where contype='f' and confrelid='public.\"user\"'::regclass" і порівняти з переліком таблиць з колонкою user_id; grep -rn 'DELETE FROM' apps/server/src.
```

**Верифікатор:**

```text
Факт підтверджено, але частина поведінки задокументована як навмисна, тож severity знижено. pg_constraint: у feedback_entries, email_unsubscribes, email_campaigns_log (recipient_id) і push_send_audit (target_user_id) немає FK на "user"; waitlist_entries має ON DELETE SET NULL, тож email лишається. purgeUserData (dataRights.ts:652-734) явно чистить тільки ai_usage_daily і ai_memory_ingest_failed. Проте ADR-0016 §4 і NO_FK_ALLOWLIST у migrations/__tests__/141-142-user-scoped-cascade.test.ts:42-55 прямо називають feedback_entries («збереження тексту після видалення - продуктове рішення») і email_unsubscribes («opt-out має пережити акаунт») навмисними винятками. Реальні прогалини такі. (a) Публічна політика (privacyDocument.ts:125, «Видалення акаунта каскадно чистить наші бази») суперечить ADR: текст фідбеку з UA залишається. (b) Гейт перевіряє лише колонку `user_id`, тому push_send_audit.target_user_id і email_campaigns_log.recipient_id/recipient_email_hash його оминають і нічим не чистяться (retention push_send_audit має позначку «caller TBD»). (c) Email у waitlist лишається. (d) Обґрунтування для email_unsubscribes не працює: таблиця ключована тільки user_id без email, а нова реєстр …[обрізано]
```

**Додаткові докази верифікатора:**

```text
psql FK-список на "user": усі модульні таблиці CASCADE, waitlist_entries 'n' (SET NULL); feedback_entries, email_unsubscribes, email_campaigns_log, push_send_audit у ньому відсутні. mono_ai_enrichment_queue каскадиться через FK (user_id, mono_tx_id) → mono_transaction, тож це не сирота. ADR-0016 рядок 29 перелічує навмисні винятки.
```

#### [low] Сирі LiqPay-колбеки (з персональними даними платника) зберігаються безстроково й не видаляються при видаленні акаунта

- **ID:** `server-static/webhooks-billing-quota#18` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/modules/billing/liqpay.ts:470-476; apps/server/src/modules/webhooks/retentionPoller.ts:126-130
- **Вплив:** PII платника (ім'я, маска картки, IP) у базі без строку зберігання і поза процедурою стирання (Hard Rule #21 / GDPR Art.17).
- **Рекомендація:** Зберігати лише потрібні поля (order_id, payment_id, action, status, amount, currency, дата) за allowlist-ом; додати retention для billing_webhook_events/stripe_webhook_events з урахуванням потреб дедупу.

**Докази:**

```text
`INSERT INTO billing_webhook_events (provider, provider_event_id, event_type, payload) VALUES ('liqpay', $1, $2, $3)` з `JSON.stringify(cb)` — увесь розібраний колбек без редакції (для Plata є redactPlataPayload, що прибирає cardToken). Retention-поллер чистить лише `n8n_webhook_events`; у billing_webhook_events немає user_id, тож GDPR-видалення його не зачіпає (hasCancellationEvent навіть залежить від цієї історії).
```

**Відтворення:**

```text
Після успішної оплати LiqPay: SELECT payload FROM billing_webhook_events WHERE provider='liqpay' — усі поля колбеку (типово sender_first_name/last_name, sender_card_mask2, ip тощо) лежать у JSONB назавжди.
```

**Верифікатор:**

```text
Перевірено в коді. liqpay.ts:470-476 пише `JSON.stringify(cb)`, де cb — весь розібраний base64-JSON колбеку; інтерфейс LiqPayCallback лише типізує частину полів і нічого не відкидає. У Plata для того самого запису є redactPlataPayload, у LiqPay аналога немає. Таблиця billing_webhook_events (міграція 072) не має колонки user_id, тому видалення через каскад її не зачіпає. purgeUserData (dataRights.ts:652-735) явно чистить лише ai_usage_daily і ai_memory_ingest_failed. Інваріант-тест 141-142 перевіряє тільки таблиці з user_id, тож ця таблиця випадає з-під нього. При цьому order_id = srg_<hex(userId)>_..., тобто дані прямо прив'язуються до користувача. Retention-поллер чистить лише n8n_webhook_events. Що знижує вагу: LiqPay ще не ввімкнено (LIQPAY_ENABLED=false), тож проблема латентна. Посилання на Hard Rule #21 неточне: це правило про редакцію pino-логів, а не про зберігання в БД. Платіжні записи частково можна тримати й на законній підставі (Art.17(3)(b)), але ім'я, маску картки, IP і телефон для дедупу не потрібні, тож зауваження про мінімізацію даних слушне. Застереження з самої знахідки про hasCancellationEvent коректне: при додаванні retention треба зберегти order_id, event_type …[обрізано]
```

**Додаткові докази верифікатора:**

```text
liqpay.ts:466-476; plata.ts:141-155 (redactPlataPayload як контраст); migrations/072_billing_webhook_events.sql (немає user_id); migrations/142:88-90 (індекс по payload->>'order_id' для hasCancellationEvent); webhooks/retentionPoller.ts:126-130 (тільки n8n_webhook_events); dataRights.ts:652-735. Перелік полів, які LiqPay кладе в callback (sender_first_name/last_name, sender_card_mask2, ip, sender_phone тощо), — з публічної документації LiqPay; наживо не перевірено, бо ключів немає.
```

#### [info] Повні payload-и білінгових вебхуків і push_send_audit зберігаються безстроково всупереч «журнали вебхуків: 30 днів»

- **ID:** `server-static/privacy-logging#10` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Серйозність від шукача:** low
- **Де:** apps/server/src/modules/billing/stripeWebhook.ts:31-35; apps/server/src/modules/billing/liqpay.ts:471-474; apps/server/src/modules/billing/plata.ts:188-194; apps/server/src/migrations/041_push_send_audit.sql:15; apps/server/src/modules/webhooks/retentionPoller.ts:1-20; apps/web/src/core/legal/privacyDocument.ts:149
- **Вплив:** Після запуску платежів PII платників і IP-аудит накопичуватимуться безстроково, не каскадуються при видаленні акаунта (немає FK) і суперечать заявленим строкам зберігання. Зараз платежі в беті вимкнені — ризик відкладений.
- **Рекомендація:** Розширити WebhookEventsRetentionPoller на stripe_webhook_events, billing_webhook_events, push_send_audit (або зберігати лише id/тип/хеш payload). Додати їх у purgeUserData.

**Докази:**

```text
stripe_webhook_events.payload = JSON.stringify(event) (повна Stripe-подія: email/імʼя клієнта, адреса, last4); billing_webhook_events.payload для LiqPay/Plata. Retention-поллер чистить лише n8n_webhook_events; grep 'DELETE FROM (stripe_webhook_events|billing_webhook_events|push_send_audit)' — 0. Міграція 041: «retention is enforced by a periodic sweep ... (caller TBD)». Політика: «Журнали подій вебхуків і серверні логи: 30 днів».
```

**Відтворення:**

```text
grep -rn 'DELETE FROM' apps/server/src | grep -E 'webhook|push_send_audit'
```

**Верифікатор:**

```text
Підтверджено, що у трьох таблиць немає жодного механізму зберігання. grep по apps/server/src не знаходить DELETE/prune для stripe_webhook_events, billing_webhook_events чи push_send_audit. retentionPoller чистить лише n8n_webhook_events. Міграція 041 прямо каже «caller TBD». stripeWebhook.ts:31-35 пише повний `JSON.stringify(event)`, liqpay.ts:471-474 повний callback. Втім, висновок «всупереч 30 дням» перебільшений, а severity завищена. (1) Та сама політика (privacyDocument.ts:153-154) окремо обіцяє «журнали безпеки й аудиту: до 12 місяців» і «білінгові та фіскальні дані: строк за законодавством (зазвичай 5 років)». Білінгові payload-и підпадають під п'ятирічний пункт, а push_send_audit під журнал аудиту. (2) LiqPay-код свідомо читає історію billing_webhook_events (liqpay.ts:284-308, `hasCancellationEvent`), тож сліпий 30-денний sweep ламав би логіку. (3) Payload Plata редагується (`redactPlataPayload`, plata.ts:194). (4) push_send_audit зберігає IP внутрішнього викликача /api/push/send (воркера), а не IP користувача, плюс target_user_id і SHA-256 payload-у. (5) Платежі вимкнені (LIQPAY_ENABLED/PLATA_ENABLED за замовчуванням false), і локально в усіх трьох таблицях 0 рядків. Лишаєт …[обрізано]
```

**Додаткові докази верифікатора:**

```text
psql: stripe_webhook_events|0, billing_webhook_events|0, push_send_audit|0. 041_push_send_audit.sql:14-17 («retention is enforced by a periodic sweep ... (caller TBD)»), :22-37 (caller_ip = IP викликача внутрішнього ендпоінта, payload лише хешем). liqpay.ts:293 «Слід лишається лише в billing_webhook_events, тож питаємо її». Наявні аудити лише перелічують ці таблиці (2026-07-31-legal-docs-beta-readiness.md:146,154) і не фіксують розбіжність зі строками зберігання.
```

<a id="priv-21"></a>

### `priv-21` [low] EXIF і GPS не вирізаються з невеликих фото чеків і страв: оригінал з координатами йде на сервер і далі AI-провайдеру

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: медіа (compressImage)
- **Де:** apps/web/src/shared/lib/media/compressImage.ts:13-18, 31, 44-52, 166; apps/web/src/modules/finyk/lib/receiptImage.ts:65-74; apps/web/src/modules/nutrition/hooks/usePhotoAnalysis.ts:182-184, 212-221; apps/server/src/modules/nutrition/analyze-photo.ts:176
- **Першопричина:** compressImage перекодовує через canvas лише файли понад 1,5 МБ і повертає null, якщо перекодований файл не менший за оригінал. Після цього виклики шлють оригінальний File. Докстрінг при цьому хибно обіцяє, що на відкидання EXIF «можна покладатись». Сервер передає base64 провайдеру без жодної обробки EXIF.
- **Вплив:** Фото чека чи страви, зроблене вдома або на роботі, розкриває точні координати серверу і сторонньому AI-провайдеру, хоча код і доки обіцяють протилежне.
- **Що зробити:** Завжди перекодовувати через canvas або вирізати сегмент APP1/EXIF перед відправкою, незалежно від розміру. Додати тест на відсутність EXIF у payload. Опційно стрипати EXIF і на сервері.
- **Примітка:** Severity знижено з medium до low: більшість фото з камери важать понад 1,5 МБ і проходять перекодування.

Знахідок у кластері: 1.

#### [low] EXIF/GPS не вирізається з невеликих фото чеків і страв: оригінал з координатами йде на сервер і далі AI-провайдеру

- **ID:** `client-static/gap-backup-restore-file-imports#8` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/shared/lib/media/compressImage.ts:13-18,31,44-52,166; apps/web/src/modules/finyk/lib/receiptImage.ts:65-74; apps/web/src/modules/nutrition/hooks/usePhotoAnalysis.ts:182-184,212-221; apps/server/src/modules/nutrition/analyze-photo.ts:176
- **Вплив:** Фото чека чи страви з дому розкривають точні координати (дім, робота) серверу й сторонньому AI-провайдеру, хоча код і доки обіцяють протилежне.
- **Рекомендація:** Завжди перекодовувати через canvas або вирізати APP1/EXIF-сегмент перед відправкою незалежно від розміру. Додати тест на відсутність EXIF у payload. Опційно стрипати EXIF і на сервері.

**Докази:**

```text
The docstring claims, as a property callers «МОЖНА покладатись», that «re-encode через canvas відкидає EXIF, включно з GPS». But for jpeg/png/webp `return file.size > COMPRESS_SKIP_BELOW_BYTES` (1_500_000), and `if (WEB_SAFE_TYPES.has(file.type) && blob.size >= file.size) return null;`. Callers then fall back to the original File: `const effective = compressed ?? file`.
Node run: `{"size":1200000,"type":"image/jpeg"} -> re-encode (EXIF stripped)? false`, `{"size":900000,"type":"image/png"} -> false`.
The server forwards `source:{type:'base64', data:b64}` to the provider unchanged, and there is no exif/sharp handling anywhere in apps/server.
```

**Відтворення:**

```text
<scratch>/agents/client-static-gap-backup-restore-file-imports/compress.ts (node --import tsx). Any phone JPEG under 1.5 MB with GPS EXIF, uploaded via the receipt scan or meal photo, goes out with its EXIF unchanged.
```

**Верифікатор:**

```text
I confirmed this in code and by running the harness. `shouldAttemptCompression` returns false for image/jpeg|png|webp files of 1.5 MB or less, and `compressImageFile` returns null when the re-encode is not smaller (compressImage.ts:51,166). Both callers then send the original File as base64 (receiptImage.ts:65-66, usePhotoAnalysis.ts:182-184,212). The server forwards `data: b64` to the vision provider unchanged (analyze-photo.ts:176), and apps/server has no exif or sharp handling. The docstring (compressImage.ts:13-18) and the spec docs/work/specs/receipt-scan.md:603 both claim EXIF/GPS is always dropped, which is false for this path. I downgraded the finding from medium to low for four reasons. (1) The image is transient: analyze does not write it to the DB or rawPayload (analyze.ts:217-226). (2) The user-facing privacy policy (privacyDocument.ts:63) already says photos go to the AI provider in full and unmasked, so no user-facing promise is broken. (3) iPhone HEIC files are always re-encoded, and most phone-camera JPEGs exceed 1.5 MB. (4) Mobile OS photo pickers often strip location metadata already. The exposure window is therefore small web-safe images that still carry GPS.
```

**Додаткові докази верифікатора:**

```text
Harness output: {size:1200000,type:image/jpeg} -> false; {size:900000,type:image/png} -> false; {size:3000000,type:image/jpeg} -> true; {size:500000,type:image/heic} -> true. grep -rniE 'exif|sharp' in apps/server/src finds nothing. privacyDocument.ts:63 says «Фото страв надсилаються на аналіз до AI-провайдера у повному вигляді, вони не маскуються».
```

<a id="priv-22"></a>

### `priv-22` [low] FTUX-розсилка йде без маркетингової згоди і до підтвердження email, а відписка — state-changing GET без List-Unsubscribe

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** server: email
- **Де:** apps/server/src/auth.ts:481-515; apps/server/src/email/ftuxDripMail.ts:290-301, 342-460; apps/server/src/routes/email-unsubscribe.ts:177-222; apps/server/src/email/ftuxUnsubscribeToken.ts:22-35, 139-145; apps/web/src/core/legal/privacyDocument.ts:133
- **Першопричина:** Хук user.create.after ставить у чергу три листи з порадами кожному новому користувачу без перевірки emailVerified чи згоди. dispatchFtuxDripEmail перевіряє лише існування користувача, opt-out і дедуп. Лист не має заголовків List-Unsubscribe/List-Unsubscribe-Post, а GET /api/email/unsubscribe одразу записує відписку.
- **Вплив:** Порушено обіцянку opt-in для порад і новин. Реєстрація на чужий email запускає серію листів третій особі. Link-сканери поштових сервісів самі відписують людей, а без one-click unsubscribe страждає доставлюваність у Gmail і Yahoo.
- **Що зробити:** Слати drip лише після emailVerified і за згоди (або в політиці перекваліфікувати його як онбординг з opt-out). Додати List-Unsubscribe і List-Unsubscribe-Post (RFC 8058), а відписку робити через POST або кнопку підтвердження. Винести окремий UNSUBSCRIBE_SECRET або виправити коментар.
- **Примітка:** Токен відписки перевірено: його не можна підробити чи перебрати, але він не має строку дії і підписаний BETTER_AUTH_SECRET. У локальній БД Day-0 диспатчився всім 226 неверифікованим користувачам.

Знахідок у кластері: 1.

#### [low] FTUX-розсилка без маркетингової згоди й до підтвердження email; відписка — state-changing GET без List-Unsubscribe

- **ID:** `server-static/privacy-logging#9` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** apps/server/src/auth.ts:481-515; apps/server/src/email/ftuxDripMail.ts:290-301; apps/server/src/routes/email-unsubscribe.ts:177-222; apps/server/src/email/ftuxUnsubscribeToken.ts:22-35,139-145; apps/web/src/core/legal/privacyDocument.ts:133
- **Вплив:** Порушення обіцянки opt-in для маркетингу; реєстрація на чужий email запускає серію листів третій особі; доставлюваність у Gmail/Yahoo (вимога one-click unsubscribe) і випадкові відписки сканерами.
- **Рекомендація:** Слати drip лише після emailVerified і за наявності згоди (або перекваліфікувати в політиці як онбординг з opt-out). Додати List-Unsubscribe + List-Unsubscribe-Post (RFC 8058) і робити відписку через POST/кнопку підтвердження. Виправити коментар або винести окремий UNSUBSCRIBE_SECRET.

**Докази:**

```text
queueFtuxDripForNewUser викликається в databaseHooks user.create.after для кожного нового юзера (без перевірки згоди і до emailVerified) — 3 листи з порадами (Day0/1/3). Політика: «Інформаційний дайджест, поради, новини фіч – лише за твоєю явною згодою». Resend-запит без headers List-Unsubscribe/List-Unsubscribe-Post. GET /api/email/unsubscribe?u=<userId>.<hmac> одразу пише в email_unsubscribes — link-сканери поштовиків відпишуть людину самі. Токен перевірено: не підробний і не перебірний (GET з u="", "abc", userId.0×64 → 200 сторінка «посилання вже не діє»), але без строку дії, розкриває внутрішній userId, і підписаний самим BETTER_AUTH_SECRET, хоча коментар стверджує, що їх можна ротувати окремо.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-privacy-logging/unsub.mjs; прочитати auth.ts:481-515.
```

**Верифікатор:**

```text
Підтверджено і в коді, і в живій БД. Хук auth.ts:500-515 `user.create.after` викликає `queueFtuxDripForNewUser` для кожного нового користувача без перевірок. ftuxDripMail.ts:342-460 (`dispatchFtuxDripEmail`) перевіряє лише, чи користувач існує, opt-out у `email_unsubscribes` і дедуп. Перевірок emailVerified чи маркетингової згоди немає. У локальній БД 226 рядків `ftux_drip_day_0` на 226 користувачів, і жоден не має emailVerified=true. Тобто Day-0 диспатчиться неверифікованим адресам; поза dev лист реально йде, коли задано RESEND_API_KEY. Зміст листів — нагадування повернутися («Все ок? Sergeant чекає на твій перший запис»), а не транзакційні листи. Політика (privacyDocument.ts:133) обіцяє «поради... лише за твоєю явною згодою». `sendViaResend` (ftuxDripMail.ts:290-304) не шле заголовків List-Unsubscribe чи List-Unsubscribe-Post, хоча коментар у email-unsubscribe.ts:22 посилається на RFC8058. GET /api/email/unsubscribe одразу робить INSERT в email_unsubscribes. Живий запит GET з u="", "abc", "someuser."+0×64 дає 200 і нейтральну HTML-сторінку, тож підробити токен не можна. Коментар у ftuxUnsubscribeToken.ts:22-26 про окрему ротацію секретів хибний: обидва HMAC беруть той самий BETTE …[обрізано]
```

**Додаткові докази верифікатора:**

```text
psql: `select campaign_key,count(*) from email_campaigns_log` → ftux_drip_day_0|226; `select count(*) filter (where "emailVerified"), count(*) from "user"` → 0|226. grep 'List-Unsubscribe' apps/server/src → лише коментар у email-unsubscribe.ts:22. Probe: <scratch>/agents/verify-server-static-privacy-logging/v3/probe.mjs (UNSUB → 200 text/html для невалідних токенів).
```

<a id="priv-23"></a>

### `priv-23` [low] Access-лог на кожен запит поєднує userIdHash, сирий User-Agent і оборотний ipHash (sha256 IP без солі)

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: логування
- **Де:** apps/server/src/http/requestLog.ts:28-31, 66-75; apps/server/src/obs/logger.ts:312-330; apps/server/src/http/authMiddleware.ts:112-118; docs/governance/security/pii-handling.md:161
- **Першопричина:** requestLog пише ipHash = sha256(ip).slice(0,16) без солі разом із повним ua, а mixin логера додає userIdHash. emailFingerprint в authMiddleware теж рахується як несолений sha256. Це обходить правило pii-handling.md («UA не комбінувати з userId»).
- **Вплив:** Loki/stdout (14+ днів, доступ ширший, ніж до Sentry) фактично містить журнал «хто, з якої IP і з якого пристрою» для кожного запиту. Весь IPv4 перебирається приблизно за 2 год на одному ядрі, а email перевіряється за словником.
- **Що зробити:** Логувати ua_family через normaliseUserAgent(). Замість sha256(ip) використовувати HMAC із серверним ключем з ротацією (або /24-префікс), так само для emailHash. Зафіксувати це в pii-handling.md.
- **Примітка:** Severity знижено з medium до low: логи внутрішні, доступ до них обмежений операторами.

Знахідок у кластері: 1.

#### [low] Access-лог на кожен запит поєднує userIdHash + сирий User-Agent + оборотний ipHash (sha256 IP без солі)

- **ID:** `server-static/privacy-logging#5` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/server/src/http/requestLog.ts:28-31, 66-75; apps/server/src/obs/logger.ts:312-330 (mixin userIdHash); apps/server/src/http/authMiddleware.ts:112-118 (emailFingerprint без солі); docs/governance/security/pii-handling.md:161
- **Вплив:** Loki/stdout (14+ днів, ширший доступ ніж Sentry) фактично містить журнал «хто, з якої IP і якого пристрою» для кожного запиту — псевдонімізація ілюзорна. emailHash (12 hex sha256 без солі) дозволяє перевірити присутність конкретного email за словником.
- **Рекомендація:** У requestLog логувати ua_family через normaliseUserAgent() і HMAC(ip, секрет з ротацією) або /24-префікс замість sha256(ip); для emailHash/ipHash використовувати HMAC з серверним секретом (LOG_PSEUDONYM_KEY). Зафіксувати в pii-handling.md.

**Докази:**

```text
Живий лог сервера: {"userIdHash":"0bfe536a1fcc08e0","module":"me","msg":"http","path":"/api/me/preferences","ipHash":"12ca17b49af22894","ua":"Mozilla/5.0 (X11; Linux x86_64) ... HeadlessChrome/141.0.0.0 Safari/537.36"} (17 450 таких рядків з userIdHash). ipHash = sha256(ip).slice(0,16) без солі: скрипт iphash.mjs одразу знайшов 127.0.0.1 → 12ca17b49af22894; перебір усього IPv4 ≈152 хв на одному ядрі Node (iphash2.mjs), хвилини на GPU. pii-handling.md:161: user-agent «НЕ комбінувати з userId»; authMiddleware.networkOriginFor свідомо нормалізує UA (M12) і не логує IP для успішних входів — access-лог це обходить.
```

**Відтворення:**

```text
grep -a '"msg":"http"' <server log> | grep userIdHash | grep '"ua"'; node <scratch>/agents/server-static-privacy-logging/iphash.mjs 12ca17b49af22894
```

**Верифікатор:**

```text
Підтверджено в коді й у живому лозі. requestLog.ts:66-75 пише в кожному рядку 'http' ipHash = sha256(req.ip).slice(0,16) без солі, сирий ua і, через mixin у logger.ts:312-330, userIdHash. Свіжий рядок live-логу: userIdHash c16ad09b33c0f9da + ipHash 12ca17b49af22894 + повний UA HeadlessChrome; таких рядків з userIdHash і ipHash 5206. Мій скрипт: sha256('127.0.0.1')→12ca17b49af22894, перебір /16 (65 536 IP) за 123 мс, тобто весь IPv4 приблизно за 2,2 год на одному ядрі, на GPU за хвилини. Твердження коментаря «не для re-identification без сирого IP» хибне. pii-handling.md:161 вимагає UA «НЕ комбінувати з userId», а access-лог саме це й робить через стабільний псевдонім. emailFingerprint (authMiddleware.ts:112-118) також несолений sha256, і членство email у ньому перевіряється за словником. Severity low замість medium: це операторські логи з обмеженим доступом, без зовнішнього вектора, а IP+UA в access-лозі стандартні; проблема в розбіжності з власною політикою і в ілюзорній псевдонімізації.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-privacy-logging/v2/iph.mjs → `127.0.0.1 -> 12ca17b49af22894`, `found 10.20.200.77 in 123 ms for <=65536 candidates`. Live: `{"userIdHash":"c16ad09b33c0f9da","module":"me","msg":"http","path":"/api/me/preferences","ipHash":"12ca17b49af22894","ua":"Mozilla/5.0 (X11; Linux x86_64) ... HeadlessChrome/141.0.0.0 Safari/537.36"}`.
```

<a id="priv-24"></a>

### `priv-24` [low] Повний tool_result (лише маскований, а за згоди й з даними про здоров'я) кладеться в Sentry-breadcrumb без скрабінгу

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: AI-шар / Sentry
- **Де:** apps/server/src/modules/chat/toolResultTruncation.ts:140-158; apps/server/src/sentry.ts:349-369
- **Першопричина:** truncateToolResults додає breadcrumb з category 'chat.tool_result', у якому data.full — оригінал до 8000 символів. applyBeforeBreadcrumb скрабить data лише для category 'http', а ключовий scrubPII поля full не знає.
- **Вплив:** Фінансові деталі і дані про здоров'я (ст. 9) потрапляють у Sentry (США) разом із будь-якою помилкою того ж запиту. Це виходить за задеклароване призначення Sentry («помилки й продуктивність»).
- **Що зробити:** Класти в breadcrumb лише довжину і хеш або скрабити category chat.tool_result в applyBeforeBreadcrumb. Якщо blob потрібен для дебагу, писати його у внутрішнє сховище з коротким TTL.
- **Примітка:** Уже відомо: docs/work/specs/audits/ai-pipeline-2026-08-05.md.

Знахідок у кластері: 1.

#### [low] Повний (лише замаскований) tool_result, разом із даними про здоровʼя за згоди, кладеться в Sentry-breadcrumb без скрабінгу

- **ID:** `server-static/ai-layer#14` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Уже відстежується:** docs/work/specs/audits/ai-pipeline-2026-08-05.md
- **Де:** apps/server/src/modules/chat/toolResultTruncation.ts:140-158; apps/server/src/sentry.ts:349-369
- **Вплив:** Фінансові деталі й дані про здоровʼя (Art. 9) можуть зберігатися в Sentry (США) поза задекларованим призначенням.
- **Рекомендація:** Не класти повний blob у breadcrumb (лише довжину й хеш) або скрабити category chat.tool_result у applyBeforeBreadcrumb; якщо blob потрібен для дебагу, писати його у внутрішнє сховище з коротким TTL.

**Докази:**

```text
truncateToolResults: `addBreadcrumb({ category: "chat.tool_result", ..., data: { ..., full: original } })` для кожного результату > 2000 символів (до 8000). applyBeforeBreadcrumb чистить data лише для category === "http". Breadcrumb їде в Sentry з будь-якою помилкою цього запиту (наприклад, 502 від upstream на синтезі). Політика описує Sentry лише як «Збір помилок і продуктивності», а згода на дані про здоровʼя покриває передачу AI-асистенту.
```

**Відтворення:**

```text
Статично: тур синтезу з великим tool_result (morning_briefing, export_report), після якого upstream падає -> подія Sentry містить breadcrumb з полем full.
```

**Верифікатор:**

```text
Reproduced the scrub path. truncateToolResults adds breadcrumb category 'chat.tool_result' with data.full = the masked original (up to the 8000-char schema cap) for every result over 2000 chars. applyBeforeBreadcrumb scrubs data only for category 'http'. applyBeforeSend runs scrubPII(bc.data), but that is key-based: 'full' is not in the key list, while 'tool_results' is deliberately redacted, which shows the intent to keep tool results out of Sentry. attachSentryErrorHandler (Sentry.setupExpressErrorHandler, @sentry/node 8.55) captures 5xx errors including the 502 ExternalServiceError from a failed synthesis turn (chat.ts:706-711), and the event carries that request's isolation-scope breadcrumbs. Masking (maskMachineText) removes counterparty names, cards and IBANs, but amounts, categories and health details (weight, injuries) stay. The mechanism was already recorded as B2 in ai-pipeline-2026-08-05.md. It was 'fixed' only by moving the mask before truncation and keeping full: original for debugging. The Art. 9 / purpose-limitation residual was not addressed. Needs SENTRY_DSN in prod.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-server-static-ai-layer/breadcrumb-v3.mts: after applyBeforeBreadcrumb + applyBeforeSend, breadcrumb keys [tool_use_id, original_length, summary_length, threshold, full], full len 3720, sample 'Вага 82.4 кг; травма коліна; пульс 140; витрати АТБ 1234 грн'. packages/shared/src/lib/pii.ts:113-114 redacts 'tool_calls_raw','tool_results' keys but not 'full'.
```

<a id="priv-25"></a>

### `priv-25` [low] Persist-снапшот React Query на диску містить AI-пам'ять, профіль з біометрією і дайджест: список чутливих ключів неповний

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: RQ persister
- **Де:** packages/shared/src/lib/sensitiveQueryKeys.ts:50-56; apps/web/src/shared/lib/api/queryClientPersister.ts:206+; apps/web/src/shared/lib/api/queryKeys.ts
- **Першопричина:** SENSITIVE_QUERY_KEY_NAMESPACES охоплює лише auth/me/coach/sync/billing. Тому ai-memory, hub/profile і weekly-digest пишуться в IndexedDB на 7 днів під ключем build-id, а не userId. Докстрінг цього ж списку відносить пам'ять до чутливих даних.
- **Вплив:** Факти про людину і біометрія лежать на диску відкритим текстом. UI-вихід їх чистить, але при XSS чи доступі до профілю браузера вони доступні.
- **Що зробити:** Додати ai-memory, hub/profile, weekly-digest, strategic і proactive-advice до чутливих неймспейсів або перейти на allowlist нечутливих ключів. Ключувати снапшот за userId.

Знахідок у кластері: 1.

#### [low] Persist-снапшот React Query на диску містить AI-памʼять, профіль і дайджест: список «чутливих» ключів неповний

- **ID:** `client-static/web-storage-session#9` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** packages/shared/src/lib/sensitiveQueryKeys.ts:50-56; apps/web/src/shared/lib/api/queryClientPersister.ts:206+; apps/web/src/shared/lib/api/queryKeys.ts (aiMemoryKeys, hubKeys.profile, digestKeys)
- **Вплив:** Чутливі відповіді сервера лежать на диску відкритим текстом. Після UI-виходу їх чистять, але після протухлої сесії й при XSS вони доступні.
- **Рекомендація:** Додати `ai-memory`, `hub`/`profile`, `weekly-digest`, `strategic` і `finyk` proactive-advice до чутливих неймспейсів, або перейти на allowlist нечутливих ключів. Ключувати снапшот за userId.

**Докази:**

```text
Браузер (expire1.mjs), IndexedDB `sergeant-db/rq_cache/web:query_cache_v1` у залогіненого користувача: `rqKeys: ["[\"hub\",\"profile\",\"<userId>\"]", "[\"ai-memory\",\"list\"]", "[\"weekly-digest\",\"2026-09-21\"]"]`. `SENSITIVE_QUERY_KEY_NAMESPACES` = auth/me/coach/sync/billing, тож `ai-memory` (факти про людину), `hub/profile` (біометрія) і `weekly-digest` пишуться на диск на 7 днів (`PERSIST_MAX_AGE_MS`) з ключем build-id, а не user-id.
```

**Відтворення:**

```text
Залогінитись, відкрити хаб і профіль, потім у DevTools прочитати `indexedDB sergeant-db -> rq_cache -> web:query_cache_v1`.
```

**Верифікатор:**

```text
Підтверджено в браузері. Снапшот web:query_cache_v1 у sergeant-db/rq_cache містить ["hub","profile",<userId>], ["weekly-digest","2026-09-21"] і ["ai-memory","list"]. SENSITIVE_QUERY_KEY_NAMESPACES = auth/me/coach/sync/billing, і власний докстрінг цього списку відносить «custom memory» до чутливого. Виходить непослідовність політики: coach виключено, а ai-memory ні. Severity низька через наявний захист. UI-вихід чистить снапшот (purgeQueryCacheSnapshot). Зміна identity, зокрема протухла сесія, яку помітив застосунок, чистить його через clearPersistedQueryCache + reload (AuthContext.tsx:382-401). Біометрія профілю й так лежить локально в LS hub_biometrics_v1 (local-first). Аргумент про XSS слабкий: XSS однаково читає API з cookie.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v5-multi.mjs: RQ persisted keys = ["[\"hub\",\"profile\",\"fMToor5k...\"]","[\"weekly-digest\",\"2026-09-21\"]","[\"ai-memory\",\"list\"]"], buster = build-id. Фільтр shouldDehydrateQueryForPersist (queryClientPersister.ts) перевіряє лише status/dataUpdateCount/isSensitiveQueryKey.
```

<a id="priv-26"></a>

### `priv-26` [low] Видалені користувачем записи лишаються повністю в sync_op_log і як soft-delete-рядки, а виняток журналу з експорту обґрунтовано хибно

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** L · **Область:** server: sync
- **Де:** apps/server/src/modules/sync/syncV2.ts:445; apps/server/src/modules/sync/serverOpLog.ts:73; apps/server/src/modules/me/dataRights.ts:340-345
- **Першопричина:** syncV2 і serverOpLog лише дописують рядки. Серверної компакції журналу немає (ADR-0065: «not shipped»), а tombstone-рядки не видаляються фізично. EXPORT_EXCLUSIONS пояснює виняток syncLog тим, що «та сама зміна лежить у таблиці модуля», але для видалених і перезаписаних версій це не так.
- **Вплив:** Людина, яка видалила запис (наприклад, нотатку про самопочуття), не може по-справжньому стерти його до видалення акаунта. Історія правок при цьому не потрапляє в експорт.
- **Що зробити:** Ввести компакцію sync_op_log: обнуляти row для застосованих опів, старших за N днів, особливо для сутностей з tombstone. Видаляти tombstone-рядки фізично після вікна синхронізації. Виправити текст EXPORT_EXCLUSIONS.
- **Примітка:** Ретенцію журналу свідомо відкладено (ADR-0065, tech-debt/backend.md:725, docs/work/specs/audits/_runner-report.md). Нове тут лише погляд з боку приватності і хибне обґрунтування винятку.

Знахідок у кластері: 1.

#### [low] Видалені користувачем записи лишаються повністю в sync_op_log і як soft-delete-рядки; виняток з експорту обґрунтовано хибно

- **ID:** `server-static/privacy-logging#11` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Уже відстежується:** docs/work/specs/audits/_runner-report.md
- **Де:** apps/server/src/modules/sync/syncV2.ts:445; apps/server/src/modules/sync/serverOpLog.ts:73; apps/server/src/modules/me/dataRights.ts:340-345
- **Вплив:** Користувач, що видалив запис (наприклад, нотатку про самопочуття), не може реально його стерти до видалення акаунта; при цьому ця історія не видається в експорті.
- **Рекомендація:** Ввести компакцію sync_op_log (видаляти/обнуляти row для застосованих опів старших за N днів, особливо для сутностей із tombstone) і hard-delete tombstone-рядків після вікна синхронізації; виправити текст у EXPORT_EXCLUSIONS.

**Докази:**

```text
psql: для fizruk_workouts id=1b742cff-... у sync_op_log лишився insert {"note": "A private workout", ...} після delete; nutrition_meals meal_f300d5b8 після delete лишається в таблиці з deleted_at (повний вміст). Жодного prune/compact sync_op_log (grep). EXPORT_EXCLUSIONS обґрунтовує виключення syncLog: «та сама зміна лежить у власній таблиці модуля» — для видалених/перезаписаних версій це не так (історія правок routine_entries "v0"→"v1"→"v2" є лише в op-log).
```

**Відтворення:**

```text
psql postgresql://hub:hub@127.0.0.1:5432/hub -c "select op, table_name, row from sync_op_log where row->>'id' in (select row->>'id' from sync_op_log where op='delete')"
```

**Верифікатор:**

```text
Відтворено на живій БД. Для finyk_manual_expenses, id яких згодом отримали op='delete', у sync_op_log лишаються insert-рядки з повним data_json (дата, тип, опис). Операцій delete в журналі 131. syncV2.ts:445 і serverOpLog.ts:73 лише додають рядки. Компакції немає: ADR-0065 прямо каже, що серверна компакція «not shipped» і потребує доказу сумісності курсорів, а tech-debt/backend.md:725 позначає це як «свідомо НЕ реалізовано». Ретеншн журналу відомий і відкладений. Новим тут є кут приватності: зміст видаленого запису (зокрема нотатки здоров'я, якщо healthText-бекфіл не прогнано) не стирається до видалення акаунта. Видалення акаунта його таки прибирає (027_sync_op_log.sql:28 `REFERENCES "user"(id) ON DELETE CASCADE`), що узгоджується з формулюванням знахідки. Обґрунтування в EXPORT_EXCLUSIONS (dataRights.ts:340-345, «та сама зміна лежить у власній таблиці модуля») неточне для видалених і перезаписаних версій. Soft-delete tombstone-и в модульних таблицях задумані для LWW-синку (ADR-0011), тож ця частина рекомендації є дизайн-зміною, а не багом. Severity low коректна.
```

**Додаткові докази верифікатора:**

```text
psql: `select table_name, op, row from sync_op_log where row->>'id' in (select row->>'id' from sync_op_log where op='delete')` → finyk_manual_expenses insert {"id":"1790890344878",...,"data_json":{..."kind":"expense"...}} лишається поруч зі своїм delete; count(op='delete')=131. ADR: docs/governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md («server-side log compaction are not shipped»). Ретеншн-частину вже трекає docs/work/specs/audits/_runner-report.md:85 і docs/work/specs/tech-debt/backend.md:49-51,725. Розбіжність тексту EXPORT_EXCLUSIONS ніде не зафіксована.
```

<a id="priv-27"></a>

### `priv-27` [low] Лендінг шле в PostHog незадекларовані $$heatmap і $web_vitals і вантажить три віддалені скрипти: збором керує remote config спільного проєкту

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** landing: аналітика
- **Де:** apps/landing/src/lib/analytics.ts:1-12, 48-70; apps/landing/src/pages/PrivacyPage.tsx:44-50
- **Першопричина:** posthog.init лендінга не задає enable_heatmaps, capture_performance, capture_dead_clicks і disable_surveys. Тому поведінку визначає config.js проєкту PostHog, спільного з apps/web: там увімкнено heatmaps з captureMode 'all' і web_vitals.
- **Вплив:** Політика приватності лендінга і внутрішній контракт («рівно чотири події») не відповідають дійсності: збираються координати кліків, рухи миші і web-vitals. Будь-який тумблер у налаштуваннях проєкту розширить збір без змін коду.
- **Що зробити:** У posthog.init лендінга явно вимкнути heatmaps, capture_performance, dead clicks, surveys і exceptions, бажано також увімкнути disable_external_dependency_loading. Якщо heatmaps потрібні, задекларувати їх у PrivacyPage і в коментарі analytics.ts.
- **Примітка:** Відтворено на проді sergeant.com.ua з локальним перехопленням подій, без відправки в PostHog.

Знахідок у кластері: 1.

#### [low] Лендінг шле в PostHog незадекларовані $$heatmap і $web_vitals та вантажить 3 віддалені скрипти: збором керує remote config спільного проєкту

- **ID:** `client-static/landing-shell-mobile#2` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Серйозність від шукача:** medium
- **Де:** apps/landing/src/lib/analytics.ts:48-70 (posthog.init без enable_heatmaps/capture_performance/capture_dead_clicks/disable_surveys/disable_external_dependency_loading); apps/landing/src/pages/PrivacyPage.tsx:44-50; коментар analytics.ts:1-12 («рівно чотири події»)
- **Вплив:** Публічна політика приватності і внутрішній контракт («лендінг шле рівно чотири події») не відповідають дійсності: фактично збираються координати кліків і рухів миші та web-vitals. Що ще збирає лендінг, вирішує тумблер у налаштуваннях PostHog-проєкту, спільного з apps/web: увімкнення там exception autocapture, dead clicks чи surveys без змін коду і без оновлення політики почне збір і на лендінгу. Це проблема прозорості за GDPR.
- **Рекомендація:** У posthog.init лендінга явно вимкнути: enable_heatmaps: false, capture_performance: false, capture_dead_clicks: false, disable_surveys: true, capture_exceptions: false. Ще краще додати disable_external_dependency_loading: true / advanced_disable_flags. Якщо heatmaps на лендінгу потрібні (у apps/web/src/core/observability/posthog.ts:276-288 це заявлено як намір), задекларувати їх у PrivacyPage і в коментарі analytics.ts.

**Докази:**

```text
Прод https://sergeant.com.ua/ (браузер зі звичайним UA, події перехоплено локально і в PostHog не відправлено):
GET eu-assets.i.posthog.com/array/phc_A8ds…/config.js -> config: {"capturePerformance":{"network_timing":true,"web_vitals":true},"heatmaps":{"captureMode":"all"},"sessionRecording":{…consoleLogRecordingEnabled:true}}
Додатково завантажено: static/surveys.js, static/dead-clicks-autocapture.js, static/web-vitals.js
Відправлені події: landing_viewed; `$$heatmap` {"$heatmap_data":{"https://sergeant.com.ua/":[{"x":200,"y":300,"type":"click"},{"type":"mousemove"}]}}; `$web_vitals` (FCP/LCP з $current_url, $session_id).
Політика приватності: «Аналітика … отримує кілька анонімних подій: перегляд сторінки, перехід у Telegram, перемикання демо-віджета … і відкриття питання у FAQ».
```

**Відтворення:**

```text
node <scratch>/agents/client-static-landing-shell-mobile/landing-ph.mjs (route-перехоплення: POST на *.i.posthog.com/e і /i/v0/e декодуються і НЕ форвардяться)
```

**Верифікатор:**

```text
Відтворив на проді, перехоплюючи події локально без форварду в PostHog. config.js проєкту віддає heatmaps.captureMode="all" і capturePerformance.web_vitals=true. SDK вантажить surveys.js, dead-clicks-autocapture.js і web-vitals.js. Відправляються `$$heatmap` (click і mousemove у (200,300), потім `deadclick` після скролу) та `$web_vitals` (FCP). posthog.init у apps/landing/src/lib/analytics.ts:48-68 не задає enable_heatmaps / capture_performance / capture_dead_clicks / disable_surveys, тому значення приходять із remote config. Через це не справджуються ні коментар «рівно чотири події … жодного autocapture», ні перелік подій у PrivacyPage.tsx:44-50. Severity знизив з medium до low. Дані анонімні: persistence: "memory", person_profiles: "never", disable_session_recording: true задано явно. До того ж apps/web/src/core/observability/posthog.ts:276-288 прямо називає heatmap «на Hub і лендінгу» наміром команди. Тож вада в розбіжності між політикою і коментарем та в залежності від тумблера в remote config, а не в зборі PII.
```

**Додаткові докази верифікатора:**

```text
Мій прогін (ph2.mjs) зловив дві `$$heatmap` події: {x:200,y:300,type:click|mousemove} і {x:200,y:1800,type:deadclick}. Значення з config: autocaptureExceptions:false, captureDeadClicks:false, surveys:false. Dead clicks при цьому все одно потрапляють у heatmap-дані, бо captureMode=all. Перевіряв, чи це вже зафіксовано: в audits/** і open-work.md про heatmap чи web_vitals лендінга нічого немає.
```

<a id="priv-28"></a>

### `priv-28` [low] Політика лендінга стверджує, що код у deep link зникає і візит неможливо пов'язати з людиною, хоча ref зберігається поруч із Telegram-ідентичністю

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** landing + server: Telegram waitlist
- **Де:** apps/landing/src/pages/PrivacyPage.tsx:45-58; apps/server/src/modules/telegram/waitlistBot.ts:305-318; apps/server/src/routes/telegram-webhook.ts:299-318; apps/landing/src/components/TelegramCta.tsx:56-63
- **Першопричина:** Бот безстроково записує start_payload = &lt;placement&gt;_&lt;ref&gt; у telegram_waitlist разом із chat_id, username і first_name, а той самий ref іде в PostHog-подіях лендінга. Зшивання «лендінг ↔ Telegram» закладене дизайном атрибуції, а текст політики писали під анонімну модель.
- **Вплив:** Публічний юридичний текст неточний: join по ref пов'язує поведінку на сайті з Telegram-профілем людини з вейтлісту. Тобто дані псевдонімізовані, а не анонімні.
- **Що зробити:** Переписати абзаци «Що збирає цей сайт» і «Черга в бету»: код зберігається в базі бота разом із Telegram-профілем і використовується для атрибуції. Інший варіант — хешувати або видаляти ref зі start_payload після агрегації.

Знахідок у кластері: 1.

#### [low] Політика приватності стверджує, що код у deep link зникає і візит неможливо повʼязати з людиною, хоча ref зберігається разом із Telegram-ідентичністю

- **ID:** `client-static/landing-shell-mobile#3` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** apps/landing/src/pages/PrivacyPage.tsx:45-58; apps/server/src/modules/telegram/waitlistBot.ts:305-318 (INSERT start_payload поруч із chat_id/telegram_username/first_name); apps/server/src/routes/telegram-webhook.ts:299-318; apps/landing/src/components/TelegramCta.tsx:56-63
- **Вплив:** Публічний юридичний текст неточний: join по ref повʼязує поведінку на сайті (referrer, сторінки, heatmap-кліки) з Telegram username/імʼям людини з вейтлісту. Ризик для прозорості й довіри; за суттю обробки це псевдонімізовані, а не анонімні дані.
- **Рекомендація:** Переписати абзаци «Що збирає цей сайт» і «Черга в бету»: код зберігається в базі бота разом із Telegram-профілем і використовується для атрибуції каналу. Або перестати зберігати ref у start_payload після агрегації чи хешувати його, якщо обіцянку треба лишити.

**Докази:**

```text
PrivacyPage: «у посиланні на бота лише місце кнопки і випадковий код, що зникає із закриттям вкладки»; «Кожне відвідування – новий анонім; повʼязати їх між собою чи з тобою особисто неможливо».
Фактично: `INSERT INTO telegram_waitlist (chat_id, telegram_username, first_name, language_code, start_payload)` з payload `hero_<ref>` назавжди (psql: telegram_waitlist має start_payload + індекс telegram_waitlist_payload_idx). Клієнт шле `landing_telegram_clicked {ref, path}` у тій самій memory-сесії, що й `landing_viewed {referrer}`, а бот шле `LANDING_TELEGRAM_STARTED` з `distinctId: attribution.ref`. Зшивання «лендінг ↔ Telegram-акаунт» закладене дизайном (коментар landingAttribution.ts).
```

**Відтворення:**

```text
Прочитати вказані рядки; psql … -c '\d telegram_waitlist'.
```

**Верифікатор:**

```text
Перевірив у коді та схемі БД. recordStart (waitlistBot.ts:305-318) пише start_payload = `<placement>_<ref>` у telegram_waitlist поруч із chat_id, telegram_username, first_name і language_code. ON CONFLICT зберігає перший payload безстроково, а \d telegram_waitlist показує окремий індекс telegram_waitlist_payload_idx. Подія landing_telegram_clicked {ref} іде в тій самій memory-сесії PostHog, що й landing_viewed та heatmap. Вебхук шле LANDING_TELEGRAM_STARTED з distinctId=ref (telegram-webhook.ts:313). Отже, оператор може зʼєднати поведінку на сайті з Telegram-профілем по ref. Політика натомість пише, що код «зникає із закриттям вкладки» і що повʼязати візит «з тобою особисто неможливо». Ще одна неточність у тому самому абзаці: «бот бачить тільки те, що ти сам йому напишеш», хоча username, first_name і language_code Telegram передає автоматично і бот їх зберігає. Знахідка L31 у landing copy audit стосувалась лише жаргону («deep link»), а не фактичної точності, тож це питання не відстежується.
```

**Додаткові докази верифікатора:**

```text
psql \d telegram_waitlist: колонки start_payload, telegram_username, first_name, language_code, індекс telegram_waitlist_payload_idx. landingAttribution.ts сам описує зшивання двох половин воронки «звичайним join-ом по ref».
```

<a id="priv-29"></a>

### `priv-29` [low] Енумерація користувачів через реєстрацію: наявний email повертає 422 USER_ALREADY_EXISTS

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** server: auth
- **Та сама першопричина, що й** [`sec-46`](./security.md#sec-46): Той самий дефект: реєстрація повертає 422 USER_ALREADY_EXISTS і розкриває наявність акаунта.
- **Де:** apps/server/src/auth.ts:368; apps/server/src/env/env.ts:85-88; apps/server/src/http/authMiddleware.ts:61-64; node_modules/better-auth/dist/api/routes/sign-up.mjs:161-207
- **Першопричина:** Better Auth дає генеричну відповідь на дубль email лише при requireEmailVerification або autoSignIn === false. У проєкті REQUIRE_EMAIL_VERIFICATION за замовчуванням false, autoSignIn не задано, а sign-up не входить у per-account лімітер (лише 5/хв на IP).
- **Вплив:** Можна перевірити, чи має конкретна людина акаунт у фінансово-медичному застосунку, і зібрати цільовий список для credential stuffing. При цьому forget-password і sign-in навмисно не дають енумерувати.
- **Що зробити:** Свідомо вирішити trade-off. Варіант 1: autoSignIn: false або requireEmailVerification, генерична відповідь і лист «у тебе вже є акаунт» через onExistingUserSignUp. Варіант 2: зафіксувати прийнятий ризик в ADR.
- **Примітка:** Специфікація auth-design 2026-09-17 (§Enumeration) розглядає reset і sign-in, але не sign-up. Прийнятий ризик ніде не зафіксовано. Потрібне рішення власника щодо UX реєстрації.

Знахідок у кластері: 1.

#### [low] Енумерація користувачів через sign-up: існуючий email → 422 USER_ALREADY_EXISTS

- **ID:** `server-static/auth-session#13` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `privacy`
- **Де:** node_modules/better-auth/dist/api/routes/sign-up.mjs (shouldReturnGenericDuplicateResponse = requireEmailVerification || autoSignIn===false); apps/server/src/auth.ts:368 (requireEmailVerification=false за замовчуванням)
- **Вплив:** Перевірка, чи має конкретна людина акаунт у фінансово-медичному застосунку (приватність), і цільовий список для credential stuffing; forget-password і sign-in навмисно не енумерують, а sign-up — так.
- **Рекомендація:** Свідомо вирішити trade-off: або `emailAndPassword.autoSignIn: false`/requireEmailVerification (генерична відповідь + лист «у вас уже є акаунт» через onExistingUserSignUp), або зафіксувати прийнятий ризик в ADR.

**Докази:**

```text
probe4: POST /api/auth/sign-up/email {email:"audit_a@example.com", ...} → 422 {"message":"User already exists. Use another email.","code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}; для нової адреси — 200 і сесія. Sign-up не входить у per-account лімітер (authMiddleware.ts:61-64), лише 5/хв на IP.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-auth-session/probe4.mjs (останній крок).
```

**Верифікатор:**

```text
Відтворено. POST /api/auth/sign-up/email з існуючим email, і в іншому регістрі теж, повертає 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL. Генеричну відповідь sign-up.mjs:161-207 дає лише при requireEmailVerification або autoSignIn===false. REQUIRE_EMAIL_VERIFICATION за замовчуванням false (env.ts:85-88), autoSignIn не задано. Прийнятого ризику ніде не зафіксовано: специфікація auth-design 2026-09-17 (§Enumeration, рядки 245-248) вважає енумерацію проблемою для reset і sign-in, а sign-up не згадує. Веб свідомо показує «Користувач з таким email вже існує.» (mapApiErrorToUserCopy.ts:65-66), тобто це UX-вибір без оцінки ризику. Гейт закритої реєстрації цього не приховує: перевірка існування (sign-up.mjs:165-207) іде раніше за user.create.before (auth.ts:446-455), тож існуюча адреса дає 422, а нова 403 REGISTRATION_CLOSED. Ліміт тільки 5 на 60 с на IP, per-email бакета на sign-up навмисно немає (authMiddleware.ts:61-64). Це типовий компроміс, тому low (на межі з info).
```

**Додаткові докази верифікатора:**

```text
v1.log: #13.1 sign-up audit_a@example.com → 422 {"message":"User already exists. Use another email.","code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}; #13.2 AUDIT_A@Example.com → той самий 422. Нових користувачів не створено.
```

<a id="priv-30"></a>

### `priv-30` [low] Анонімні /healthz і /health/workers без rate-limit і кешу розкривають внутрішній стан і кількість акаунтів у вікні видалення та щоразу виконують агрегатні SQL

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: health / observability
- **Та сама першопричина, що й** [`sec-40`](./security.md#sec-40): Той самий дефект: анонімні /healthz, /health/workers і /api/status без rate-limit роблять SQL на кожен виклик і розкривають операційні дані.
- **Де:** apps/server/src/routes/health.ts:55-56; apps/server/src/http/health.ts:106-191, 195-256; apps/server/src/routes/status.ts:15; apps/server/src/modules/mono/enrichmentWorker.ts:434-438
- **Першопричина:** Роути навмисно анонімні і без rate-limit, щоб не голодували проби платформи. Але сам код визнає, що /healthz «не probe», а /health/workers платформа не використовує. Відповідь містить стан пулу БД, applied/shipped міграцій, redis і circuit breaker, глибини черг і accountDeletion.pending.
- **Вплив:** Будь-хто бачить бізнес-сигнали (скільки акаунтів на видаленні, обсяг Mono-збагачень), момент деплою і стан залежностей. Кожен запит робить 4 агрегати, зокрема GROUP BY по таблиці, що росте без ретенції, тож ендпоінт придатний як дешевий DoS-підсилювач для БД.
- **Що зробити:** Закрити /health/workers і /healthz METRICS_TOKEN або requireInternalIp, для проб лишити /readyz з простим ok. Кешувати результат на 15-30 с і додати per-IP rate-limit. Додати ретенцію done-рядків у mono_ai_enrichment_queue.
- **Примітка:** Справжній шлях — /health/workers, а /api/health/workers дає 404. L7-хардинг свідомо лишив роути анонімними, прибравши version/commit, але блок accountDeletion у задокументований контракт не входить.

Знахідок у кластері: 2.

#### [low] Анонімні observability-ендпоінти без rate-limit і кешу розкривають внутрішній стан і щоразу виконують агрегатні SQL

- **ID:** `server-static-redo/route-authz#6` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · повтор route-authz · **Категорія:** `privacy`
- **Де:** apps/server/src/routes/health.ts:55-56; apps/server/src/http/health.ts:106-191 (/healthz), 222-256 (/health/workers); apps/server/src/routes/status.ts:15 + http/status.ts (/api/status, 3 запити); modules/mono/enrichmentWorker.ts:434-438 (GROUP BY по mono_ai_enrichment_queue без ретенції done-рядків), modules/me/deletionPoller.ts:~250-262, modules/gdpr/cleanupPoller.ts:~236-243
- **Вплив:** Будь-хто бачить бізнес-сигнали (скільки акаунтів стоїть на видаленні, обсяг Mono-збагачень), момент деплою і стан залежностей, що полегшує розвідку і таймінг атак. Кожен запит до /health/workers робить 4 агрегати, зокрема повний GROUP BY по таблиці, що росте без обмежень, тому ендпоінт придатний як дешевий DoS-підсилювач на БД.
- **Рекомендація:** /health/workers і /healthz закрити METRICS_TOKEN або requireInternalIp. Для платформних проб лишити /readyz з plain ok. Кешувати результат на 15-30 с. Додати per-IP rate-limit. Для /api/status кешувати відповідь. Додати ретенцію done-рядків у mono_ai_enrichment_queue.

**Докази:**

```text
Живі відповіді без автентифікації (probe4.out): /healthz → schema applied:153/shipped:153 (відбиток версії деплою), DB pool totalCount/idleCount/waitingCount, routedThrough, стан redis, стан і час відмов circuit breaker anthropic. /health/workers → accountDeletion.pending {waiting:4, overdue:0}, черги mono/gdpr/ai-memory з лічильниками та enabled-прапорами. /metrics у проді закритий токеном (env.ts:789, boot падає без нього), це гаразд.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-redo-route-authz/probe4.mjs
```

**Верифікатор:**

```text
/healthz і /health/workers анонімні й без rate-limit (routes/health.ts:55-56). Код прямо каже «Роут анонімний і без rate-limit» (http/health.ts:122, 209), обґрунтовуючи це тим, щоб «probe платформи не голодували». Проте той самий файл визнає, що /healthz «не probe», а /health/workers «платформа-probe не використовує», тож обґрунтування на ці два роути не поширюється. Відповіді містять стан DB pool, applied/shipped міграцій, стан redis і circuit breaker, а також лічильник акаунтів у вікні видалення (accountDeletion.pending.waiting) і глибини черг. getMonoEnrichmentWorkerStatus робить SELECT status, COUNT(*) … GROUP BY status по mono_ai_enrichment_queue. DELETE done-рядків у коді немає, а частковий індекс покриває лише pending/failed, тож запит сканує всю таблицю, що росте. /api/status — свідомо публічна сторінка статусу (StatusPage.tsx), тут нормально. /metrics у проді закритий токеном. Low.
```

**Додаткові докази верифікатора:**

```text
v6.mjs: /healthz і /health/workers → 200 без RateLimit-заголовків, тіло з accountDeletion.pending, totalCount/idleCount/waitingCount, schema applied/shipped. 60 паралельних /health/workers → усі 200 за 241 мс (локальна таблиця порожня). psql: індекси mono_ai_enrichment_queue = pkey, unique(user_id,mono_tx_id), ready_idx WHERE status IN (pending,failed). grep 'DELETE FROM mono_ai_enrichment_queue' в apps/server/src (без тестів) нічого не знаходить. threat-model.md:81 для health-проб декларує «≤ 32-byte payloads», а /healthz йому не відповідає.
```

#### [info] GET /api/health/workers анонімно розкриває внутрішні черги воркерів і лічильник акаунтів у процесі видалення

- **ID:** `api-live/unauth-sweep#5` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `privacy`
- **Де:** apps/server/src/http/health.ts:222-256 (createWorkersHealthHandler); роут apps/server/src/routes/health.ts:56 (без guard)
- **Вплив:** Низький: розкриває операційні внутрішні дані (глибини черг, інтервали, кількість акаунтів у процесі видалення) неавтентифікованим користувачам. L7-хардинг свідомо лишив роут анонімним і прибрав лише version/commit/sha, тож це радше спостереження; лічильник pending-deletion — трохи більше за чистий health.
- **Рекомендація:** Розглянути винесення /api/health/workers за METRICS_TOKEN/internal-allowlist (як /metrics), або прибрати з анонімної відповіді accountDeletion.pending і точні queueDepth, лишивши тільки responsive-прапорець.

**Докази:**

```text
Анонімно: GET /api/health/workers -> 200 {...,"workers":{"aiMemoryIngest":{...},"monoEnrichment":{"queueDepth":{...}},"gdprCleanup":{"queueDepth":{"pending":0,"stuck":0}},"accountDeletion":{"graceDays":30,"pending":{"waiting":2,"overdue":0}}}}. Анонім бачить, що 2 акаунти у вікні видалення, глибини черг, інтервали полерів. Збережено у health-workers.json.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-unauth-sweep/03-metrics.mjs (секція /health/workers) або 01-sweep.mjs рядок '200 GET /health/workers'.
```

**Верифікатор:**

```text
Відтворено, але шлях у знахідці неточний. Роут живе на `/health/workers` (routes/health.ts:56). `/api/health/workers` і `/api/v1/health/workers` повертають 404.

Анонімний GET /health/workers повертає 200 з глибинами черг, інтервалами полерів і `accountDeletion: {graceDays: 30, pending: {waiting: 4, overdue: 0}}`. Анонімність роуту задумана (health.ts:195-214): L7-хардинг прибрав version/commit/sha і текст помилок, лишивши лише errorCode.

Однак блок accountDeletion не входить у задокументований там контракт. Коментар описує лише `{aiMemoryIngest, monoEnrichment, gdprCleanup}`. Тобто агрегат «скільки акаунтів зараз видаляються» додали без тієї ж оцінки. Персональних даних там немає, це лише агрегована бізнес-метрика (відтік).

Додатково: роут без rate-limit і на кожен виклик робить кілька SQL/Redis-запитів. Анонім може ганяти його без обмежень, але навантаження невелике.

На проді бекенд-домен Coolify відкритий напряму, а Vercel проксіює лише /api/*, тож роут досяжний. Серйозність info.
```

**Додаткові докази верифікатора:**

```text
Перевірка: <scratch>/agents/verify-api-live-unauth-sweep/01-verify.mjs, відповідь: `{"status":"healthy",...,"accountDeletion":{"enabled":true,"intervalMs":3600000,"graceDays":30,"lastRunAt":null,"pending":{"waiting":4,"overdue":0}}}`.
user-story-ledger.csv API-HEALTH-004 описує роут як операторську діагностику.
Поле pending обчислює modules/me/deletionPoller.ts:249-272.
```

<a id="priv-31"></a>

### `priv-31` [low] Expo-застосунок не вимикає android:allowBackup, а SQLite з фінансовими і health-даними не зашифрована

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** mobile: Expo
- **Де:** apps/mobile/app.config.ts (блок android); apps/mobile/src/core/db/sqlite.ts:111
- **Першопричина:** У блоці android в app.config.ts немає allowBackup: false, а @expo/config-plugins за замовчуванням ставить true. expo-secure-store виключає з бекапу лише власне сховище. ExpoSQLite.openDatabaseAsync відкриває БД без SQLCipher, хоча MMKV шифрується ключем із SecureStore.
- **Вплив:** Відкрита БД з транзакціями і даними про здоров'я потрапляє в Android Auto Backup і device-transfer. Після відновлення на іншому пристрої ключ MMKV з Keystore не переноситься, і стан стає неконсистентним.
- **Що зробити:** Додати android.allowBackup: false (або dataExtractionRules, що виключають БД) в app.config.ts. Розглянути шифрування SQLite: SQLCipher з ключем у SecureStore.
- **Примітка:** Мобільний контур на паузі (ADR-0094), тож це hardening перед релізом. Шифрування SQLite вже відстежується: security-comprehensive-2026-08-04, SECURITY-20260804-SQLITE, open. allowBackup ніде не відстежується; окремо це зміна обсягом S.

Знахідок у кластері: 1.

#### [low] Expo-застосунок не вимикає android:allowBackup, а SQLite з фінансовими й health-даними не зашифрована

- **ID:** `client-static/landing-shell-mobile#11` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Уже відстежується:** docs/work/specs/audits/security-comprehensive-2026-08-04.md (the SQLite-encryption part; also docs/work/specs/audits/verification/findings.json SECURITY-20260804-SQLITE, status open). The allowBackup part is not tracked.
- **Де:** apps/mobile/app.config.ts (блок android: немає allowBackup:false; Expo за замовчуванням true); apps/mobile/src/core/db/sqlite.ts:111 (ExpoSQLite.openDatabaseAsync без шифрування)
- **Вплив:** Відкрита БД із транзакціями й даними про здоровʼя йде в Android Auto Backup і device-transfer. Після відновлення на іншому пристрої MMKV-ключ із Keystore не переноситься, і стан стає неконсистентним. Мобільний контур на паузі (ADR-0094), тож це hardening перед релізом.
- **Рекомендація:** Додати android.allowBackup: false в app.config.ts (або dataExtractionRules, що виключають БД) і розглянути шифрування SQLite (SQLCipher або ключ у SecureStore).

**Докази:**

```text
android: { adaptiveIcon, package, permissions, intentFilters }, allowBackup не задано. Для порівняння, shell явно: AndroidManifest.xml `android:allowBackup="false"`. MMKV шифрується ключем із SecureStore (storageEncryption.ts), а SQLite (транзакції Фініка, рутини) лишається у відкритому вигляді: grep не знаходить SQLCipher/PRAGMA key.
```

**Відтворення:**

```text
Прочитати apps/mobile/app.config.ts (android) і apps/mobile/src/core/db/sqlite.ts.
```

**Верифікатор:**

```text
Verified in code and config. The `android:` block in apps/mobile/app.config.ts has no `allowBackup`, and no local plugin sets it (withAndroidShortcuts does not touch it; grep is clean). @expo/config-plugins 9.0.17 AllowBackup.js:28 does `return config.android?.allowBackup ?? true`, so the generated manifest gets `android:allowBackup="true"`. The expo-secure-store 14.0.1 plugin (configureAndroidBackup defaults to true) adds backup and data-extraction rules that exclude only SecureStore's own storage. The MMKV encryption key (kept in SecureStore) is therefore excluded, while the SQLite file and the MMKV files are backed up. That supports the restore-inconsistency claim. src/core/db/sqlite.ts:111 opens with plain `ExpoSQLite.openDatabaseAsync(DATABASE_NAME)`, with no SQLCipher or PRAGMA key. Dual-write boots for finyk, fizruk, nutrition and routine write into it. The schema includes finyk_mono_transactions, fizruk_injuries, fizruk_measurements and similar sensitive tables. This contradicts threat-model.md:155 ('no PII stored client-side'). The mobile app is paused (ADR-0094, not sunset), so this is pre-release hardening, and low severity is fair. The unencrypted-SQLite half is already …[обрізано]
```

**Додаткові докази верифікатора:**

```text
node_modules/@expo/config-plugins/build/android/AllowBackup.js:28 has `config.android?.allowBackup ?? true`. node_modules/expo-secure-store/plugin/build/withSecureStore.js:8,16-28 has `configureAndroidBackup = true` and sets fullBackupContent/dataExtractionRules to the SecureStore-only rules. Tables are in packages/db-schema/src/sqlite/{finyk,fizruk,nutrition}.ts. By contrast, apps/mobile-shell/android/app/src/main/AndroidManifest.xml sets allowBackup=false.
```

<a id="priv-32"></a>

### `priv-32` [low] Легасі-міграція Mono-токена запускається для анонімів і при збої лишає токен у сховищі відкритим текстом

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік
- **Де:** apps/web/src/modules/finyk/FinykApp.tsx:104; apps/web/src/modules/finyk/hooks/useMonoTokenMigration.ts:20-34, 58-101
- **Першопричина:** FinykApp викликає useMonoTokenMigration(true) з захардкодженим isLoggedIn. Тому анонім із легасі-ключем finyk_token на кожному маунті шле токен на /api/mono/connect і отримує 401, а гілка catch лише скидає ref і ключа не видаляє.
- **Вплив:** Персональний токен Monobank (повне читання банківських даних) лишається в браузері без захисту і щоразу їде неавтентифікованим запитом. Стосується лише пристроїв, де легасі-ключ лишився від старих збірок.
- **Що зробити:** Передавати реальний status === 'authenticated'. Анонімам токен не слати, а пропонувати увійти; легасі-ключ видаляти після кількох невдач.
- **Примітка:** Верифікатор вважає вплив на приватність перебільшеним: хук ключа не створює, а серверний лог тіло запиту не пише.

Знахідок у кластері: 1.

#### [low] Легасі-міграція Mono-токена запускається для анонімів і при збою лишає токен у сховищі відкритим текстом

- **ID:** `client-static/web-storage-session#13` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** apps/web/src/modules/finyk/FinykApp.tsx:104; apps/web/src/modules/finyk/hooks/useMonoTokenMigration.ts:20-34,58-101
- **Вплив:** Повний доступ на читання банківських даних (Monobank personal token) лежить у браузері без захисту. Зайві запити до API на кожному маунті.
- **Рекомендація:** Передавати реальний `status === "authenticated"`. Для анонімів не слати токен, а показувати пропозицію увійти й/або видаляти легасі-токен після N невдач.

**Докази:**

```text
`useMonoTokenMigration(true)`: прапорець `isLoggedIn` завжди true, тож анонім із легасі-ключем `finyk_token`/`finyk_token_remembered` (LS, kv_store або sessionStorage) на кожному маунті Фініка шле його на `/api/mono/connect` і отримує 401. Гілка `catch` лише скидає ref і токен лишає. Без входу токен Monobank живе на пристрої відкритим текстом безстроково, і `purgeAppOwnedLocalData` його не стирає, бо не виконується без логауту.
```

**Відтворення:**

```text
Статично: покласти `finyk_token` у localStorage анонімного профілю й відкрити /finyk: POST /api/mono/connect -> 401, ключ лишається.
```

**Верифікатор:**

```text
Відтворено. FinykApp.tsx:104 викликає useMonoTokenMigration(true) незалежно від auth. Анонім із legacy-ключем двічі шле токен у тілі POST /api/v1/mono/connect, отримує 401, і ключ лишається в LS. Вплив на приватність у знахідці перебільшено. Legacy-ключ може залишитись лише від старих збірок, і цей хук його не створює. Серверний лог тіло не пише (перевірено). Справжній дефект у захардкодженому `true`: запити з банківським токеном ідуть без автентифікації на кожному маунті Фініка. Крім того, deps ефекту містять toast context value, який змінюється з кожним тостом, і це дає зайві повтори після збою.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v9-mono.mjs: connect calls = 2× '401 POST /api/v1/mono/connect body={"token":"uFAKE_LEGACY_MONO_TOKEN_123"}', 'token still in LS: uFAKE_LEGACY_MONO_TOKEN_123'. server.log фіксує лише path/status, без тіла. useToast.tsx:419-422: value = useMemo(..., [api, toasts]).
```

<a id="priv-33"></a>

### `priv-33` [low] «Приховати суми» не діє на головній: картки темпу і «Тиждень у цифрах» показують суми Фініка

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: хаб / Фінік
- **Де:** apps/web/src/core/hub/now/NowPile.tsx; apps/web/src/core/hub/LocalWeekReport.tsx; apps/web/src/core/hub/ExpensesCard.tsx; showBalance у сховищі Фініка (useFinykStorageSlots)
- **Першопричина:** showBalance живе лише в сховищі Фініка і передається тільки в компоненти модуля. Картки хабу (NowPile, LocalWeekReport, ExpensesCard) його не читають.
- **Вплив:** Режим, увімкнений саме на випадок, коли екран бачать інші, не ховає витрати на головному екрані, куди людина потрапляє першою.
- **Що зробити:** Застосувати showBalance до фінансових карток хабу (NowPile, ExpensesCard, LocalWeekReport) або прямо написати, що режим діє лише в модулі.
- **Примітка:** PR-F3 (аудит 2026-09-13) закрив ту саму ваду для Планування і Аналітики, але хаб не зачепив.

Знахідок у кластері: 1.

#### [low] «Приховати суми» не діє на головній: картки темпу й «Тиждень у цифрах» показують суми Фініка

- **ID:** `browser-surfaces/finyk-flows#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `privacy`
- **Де:** Кнопка-око «Приховати суми» в шапці Фініка; http://127.0.0.1:4173/
- **Вплив:** Режим приватності (коли екран бачать інші) не приховує витрати на головному екрані, куди користувач потрапляє першим.
- **Рекомендація:** Застосувати showBalance до фінансових NowPile-карток, ExpensesCard і LocalWeekReport (маскувати суми) або явно написати, що режим діє лише в модулі.

**Докази:**

```text
r3-29-hide.mjs: після перемикання (aria-label став «Показати суми») на сторінках Фініка суми приховано, але на головній: 'HUB amounts while hidden: [4 100 ₴, 200 ₴, 900 ₴, ...]', «Сьогодні 4 100 ₴, на 1950% вище середнього», «За тиждень витрачено 900 ₴». Скрін shots/finyk-flows/r3-hide-hub.png.
```

**Відтворення:**

```text
У Фініку натиснути око «Приховати суми» і перейти на головну.
```

**Верифікатор:**

```text
showBalance живе лише у сховищі Фініка (useFinykStorageSlots / useStorage) і передається тільки в компоненти модуля. У apps/web/src/core і apps/web/src/shared немає жодного звернення до showBalance, тож картки хабу (NowPile «Закрито сьогодні», LocalWeekReport, ExpensesCard) його не читають. Ні в документах, ні в коді не сказано, що режим діє лише в модулі. PR-F3 (аудит 2026-09-13) закрив ту саму ваду для Планування й Аналітики, а хаб не згадує. Впевненість знахідки «medium» піднімаю: відтворено напряму.
```

**Додаткові докази верифікатора:**

```text
v2-finyk.mjs: після кліку на око aria-label став «Показати суми», на Огляді Фініка видимих сум 0. На головній: «Закрито сьогодні · Витрати записано 588 ₴», «Тиждень у цифрах: За тиждень витрачено 588 ₴…», «Найбільше за тиждень: Інше, 588 ₴». Скрін v2-hub-hidden.png: картка «Витрати записано 588 ₴» видима.
```

## info

<a id="priv-34"></a>

### `priv-34` [info] Waitlist приймає будь-чий email без підтвердження і показує, чи адреса вже в списку

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web + server: waitlist
- **Де:** apps/web/src/core/pricing/WaitlistForm.tsx:117-147; apps/server/src/routes/waitlist.ts:29-49; apps/server/src/modules/waitlist/waitlistService.ts:45-58
- **Першопричина:** POST /api/v1/waitlist робить INSERT ... ON CONFLICT DO NOTHING без double opt-in і повертає created: true/false, а форма для цих випадків показує різні тексти.
- **Вплив:** Сторонні можуть підписати чужі адреси на маркетингові листи без підтвердження (проблема згоди) і перевірити, чи конкретна людина є в списку очікування.
- **Що зробити:** Додати double opt-in, тобто лист із підтвердженням. За бажання прибрати оракул членства однаковою відповіддю для нових і наявних адрес.
- **Примітка:** Оракул членства задуманий і задокументований (routes/waitlist.ts:29-49: окрема таблиця, вхід не дає, ліміт 10/IP/год). Реальна вада лише одна: немає double opt-in.

Знахідок у кластері: 1.

#### [info] Waitlist приймає будь-чий email без підтвердження і розкриває, чи адреса вже в списку

- **ID:** `browser-surfaces/public-auth-pages#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `privacy`
- **Серйозність від шукача:** low
- **Де:** apps/web/src/core/pricing/WaitlistForm.tsx:117-147; POST /api/v1/waitlist
- **Вплив:** Сторонні люди можуть підписувати чужі адреси на маркетингові листи (без double opt-in, проблема згоди за GDPR/ЗУ про ПД) і перевіряти, чи конкретна людина в списку очікування.
- **Рекомендація:** Додати double opt-in (лист із підтвердженням), а UI-відповідь зробити однаковою для нових і наявних адрес.

**Докази:**

```text
20-waitlist.mjs (анонім): `200 POST /api/v1/waitlist {"email":"pa_waitlist_…"} => {"ok":true,"created":true}` → «Email збережено…». Повтор того самого: `{"ok":true,"created":false}` → «Цей email уже в списку.» Чужу адресу audit_a@example.com записано без будь-якого підтвердження: `{"created":true}`.
```

**Відтворення:**

```text
Анонімно на /pricing введи будь-яку чужу адресу в «Підписатись на waitlist» двічі.
```

**Верифікатор:**

```text
Знахідка підтверджується лише частково. (1) Оракул членства зроблено свідомо, і це задокументовано: routes/waitlist.ts:29-49 прямо пояснює, що `created` є оракулом членства саме у ВЕЙТЛИСТІ, і чому це прийнятно. Таблиця окрема від акаунтів, вхід вона не дає, ліміт 10/IP/год. Ця половина intended-and-safe. (2) Відсутність підтвердження реальна: INSERT ... ON CONFLICT DO NOTHING без жодної верифікації (waitlistService.ts:45-58). У БД є рядок `audit_a@example.com` з user_id=NULL, тобто чужу адресу записано анонімно. Проте зараз нічого не надсилає листи по `waitlist_entries`: grep знаходить лише INSERT і count. Шкода гіпотетична, вона настане при майбутньому «одному листі на запуск». Для цієї розсилки варто мати підтверджену згоду. Severity понижено до info.
```

**Додаткові докази верифікатора:**

```text
psql: `select email,user_id is not null from waitlist_entries` → `audit_a@example.com | f` (записано анонімно), `pa_waitlist_… | f`. `grep waitlist_entries apps/server/src scripts` → лише waitlistService.ts (INSERT, COUNT), розсилача немає.
```

<a id="priv-35"></a>

### `priv-35` [info] Кеш навігацій SW зберігає повні URL із секретами в query (токен скидання пароля) без expiration

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: service worker
- **Де:** apps/web/src/sw/cache.ts:130-142; apps/web/src/core/auth/ResetPasswordPage.tsx:60
- **Першопричина:** NavigationRoute — це NetworkFirst без ExpirationPlugin і без зрізання query. Ключ кешу = повний URL + __u, тож кожен унікальний URL отримує власну копію index.html.
- **Вплив:** Невикористаний токен скидання пароля лежить у Cache Storage до оновлення SW, а кеш навігацій росте з кожним новим URL. Реальний ризик малий: ResetPasswordPage не прибирає токен з адреси, тож той самий URL і так лишається в історії браузера.
- **Що зробити:** Для навігацій віддавати precache-шел через createHandlerBoundToURL('index.html'). Мінімум — зрізати query в cacheKeyWillBeUsed і додати ExpirationPlugin. Додати denylist для /reset-password і /verify-email і прибирати токен з адреси після читання.

Знахідок у кластері: 1.

#### [info] Кеш навігацій зберігає повні URL із секретами в query (токен скидання пароля) без expiration

- **ID:** `client-static/service-worker-pwa#11` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Серйозність від шукача:** low
- **Де:** apps/web/src/sw/cache.ts:130-142
- **Вплив:** Невикористаний токен скидання пароля (і будь-які інші токени в URL) лежить у Cache Storage до наступного оновлення SW, а для незалогіненого користувача logout-очистка не спрацьовує; кеш навігацій росте з кожним унікальним URL (~15 КБ копія index.html на запис).
- **Рекомендація:** Для навігацій віддавати precache-шел через createHandlerBoundToURL('index.html') (SPA не потребує per-URL копій), або хоча б cacheKeyWillBeUsed, що зрізає query, і ExpirationPlugin({maxEntries: 10}); denylist для /reset-password і /verify-email.

**Докази:**

```text
NavigationRoute → NetworkFirst({cacheName: navigations-v*, plugins: [CacheableResponsePlugin, userPartitionPlugin]}) — без ExpirationPlugin; ключ = повний URL + __u. exp5.log: navigations-v1790885250982: [".../welcome?__u=anon", ".../reset-password?token=AUDIT_SECRET_RESET_TOKEN_123&__u=anon", ".../?module=finyk&action=add_expense&__u=anon"]. ResetPasswordPage читає token із searchParams (ResetPasswordPage.tsx:60).
```

**Відтворення:**

```text
PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node <scratch>/agents/client-static-service-worker-pwa/exp5-nav.mjs → exp5.log.
```

**Верифікатор:**

```text
Reproduced. The NavigationRoute in cache.ts:130-142 is NetworkFirst with no ExpirationPlugin and no query stripping. The cache key is the full URL plus __u=<partition>, so /reset-password?token=... gets stored as its own ~14 KB copy of index.html. The real risk is much smaller than claimed. (1) ResetPasswordPage never strips the token from the URL, so the same URL already sits in browser history and the address bar. Any party with local profile access or same-origin script execution can read history just as easily as Cache Storage, so the cache adds no new exposure. (2) Better Auth reset tokens expire after 1 h by default (resetPasswordTokenExpiresIn || 3600, not overridden in auth.ts) and are single-use. (3) Growth is bounded: the SW activate handler deletes the previous navigations-v<build> cache on every web deploy (listStaleCaches), and client-side SPA navigations never reach the SW. The fix suggestion (createHandlerBoundToURL / ExpirationPlugin) is reasonable hygiene, so I downgraded this to info.
```

**Додаткові докази верифікатора:**

```text
Script <scratch>/agents/verify-client-static-service-worker-pwa/v11-navcache.mjs, log v11.log: navigations-v1790885250982 = ['/welcome?__u=anon', '/reset-password?token=VERIFY_SECRET_TOKEN_ABC&__u=anon', '/welcome?x=0..4&__u=anon'], each 14345 bytes. location.href after load still contains ?token=..., so it is in history. sw.ts:118-129 activate deletes the stale navigations-v* caches.
```

<a id="priv-36"></a>

### `priv-36` [info] Транскрипція віддає клієнту сире тіло помилки Groq (до 500 символів)

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: transcribe
- **Та сама першопричина, що й** [`sec-55`](./security.md#sec-55): Той самий дефект: /api/transcribe віддає клієнту сирий текст помилки Groq до 500 символів.
- **Де:** apps/server/src/lib/groq.ts:143-161; apps/server/src/modules/transcribe/transcribe.ts:181-188
- **Першопричина:** groq.ts кладе до 500 символів тіла відповіді Groq у GroqTranscribeError.message, а transcribe.ts віддає err.message у полі error JSON-відповіді. Для чату це зроблено правильно, через makeAiProviderError.
- **Вплив:** Деталі акаунта Groq (ідентифікатор організації, квоти, причина invalid_api_key) видно в API-відповіді будь-якому користувачу. Поточний UI їх не показує, бо useGroqVoiceInput мапить помилки на фіксовані тексти, тож розкриття можливе лише через мережеву вкладку.
- **Що зробити:** Повертати клієнту стабільне українське повідомлення і код, а detail писати лише в лог, як у makeAiProviderError.
- **Примітка:** Живцем не перевірено, бо немає ключа Groq; поведінку фіксує юніт-тест groq.test.ts:72-80.

Знахідок у кластері: 1.

#### [info] Транскрипція віддає клієнту сире тіло помилки Groq (до 500 символів)

- **ID:** `api-live/ai-billing-integrations-live#9` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `privacy`
- **Серйозність від шукача:** low
- **Де:** apps/server/src/lib/groq.ts:143-161 (`detail = text.slice(0, 500)`; `Groq повернув ${status}: ${detail}`), apps/server/src/modules/transcribe/transcribe.ts:181-188 (`res.status(err.status).json({ error: err.message, ... })`)
- **Вплив:** Повідомлення Groq про ліміти і помилки (ідентифікатор організації, поточні квоти ASPH, посилання на білінг, причина invalid_api_key) показуються кінцевому користувачу дослівно, бо UI виводить `error`. Це розкриває конфігурацію і стан білінгу власника.
- **Рекомендація:** Повертати клієнту стабільне українське повідомлення і код (outcome), а detail писати лише в лог (як makeAiProviderError).

**Докази:**

```text
Live-перевірити неможливо, бо ключа Groq немає (POST /api/transcribe -> 503 GROQ_KEY_MISSING). Юніт-тест lib/groq.test.ts:72-80 фіксує поведінку: відповідь апстріму `new Response("too many", {status:429})` дає GroqTranscribeError з `message: expect.stringContaining("too many")`, а transcribe.ts кладе err.message у поле `error` відповіді. Для чату це зроблено правильно: makeAiProviderError (obs/errors.ts:88-115) ховає повідомлення провайдера в cause.
```

**Відтворення:**

```text
Статично: groq.ts:146-158 + transcribe.ts:185; тест apps/server/src/lib/groq.test.ts "maps rate limits to a typed GroqTranscribeError".
```

**Верифікатор:**

```text
Поведінку сервера підтверджено в коді. groq.ts:143-161 кладе до 500 символів тіла відповіді Groq у GroqTranscribeError.message, а transcribe.ts:185-188 віддає err.message у поле `error` JSON-відповіді. Юніт-тест groq.test.ts:72-80 це фіксує. Але твердження з impact, що «UI виводить `error`», хибне. Єдиний клієнт, useGroqVoiceInput.ts:140-182, через api-client мапить 429 на outcome rate_limited, а 502 на outcome error, і в обох випадках показує фіксований текст: «Забагато голосових запитів…» та «Не вдалося розпізнати запис…». Мобільного споживача немає. Отже, сирий текст Groq (ідентифікатор організації, ASPH-квоти, посилання на білінг) бачить лише автентифікований Pro-юзер у сирій відповіді API, тобто в devtools. Це defense-in-depth витік конфігурації, а не повідомлення, яке показують кінцевому користувачу. Тому понижено до info.
```

**Додаткові докази верифікатора:**

```text
apps/web/src/shared/components/ui/voice/useGroqVoiceInput.ts:171-181: для case "rate_limited" і case "error" тексти фіксовані, result.message не використовується. packages/api-client/src/endpoints/transcribe.ts:118-127: 429 перетворюється на {outcome:"rate_limited"} без message. Наживо не перевірити, бо немає ключа Groq.
```

<a id="priv-37"></a>

### `priv-37` [info] redactPii у резервній копії не прибирає ідентифікатори рахунків Monobank у значеннях (hiddenAccounts), хоча коментар це обіцяє

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: резервні копії
- **Де:** apps/web/src/core/hub/hubBackup.ts:30-73; apps/web/src/modules/finyk/lib/finykBackup.ts:94-96
- **Першопричина:** PII_KEY_RE перевіряє лише імена ключів, а hiddenAccounts — це масив значень з id рахунків. Він експортується без змін, як і hiddenTxIds та excludedStatTxIds.
- **Вплив:** Файл, пересланий у підтримку, усе одно містить ідентифікатори банківських рахунків і транзакцій, всупереч наміру Audit 03 F20.
- **Що зробити:** Псевдонімізувати id рахунків (стабільний хеш) у hiddenAccounts і ключах мап або виправити коментар і копію, щоб вони не обіцяли більше, ніж робить код.

Знахідок у кластері: 1.

#### [info] redactPii не прибирає ідентифікатори рахунків Monobank, що лежать у значеннях (hiddenAccounts), хоча коментар обіцяє їх вирізати

- **ID:** `client-static/gap-backup-restore-file-imports#16` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Де:** apps/web/src/core/hub/hubBackup.ts:30-73; apps/web/src/modules/finyk/lib/finykBackup.ts:94-96
- **Вплив:** Невеликий: файл, пересланий у підтримку, усе одно містить ідентифікатори банківських рахунків, усупереч задокументованому наміру Audit 03 F20.
- **Рекомендація:** Або псевдонімізувати id рахунків (стабільний хеш) в hiddenAccounts і ключах мап, або виправити коментар і копію, щоб не обіцяти більше, ніж робиться.

**Докази:**

```text
The comment says identity fields, including «Monobank account UUIDs», are stripped. PII_KEY_RE only matches KEY names (`^(_?)(user|owner|account|…)_?id$`). hiddenAccounts is an array of account-id VALUES and is exported unchanged, as are hiddenTxIds/excludedStatTxIds (bank transaction ids).
```

**Відтворення:**

```text
Code read; redactPii({hiddenAccounts:['<mono-account-id>']}) returns the input unchanged.
```

**Верифікатор:**

```text
In hubBackup.ts:30-46 the comment says the backup shapes carry "Monobank account UUIDs" and that "we strip the identity fields". The code doesn't do that. PII_KEY_RE (`^(_?)(user|owner|account|customer|client|device|session|auth)_?id$`) only matches key names, and redactPiiValue maps array elements and primitives through unchanged. hiddenAccounts is a string[] of Monobank account ids: toggleHideAccount(openId) in AssetsMonoCards.tsx:186 → useFinykStorageMutations.ts:175. readFinykBackupFromStorage (finykBackup.ts:94-96) exports it as-is, alongside hiddenTxIds and excludedStatTxIds (bank tx ids). monoDebtLinkedTxIds is also keyed by mono credit-account id (AssetsLiabilitiesSection.tsx:95), and those keys survive because they are not named `accountId`. So the comment promises more than the code does. The behaviour itself is arguably needed: stripping hiddenAccounts would lose which accounts are hidden on restore. These are opaque bank-side ids that only Monobank can map to a person. The UI copy («Ідентифікатори акаунта прибираю автоматично») refers to the Sergeant account, not bank accounts (рахунки), so it is not strictly false. The only real mismatch is the code comment versus the …[обрізано]
```

**Додаткові докази верифікатора:**

```text
hubBackup.test.ts:31-84 only covers key-name redaction (userId/accountId/_accountId/ownerId/sessionId/customerId). No test covers account ids held as values in hiddenAccounts or as map keys in monoDebtLinkedTxIds. I could not find the original "Audit 03 F20" document under docs/; it is referenced only from code comments.
```

<a id="priv-38"></a>

### `priv-38` [info] sanitizeUrl не редагує параметри sync (фінансовий payload) і q (текст запиту в чат), тож $pageview міг би їх зафіксувати

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: аналітика
- **Де:** apps/web/src/core/observability/PageviewTracker.tsx:38-49; apps/web/src/core/observability/sanitizeUrl.ts; packages/shared/src/lib/pii.ts:285-310
- **Першопричина:** SENSITIVE_QUERY_KEYS і SENSITIVE_QUERY_PARAM_NAMES — це denylist токенових ключів, контентних параметрів у ньому немає. PageviewTracker шле $current_url на mount, раніше, ніж лінивий FinykApp прибирає ?sync=.
- **Вплив:** Зараз експозиція майже нульова: generateSyncLink не має жодного UI-виклику, а /chat?q= згадується лише в коментарях, живого коду з навігацією туди немає. Ризик латентний і з'явиться, щойно ці посилання повернуться.
- **Що зробити:** Додати sync і q до обох списків редагування або перейти на allowlist безпечних query-ключів для $current_url.
- **Примітка:** Уже згадано в docs/work/specs/audits/product-knowledge-finyk.md. На HEAD перевірено: grep не знаходить навігації на /chat?q= поза коментарями.

Знахідок у кластері: 1.

#### [info] `sanitizeUrl` не редагує `sync` (фінансовий payload) і `q` (текст запиту в чат) — $pageview фіксує їх до очистки URL

- **ID:** `client-static/web-route-guards#11` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `privacy`
- **Серйозність від шукача:** low
- **Уже відстежується:** docs/work/specs/audits/product-knowledge-finyk.md
- **Де:** apps/web/src/core/observability/PageviewTracker.tsx:38-49; apps/web/src/core/observability/sanitizeUrl.ts (SENSITIVE_QUERY_KEYS); packages/shared/src/lib/pii.ts:285-310
- **Вплив:** За наявності згоди на аналітику у PostHog/Sentry-брейдкрамби потрапляють бюджети/активи/борги (sync) і довільний текст звернень до AI (q) — дані, які політика приватності не декларує.
- **Рекомендація:** Додати `sync` і `q` (та інші контентні параметри) до обох списків редагування або перейти на allowlist безпечних query-ключів для `$current_url`.

**Докази:**

```text
PageviewTracker змонтований у Providers (вище маршрутів) і на mount шле `$current_url: sanitizeUrl(window.location.href)`. Список ключів: token, code, state, magic, auth, password, secret, api_key… — без `sync` і `q`. FinykApp чистить `?sync=` лише після лінивого чанка, HubChatPage `?q=` не чистить взагалі (лаунчери навігують на `/chat?q=<повідомлення>`).
```

**Відтворення:**

```text
Статично: sanitizeUrl("https://x/finyk?sync=AAA") повертає URL без змін; порядок монтування Providers → PageviewTracker → lazy FinykApp.
```

**Верифікатор:**

```text
Прогалину в коді підтверджено: ні SENSITIVE_QUERY_KEYS (sanitizeUrl.ts), ні SENSITIVE_QUERY_PARAM_NAMES (pii.ts:285-310), що їх використовує PostHog before_send, не містять `sync` і `q`. PageviewTracker шле `$current_url` на mount за pathname, FinykApp чистить ?sync= лише в ефекті лінивого чанка. Проте реальна експозиція майже нульова. generateSyncLink (useFinykBackupSync.ts:171) не має жодного UI-виклику, тільки в тесті, тож сучасний застосунок ?sync=-лінків не створює. Жоден код не навігує на `/chat?q=<повідомлення>`: опис «лаунчери навігують на /chat?q=» спирається на застарілі коментарі (HubChatPage.tsx:37, useHubChatOverlay.ts:17), лаунчери відкривають оверлей. Крім того, PostHog працює лише з VITE_POSTHOG_KEY і згодою. Лишається шлях через старі закладки або зовнішні посилання, тому info.
```

**Додаткові докази верифікатора:**

```text
grep: `generateSyncLink` використовують лише useStorage.ts:247 (re-export) і тест. Пошук `/chat?q=` у web, server і shared знаходить тільки коментарі. posthog.ts:316 before_send → redactSensitiveQueryParams (той самий список без sync/q).
```
