# Аудит 2026-10-01 · Логіка доменів

> **Status:** Active. Тематичний розділ повного аудиту застосунку: 76 відкритих знахідок. Загальний опис, метод і обмеження — у [README](./README.md).
> **Last validated:** 2026-10-02
> **Next review:** 2026-11-02
> **Spec-lint:** skip. Реєстр знахідок аудиту, не специфікація реалізації.

Знахідки впорядковано за серйозністю, далі за вердиктом. Виправив — зміни рядок «Стан» на `виправлено в #<PR>` або `не відтворюється на <коміт>`, ID не чіпай.

| Серйозність | К-сть |
| ----------- | ----- |
| critical    | 0     |
| high        | 2     |
| medium      | 14    |
| low         | 54    |
| info        | 6     |

## high

### [high] Акаунт у 30-денному вікні видалення неможливо відновити через UI: вхід «успішний», але застосунок лишається на /sign-in і не показує «Відновити акаунт»

- **ID:** `browser-surfaces/hub-shell#3` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/auth/AuthContext.tsx:317-339 (user = meQuery.data?.user; 403 від /api/v1/me = unauthenticated); apps/web/src/core/profile/usePendingDeletion.ts:20-26 (enabled: Boolean(user)); apps/web/src/core/app/RootLayout.tsx:178-187 (PendingDeletionScreen); сервер повертає 403 account_pending_deletion на GET /api/v1/me; URL http://127.0.0.1:4173/sign-in
- **Вплив:** Користувач, який передумав (або акаунт видалив хтось із вкраденою сесією та паролем), не може скасувати видалення: вхід мовчки «не працює», і через 30 днів AccountDeletionPoller безповоротно видаляє всі дані. Обіцяне вікно відновлення фактично недоступне, лишається тільки підтримка. Додатково людина опиняється в анонімному онбордингу і може почати вести дані локально, не розуміючи, що акаунт у черзі на видалення.
- **Що зробити:** В AuthContext розрізняти 403 account_pending_deletion і 401: вважати сесію автентифікованою в стані pending (окремий статус), рендерити PendingDeletionScreen з даних помилки (scheduledPurgeAt вже є в тілі 403) або вмикати usePendingDeletion за наявності сесії, а не user. На /sign-in після 200 і 403 pending переходити на екран відновлення. Додати e2e: delete → sign-in → бачу «Відновити акаунт» → restore → вхід працює.

**Докази:**

```text
v06-pending-signin.out (hubshell-throw1, deletion_requested_at=21:51:53): '200 POST /api/auth/sign-in/email', cookies better-auth.session_token+session_data виставлено, далі '403 GET /api/v1/me {"code":"account_pending_deletion","scheduledPurgeAt":"2026-10-31…"}', 'url: http://127.0.0.1:4173/sign-in' (без жодного повідомлення), після переходу на / → '/welcome' (онбординг анонімного користувача), 'restore buttons: 0'. Повторено на hubshell-throw2 (v08-delete.out): '200 DELETE /api/v1/me {ok:true,scheduledPurgeAt:2026-10-31…}' → повторний вхід 200 → '/sign-in', профіль → '/welcome', 'restore btns: 0'. Діалог видалення обіцяє: «До того дня можна передумати: увійди і натисни «Відновити акаунт»». Скріншоти: <scratch>/shots/hub-shell/v06-pending-after-signin.png, v06-pending-root.png, v08-resignin-after-delete.png
```

**Відтворення:**

```text
1) Профіль → Небезпечна зона → «Видалити акаунт» → пароль → «Видалити». 2) На /sign-in увійти тим самим email/паролем. Відповідь sign-in 200, але сторінка лишається /sign-in без повідомлення; відкриття / веде на /welcome. Екрану PendingDeletionScreen з кнопкою «Відновити акаунт» немає. Скрипти: v06-pending-signin.mjs, v08-delete.mjs
```

**Верифікатор:**

```text
Код виключає показ екрана відновлення. GET /api/me (me.ts:339) стоїть за requireSession() без allowPendingDeletion, тож для позначеного акаунта повертає 403 account_pending_deletion (requireSession.ts:146-157). В AuthContext user = meQuery.data?.user ?? null, тобто при помилці null, а статус 'unauthenticated'. usePendingDeletion має enabled: Boolean(user), тому GET /api/me/deletion-status, який навмисно пропущено повз гейт, ніколи не викликається. PendingDeletionScreen у RootLayout:178 недосяжний. У web-клієнті ніде немає обробки коду account_pending_deletion. Спека user-deletion-grace-window.md, крок перевірки 4 («Увійти знову. Очікування: екран-блокер із датою»), і текст діалогу обіцяють протилежне. Відновити акаунт можна лише через підтримку, інакше через 30 днів дані безповоротно видаляються.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v3-pending-signin.mjs (hubshell-throw1, у БД deletion_requested_at=2026-10-01 21:51:53): '200 POST /api/auth/sign-in/email', cookies session_token+session_data виставлено, '403 GET /api/v1/me {code:account_pending_deletion, scheduledPurgeAt:2026-10-31…}' двічі, ЖОДНОГО запиту на /deletion-status, 'url after sign-in: /sign-in' без повідомлення, 'url after goto /: /welcome', 'restore buttons: 0'. Скріншоти v3-after-signin.png, v3-root.png.
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and couldn't. I traced the code end to end and reproduced it myself.

**Code path (HEAD c7c09607)**
1. `GET /api/me` is mounted with plain `requireSession()` and no `allowPendingDeletion` (apps/server/src/routes/me.ts:339).
2. `buildRequireSession` looks up the deletion status. For a marked account it returns `403 {code: account_pending_deletion}` (apps/server/src/http/requireSession.ts:153-165). Only `/api/me/deletion-status` (me.ts:302-303) and `/api/me/restore` (me.ts:318) skip this gate.
3. On the web side, `AuthProvider` uses `useUser({retry:false})`. It sets `user = signedOut ? null : (meQuery.data?.user ?? null)` and `status = user ? "authenticated" : "unauthenticated"` (apps/web/src/core/auth/AuthContext.tsx:318-360).
4. A 403 is a query error, so `data` is undefined and `user` is null. This is a fresh sign-in, because `DELETE /api/me` revokes all sessions and `DangerZoneSection.tsx:40-49` signs the user out. So there is no earlier successful `me` payload left in the cache.
5. `login()` gets 200 from `signIn.email` and calls `invalidateMe` (AuthContext.tsx:418-433). Nothing in the client looks at code `account_pending_deletion`: grep finds no match in apps/web, packages/api-client or the auth code. The only mention is a comment at RootLayout.tsx:156.
6. `usePendingDeletion` has `enabled: Boolean(user)` (apps/web/src/core/profile/usePendingDeletion.ts:20-26). So `GET /api/me/deletion-status`, the one call that would draw the blocker screen, is never made.
7. `AppShell` therefore never renders `PendingDeletionScreen` (apps/web/src/core/app/RootLayout.tsx:153-187). This loop is closed: `user` stays null exactly because the account is pending deletion.

**My own repro**
Script and output are in <scratch>/agents/skeptic-browser-surfaces-hub-shell-3/s1.mjs. I used user hubshell-throw2; the DB shows `deletion_requested_at` = 2026-10-01 22:53.
- `200 POST /api/auth/sign-in/email`, then `403 GET /api/v1/me {code:account_pending_deletion, scheduledPurgeAt:2026-10-31…}`.
- The page stayed on /sign-in with no message. Screenshot s1-after-signin.png shows the plain sign-in form. There were 0 "Відновити" buttons.
- The app itself never requested `/deletion-status`. The only `/deletion-status` request in the log is the `fetch` my script sent by hand from the same page. It returned `200 {"pending":true,…}`, so the server side works and only the client gate is broken.
- Navigating afterwards: `/` → /welcome (anonymous onboarding), `/?tab=profile` → /welcome, `/profile` → /sign-in, `/finyk` → anonymous local Finyk. Every visit had restore=0, while background calls (`billing/status`, `mono/sync-state`) got 403s.

**Not a known issue, and not intended**
- Spec docs/work/specs/user-deletion-grace-window.md, decision 3 and verification step 4, says: "Увійти знову. Очікування: екран-блокер із датою".
- The spec header lists the live click-through as an open item ("Residual: живий клік-through … п. 3"), so this flow was never exercised end to end.
- ADR-0098:50 says the web shows `PendingDeletionScreen`.
- Nothing in docs/work/specs/audits mentions the issue.
- There is no admin or ops restore tool. `restoreAccount` is only called from the route (dataRights.ts:614, me.ts:321), so support would have to UPDATE the DB by hand.

**Severity**
I tried to argue it down to medium: deletion is started by the user, gated by a password, and the flow is rare. Before ADR-0098, deletion was immediate anyway. I keep high for these reasons:
- The failure is deterministic for 100% of users.
- The recovery path that the dialog and the ADR explicitly promise does not work at all.
- The result is irreversible purge of all account data by the poller after 30 days.
- The user also lands in anonymous mode and may start entering local data while their account is queued for deletion.

It is not critical, because it needs the user's own password-confirmed deletion request first.

**Side note for the fix**
`PendingDeletionScreen.handleRestore` (PendingDeletionScreen.tsx:47-56) invalidates only `me.deletionStatus`, not `me.current`. Even after the gate is fixed, the app may need `me` refetched (or a reload) after restore. The root fix is for `AuthContext` to treat 403 `account_pending_deletion` as an authenticated-but-pending state, or for `usePendingDeletion` to run whenever a session exists rather than gating on `user`.
```

### [high] Квиток round_trip_ticket знімає списання квоти з будь-якого AI-запиту, а не лише з туру синтезу: безкінечний ланцюг безкоштовних першх турів чату

- **ID:** `server-static/ai-layer#1` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/chat/aiQuota.ts:302-307, 335-341; apps/server/src/modules/chat/chat.ts:340-362, 787-789, 911-913; apps/server/src/routes/coach.ts:44; apps/server/src/routes/nutrition.ts:86
- **Вплив:** Free-план (20 AI-дій на тиждень) обходиться повністю: скриптований клієнт отримує необмежені виклики LLM першого туру (текст до 1500 токенів + tool_calls), обмежені лише rate-limit-ом (~20 запитів/5 хв, тобто тисячі на добу замість 20 на тиждень). Це прямі витрати на LLM і обхід paywall основної платної фічі.
- **Що зробити:** Погашати квиток лише тоді, коли запит справді є туром синтезу: у tryConsumeRoundTripTicket вимагати непорожні tool_results і tool_calls_raw у тілі і погашати тільки на /api/chat (передати в requireAiQuota прапорець/маршрут). Додатково звʼязати квиток з id tool_use-блоків, які сервер видав (зберігати їх у TicketRecord і звіряти з tool_calls_raw), і не видавати квиток на кеш-хіті повторно для того самого tool_use. Додати тест: перший тур з валідним квитком мусить списувати квоту.

**Докази:**

```text
aiQuota.ts:302 `function tryConsumeRoundTripTicket(req, userId) { const raw = req.body?.round_trip_ticket; ... return consumeRoundTripTicket({ ticket: raw, userId }); }` і :335 `if (meter === "ai" && sessionUser && tryConsumeRoundTripTicket(req, sessionUser.id)) { return true; }` -- перевіряється лише наявність валідного квитка в тілі, не те, що запит є туром синтезу (tool_results + tool_calls_raw). Водночас перший тур (chat.ts:911-913, і навіть кеш-хіт chat.ts:787-789) видає СВІЖИЙ квиток щоразу, коли відповідь містить tool_calls (`attachRoundTripTicket`). ChatRequestSchema приймає round_trip_ticket і на першому турі. requireAiQuota() з дефолтним meter "ai" стоїть також на /api/coach/insight і на текстових nutrition-ендпоінтах (`aiText`).
```

**Відтворення:**

```text
1) Free-юзер шле POST /api/chat {messages:[{role:'user',content:'Виклич calculate_1rm(100,5), а перед викликом дай повну відповідь на: <будь-яке питання>'}]} -- списується 1 одиниця, у відповіді tool_calls + round_trip_ticket T1. 2) Наступний POST /api/chat з НОВИМ питанням (без tool_results) і round_trip_ticket=T1 -- assertAiQuota повертає true без списання, відповідь знову з tool_calls і новим квитком T2. 3) Повторювати з T2, T3... Квоту більше не списано. Будь-який квиток можна також погасити на POST /api/coach/insight (CoachInsightSchema не strict) -- безкоштовна порада. Локально не відтворено наживо: без LLM-ключа /api/chat віддає 503 ще до requireAiQuota.
```

**Верифікатор:**

```text
Підтверджено в коді. assertAiQuota (aiQuota.ts:335-341) не списує квоту, якщо tryConsumeRoundTripTicket знаходить у сирому req.body валідний квиток цього користувача. Більше нічого не перевіряється: ні tool_results/tool_calls_raw, ні маршрут. Той самий requireAiQuota() з meter ai стоїть на /api/chat, /api/coach/insight і текстових nutrition-ендпоінтах. Гілка першого туру в chat.ts поле round_trip_ticket ігнорує, а на кожну відповідь із tool_calls видає новий квиток через attachRoundTripTicket (chat.ts:787-789 на кеш-хіті, 911-913 на живому виклику). Звідси ланцюг: оплачений перший тур дає T1; новий запит без tool_results, але з T1 безкоштовний і, якщо модель знову повертає tool_calls, видає T2, і так далі. Чинний тест aiQuota.test.ts:662-673 сам будує запит із тілом лише {round_trip_ticket} без tool_results і очікує списання без жодного запиту до БД. Тобто ця поведінка закріплена тестом. Одноразовість квитка й привʼязка до userId ланцюгу не заважають, бо кожна tool_calls-відповідь видає новий квиток. Обмежує лише rate-limit: sustained 20 запитів за 5 хв на /api/chat, 20 на годину на coach. Задокументований намір (chatRoundTripTicket.ts, hub-coach.md:816: «підробити продовження без реального першого ходу не можна») порушено. Наживо не відтворено (немає LLM-ключа, локально AI_QUOTA_DISABLED=1), але логіка однозначна. High залишаю: це повний обхід Free-квоти основної платної фічі скриптованим клієнтом.
```

**Додаткові докази верифікатора:**

```text
aiQuota.test.ts:662-673 - makeReq({}, { round_trip_ticket: ticket }) дає assertAiQuota === true і pool.query not called (тіло без tool_results). chat.ts:340-362 attachRoundTripTicket видає квиток на будь-яку відповідь першого туру з непорожнім tool_calls. Тур синтезу (chat.ts:521+) квитків не видає. Гілка першого туру читає round_trip_ticket лише як trace id у гілці синтезу (chat.ts:528).
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the mechanism. I traced it end to end and it is real. I am lowering the severity from high to medium.

Code path (main @ c7c09607):
- routes/chat.ts runs requireSession, then rateLimitExpress, then requireChatUpstreamKey, then requireAiQuota(), then chatHandler. The JSON body is parsed globally before this chain, and resolvePresetBudget already relies on that.
- aiQuota.ts:302-307 `tryConsumeRoundTripTicket` only checks that `req.body.round_trip_ticket` is a live ticket for this userId.
- aiQuota.ts:335-341 then skips the charge entirely (`meter === "ai" && sessionUser && tryConsume...`). Nothing checks that the request is a synthesis turn, meaning that tool_results and tool_calls_raw are present.
- ChatRequestSchema (packages/shared/src/schemas/api.ts:537-567) has no refine that ties round_trip_ticket to tool_results.
- In chat.ts the first-turn branch (line 718 onward) never looks at round_trip_ticket. On every response that has tool_calls it mints a new ticket via attachRoundTripTicket (chat.ts:340-362). It does this on the live path (911-913) and also on a cache hit (787-789), whether or not the request itself was paid.
- So one paid first turn gives T1. A new question sent with T1 is free and returns T2, and the chain continues as long as each reply contains tool_calls.
- The chain is easy to keep alive. The attacker writes `messages` and can ask the model to call any tool and put the whole answer into a free-text tool argument. `tool_calls[].input` and `text` both come back to the client (chat.ts:896-905). Tools run on the client, so the attacker never has to execute them.
- The ticket TTL is 120 s (chatRoundTripTicket.ts). The sustained rate limit allows 20 requests per 5 min, about one every 15 s, so the chain never expires.
- The unit test aiQuota.test.ts:662-673 sends a body containing only round_trip_ticket and expects it to pass free. That locks in the behaviour.
- This breaks the documented intent in chatRoundTripTicket.ts and hub-coach.md:816 ("підробити продовження без реального першого ходу не можна").
- Pro plans are unlimited (entitlements.ts:35-36), so only the Free limit of 20 per week is bypassed.

I did not reproduce it live. Locally AI_QUOTA_DISABLED=1 and there is no LLM key, so /api/chat returns 503 before the quota runs. The static logic is unambiguous.

Why medium and not high:
1. Throughput per account is capped by the rate limiter at 20 requests per 5 min (routes/chat.ts), about 5.7k per day. On /api/coach/insight the cap is 20 per hour.
2. The first-turn default model is cheap: gemini flash via OpenRouter (env/chatModels.ts:90+), with max_tokens 1500. The worst case is tens of dollars per day per account, and the daily spend guard ($3 soft / $5 hard, obs/anthropicBudgetGuard.ts) raises a Sentry/Telegram alert within hours. That guard only alerts; it does not block.
3. The Free quota can already be bypassed by farming accounts:
   - REQUIRE_EMAIL_VERIFICATION defaults to false (env.ts:85-88).
   - There is no captcha.
   - Sign-up only allows 5 per minute per IP, but at 20 actions per account that already gives more throughput than one chain.
   So the extra abuse capability is moderate. The main harm is that one Free user with a script gets an effectively unlimited personal quota without paying for Pro.

It does not match the brief's high categories: no auth bypass on real data, no cross-user leak, no outage. It is a business-logic flaw in the quota/paywall that can actually be exploited, which is medium.

Fix direction: in assertAiQuota, accept the ticket only when the body has tool_results and tool_calls_raw (and only on /api/chat). The ticket stays as the authorization, while the shape of the request restricts where it can be used. Alternatively, do not mint a new ticket on a first turn that was itself paid by a ticket.
```

## medium

### [medium] Hub-картки про витрати суперечать Фініку: рахують майбутні й «Не враховувати» ручні витрати (порушено «одну правду про витрати» з a7be9c1a)

- **ID:** `browser-surfaces/finyk-flows#3` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** http://127.0.0.1:4173/ (Зараз / NowPile, «Порада й звіт тижня»); apps/web/src/core/lib/recommendations/financeContext.ts:80-110 (manualExpenses без фільтра excluded/hidden, canonicalMonthSpend без верхньої межі); packages/insights/src/recommendations/finance/dailyVsWeeklyPace.ts:49-74 (ts &gt;= todayMs без верхньої межі, північ за годинником пристрою); packages/insights/src/recommendations/finance/spendingVelocity.ts:51-57
- **Вплив:** Хаб показує неправдиві суми й відсотки (тисячі відсотків «перевитрати»), підштовхує до непотрібних дій і підриває довіру до фінансових порад. «Не враховувати» на поради не впливає.
- **Що зробити:** У buildFinanceContext фільтрувати manualExpenses тим самим набором excluded/hidden, що й useFinykStatTransactions, і обмежувати вікна зверху (сьогодні: [todayStart, tomorrowStart), місяць: [monthStart, nextMonthStart)). evaluateDailyPace перевести на київські межі доби (kyivDayStartMs), як решту грошових сигналів.

**Докази:**

```text
Користувач ff3-c: 7 днів по 200 ₴, сьогодні 100 ₴, запланована на 2026-12-31 витрата 4000 ₴. Хаб о 15:30 за Києвом показує «Сьогодні 4 100 ₴, на 1950% вище середнього» і «Інше» – твоя найчастіша категорія без ліміту. Цього місяця вже 4 300 ₴». Водночас Фінік: Аналітика за жовтень «Витрати 300 ₴», ліміт «300 / 1 000 ₴», «Тиждень у цифрах: 900 ₴» (скрін shots/finyk-flows/r3-pace-hub.png). Користувач ff3-d: 5 витрат минулого тижня позначено «Не враховувати» (тост «Виключено зі статистики: 5 операцій»). Аналітика вересня показує 200 ₴, звіт тижня каже «за ті самі дні минулого тижня витрат не було», а картка досі «Витрати на 70% нижче ніж минулого тижня. Чудовий темп: 300 ₴ vs 1 000 ₴». Її кнопка «Відкрити звіт тижня» веде на звіт, який їй суперечить. Хибна денна картка ще й глушить тижневу (f2) і не пускає Фінік у «Закрито сьогодні» (f5).
```

**Відтворення:**

```text
Скрипти r3-14-pace-seed.mjs ff3-c і r3-15-pace-hub.mjs ff3-c 2026-10-02T12:30:00Z (clock.install), r3-17-week-seed.mjs ff3-d, r3-25-exclude.mjs ff3-d, r3-15-pace-hub.mjs ff3-d 2026-10-02T08:00:00Z. Вручну: додати витрату з «Інша дата» в наступному місяці (або позначити записи «Не враховувати»), відкрити хаб після 14:00.
```

**Верифікатор:**

```text
Both parts are confirmed in the code, and I reproduced the headline number exactly by running the real rule.

Future-dated expenses: in dailyVsWeeklyPace.ts:61-67 the manual-expense loop counts `if (ts >= todayMs) todayManual += abs` with no upper bound, so any future-dated manual expense counts as 'today'. In financeContext.ts:96-105, canonicalMonthSpend only skips dates before monthStart, so manual expenses in later months inflate 'this month'. The manual sheet allows future dates: ManualExpenseDateSection uses max=HARD_MAX_DAY_KEY ('2100-01-01') with only a soft warning.

Excluded expenses: buildFinanceContext filters manualExpenses by kind only (financeContext.ts:81-83). Neither it nor the pace/velocity rules apply excludedStatTxIds or hiddenTxIds to manual rows: financeExcludedTxIds is applied only to bank transactions through calcFinykPeriodAggregate. The Фінік canonical universe (lsStats.ts readFinykStatsContext → buildFinykSpendingUniverse/buildFinykExcludedTxIds) does exclude them, so the hub and Фінік disagree.

Medium is right: these are misleading advice cards, with no data loss.
```

**Додаткові докази верифікатора:**

```text
v3-pace.mts imports the real packages/insights/src/recommendations/finance/dailyVsWeeklyPace.ts. Setup: 7 days × 200 ₴, 100 ₴ today, 'now' = 2026-10-02 15:30.
- Without the future row, evaluateDailyPace returns null.
- With one 4000 ₴ manual expense dated 2026-12-31, it returns {todaySpend:4100, avgDaily:200, pctMore:1950}, and the rule title is 'Сьогодні 4 100 ₴, на 1950% вище середнього', exactly what the finder saw.

The exclusion half belongs to the class in docs/work/specs/audits/unification-modules.md §1.1 ('insights рахує витрати повз … виключення'). That item was marked closed on 2026-09-15 after the bank side moved to calcFinykPeriodAggregate, but the manual-expense branches still bypass excludedStatTxIds/hiddenTxIds. The future-date upper-bound problem is not recorded anywhere I could find.
```

### [medium] Таймер відпочинку рахує тіками setInterval, а не за годинником: на заблокованому телефоні чи у фоновій вкладці він зупиняється, а після reload зникає

- **ID:** `browser-surfaces/fizruk-flows#5` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/hooks/useWorkoutsLifecycle.ts:107-130 (remaining - 1 щосекунди); apps/web/src/modules/fizruk/context/RestTimerProvider.tsx:25 (стан лише в useState)
- **Вплив:** Основний сценарій у залі: людина блокує телефон між підходами. Сигнал кінця відпочинку приходить із запізненням, рівним часу блокування, а показаний залишок неправдивий. iOS у фоні повністю зупиняє JS. Убитий ОС PWA втрачає таймер зовсім.
- **Що зробити:** Зберігати endsAt (Date.now()+sec) і рахувати remaining = endsAt - now на кожному тіку та на visibilitychange; персистити endsAt (sessionStorage/SQLite), щоб таймер переживав reload. Для сигналу в фоні розглянути Notification/Web Push з тригером за часом.

**Докази:**

```text
restfreeze.mjs: ✓ на підході 3 → «Відпочинок 90 секунд», годинники [сесія, відпочинок] = ['10:53','01:27']. Далі 25 с JS не виконується (busy-loop, імітує заблокований екран чи заморожений PWA) + visibilitychange → ['11:19','01:25']: сесія зсунулась на 26 с, відпочинок лише на 2 с. rest.mjs: після page.reload під час відпочинку таймер відсутній (shots/fizruk-flows/rest-after-reload.png). Таймер тривалості тренування (HeroCardStates.tsx diffSecFromNow) рахується від startedAt і лишається коректним.
```

**Відтворення:**

```text
Почати тренування → ввести повтори → ✓ (старт відпочинку 90 с) → заблокувати телефон на 60 с (у тесті <scratch>/agents/browser-surfaces-fizruk-flows/restfreeze.mjs) → розблокувати: на таймері лишилось ~88 с замість ~30. Також: перезавантажити сторінку під час відпочинку → таймер зник.
```

**Верифікатор:**

```text
useRestTimerCountdown (useWorkoutsLifecycle.ts:107-130) робить {remaining: r.remaining - 1} на кожен тік setInterval(1000), а RestTimerState = {remaining, total} без жодної мітки часу (useFizrukRestSound.ts:64-67). Кожен setRestTimer стартує від {remaining: sec} (WorkoutItemCard.tsx:169, WorkoutItemRestPresets.tsx:53). Обробника visibilitychange чи pageshow для таймера відпочинку немає: той у HeroCardStates.tsx стосується лише тривалості тренування від startedAt. Стан живе лише в useState у RestTimerProvider (RestTimerProvider.tsx:25), без персисту, тому reload його втрачає. Заморожена сторінка (заблокований телефон, iOS-фон, троттлінг фонової вкладки) не декрементує лічильник, і залишок брешe на час заморозки. Обхідних механізмів (Notification, SW, обчислення від endsAt) немає. У доках не згадано.
```

**Додаткові докази верифікатора:**

```text
Перевірено кодом: ланцюжок setRestTimer → useRestTimerCountdown не містить Date.now(); grep по apps/web/src/modules/fizruk на endsAt / visibilitychange для rest-таймера нічого не дав.
```

### [medium] PWA-ярлик «Розпочати тренування» не відкриває аркуш старту, а лише веде на /fizruk/workouts

- **ID:** `browser-surfaces/route-matrix#2` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/pages/Workouts.tsx:134-139; apps/web/src/modules/fizruk/FizrukApp.tsx:152-158; apps/web/vite.config (manifest shortcuts url "/?module=fizruk&amp;action=start_workout")
- **Вплив:** Один із трьох ярликів встановленої PWA (і інші входи з `start_workout`, коли сторінка Тренувань ще не змонтована) не виконує обіцяну дію. Користувач потрапляє на сторінку, хоча чекав відкритий аркуш.
- **Що зробити:** Ініціалізувати `seenQuickStartRequest` значенням 0 (або передавати одноразовий прапорець і споживати його після відкриття), щоб запит, зроблений до маунту Workouts, теж відкривав аркуш. Додати e2e на кожен manifest-ярлик.

**Докази:**

```text
Таймлайн (390x844, авторизований): `/?module=fizruk&action=start_workout` → 1604ms `/fizruk` → 3251ms `/fizruk/workouts | dialogs=` і за 20 с жодного [role=dialog]. Контроль: `/fizruk/workouts?action=start_workout` → 3510ms `dialogs=Почати тренування Обери, з чого почати:`. Код: обробник робить `navigate("workouts"); setQuickStartRequest(n => n + 1)`, а `Workouts` маунтиться вже після інкременту й ініціалізує `useState(quickStartRequest)` поточним значенням (1), тому `quickStartRequest !== seenQuickStartRequest` ніколи не стає true. Для порівняння, ярлики add_expense і add_meal свої діалоги відкривають. Скрін: shots/browser-surfaces-route-matrix/pwa_module_fizruk_action_start_workout.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/pwa2.mjs, або відкрити http://127.0.0.1:4173/?module=fizruk&action=start_workout як авторизований користувач: аркуш «Почати тренування» не з'являється.
```

**Верифікатор:**

```text
Відтворено. `/?module=fizruk&action=start_workout` (390x844, авторизований) двічі поспіль дав /fizruk → /fizruk/workouts, і за 30 с жодного [role=dialog] не з'явилось. Скрін pwa_shortcut.png: сторінка «Тренування» з кнопкою «Почати тренування», аркуша немає. Те саме, коли спершу прогріти хаб і потім відкрити ярлик. Корінь у коді збігається з описом. FizrukApp.tsx:152-158 у тому самому обробнику робить `navigate("workouts")` і `setQuickStartRequest(n => n + 1)`. Workouts.tsx:131-136 ініціалізує `useState(quickStartRequest)` значенням, яке вже дорівнює 1, тому умова `quickStartRequest !== seenQuickStartRequest` на маунті хибна, і аркуш не відкривається. Запит працює лише тоді, коли Workouts уже змонтовано до інкременту. Тестів на `quickStartRequest` немає. Зламаний не лише manifest-ярлик: той самий `start_workout` шлють швидка дія хабу (moduleConfigs.tsx:219), recommendationEngine, PresetSheet і TodayFocusCard через HUB_OPEN_MODULE_EVENT, і в усіх випадках FizrukApp маунтиться наново. Чому medium, а не нижче: обіцяна дія не виконується з кількох входів. Чому не вище: кнопка старту на один тап від місця, де людина опиняється.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/pwa.mjs. Таймлайн: shortcut 469ms / → 673ms /fizruk → 3774ms /fizruk/workouts, dialogs порожні до 30 с; shortcut2 і hubfirst так само. Мій контрольний прогін `/fizruk/workouts?action=start_workout` теж не відкрив аркуш: це залежить від таймінгу маунту лінивого Workouts і узгоджується з тим самим коренем. Скрін: shots/verify-browser-surfaces-route-matrix/pwa_shortcut.png.
```

### [medium] Хаб: «N звичок ще не виконано сьогодні» і серії рекомендацій ігнорують розклад звичок

- **ID:** `browser-surfaces/routine-flows#3` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/recommendationEngine.ts:296-365 (buildRoutineRecs); http://127.0.0.1:4173/
- **Вплив:** Головний екран суперечить модулю й тисне на користувача невиконаними звичками, яких сьогодні немає в розкладі. Серії «3/7/14… днів поспіль» і «Серія може перерватись» для будь-кого з нещоденною звичкою ніколи не спрацюють (або рахуються неправильно).
- **Що зробити:** Рахувати todayDone/total і серію через ті самі доменні функції, що й модуль (calcRoutineDayProgress / flexibleMaxActiveStreak або знімок ROUTINE_QUICK_STATS), з habitScheduledOnDate, паузами й weekDoneCount.

**Докази:**

```text
Субота 2026-10-03 19:30 Kyiv, 6 звичок (щодня, Пн/Ср/Пт, 3/тиждень, будні, щомісяця, разова). /routine: «0/2 … Вода щодня | Читання 3 рази». Хаб: «6 звичок ще не виконано сьогодні | Вечір, ще не пізно закрити всі звички.» (скрін shots/routine-flows/sat-hub.png). Код: const total = habits.length (лише !archived); streak: habits.every(h => completions[h.id].includes(dk)) для КОЖНОГО дня — без habitScheduledOnDate, пауз, startDate, once/flexible. Також 2026-10-01 23:58 (до startDate звичок) хаб показував «6 звичок ще не виконано», хоча модуль — «Звичок на сьогодні ще немає».
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/hubSat.mjs (clock 2026-10-03T19:30+03:00, юзер routine-flows-1): /routine → «На хаб».
```

**Верифікатор:**

```text
У коді: buildRoutineRecs (recommendationEngine.ts:296-365) фільтрує лише `!h.archived`. `total = habits.length`, а серія рахується через `habits.every(... includes(dk))` для кожного дня, без habitScheduledOnDate, пауз, startDate, once чи flexible. У mergeNowItems (nowItems.ts) для пари-близнюка routine_evening_reminder ↔ routine-todo-evening title і body беруться з Rec, тож на хаб потрапляє саме цей неправильний текст. Відтворив у браузері: модуль показує 0/1, а хаб пише «3 звички ще не виконано сьогодні». Через ту саму логіку мілстоуни серії й «Серія може перерватись» не спрацюють для будь-кого з нещоденною звичкою. Даних це не зачіпає, але хибний сигнал на головному екрані з'являється щовечора. Тому medium, а не вище.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-routine-flows/v3_hub.mjs, юзер verify-routine-hub. Створено у пт 2026-10-02: «Щодня тест» (щодня), «Будні тест» (Пн–Пт), «Пн тест» (лише Пн). Годинник Сб 2026-10-03 19:30. /routine: «0/1 … Щодня тест», «Будні тест: absent», «Пн тест: absent». Хаб: «3 звички ще не виконано сьогодні | Вечір, ще не пізно закрити всі звички.» Скрін shots/verify-routine-flows/v3-sat-hub.png.
```

### [medium] Тижнева/денна картка темпу витрат рахує інший «всесвіт», ніж звіт тижня: «+3130 %» проти «−20 %» на тих самих даних

- **ID:** `client-static/domain-logic#1` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/unification-modules.md §1.1 (UNIFY-1-1 у docs/work/specs/audits/verification/findings.json, status open; перезамір 2026-09-15 у шапці помилково зарахував 1.1 закритим, хоча закрито лише спліти)
- **Де:** packages/insights/src/recommendations/finance/spendingVelocity.ts:40-58, packages/insights/src/recommendations/finance/dailyVsWeeklyPace.ts:58-78, packages/insights/src/recommendations/financeContext.ts:90-95, apps/web/src/core/lib/recommendations/financeContext.ts:69-82; порівняти з packages/finyk-domain/src/domain/weekReport.ts:5-8 та apps/web/src/modules/finyk/hooks/useFinykStatTransactions.ts:47-58
- **Вплив:** Хаб показує тривожне попередження про перевитрату (і блокує Фінік у «Закрито сьогодні», f5), якого не підтверджує жоден інший екран; транзакції, які людина явно виключила, погашення боргів, скасовані платежі та ручні перекази роздувають «темп». Комміт a7be9c1a обіцяв «одну правду про витрати», але картка й звіт досі розходяться.
- **Що зробити:** Будувати FinanceContext з `readFinykStatsContext().excludedTxIds` (канонічний `buildFinykExcludedTxIds` по bank+manual) і подавати в правила темпу вже відфільтрований всесвіт (`stats.txs`), а не мірор + сирі manualExpenses; прибрати `financeExcludedTxIds`. «Сьогодні» в evaluateDailyPace рахувати через kyivDayStartMs. Додати тест на паритет картки й buildWeekReport.

**Докази:**

```text
Картки беруть excluded-set `financeExcludedTxIds(ctx) = hidden + transferIds(лише з мапи txCategories)` і додають УСІ ручні витрати kind=expense без жодного фільтра; звіт тижня (кнопка «Відкрити» веде саме туди, WEEK_REPORT_ACTION) читає канонічний `buildFinykExcludedTxIds` (excludedStat, receivables, пари «Скасування», tx-level перекази). Скрипт f1: тиждень пн–чт: Silpo −800, ноутбук −30 000 позначений «виключити зі статистики», Uklon −1500 + «Скасування. Uklon» +1500; минулий тиждень −1000. Вивід: `WEEK REPORT total: { spentMinor: 80000, prevMinor: 100000, delta: { pct: -20 } }`, `VELOCITY CARD: title 'Витрати на 3130% вище ніж минулого тижня', body 'За такий же проміжок: 32 300 ₴ vs 1 000 ₴'`. Коментар weekReport.ts:5-8 стверджує «числа картки й звіту збігаються». Додатково: evaluateDailyPace бере «сьогодні» за годинником пристрою (`now.getHours()`, `setHours(0)`), а тижнева — київський weekSliceWindows.
```

**Відтворення:**

```text
cd /home/user/sergeant && TZ=Europe/Kyiv node --import tsx <scratch>/agents/client-static-domain-logic/f1_pace_vs_report.mts
```

**Верифікатор:**

```text
Підтверджено і в коді, і запуском. Веб-білдер apps/web/src/core/lib/recommendations/financeContext.ts:69-74 кладе в контекст лише hiddenTxIds = stats.hiddenTxIds і transferIds з мапи txCategories. financeExcludedTxIds (packages/insights/src/recommendations/financeContext.ts:90-94) обʼєднує тільки ці два набори. calcFinykPeriodAggregate (finyk-domain/src/lib/spending.ts:149-165) сам нічого не виключає, крім переданого набору. Тому excludedStatTxIds, receivables.linkedTxIds, пари «Скасування» (findCancelledTxIds) і перекази на рівні транзакції до карток темпу (spendingVelocity.ts:40-58, dailyVsWeeklyPace.ts:58-78) не доходять. Звіт тижня (useFinykWeekReport -> useFinykStatTransactions -> buildFinykExcludedTxIds) усе це виключає. Перевірки, яка б нейтралізувала різницю, немає ні в тракті, ні в правилах. Сам білдер навіть рахує канонічний stats.excludedTxIds, але лише для limitUsage, а не для правил темпу. Коментар weekReport.ts:5-9 («числа картки й звіту збігаються») цьому не відповідає. Побічне зауваження про «сьогодні» за годинником пристрою в evaluateDailyPace (now.getHours()/setHours(0)) теж підтверджено в коді. За ADR-0078 фінансові періоди рахуються за Києвом, тож це невелика додаткова розбіжність. Наслідок «блокує Фінік у Закрито сьогодні» (f5) я не перевіряв. Medium лишаю: на хабі хибне тривожне число, а «Відкрити» веде на екран, який йому суперечить. Проблема та сама, що вже записана в unification-modules §1.1. Перезамір 2026-09-15 позначив її закритою, але закрито лише частину про спліти, а набір виключень досі складається з 2 джерел замість 5.
```

**Додаткові докази верифікатора:**

```text
Запуск TZ=Europe/Kyiv node --import tsx .../client-static-domain-logic/f1_pace_vs_report.mts дав: canonical excluded: [c3, c4, c2]; WEEK REPORT total: spentMinor 80000, prevMinor 100000, delta.pct -20; VELOCITY CARD: title «Витрати на 3130% вище ніж минулого тижня», body «За такий же проміжок: 32 300 ₴ vs 1 000 ₴»; daily pace signal: null. getVisibleFinykMonoMirrorState (monoMirrorReader.ts:118-122) відсіює лише транзакції прихованих рахунків, виключені зі статистики не чіпає.
```

### [medium] Адаптивна ціль калорій: виміряний TDEE систематично занижений на ~400 ккал (EMA-кінець проти сирого старту)

- **ID:** `client-static/domain-logic#2` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/nutrition-domain/src/adaptiveTdee.ts:125-151 (weightTrendEma), :176-184; споживач apps/web/src/modules/nutrition/hooks/useAdaptiveNutritionGoal.ts:171-213, 270-285
- **Вплив:** Людина, що худне 0,7 кг/тиждень з увімкненою «адаптивною ціллю», отримує TDEE на ~15 % нижче реального, і автоматика щотижня ріже їй ціль (до −10 %/тиждень до підлоги BMR) — надто агресивний дефіцит; випадковий перший замір натомість роздуває ціль на 300+ ккал. Це автоматична зміна харчової цілі без участі людини.
- **Що зробити:** Порівнювати однаково згладжені точки (EMA-старт проти EMA-кінця з прогрівом, або лінійна регресія ваги за вікно), або брати нахил тренду × span; додати тест «лінійна втрата без шуму → TDEE = intake + slope×7700».

**Докази:**

```text
`startKg = clean[0].weightKg` (сирий перший замір), `endKg = ema` (згладжений, лагає ~half-life 7 днів), `deltaKg = ema - startKg`. На ідеальних даних у вікні хука (14 днів, щоденні заміри, без шуму): `loss 0.1 kg/day: true TDEE 2770, measured 2358 (weightDelta -0.60 vs true -1.30)`; `loss 0.05: true 2385, measured 2179`. Один «водяний» перший замір +0.8 кг при стабільній вазі: `true 2500, measured 2843`. Хук записує `clampGoalDelta(measured.tdeeKcal + GOAL_KCAL_DELTA[intent])` у dailyTargetKcal щотижня.
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/f11b_tdee14.mts (також f11_tdee.mts для 28 днів)
```

**Верифікатор:**

```text
У weightTrendEma (adaptiveTdee.ts:139-150) EMA ініціалізується першою сирою точкою, startKg = ця сира точка, endKg = згладжена EMA, а deltaKg = ema - startKg. Якщо вага лінійно змінюється, EMA з напіврозпадом 7 днів на 13-денному проміжку відстає приблизно на половину реальної зміни, тож дельта систематично занижена. Через це в measuredTdeeFromBalance виміряний TDEE під час схуднення занижений, а під час набору завищений. Хук (useAdaptiveNutritionGoal.ts:171-213) щоразу бере свіже 14-денне вікно, тож EMA щоразу стартує заново і зсув не зникає. Далі хук записує clampGoalDelta(measured + GOAL_KCAL_DELTA) у dailyTargetKcal (:290-300). Спека nutrition-adaptive-goal.md прямо задумувала «тренд ваги, а не сиру вагу» і вважала метою точність. Про такий лаг як свідомий консерватизм ніде не сказано. Тести (adaptiveTdee.test.ts) перевіряють лише знак, а не величину. Обмеження ±10% на тиждень і підлога BMR пом'якшують наслідок, але не прибирають зсуву.
```

**Додаткові докази верифікатора:**

```text
Запуск f11b_tdee14.mts: «loss 0.05 kg/day: true TDEE 2385, measured 2179 (weightDelta -0.30 vs true -0.65)»; «loss 0.1 kg/day: true TDEE 2770, measured 2358 (weightDelta -0.60 vs true -1.30)»; «flat weight, first weigh-in +0.8 kg: true 2500, measured 2843». Вікно хука: end = вчора, start = end-13, 14 днів (useAdaptiveNutritionGoal.ts:171-174).
```

### [medium] Старіння 1ПМ скидається одним легким підходом: калькулятор навантаження повертається до піку за всю історію

- **ID:** `client-static/domain-logic#3` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/fizruk-domain/src/domain/workouts/oneRmAging.ts:151-186; packages/fizruk-domain/src/domain/workouts/exerciseDetail.ts:216-290; apps/web/src/modules/fizruk/pages/Exercise.tsx:88-95, 418-424
- **Вплив:** Після першого ж заняття після перерви сторінка вправи знову рахує робочі ваги (LoadCalculator) від 140 кг при фактичних 76 — саме той сценарій травми, який «контракт довіри тіла» (канон fizruk §6, AI-DANGER у файлі) мав закрити.
- **Що зробити:** Тримати режим повернення N сесій/днів після паузи (наприклад, доки lastWorkoutBest1rm не наблизиться до піку) і/або старити сам пік за датою досягнення (peakAt), а не лише за датою останньої сесії; орієнтир брати як max(недавній e1RM, знижений пік).

**Докази:**

```text
Застарілість рахується лише від `lastSessionAt` (останнє силове заняття), а орієнтир — від `peak1rm` за ВСЮ історію. Скрипт f9: пік 120×5 (e1RM 140) у травні–червні, 4 міс. паузи → `returnMode true reference1rm 105.0 reduction% 25`; після ОДНОГО повернення 60×8 (e1RM 76) → `returnMode false reference1rm 140.0 | last session e1RM 76.0`. Той самий механізм тримає «свіжим» пік дворічної давності, якщо вправу робили вчора.
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/f9_1rm_aging.mts
```

**Верифікатор:**

```text
computeOneRmAging (oneRmAging.ts:151-186) визначає застарілість лише за daysSinceLastSession (summary.lastStrengthAt), а reference1rm = peak1rm * factor, де пік береться за всю історію. Будь-який силовий підхід до вправи обнуляє давність: factor = 1, returnMode = false, і орієнтир повертається до повного піку незалежно від того, наскільки слабкою була сесія повернення. Exercise.tsx:88-94 і :422-426 передає aging.reference1rm у LoadCalculator, інших обмежень (кількість сесій, свіжий e1RM) немає. Канон fizruk §6 описує повернення як «окремий продуктовий стан» зі зниженими орієнтирами. Тривалість режиму канон не задає, але скидання після одного легкого підходу явно суперечить меті AI-DANGER у файлі. Знахідка коректна. Medium лишаю: калькулятор лише радить, вагу людина обирає сама, але це прямо зачіпає «контракт довіри тіла».
```

**Додаткові докази верифікатора:**

```text
Запуск f9_1rm_aging.mts: «After 4-month layoff: returnMode true reference1rm 105.0 reduction% 25»; «After ONE light comeback set: returnMode false reference1rm 140.0 | last session e1RM 76.0». У docs/work/specs/audits і в каноні не знайшов жодної згадки про тривалість режиму повернення (grep lastSessionAt/lastStrengthAt/peakAt нічого не дав).
```

### [medium] Огляд: алерти лімітів ігнорують період — тижневий/разовий ліміт порівнюється з витратами за весь місяць

- **ID:** `client-static/domain-logic#4` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/pages/overview/useOverviewData.ts:314-331 (budgetAlerts) і apps/web/src/modules/finyk/pages/overview/BudgetAlertsList.tsx:46-56
- **Вплив:** На Огляді червона плашка «290 % · перевищено» для тижневого/разового ліміту, який на сторінці Планування й у хабі на 20 %. Користувач отримує хибну тривогу, коментар у коді («Той самий рахунок, що й на картці ліміту») неправдивий.
- **Що зробити:** Замінити обидва місця на `calcLimitUsages(budgets, insightTx/повна історія, …)` і рендерити `usage.pctRaw/overLimit` — один прохід, як у хабі.

**Докази:**

```text
`budgetAlerts` і BudgetAlertsList рахують `calcLimitCategorySpent(statTx, ...)`, де `statTx` — київський місяць, для БУДЬ-ЯКОГО `period`; картка ліміту (Budgets.tsx:283-290) і хаб (`calcLimitUsages`) накладають `filterTransactionsForLimitPeriod`. Скрипт f2 (24.09, тижневий ліміт 1000 ₴, у тижні 200 ₴, у місяці 2900 ₴): `Limit card / hub: w week spent 200 pct 20 over false; o one_time spent 200 pct 20` vs `Overview BudgetAlertsList: w week spent 2900 pct 290 alert true; o one_time spent 2900 pct 290 alert true`.
```

**Відтворення:**

```text
cd /home/user/sergeant/apps/web && TSX_TSCONFIG_PATH=/home/user/sergeant/apps/web/tsconfig.json node --import tsx <scratch>/agents/client-static-domain-logic/f2_weekly_limit_overview.mts
```

**Верифікатор:**

```text
useOverviewData.ts:314-331 (budgetAlerts) і BudgetAlertsList.tsx:46-56 рахують calcLimitCategorySpent(statTx, ...), де statTx = filterStatTransactions(filterToKyivMonth(...)) (:176-179), тобто київський місяць. Період ліміту при цьому ніде не враховується. Overview.tsx:316-326 рендерить BudgetAlertsList саме з d.statTx. Тим часом Budgets.tsx:289 і calcLimitUsages накладають filterTransactionsForLimitPeriod (week від kyivMondayStartMs, one_time від createdAt). Тижневий ліміт людина створює через UI (AddBudgetForm/LimitBudgetCard, варіант «Щотижня»), тож сценарій реальний. Коментар «той самий рахунок, що й на картці ліміту» не відповідає дійсності. Плашка на Огляді показує хибні 290% і стан «перевищено».
```

**Додаткові докази верифікатора:**

```text
Запуск f2_weekly_limit_overview.mts (cwd apps/web): Limit card/hub: «w week spent 200 pct 20 over false; o one_time spent 200 pct 20 over false»; Overview BudgetAlertsList: «w week spent 2900 pct 290 alert true; o one_time spent 2900 pct 290 alert true». getLimitPeriodRange (finyk-domain/src/domain/budget.ts:168-198) дає вікна week і one_time, які Огляд не використовує.
```

### [medium] realTx після мережевого запиту — лише поточний місяць, тож тижневі/разові ліміти на Плануванні та інсайти Огляду недораховують

- **ID:** `client-static/domain-logic#5` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:160-179, 257-267; apps/web/src/modules/finyk/pages/budgets/Budgets.tsx:209-235, 283-290; apps/web/src/modules/finyk/pages/overview/useOverviewData.ts:120-133; apps/web/src/modules/finyk/hooks/useCoffeeLimitInsight.ts:100-117
- **Вплив:** У перші дні кожного місяця (і завжди для разових лімітів, створених у минулих місяцях) картка ліміту на Плануванні показує 13 %, тоді як хаб-картка каже «перевищено» — дві правди про одні гроші; інсайт «кава» на Огляді мертвий.
- **Що зробити:** Для лімітів і міжмісячних інсайтів брати історію з SQLite-дзеркала (`useFinykStatTransactions`/`getVisibleFinykMonoMirrorState`), а не `mono.realTx`; або розширити мережевий запит до min(початок місяця, понеділок тижня, createdAt разових лімітів, попередній місяць).

**Докази:**

```text
Запит мережі обмежений `kyivMonthRangeIso(kyivYear,kyivMonth)`, а overlay повертає дзеркало лише коли мережевий зріз порожній. Budgets.tsx будує `allStatTx` з realTx і в AI-DANGER (:221-229) стверджує, що тижневий ліміт «на 2-го числа починається з понеділка минулого місяця» — але даних минулого місяця там нема. Скрипт f14 (сьогодні чт 01.10, тиждень з пн 28.09): `hub/insight (full mirror): spent 1850 pct 100 over true` vs `Budgets page (realTx=Oct only): spent 200 pct 13 over false`. Той самий `insightTx` на Огляді годує useCoffeeLimitInsight, який порівнює з минулим місяцем — `lastMonthSpend <= 0 → null`, тобто після завантаження мережі інсайт «кава ↑» не спрацьовує ніколи.
```

**Відтворення:**

```text
cd /home/user/sergeant/apps/web && TSX_TSCONFIG_PATH=/home/user/sergeant/apps/web/tsconfig.json node --import tsx <scratch>/agents/client-static-domain-logic/f14_week_limit_month_edge.mts; код-шлях — у location
```

**Верифікатор:**

```text
useMonobankWebhook.ts:160-172 запитує транзакції лише за kyivMonthRangeIso(поточний київський місяць). overlayTransactions (:257-267) повертає дзеркало SQLite тільки тоді, коли мережевий зріз порожній. Хук віддає realTx: overlayTransactions (:552), а useUnifiedFinanceData лише домішує Приват. Тому, щойно в місяці зʼявилась хоч одна мережева транзакція, Budgets.tsx (allStatTx :231-234 -> filterTransactionsForLimitPeriod :289) бачить лише поточний місяць. AI-DANGER-коментар у :220-230 про тиждень, що «починається з понеділка минулого місяця», на цих даних не справджується. На Огляді insightTx (useOverviewData.ts:126-133) теж побудований з realTx. FinykInsightsBlock передає його в useCoffeeLimitInsight, де lastMonthSpend по банку дорівнює 0, і функція повертає null (:113-117). Хаб (useFinykInsights, FinanceContext.limitUsage) читає повне дзеркало, тож дві поверхні розходяться. Уточнення: ручні витрати мають повну історію (withManualExpenses), тож кавовий інсайт мертвий лише для банківських витрат. Першого числа, поки в новому місяці немає жодної транзакції, overlay показує дзеркало.
```

**Додаткові докази верифікатора:**

```text
Запуск f14_week_limit_month_edge.mts: «hub/insight (full mirror): spent 1850 pct 100 over true» проти «Budgets page (realTx=Oct only): spent 200 pct 13 over false». Ланцюжок у коді: FinykApp.tsx:102 useMonobank = useMonobankWebhook -> useUnifiedFinanceData.ts:39 mono.realTx -> mergedMono.realTx -> Budgets.tsx:174 і useOverviewData.ts:57/129 -> Overview.tsx:288-289 FinykInsightsBlock transactions={d.insightTx}.
```

### [medium] Хаб-серія звичок рахує гнучкі звички («N разів на тиждень») поденно: обнуляється в середині тижня і видає тижні за дні

- **ID:** `client-static/domain-logic#8` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/routine-domain/src/flexStreak.ts:144-269 (немає гілки isFlexibleHabit), 365-382 (flexibleMaxActiveStreak); споживачі apps/web/src/modules/routine/useRoutineDerivedData.ts:217-226, RoutineCalendarHero, useStreakMilestoneCelebration, ROUTINE_QUICK_STATS
- **Вплив:** Людина з гнучкими звичками бачить «серія 0» щосереди-четверга, хоча йде за планом; або «серія 6 днів» за шість тижнів. Тост віхи «7 днів» (CELEBRATED_STREAK_MILESTONES у днях) спрацьовує після 7 тижнів — той самий клас змішування одиниць, що аудит L-8.
- **Що зробити:** У flexibleStreakForHabit/flexibleMaxActiveStreak для isFlexibleHabit або виключати звичку з денного агрегату, або перераховувати weeklyGoalStreak окремо й не змішувати з днями; у flexibleStreakBreakdown не вважати «miss» дні поточного тижня, поки ціль ще досяжна.

**Докази:**

```text
HabitStatsSection.tsx:80-84 сам визнає: прогнати гнучку звичку через flexibleStreakBreakdown «означає порахувати пропуском кожен день». Але flexibleMaxActiveStreak робить саме це. Скрипт f7: ціль 3/тиждень, 4 повні тижні пн/ср/пт, цього тижня пн, сьогодні чт (у графіку): `flex breakdown: { days: 0 }`, `weekly-goal streak (streakForHabit, weeks): 4`, `hub max active streak: 0`; у неділю той самий ряд дає 12. f8b: звичка 1×/тиждень, 6 понеділків → `currentStreakShownAsDays: 6`.
```

**Відтворення:**

```text
cd /home/user/sergeant && TZ=Europe/Kyiv node --import tsx <scratch>/agents/client-static-domain-logic/f7_flex.mts (і f8b_record.mts)
```

**Верифікатор:**

```text
The code confirms it. flexibleStreakBreakdown has no exclusion for isFlexibleHabit. It only passes weekDoneCount (flexStreak.ts:236-239), so a day in an unfinished week (current or past) is still 'scheduled'. Each empty day there becomes a 'miss', and two in a row break the streak (MAX_CONSECUTIVE_GRACE=1). flexibleMaxActiveStreak (:365-382) feeds the hub quick-stats (quickStats.ts:57 → ROUTINE_QUICK_STATS), the hero's streakMax (useRoutineDerivedData.ts:217-226), the milestone toast and the record insight. That number is a count of DONE DAYS, while streakForHabit/maxStreakAllTime count flexible habits in WEEKS. This contradicts founder decision #2 in docs/work/specs/routine-flexible-weekly-frequency.md ('unit = weeks in a row; the current week is still running, not counted as a break'). It also contradicts plan item PR-3.5 there ('streaks.ts / flexStreak.ts: flexible habits are excluded from the daily model and routed to weeklyGoalStreak'). The status table marks flexStreak as done, but it only got the weekDoneCount branch, not the exclusion. Nothing neutralizes this: claimStreakMilestone never resets claims, so a false '7 днів' toast for 7 weeks fires once and stays. The hub figure is a max across habits, so a daily habit with a longer streak hides the bug; it shows for users whose best habit is flexible. medium is fair (a core metric on the hub/hero breaks a ratified decision and feeds streak_milestone_reached in days for weeks).
```

**Додаткові докази верифікатора:**

```text
My script <scratch>/agents/verify-client-static-domain-logic/v8_flex.mts (TZ=Europe/Kyiv). Habit 3x/week, pattern Mon/Thu/Sat, past weeks complete. On the current week, computeRoutineQuickStats().streak by day: Mon 10, Tue 10, Wed 10, Thu (Mon+Thu done, on track) **1**, Fri **1**, Sat (3/3) 12, Sun 12. streakForHabit (weeks) over the same days: 3,3,3,3,3,4,4. Habit 1x/week with 7 Mondays: hub streak = 7 (the '{days} днів' milestone toast fires after 7 weeks), weeks = 7. The finder's f7/f8b reproduce as well: hub 0 vs weeks 4; currentStreakShownAsDays 6.
```

### [medium] Незворотні або перезаписні чат-дії поза гейтом підтвердження і без undo (mark_debt_paid видаляє борг, consume_from_pantry, set_daily_plan, edit_habit...)

- **ID:** `client-static/gap-ai-chat-action-executors#6` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/shared/src/lib/toolRisk.ts:54-116; chatActions/finykActions/debts.ts:72-123; transactions.ts:95-109,130-158; budgets.ts:182-201; nutritionActions.ts:261-337,378-416; crossActions/goalAndUtility.ts:179-189; routineActions.ts:397-453,455-494,495-536,537-556
- **Вплив:** Модель (або інʼєкція в призначенні платежу, B21) без жодного кліку видаляє борг з історією, прибирає продукти з комори, вимикає адаптивну ціль, переписує розклад або паузу звички заднім числом, затирає історію поповнень цілі. Скасувати нічим. Відомий B21 закрито лише для 3 тулів. Тут конкретні дії, що порушують саме правило «незворотне → confirm, решта → undo».
- **Що зробити:** Або додати undo (reverse-snapshot з канонічного кешу) для кожного з перелічених тулів, або внести їх у TOOL_RISK як destructive. mark_debt_paid не має видаляти борг (позначати закритим, як UI). update_budget(goal) не має чіпати contributions, якщо saved_amount не передано, і має дописувати, а не замінювати. Тест-інваріант: кожен мутуючий tool або в TOOL_RISK, або повертає undo.

**Докази:**

```text
TOOL_RISK policy: confirm only for irreversible actions; the rest run immediately, with an undo button. These run without confirm and return a plain string, so no undo toast:
- mark_debt_paid: `if (closed) debts.splice(idx, 1)` deletes the debt record. The UI never deletes paid debts.
- consume_from_pantry: removes the whole item when qty is omitted.
- set_daily_plan / set_goal(daily_kcal): overwrite targets. persistNutritionPrefs silently sets adaptiveGoalEnabled=false.
- edit_habit / set_habit_schedule (forces recurrence='weekly') / pause_habit (from = any past date, retroactive) / reorder_habits: no undo.
- split_transaction overwrites existing splits. hide_transaction has no undo.
- update_budget(scope:'goal') sets `g.contributions = buildAiContribution(saved)`: the deposit history is replaced (empty when saved_amount is omitted).
hubChatContext/finance.ts:188 puts third-party Monobank descriptions verbatim into the context (B21 channel).
```

**Відтворення:**

```text
Static review. A mocked /api/chat (lib2.mjs mockChat) with mark_debt_paid on a chat-created debt and amount ≥ total shows the debt row removed, with no dialog and no toast.
```

**Верифікатор:**

```text
TOOL_RISK (toolRisk.ts) holds only delete_transaction, forget, batch_categorize, import_monobank_range, clear_pantry, remember, create_transaction, export_module_data (destructive), plus hide_transaction, archive_habit and the 4 B39 budget tools (reversible). Confirmed defects: markDebtPaid splices the debt out and returns a plain string with no undo. The UI keeps paid debts and deletes only via an explicit action with an undo toast (AssetsLiabilitiesSection.tsx:140-147). consume_from_pantry and split_transaction return plain strings (no undo). set_daily_plan has no undo. update_budget(goal) replaces `g.contributions` with buildAiContribution(saved), wiping the deposit log; its B39 undo snapshot comes from stale kv (see #1). Overstated: edit_habit, reorder_habits, set_habit_schedule and pause_habit are reversible via the Routine UI, which meets the policy's own definition of 'reversible' ('через UI'). Auto-disabling adaptiveGoalEnabled on a manual goal change matches the UI's manual-edit semantics. consume_from_pantry is documented in TOOL_RISK as intentionally non-destructive.
```

**Додаткові докази верифікатора:**

```text
Own live run (debtpaid.mjs, audit_pool97). create_debt VPaidDebt 300 → d_1790909955386, then mark_debt_paid{amount:300} returned '…борг закрито'. No undo button was visible, and the server finyk_debts row got deleted_at = 2026-10-02 02:59:21. B21 in ai-pipeline-2026-08-05.md (closed by owner decision 2026-09-29) covers the confirm-gate policy in general, not these specific tools.
```

### [medium] Таймер відпочинку рахує тики, а не реальний час — у фоні/при заблокованому екрані «стоїть»

- **ID:** `client-static/react-correctness#4` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/hooks/useWorkoutsLifecycle.ts:107-131; apps/web/src/modules/fizruk/context/RestTimerProvider.tsx:24-38
- **Вплив:** Основний сценарій у залі (екран блокують між підходами) дає неправильний залишок відпочинку і пропущений сигнал завершення; користувач чекає зайвий час.
- **Що зробити:** Зберігати `endsAt` (мс епохи) і рахувати `remaining = ceil((endsAt − Date.now())/1000)` на кожен тик і на `visibilitychange`; сигнал і телеметрію викликати з ефекту при переході в 0, а не з updater-а.

**Докази:**

```text
`useRestTimerCountdown`: `setInterval(() => setRestTimer((r) => { if (!r || r.remaining <= 1) { markCompletedNaturally(); return null; } return { ...r, remaining: r.remaining - 1 }; }), 1000)`. Стан — лише `{remaining, total}` без моменту закінчення; немає ні `visibilitychange`-досинхронізації, ні `Date.now()`-якоря (grep по fizruk/context і hook: 0 збігів). Коли iOS-PWA заблоковано або вкладку приховано (WebKit призупиняє JS, Chrome глибоко тротлить приховані таймери), інтервал не тікає, і після повернення таймер продовжує з тієї самої секунди. Додатково `markCompletedNaturally()` (звук + `trackFizrukRestTimerDone`) викликається ВСЕРЕДИНІ updater-а `setRestTimer` — сайд-ефект у чистій функції, яку React може викликати двічі (StrictMode/повторний рендер).
```

**Відтворення:**

```text
Статично: прочитати useWorkoutsLifecycle.ts:107-131. Вручну: на iPhone запустити відпочинок 90 с, заблокувати екран на 2 хв, розблокувати — таймер показує майже повні 90 с замість завершення.
```

**Верифікатор:**

```text
Code: `useRestTimerCountdown` (useWorkoutsLifecycle.ts:107-131) decrements `remaining` by 1 per `setInterval` tick. `RestTimerState` is only `{remaining,total}`, with no `endsAt`. Neither RestTimerProvider, SessionDock nor the overlay re-syncs on `visibilitychange`. Every time the JS timers are suspended (iOS Safari/PWA on lock or background, Android freezing), the countdown resumes from the same second afterwards. The previous verifier's CDP `Page.setWebLifecycleState frozen` test was a false negative: a probe (v2-freeze-probe.mjs) shows that in headless-shell this CDP freeze does not stop timers (ticks kept arriving every 1000 ms). I simulated the suspension properly instead: wall clock jumps forward and no timers fire in between. The side-effect-in-updater sub-claim is minor. The ref flag is idempotent and the pattern is documented in useFizrukRestSound. Only `trackFizrukRestTimerDone` could fire twice, and only in StrictMode dev.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-react-correctness/v2-rest2.mjs (page.clock installed, real session: start workout → exercise → «Підхід 1: зроблено»): T0 «01:29 Відпочинок»; `clock.setSystemTime(+60 s)` (Date.now jumped 60009 ms, no timers fired); after 1.5 s T1 «01:28». The countdown ignored the 60 s that had passed. Expected with an endsAt anchor: ≈00:28.
```

### [medium] Повернення з LiqPay/Plata завжди `?checkout=success`, а /pricing безумовно показує «Підписку активовано, Premium уже діє.» — навіть аноніму і free-юзеру

- **ID:** `client-static/web-route-guards#3` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/server/src/modules/billing/liqpay.ts:400; apps/server/src/modules/billing/plata.ts:281; apps/web/src/core/PricingPage.tsx:145-171
- **Вплив:** Людина з відхиленою/скасованою оплатою в UA-провайдерах отримує твердження, що Premium діє; гроші/доступ розходяться з повідомленням, звідси звернення в підтримку й недовіра. Будь-хто може відтворити хибне повідомлення лінком.
- **Що зробити:** Для LiqPay/Plata повертати на нейтральний `?checkout=return` і на клієнті показувати результат лише після рефетчу `billingKeys.status` (успіх = plan pro, інакше «Оплату не підтверджено / ще обробляється»); не показувати success-тост без сесії.

**Докази:**

```text
liqpay.ts:400 `result_url: ${baseUrl}/pricing?checkout=success`; plata.ts:281 `redirectUrl: ${baseUrl}/pricing?checkout=success` — у обох провайдерів цей URL використовується після завершення платежу незалежно від результату (успіх/відмова/закриття). PricingPage.tsx:158 `toast.success(t.toast.subscriptionActive…)` лише за наявністю параметра, без перевірки billing/status.
Браузер: anon /pricing?checkout=success → toast «Підписку активовано, Premium уже діє. Перейти у налаштування»; free-юзер (rg-sweep) → той самий toast, при цьому картка Free лишається «Зараз твій план» (shots/client-static-web-route-guards/checkout-success-rg-sweep.png).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-route-guards/checkout-toast.mjs
```

**Верифікатор:**

```text
Server: liqpay.ts:400 sets `result_url: ${baseUrl}/pricing?checkout=success` and plata.ts:281 sets `redirectUrl: ${baseUrl}/pricing?checkout=success`. Neither provider gets a separate cancel or failure URL, unlike stripe.ts:149-150, which has both success_url and cancel_url. Monobank's acquiring redirectUrl is documented as used after the payment ends whether it succeeded or failed, and LiqPay has only one result_url. Client: PricingPage.tsx:145-171 shows toast.success(subscriptionActive = «Підписку активовано, Premium уже діє.») whenever the param is present, without checking session or billing status. Reproduced: anon /pricing?checkout=success shows the toast. Free user verify-crg-sync also gets the toast while GET /api/billing/status returns access.state=free and the Free card still says «Зараз твій план». A declined or abandoned payment on the UA providers produces a false Premium-activated claim. No money is lost, but it is a misleading message on the payment flow; medium stands.
```

**Додаткові докази верифікатора:**

```text
r2/checkout.mjs: `anon … toasts: ['Підписку активовано, Premium уже діє. Перейти у налаштування']`; for the free user the same toast appears with 'current-plan badge: 2' and billing status `{"access":{"state":"free"…}}`. Screenshots r2/checkout-anon.png, r2/checkout-verify-crg-sync.png.
```

### [medium] Глобальний cost circuit-breaker Anthropic (HARD_DEGRADE_ALL) губить стан hard-пробиття після рестарту чи на іншій репліці, бо прапорець у Redis уже стоїть

- **ID:** `server-static/reliability-ops#2` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/obs/anthropicBudgetGuard.ts:295-302 (hardBreached ставиться лише при hardFired), 458-470 (fireOnce), 500-531 (markFlag: SET NX -&gt; false), 637-638; споживач apps/server/src/modules/chat/aiQuota.ts:686
- **Вплив:** Попередні аудити (ai-abuse-2026-08-05 A5, ai-pipeline-2026-08-05) рекомендують увімкнути `ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=true` як єдину реальну стелю витрат. Навіть увімкнений, вимикач працює лише в тому процесі, який першим відстріляв алерт, і лише до першого рестарту (деплої йдуть кілька разів на день). Після цього всі запити знову йдуть на premium-модель, хоча денний бюджет уже пробито, а повторного алерту немає (NX). У мульти-репліці вимикач спрацює максимум на одній репліці.
- **Що зробити:** Відокремити стан hard-пробиття від одноразовості алерту: `hardBreached = spendUsd &gt;= hardUsd` на кожному тіку, незалежно від результату `fireOnce`. Робити перший тік на старті (див. знахідку про полери). Додати тест «рестарт при вже виставленому Redis-прапорі».

**Докази:**

```text
`if (hardUsd > 0 && spendUsd >= hardUsd) { hardFired = await this.fireOnce("hard", ...); if (hardFired) { this.state.hardBreached = true; } }`. markFlag: `const result = await client.set(key,"1","EX",ttl,"NX"); if (result === "OK") {...return true;} this.state.firedAlerts.add(key); return false;`. Відтворено на справжньому класі (scratch bg.mts, спільний фейковий Redis з NX-семантикою, spend=7 > hard=5):
process #1 tick: { hardFired: true, isHardBreached: true }
process #2 tick: { hardFired: false, isHardBreached: false }
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/server-static-reliability-ops/bg.mts (cwd apps/server). Сценарій у проді: hard-поріг пробито, перший процес виставив Redis-ключ `...:<day>:hard`; далі деплой або рестарт; новий процес на кожному тіку отримує `SET NX` = null, і `isAnthropicBudgetHardExceeded()` до кінця доби повертає false.
```

**Верифікатор:**

```text
Перевірено в коді: state.hardBreached = true виставляється лише коли fireOnce повернув true (anthropicBudgetGuard.ts:295-302). markFlag повертає false, якщо Redis-ключ уже стоїть (SET NX дає null, рядки 517-526). makeInitialState() на старті процесу дає hardBreached=false, а відновлення стану з Redis немає. Значить, після рестарту чи на іншій репліці isAnthropicBudgetHardExceeded() до кінця доби повертає false, хоча витрати з леджера вище hard-порогу. Redis у проді є (ADR-0074: «API, Postgres, and Redis run on one Hetzner VPS»), тож це не артефакт середовища. Шапка модуля (рядки 17-21) описує саме цей клас бага («hardBreached теж скидався… друге пробиття тієї ж доби було ще й тихим») як причину переходу на леджер. Але фікс виправив лише читання витрат, а прив'язку hardBreached до одноразовості алерту залишив. Єдиний споживач (aiQuota.ts:686) працює лише при ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=true. Цей прапор рекомендують аудити (A5) і рунбук run-beta-wave.md:27,40 як «єдине, що фізично обмежує рахунок». Medium залишаю.
```

**Додаткові докази верифікатора:**

```text
Повторно відтворено на справжньому класі (verify-server-static-reliability-ops/bg-verify.mts, cwd apps/server, спільний фейковий Redis з NX-семантикою, spend=7 > hard=5): «process #1 tick: { hardFired: true, isHardBreached: true }» / «process #2 tick: { hardFired: false, isHardBreached: false }». В аудитах ai-pipeline-2026-08-05 і ai-abuse-2026-08-05 записано лише те, що прапор DEGRADE_ALL вимкнено. Скидання стану при рестарті там не згадано.
```

## low

### [low] Білінг довіряє клієнтському заголовку x-vercel-ip-country і пропонує Stripe навіть тоді, коли він вимкнений

- **ID:** `api-live/ai-billing-integrations-live#11` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/routes/billing.ts:60-64 (userCountry), apps/server/src/modules/billing/provider.ts:182-194 (для не-UA завжди ['stripe'] без перевірки STRIPE_ENABLED)
- **Вплив:** Гео-логіка вибору провайдера фактично мертва (усі реальні користувачі стають UA) і водночас керується клієнтом: будь-хто може обрати «закордонний» провайдер. Користувач за кордоном (якщо гео колись запрацює) побачить кнопку Stripe, яка завжди дає 503.
- **Що зробити:** Не читати гео з клієнтських заголовків на Coolify. Брати країну з довіреного джерела (GeoIP на сервері або заголовок, який ставить лише свій проксі) або з профілю. У getEnabledProviders враховувати env.STRIPE_ENABLED.

**Докази:**

```text
Як aibill1: GET /api/billing/providers з `x-vercel-ip-country: US` -> {"providers":["stripe"]}; з `ua` -> []; з `XYZ` -> [] (вважається UA). POST /api/billing/checkout {plan:'pro'} + `x-vercel-ip-country: US` -> 503 BILLING_UNAVAILABLE; з `DE` і provider:'stripe' -> 503. Бекенд стоїть на Hetzner/Coolify, а Vercel /api не проксує (див. коментар у routes/silpo.ts:176-181), тож заголовок ніколи не ставить інфраструктура, лише клієнт.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p12_bill.mjs
```

**Верифікатор:**

```text
Підтверджено наживо і в коді. userCountry() (billing.ts:60-64) бере країну з x-vercel-ip-country. apps/web/vercel.json не проксує /api: rewrite виключає `api/`, а фронт ходить напряму на api.sergeant.com.ua (CSP connect-src). Бекенд стоїть на Coolify, тож цей заголовок ставить лише клієнт, і для всіх реальних запитів діє дефолт UA. getEnabledProviders (provider.ts:182-194) для не-UA повертає ['stripe'] без перевірки STRIPE_ENABLED, хоча за реєстром прапорців Stripe лишається dormant. stripe.ts:79-80 при checkout перевіряє лише STRIPE_SECRET_KEY. Практичний вплив сьогодні майже нульовий: без ключа Stripe checkout дає 503, а з ключем користувач просто платить через dormant-провайдера. Це логічний дефект і дефект defense-in-depth, тому low.
```

**Додаткові докази верифікатора:**

```text
y1_all.mjs: GET /api/billing/providers із x-vercel-ip-country: US -> 200 {"providers":["stripe"]}; без заголовка -> 200 {"providers":[]}; POST /api/billing/checkout {plan:'pro'} з US -> 503 BILLING_UNAVAILABLE; без заголовка -> 400 PROVIDER_UNAVAILABLE 'none'. apps/web/vercel.json:130-134, rewrite "/((?!api/|assets/|\\.well-known/).*)" -> /index.html, проксі на бекенд немає. grep по docs/ на x-vercel-ip-country нічого не знаходить.
```

### [low] Coach: читання пам'яті (GET /api/coach/memory) витрачає той самий годинний бакет 20/год, що й генерація інсайту; копі 429 «через 3600 секунд»

- **ID:** `api-live/ai-billing-integrations-live#13` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/routes/coach.ts:29-38 (`r.use("/api/coach", rateLimitExpress({ key: "api:coach", limit: 20, windowMs: 3600000 }))` на весь префікс)
- **Вплив:** Дешеві читання і запис пам'яті з'їдають ліміт дорогої AI-генерації, тож реальна стеля — близько 10 інсайтів на годину, і вона закінчується непередбачувано. Повідомлення «через 3600 секунд» незручне для людини (те саме на інших годинних лімітах: waitlist, feedback).
- **Що зробити:** Розвести бакети: memory GET/POST на окремий ширший ключ, а api:coach лишити лише на /insight. У форматуванні Retry-After для довгих вікон показувати хвилини або години.

**Докази:**

```text
Як aibill2: 22× GET /api/coach/memory -> 200×20, потім 429 429; після цього POST /api/coach/insight -> 429 {"error":"Забагато запитів. Спробуй через 3600 секунд.",...}. Веб на кожен інсайт робить getMemory + postInsight (apps/web/src/core/insights/useCoachInsight.ts:324-330), а генерація дайджесту ще й postMemory.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p21_chatrl.mjs
```

**Верифікатор:**

```text
Відтворено наживо. routes/coach.ts:29-33 ставить rateLimitExpress({key:'api:coach',limit:20,windowMs:1h}) на весь префікс /api/coach, тож GET і POST /memory витрачають той самий бакет, що й /insight. Retry-After дорівнює 3600, і повідомлення «Спробуй через 3600 секунд.» доходить до UI: useCoachInsight.ts:518-520 показує serverMessage, а friendlyApiError для 429 повертає текст сервера. Реальний вплив менший, ніж описано: інсайт кешується на добу (staleTime: Infinity, ключ дня), тож звичайний користувач витрачає 2 токени на день. Стелю близько 10 інсайтів на годину можна досягти лише ручним перегенеруванням. Вартість AI окремо тримає requireAiQuota. Отже, лишаються copy-полиш і дрібна логічна неточність, low.
```

**Додаткові докази верифікатора:**

```text
y3_coach.mjs (пул-юзер vbillw4): 21× GET /api/coach/memory -> 200×20, потім 429; одразу після цього POST /api/coach/insight -> 429, retry-after 3600, {"error":"Забагато запитів. Спробуй через 3600 секунд.","code":"RATE_LIMIT_USER"}. rateLimit.ts:799 форматує лише секундами (pluralSeconds). У docs/work/specs/audits і docs/open-work.md ця проблема не записана.
```

### [low] Postgres-лімітер: «прибирання» з вікном короткого роуту видаляє бакети ВСІХ ключів — годинні/добові ліміти (і auth per-account) скидаються за ~2 хв і можуть бути скинуті атакером навмисно

- **ID:** `api-live/ai-billing-integrations-live#2` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/http/rateLimit.ts:516-530 (maybeSweepPgBuckets), :772 (`void maybeSweepPgBuckets(windowMs)` з вікном поточного роуту)
- **Вплив:** Коли Redis недоступний (рядок `REDIS_URL` у доках позначений як optional; аварії Redis теж трапляються), будь-який ліміт із вікном більше ~2 хв фактично стає ~2-хвилинним: api:auth:account (10 спроб на email за 15 хв), billing checkout/portal/cancel (10/год), weekly-digest (10/год), coach (20/год), waitlist/feedback (10–20/год), barcode/food-search добові. Атакер може скинути їх навмисно ~256 дешевими анонімними запитами (csp-report/web-vitals), що прискорює перебір паролів по акаунту в ~7 разів і знімає захист від зловживань AI та білінгом.
- **Що зробити:** Видаляти лише прострочені рядки з урахуванням вікна конкретного ключа: зберігати window_ms у рядку (`DELETE ... WHERE started_at + window_ms*2 &lt; NOW()`) або фільтрувати `WHERE rl_key = $key`. Додати тест: sweep, спричинений 60-секундним роутом, не чіпає годинний бакет.

**Докази:**

```text
`const ttlMs = Math.max(60_000, maxWindowMs * 2); DELETE FROM rate_limit_buckets WHERE started_at < NOW() - ttl` — без фільтра по rl_key, а maxWindowMs = вікно роуту, що спричинив sweep (для 60-сек роутів ttl=120 с). Живий прогін p16_sweep.out:
20:58:25 після 11 POST /api/waitlist (XFF 10.77.1.1) -> 429, Retry-After 3600; DB: api:waitlist ip:10.77.1.1 count=11
21:00:35 рядок ще є
21:01:11 після 259 анонімних POST /api/csp-report -> рядок зник (DB: "")
21:01:11 POST /api/waitlist з тієї ж IP -> 400 (не 429), RateLimit-Remaining 9.
Те саме сталося «саме» з фідбеком: 429 о 20:51:59 (Retry-After 3600), а о 20:57:57 та сама IP -> 400, RateLimit-Remaining 19.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p16_sweep.mjs (виснажує /api/waitlist, чекає 130 с, шле анонімні /api/csp-report, доки бакет не зникне, повторює waitlist). Без Redis (REDIS_URL не заданий або Redis лежить) лімітер іде через Postgres.
```

**Верифікатор:**

```text
Код однозначний: maybeSweepPgBuckets(windowMs) у rateLimit.ts:516-530 видаляє з rate_limit_buckets УСІ рядки зі started_at < NOW()-max(60s, 2×вікно поточного роуту), без фільтра за rl_key. Виклик іде на :772 з вікном роуту, який спрацював. Через це будь-який 60-секундний роут прибирає годинні й добові бакети, а також sustained-бакети AI-3 і per-account auth-бакет. Я відтворив це живим прогоном: годинний бакет api:waitlist (429, Retry-After 3600) зник уже за ~130 с, причому через фоновий трафік інших агентів, без жодного мого csp-report. Наступний запит з тієї ж IP отримав 400 і RateLimit-Remaining 9. Severity знижую: ланцюг такий: Redis -> Postgres -> in-memory, а в проді Redis працює (ADR-0074:13: «API, Postgres, and Redis run on one Hetzner VPS»). Postgres-лімітер вмикається лише під час збою Redis, і атакер не може такий збій спричинити. Це дефект деградованого режиму, defense-in-depth, а не постійна вразливість.
```

**Додаткові докази верифікатора:**

```text
x2_sweep.out: 01:51:47 after 11 waitlist calls: 429 Retry-After 3600; DB: api:waitlist ip:10.97.8.8 count=11; 01:53:57 DB before sweep traffic: (порожньо); after 0 csp-report calls; waitlist again: 400 RateLimit-Remaining 9. Попередній верифікатор отримав той самий результат (v2_sweep.out). docs/governance/security/rate-limit-failure-mode.md описує Redis->PG->inmem, але цей sweep там не згадано.
```

### [low] Відписка від розсилки змінює стан на GET і навіть HEAD (сканери посилань відписують людей), RFC 8058 one-click POST отримує 403, а сторінка показує внутрішній слаг «ftux_drip»

- **ID:** `api-live/ai-billing-integrations-live#7` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/routes/email-unsubscribe.ts:32-77 (GET з INSERT), :92 (копі «Більше листів від ${FTUX_DRIP_CAMPAIGN_FAMILY}»); заголовка List-Unsubscribe у відправці немає (grep по apps/server/src)
- **Вплив:** Корпоративні сканери (SafeLinks, Proofpoint, Mimecast) роблять GET/HEAD по посиланнях з листа і тихо відписують користувача від FTUX-ланцюжка. Без List-Unsubscribe/One-Click Gmail і Yahoo частіше кладуть розсилку в спам. Користувач бачить технічний ідентифікатор «ftux_drip» замість назви.
- **Що зробити:** GET показує сторінку з кнопкою підтвердження, а відписка відбувається на POST (додати шлях у винятки CSRF, як інші машинні POST, захищені HMAC). Додати заголовки List-Unsubscribe і List-Unsubscribe-Post: List-Unsubscribe=One-Click. Замінити слаг на людську назву («листи-підказки Sergeant»).

**Докази:**

```text
HEAD /api/email/unsubscribe?u=<валідний токен для власного тестового юзера aibill2> -> 200, і в БД з'явився рядок `22kE5cHmZgzypsKHRiGgfSBcEhRoGKmY | ftux_drip | email_footer | 2026-10-01 20:54:15`. GET із валідним токеном -> 200, у тілі «Більше листів від ftux_drip не приходитиме.». POST /api/email/unsubscribe (тіло List-Unsubscribe=One-Click, як шле Gmail) -> 403 {"error":"CSRF header required"}. Підроблені токени (abc.def, без u, 63+1 hex) -> 200 зі сторінкою «посилання вже не діє», без rate-limit (кожен запит пише warn у лог).
```

**Відтворення:**

```text
node p8_unsub.mjs ftux_drip / p10_unsubhead.mjs / p9_unsubpost.mjs у <scratch>/agents/api-live-ai-billing-integrations-live (токен порахований локальним BETTER_AUTH_SECRET лише для власних пул-юзерів).
```

**Верифікатор:**

```text
Відтворено на власному одноразовому юзері vunsub7. Express віддає GET-хендлер і на HEAD, а хендлер робить INSERT в email_unsubscribes. Перший прогін: before "" -> HEAD 200 -> рядок `ftux_drip|email_footer` з'явився (видно на старті другого прогону). GET зі валідним токеном показує «Більше листів від ftux_drip не приходитиме.»: це внутрішній слаг FTUX_DRIP_CAMPAIGN_FAMILY='ftux_drip'. POST із тілом List-Unsubscribe=One-Click -> 403 CSRF_HEADER_REQUIRED, бо POST-роуту немає і CSRF-гард відсікає раніше. У sendViaResend (ftuxDripMail.ts:290-301) заголовків List-Unsubscribe і List-Unsubscribe-Post немає. Коментар у роуті сам визнає, що preview-fetcher-и ходять по посиланнях, але відписку на GET і HEAD не прибирає. Severity low: стосується лише FTUX-розсилки, даним це не шкодить.
```

**Додаткові докази верифікатора:**

```text
x7_unsub.mjs (uid 7v5OuZ1Z79fPwgxGYrfjsxPEGe59Miqw): before "" -> HEAD 200 -> after `ftux_drip|email_footer`; GET 200 «Готово. Більше листів від ftux_drip не приходитиме.»; POST one-click 403 {"code":"CSRF_HEADER_REQUIRED"}. grep -i list-unsubscribe apps/server/src -> лише коментар.
```

### [low] authMiddleware over-match по всьому URL (разом із query): підробка security-подій op=sign_in і випалювання per-account бакета жертви з не-sign-in ендпоінтів

- **ID:** `api-live/gap-better-auth-catchall-subroutes#1` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/http/authMiddleware.ts:30-37, :76-82, :196-208; apps/server/src/routes/auth.ts:23-28
- **Вплив:** Неавтентифікований зловмисник може: (1) вприскувати у журнал безпеки й метрику authAttemptsTotal{op=sign_in} фальшиві події входу з обраним emailHash (у т.ч. outcome=ok), отруюючи brute-force тріаж — зашумити дашборд, щоб сховати реальну атаку, або сфабрикувати 'успішний вхід' у акаунт жертви; (2) палити per-account sign-in бакет жертви (10/15хв) через дешеві не-sign-in шляхи без scrypt-коштів справжнього /sign-in — підсилення account-lockout DoS; (3) випадково наражати легітимні запити (callbackURL=/sign-in у query) на спільні auth-бакети. Ідентично в проді (підрядкова логіка безумовна).
- **Що зробити:** Класифікувати auth-операцію й застосовувати лімітери та op за нормалізованим path (req.path / pathname), а не за повним originalUrl; звіряти з точними шляхами (startsWith/рівність), а не includes.

**Докази:**

```text
Усі три middleware роблять url.includes('/sign-in') на req.originalUrl, який містить query. Control POST /api/auth/send-verification-email -> 200 БЕЗ RateLimit-* заголовків. Tricked POST /api/auth/send-verification-email?redirect=/sign-in -> 200 з RateLimit-Limit:10, RateLimit-Remaining:9 (спрацював per-account credential-бакет). Лог-доказ: POST /api/auth/send-verification-email?x=/sign-in з {email: logpoison_marker_...} (emailHash 9272486f4f43) -> у server.log зʼявився рядок {"msg":"auth_event","op":"sign_in","outcome":"ok","status":200,"emailHash":"9272486f4f43"} — успішний вхід, якого не було, від неавтентифікованого виклику.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-gap-better-auth-catchall-subroutes/04-bearer-overmatch-social.mjs (control vs tricked); node .../05-logpoison.mjs потім grep emailHash 9272486f4f43 у server.log -> counterfeit op:sign_in outcome:ok.
```

**Верифікатор:**

```text
Reproduced, both in code and live. All three middlewares in apps/server/src/http/authMiddleware.ts (lines 30-37, 76-82, 196-208) match with `req.originalUrl.includes(...)`. Express's originalUrl keeps the query string, so a substring that appears only in the query is enough to classify the request. Live check: control `POST /api/auth/send-verification-email` returned 200 with no RateLimit-* headers. `POST /api/auth/send-verification-email?cb=/sign-in` returned 200 with RateLimit-Limit:10 / Remaining:9, so the per-account bucket ran. `POST /api/v1/auth/send-verification-email?next=request-password-reset` behaved the same way. server.log then got a forged `{"msg":"auth_event","op":"sign_in","outcome":"ok","status":200,"emailHash":"56ac6edcbe3f"}` and a forged `op:"forget_password",outcome:"ok"` (emailHash b73573574efa) from unauthenticated calls that are not sign-in. So log/metric forging and consumption of the victim's `api:auth:account` bucket (shared key `a:<sha256(email)>`) are real. I downgraded severity for three reasons. (a) There is no lockout amplification. A real `/sign-in/email` with a wrong password burns the same per-account bucket at the same rate of one request per slot, and the per-IP bucket of 5/60s is spent too (authSensitiveRateLimit over-matches the same way). The only gain is stealth: the forged events go out at info level with outcome=ok and only the /24 ipPrefix, while real bad_credentials events go out at warn level with the full IP. (b) The 'legitimate clients get rate-limited' scenario is speculative. Better Auth POSTs send callbackURL in the JSON body, not the query. (c) There is no data access or auth bypass. The impact is integrity and attribution of security telemetry: auth_attempts_total, the auth SLI error ratio in recording_rules.yml, and brute-force triage.
```

**Додаткові докази верифікатора:**

```text
Verifier script <scratch>/agents/verify-api-live-gap-better-auth-catchall-subroutes/v1-overmatch.mjs. Output: control rl=null; tricked rl=10 rem=9; v1+request-password-reset rl=10 rem=9. server.log lines 29273/29279 hold forged auth_event op=sign_in / op=forget_password with outcome=ok, ipPrefix 127.0.0.0/24 only (networkOriginFor drops the full IP for outcome=ok). docs/operations/observability/prometheus/recording_rules.yml:117-122 builds the auth SLI as error/total over auth_attempts_total, so forged 'ok' events dilute it. Bucket key: config/rateLimit.ts AUTH_ACCOUNT_RATE_LIMIT key 'api:auth:account', shared by every targeted path.
```

### [low] /api/sync/audit: фільтри не знають значень v2 (`v2_push`, `partial`), а відхилення валідації пишуться як conflict

- **ID:** `api-live/sync-live#11` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/audit.ts:51-63 (op_type enum push/pull/push_all/pull_all; outcome без partial); syncV2-core.ts recordSyncV2 (op_type v2_push/v2_pull, conflict = outcome==='conflict')
- **Вплив:** Інцидент-аналіз через аудит-ендпоінт не може відфільтрувати жодного v2-рядка за типом операції чи partial-результатом, а метрика конфліктів змішує LWW-конфлікти з відмовами валідації/неіснуючими таблицями.
- **Що зробити:** Розширити enum op_type до v2_push/v2_pull (або прибрати старі значення), додати partial в outcome; писати conflict=true лише коли в батчі є lww_conflict.

**Докази:**

```text
GET /api/sync/audit?op_type=v2_push → 400 {"fieldErrors":{"op_type":["Invalid option: expected one of \"push\"|\"pull\"|\"push_all\"|\"pull_all\""]}}
GET /api/sync/audit?op_type=push → 200 rows=0
GET /api/sync/audit?outcome=partial → 400, хоча в БД є рядки outcome=partial (synclive3: v2_push/partial 3)
Push із самими table_not_allowed → рядок аудиту outcome=conflict, conflict=true.
Чужий user_id → 403 (ок), без сесії → 401 (ок).
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t08_audit.mjs
```

**Верифікатор:**

```text
I reproduced it live (d4/v11_audit.mjs, user vsyncb2) and confirmed it in code. audit.ts:51 allows op_type only in [push,pull,push_all,pull_all], and outcome (lines 53-63) has no 'partial'. The v1 audit writers are gone: the only writer is recordSyncV2 (syncV2-core.ts:134), which writes op_type v2_push/v2_pull and conflict = (outcome==='conflict'). The whole DB holds only v2 rows: v2_pull/empty=2560, v2_pull/ok=885, v2_push/conflict=418, v2_push/ok=1288, v2_push/partial=40. So ?op_type=v2_push and v2_pull return 400, ?op_type=push returns 200 with 0 rows, and ?outcome=partial returns 400 although partial rows exist. A push containing only table_not_allowed, or only clock_skew, produced an audit row v2_push/conflict with conflict=true. The v2 'conflict' outcome means 'applied=0 and rejected>0' (syncV2.ts:602-609), so the conflict flag mixes LWW conflicts with validation-type rejects. Impact is limited: the endpoint has no UI consumer (self/admin, manual use), and unfiltered listing plus module=v2 still work. Related staleness I found, not in the finding: the recording rule sli:sync_conflict:ratio_rate1h filters op=~'push|push_all', so it never matches v2 ops. Low severity is right.
```

**Додаткові докази верифікатора:**

```text
push table_not_allowed only → ['rejected:table_not_allowed'] → audit row 'v2_push/conflict/conflict=true'; clock_skew only → same; mixed → 'v2_push/partial/conflict=false'. GET /api/sync/audit?op_type=v2_push → 400 'expected one of "push"|"pull"|"push_all"|"pull_all"'; ?op_type=push → 200 rows=0; ?outcome=partial → 400; ?module=v2 → 200 rows. docs/operations/observability/prometheus/recording_rules.yml:91-95 uses op=~"push|push_all".
```

### [low] /status віддає з кешу SW «Усі сервіси працюють · оновлено щойно», коли бекенд висить або мережі немає

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#7` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/sw/cache.ts:150-175 (NetworkFirst для будь-якого /api/*, networkTimeoutSeconds 5), apps/web/src/sw/cachePolicy.ts:31-36 (/api/status не у VOLATILE_API_PREFIXES), apps/web/src/core/status/StatusPage.tsx:81 (fetch("/api/status")); URL http://127.0.0.1:4173/status
- **Вплив:** Статус-сторінка показує «все працює, щойно оновлено» саме тоді, коли бекенд недоступний або висить, тобто коли людина й відкриває її, щоб перевірити.
- **Що зробити:** Додати `/api/status` у VOLATILE_API_PREFIXES (або фетчити з `cache: "no-store"` і заголовком, який SW оминає), показувати час відповіді сервера, а не клієнта. Перевірити, що /api/status на web-origin у проді взагалі доходить до бекенду (apiUrl()).

**Докази:**

```text
19-status-hang.mjs (анонім): online → OK; route /api/status «висить» 9 с → сторінка: «Усі сервіси працюють · оновлено щойно … API server Працює» (route hits: `hang sw=true`, тобто запит робив SW і впав у кеш після 5 с); при 503 → «Не вдалося завантажити статус». 17-profile-offline.mjs: повністю офлайн → той самий зелений статус. Screenshots: 19-status-hang.png, 17-offline_status.png. Додатково (не перевірено на проді): StatusPage ходить на відносний /api/status на web-origin, а у vercel.json rewrite виключає `api/` і проксі немає, тож у проді запит, імовірно, дає 404.
```

**Відтворення:**

```text
node 19-status-hang.mjs
```

**Верифікатор:**

```text
Reproduced with an anonymous user. After one successful load of /status, I made /api/status hang. The page then showed «Усі сервіси працюють оновлено щойно … API server Працює», and the route hits confirm the request came from the SW (`hang sw=true`). A 503 response shows the error state correctly. Cause: cachePolicy.shouldUseRuntimeCache sends every GET /api/* (except auth and the VOLATILE prefixes) through NetworkFirst with networkTimeoutSeconds 5, and /api/status is not in VOLATILE_API_PREFIXES. Two corrections to the finding. The timestamp is the server's `timestamp` from the cached body (status.ts:172, rendered at StatusPage.tsx:215). «щойно» appeared only because the cache entry was seconds old; an older entry would show «N хв тому», so the «client time» part of the recommendation is a misreading. The stale window is also capped at 30 min by ExpirationPlugin maxAgeSeconds, so it only bites if /status was opened successfully within the previous 30 min. The side note that /api/status probably 404s in prod is unlikely: apps/web/middleware.ts is a Vercel Edge middleware that proxies /api/* to BACKEND_URL. Low severity.
```

**Додаткові докази верифікатора:**

```text
verify dir v19.log: `hang: ... Усі сервіси працюють оновлено щойно API server Прац...`, `503: ... Не вдалося завантажити статус`, `route hits ["ok sw=false","ok sw=true","hang sw=true","503 sw=true"]`. Code: sw/cachePolicy.ts:30-35 (no /api/status), sw/cache.ts:157-175 (NetworkFirst 5 s, maxAge 30 min).
```

### [low] /pricing?checkout=success показує «Підписку активовано, Premium уже діє» безумовно, незалежно від реального статусу

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#17` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/core/PricingPage.tsx:143-172 (toast.success(t.toast.subscriptionActive) лише за query-параметром)
- **Вплив:** Людина бачить підтвердження активації, хоча план лишається Free: з’являються звернення «оплатив, а Premium немає», навіть якщо вебхук просто запізнюється.
- **Що зробити:** Після інвалідації billingKeys.status показувати «активовано» лише коли status підтверджує активну підписку, інакше писати «Оплату отримано, активуємо… (до хвилини)» і робити polling.

**Докази:**

```text
s46b (free-юзер без підписки): відкриття http://127.0.0.1:4173/pricing?checkout=success → тост «Підписку активовано, Premium уже діє. | Перейти у налаштування»; billing/status при цьому `state:"free"`.
```

**Відтворення:**

```text
Залогінений free-користувач відкриває /pricing?checkout=success (стара вкладка, поділене посилання, затримка вебхука).
```

**Верифікатор:**

```text
Відтворено. Free-користувач verify-onbai-1 (GET billing/status → access.state "free", subscription.active false) відкриває /pricing?checkout=success і бачить тост «Підписку активовано, Premium уже діє. | Перейти у налаштування». PricingPage.tsx:143-172 показує toast.success лише за query-параметром: перед тостом є тільки invalidateQueries, статус підписки не перевіряється. Додатковий аргумент: liqpay.ts:400 (result_url) і plata.ts:281 (redirectUrl) ставлять `/pricing?checkout=success` безумовно, а платіжні сторінки зазвичай повертають на цю адресу і після невдалої оплати, тож тост може збрехати і при відмові картки. Чому low: зараз Premium на /pricing позначено «Скоро», тож checkout у проді, ймовірно, не відкритий.
```

**Додаткові докази верифікатора:**

```text
x17b.mjs: `success final url: http://127.0.0.1:4173/pricing toasts seen: ["Підписку активовано, Premium уже діє. | Перейти у налаштування", ...]`; x16-api.mjs: `#17 billing/status: 200 {"subscription":{..."active":false...},"access":{"state":"free"...`.
```

### [low] /welcome і /onboarding відкривають онбординг заново для вже онбордженого залогіненого користувача; «Почати» мовчки перезаписує activeModules на сервері

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#7` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/core/onboarding/route.tsx (Component без guard-а на isOnboardingDone/auth); http://127.0.0.1:4173/welcome, /onboarding, /onboarding/&lt;будь-що&gt;
- **Вплив:** Повернення на старий лінк скидає вибір модулів на сервері й ховає модулі з наявними даними. Кнопка «У мене вже є акаунт» для залогіненого збиває з пантелику.
- **Що зробити:** У route для /welcome і /onboarding/* редіректити на / при isOnboardingDone() або status==='authenticated' з наявними activeModules. Невідомі підшляхи /onboarding/* віддавати на 404 або редіректити.

**Докази:**

```text
r-s7 (obai-fresh4: залогінений, онбординг пройдено, є витрата 85 ₴): `authed /welcome -> http://127.0.0.1:4173/welcome`, на /onboarding повний екран «З чого почати?» з кнопкою «У мене вже є акаунт», хоча людина вже залогінена. Після зняття Фінік/Фізрук/Їжа і «Почати»: prefs before `"activeModules":null` → prefs after `"activeModules":["routine"]`. Модуль Фінік із даними вимкнено без попередження. Також /onboarding/foo рендерить той самий екран.
```

**Відтворення:**

```text
Залогінений користувач із даними відкриває http://127.0.0.1:4173/onboarding (закладка, лінк із лендингу чи листа) → зніми кілька модулів → «Почати». Скрипт: r-s7.mjs
```

**Верифікатор:**

```text
Confirmed only in part. /welcome is guarded: in StandaloneRoutes, the WELCOME_PATH entry redirects authenticated users to /, and in my run a signed-in user on /welcome was redirected to /. The original 'authed /welcome stays' observation was most likely a timing artefact. /onboarding/* is the real problem. router.tsx sends `onboarding/*` to onboarding/route.tsx, which renders WelcomeScreen with no auth or isOnboardingDone guard. A signed-in user gets the full onboarding with «У мене вже є акаунт», and so does /onboarding/foo. Picking a subset and pressing «Почати» sends PATCH /me/preferences {activeModules:[...]}, which silently overwrites the server's module selection. No data is deleted; the modules are just hidden and can be turned back on. Reachability is low: nothing in web, landing or server links to /onboarding (only a Sentry sample-rate entry mentions it), so it takes a manually typed or old URL. Low is the right severity.
```

**Додаткові докази верифікатора:**

```text
v7-onb.mjs with my pool user. authed /welcome → http://127.0.0.1:4173/ (redirected). authed /onboarding and /onboarding/foo both render «Почати» and «У мене вже є акаунт». After deselecting Фінік/Фізрук/Їжа and pressing «Почати»: PATCH /api/v1/me/preferences {"activeModules":["routine"]}, with prefs going from null to ['routine'].
```

### [low] Два різні «денні бюджети» для одного плану: Планування 1 049 ₴/день проти Огляду 1 033 ₴

- **ID:** `browser-surfaces/finyk-flows#9` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** http://127.0.0.1:4173/finyk/budgets («План на місяць») і http://127.0.0.1:4173/finyk («Лишилось на сьогодні»)
- **Вплив:** Один модуль дає дві різні відповіді на «скільки можна витрачати на день», і користувач не знає, якій вірити.
- **Що зробити:** Звести до однієї функції денного ліміту в finyk-domain і показувати те саме число (з однаковою кількістю днів) на обох екранах.

**Докази:**

```text
r3-23-plan.mjs: план витрат 31 000 ₴, сьогодні (2 жовтня) витрачено 555 ₴. Планування показує «2% витрачено 1 049 ₴/день · 29 дн.», Огляд — «478 ₴ Лишилось на сьогодні · В межах плану витрачено 555 ₴ із 1 033 ₴». Формули різні: (31000−555)/29 проти 31000/30. Скрін shots/finyk-flows/r3-plan-overview.png.
```

**Відтворення:**

```text
Задати «План витрат» 31 000, додати витрату 555 за сьогодні, порівняти Планування й Огляд.
```

**Верифікатор:**

```text
Формули справді різні. Планування: getMonthlyPlanUsage (packages/finyk-domain/src/domain/budget.ts:~595-617) рахує floor((planExpense − totalFact)/daysLeft), де daysLeft = daysInMonth − day (сьогодні НЕ входить), без recurring-потоків. Огляд: useOverviewData.ts:431-446 рахує dayBudget = (planExpense − spentBeforeToday − recurringOut + recurringIn)/remainingDays, де remainingDays включає сьогодні. Документовано лише формулу Огляду (ADR-0079, spec finyk-hero-month-strip, finyk.md журнал 2026-09-01). Що Планування має навмисно показувати інше число, ніде не сказано. За наявності підписок розбіжність буде ще більшою, бо Огляд враховує recurringOut/In, а Планування ні.
```

**Додаткові докази верифікатора:**

```text
v2-finyk.mjs (2 жовтня, Europe/Kyiv): план витрат 31 000, сьогодні витрачено 588 ₴. Планування: «2% витрачено 1 048 ₴/день · 29 дн.»; Огляд: «445 ₴ Лишилось на сьогодні · В межах плану витрачено 588 ₴ із 1 033 ₴». Відтворено незалежно: (31000−588)/29 = 1048,7, а 31000/30 = 1033,3.
```

### [low] Поля замірів парсяться через Number(): «1e2» зберігається як 100 кг, «0x50» як 80 см, а невалідне значення в одному полі тихо відкидається

- **ID:** `browser-surfaces/fizruk-flows#11` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/pages/Measurements/AddMeasurementForm.tsx:160-166 (Number(v.replace(',', '.')) замість parseDecimalInput)
- **Вплив:** Одруківки й вставлений текст тихо стають іншими числами або зникають без повідомлення, що псує історію ваги й обхватів. Спільний парсер, який це вже вирішує, тут не використаний.
- **Що зробити:** Використати parseDecimalInput і показувати помилку поля для not-a-number, а не відкидати значення мовчки.

**Докази:**

```text
meas.mjs на /fizruk/measurements: «weight abc + waist 80» → errors=[] і збережено лише «Талія: 80 см» (про вагу ані слова); «weight 1e2» → «Вага: 100 кг»; «waist 0x50» → «Талія: 80 см». Для порівняння форма «Записати сьогодні» на /fizruk/body (parseDecimalInput) на «abc»/«1e2» показує «Вага має бути від 20 до 300 кг».
```

**Відтворення:**

```text
/fizruk/measurements → ВАГА «1e2» → «Зберегти замір» → в історії «Вага: 100 кг».
```

**Верифікатор:**

```text
Підтверджено кодом. AddMeasurementForm.tsx:160-166 парсить кожне поле як Number(v.replace(',', '.')) і мовчки пропускає не-скінченні значення. Number('1e2') дорівнює 100, Number('0x50') дорівнює 80, і обидва значення проходять measurementSchema, бо лежать у межах. Спільний parseDecimalInput (numberInput.ts:56-69) експоненту, hex і сміття відхиляє, але тут він не використаний. Мовчазне відкидання NaN частково задумане (коментар F4: «NaN inputs ('abc') are stripped before persisting»), проте помилки поля при цьому не показується. Тому одруківка в одному полі разом із валідним іншим губиться без сліду. Реалістичний ризик невеликий: hex і експоненту майже ніхто не вводить, а ось мовчазна втрата значення з одруківкою (наприклад «8l») цілком реальна.
```

**Додаткові докази верифікатора:**

```text
psql: op 18499 fizruk_measurements weight_kg=100, applied, від користувача 0UPrSz… (тест «1e2»). Форма «Записати сьогодні» на /fizruk/body використовує parseDecimalInput, тож поведінка двох форм ваги різна.
```

### [low] «Жорстке застереження» про recovery спрацьовує хибно (будь-який мʼяз, навіть вторинний з мізерним навантаженням, учора = red), не називає мʼяз і діє не в усіх шляхах старту

- **ID:** `browser-surfaces/fizruk-flows#12` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** packages/fizruk-domain/src/lib/recoveryCompute.ts:286-290 (ds&lt;=1 → red незалежно від навантаження); packages/fizruk-domain/src/lib/recoveryConflict.ts:66-75 (hasHardBlock і для secondary); apps/web/src/modules/fizruk/components/workouts/WorkoutsConfirmDialogs.tsx:61-70
- **Вплив:** Майже кожне наступне тренування впирається в блокувальну модалку («вовк, вовк»), тож користувачі вчаться її ігнорувати, і справжні застереження (травма) втрачають вагу. Без назви мʼяза рішення неінформоване. Непослідовність між шляхами старту.
- **Що зробити:** Для hard-block враховувати навантаження (fatigue), а не лише «≤1 доба», і лише первинні мʼязи; у діалозі перелічувати конкретні групи чи травми; застосувати ту саму перевірку до старту програми й повтору.

**Докази:**

```text
Після 5 хв «Бурпі» (0 м) і 15 віджимань «Підібрати вправи → Присідання зі штангою → Почати · 1» відкриває модалку «Є жорстке застереження… Ти позначив біль або ця група ще має червоний recovery-статус» без назви групи (shots/fizruk-flows/after-start-click-b.png). Дашборд: «Квадрицепс до вт», «Прес до вт». Старт програми «Розпочати сьогодні» і «Повторити це тренування» запускаються з тими самими «червоними» групами без жодного діалогу.
```

**Відтворення:**

```text
Зробити будь-яке тренування з вправою, де група є вторинною → наступного дня або в той самий день почати шаблон/підбір з вправою на цю групу → модалка.
```

**Верифікатор:**

```text
Підтверджено кодом і скриншотом after-start-click-b.png. recoveryCompute.ts:286-290 ставить status='red' будь-якому мʼязу з daysSince<=1 (календарні дні Києва) незалежно від fatigue, навіть якщо мʼяз зачеплено лише як вторинний з вагою 0.55 і мізерним навантаженням. recoveryConflict.ts:66-75 рахує hasHardBlock і для secondary. useWorkoutsOrchestrator.ts:389-395 на старті з шаблону чи підбору («Підібрати вправи» теж іде через startWorkoutFromTemplate, Workouts.tsx:238-248) відкриває ConfirmDialog. Його текст (WorkoutsConfirmDialogs.tsx:61-70) не називає ні групи, ні травми. useFizrukProgramStart і «Повторити» recovery не перевіряють взагалі. Канон fizruk.md §4 [ІНТЕРВ'Ю] каже «recovery — завжди порада, не гейт» і «UI ніде не блокує старт», тож блокувальна модалка на кожен «червоний» вторинний мʼяз розходиться з каноном. Діалог при цьому можна підтвердити, тому severity лишаю low.
```

**Додаткові докази верифікатора:**

```text
Додатково: startWorkoutFromTemplate викликає recoveryConflictsForExercise(ex, rec.by) БЕЗ третього аргументу activeInjurySites, тож береться дефолт NO_INJURIES. useRecovery не вносить травми в `by`: оверлей травм іде лише в ready/avoid. Отже на цьому шляху половина тексту «Ти позначив біль» спрацювати не може, і вправа на зону з позначеною травмою (ADR-0083 hard block) стартує без діалогу, якщо мʼяз не «червоний» за втомою. Канон fizruk.md:239-241 і product-knowledge-fizruk.md E5 ще називають hasHardBlock «мертвим для UI», тобто ці доки застарілі.
```

### [low] «+ Підхід» копіює попередній підхід і одразу позначає його виконаним (done = reps&gt;0): незроблені підходи потрапляють в обʼєм, PR і прогрес

- **ID:** `browser-surfaces/fizruk-flows#6` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/modules/fizruk/components/workouts/WorkoutItemCard.tsx:320-341 (seed з останнього done-сету чи «було»); apps/web/src/modules/fizruk/components/workouts/WorkoutSetRow.tsx:64-67 (isSetDone = reps&gt;0)
- **Вплив:** Хто розкладає підходи наперед (типовий план 4×8) і виконує лише частину, отримує в історії, тижневому обʼємі, recovery і PR підходи, яких не було. Це тихо псує ключові метрики модуля. Стан ✓ «виконано» на такому рядку вводить в оману.
- **Що зробити:** Розділити «підготовлений» і «виконаний» підхід: явний прапорець done, який ставить лише тап ✓. Або підставляти скопійовані значення як ghost-плейсхолдер (вже є механізм ghost), а не як справжні reps. Перед «Завершити» попереджати про незавершені підходи.

**Докази:**

```text
Мобільний в’юпорт: ввести 60×8 у підхід 1 і натиснути «+ Підхід» → другий рядок одразу 60×8 із зеленою ✓ і «2 з 2 підходів», хоча користувач нічого не робив (shots/fizruk-flows/m-session-rest.png). На сервері так само: rollback/kill-скрипти — кожне «+ Підхід» дає новий рядок 10×12, і кожен рахується як виконаний; «Завершити» не попереджає про незроблені підходи, бо формально все виконано.
```

**Відтворення:**

```text
/fizruk/workout/<active>/<item> → заповнити підхід 1 → натиснути «+ Підхід» 2–3 рази, не тиснучи ✓ → у шапці «N з N підходів» → «Завершити» → у підсумку всі ці підходи з обʼємом.
```

**Верифікатор:**

```text
«+ Підхід» (WorkoutItemCard.tsx:320-341) сідить новий рядок значеннями останнього виконаного сету, а коли таких нема, значенням «було» з минулої сесії. isSetDone = reps>0 (WorkoutSetRow.tsx:65-67), тож доданий рядок одразу виконаний: зелена ✓, «2 з 2 підходів» (скріншот finder-а m-session-focus.png це показує). Це суперечить первинному задуму аудиту 08-07 §4.3 («✓… робить лог чесним… незачекнуте не рахується»). Похідний done задокументовано як свідоме рішення, але його поєднання з копіюванням сету ніде не обговорено. Severity знижено до low. Шаблони й програми сідять reps:0, тож проблема виникає лише тоді, коли людина наперед додає рядки, яких потім не виконує. Новий PR через копію виникнути не може, бо значення дорівнюють уже наявному сету. Кошик на останньому рядку з undo дає вийти з ситуації. Псуються головно обʼєм і маркер «поточного» підходу.
```

**Додаткові докази верифікатора:**

```text
docs/work/specs/audits/2026-08-07-fizruk-deep-audit.md:403-408 (задум «незачекнуте не рахується»). Насіння з ghost при порожньому першому рядку (ghostFallback = lastFilteredSets[currentSets.length]) робить виконаними навіть рядки, додані ще до першого сету.
```

### [low] «З комори» мовчки підставляє перший збіг пошуку: «молоко» -&gt; «Молоко топлене 4%»

- **ID:** `browser-surfaces/nutrition-flows#12` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/useSourceAutoPick.ts (hit = search.foodHits[0] ?? search.offHits[0])
- **Вплив:** КБЖВ прийому з комори можуть бути завищені/занижені на десятки відсотків без явного вибору користувача.
- **Що зробити:** Автопідбір лише при точному збігу канонічного ключа (canonicalFoodKey), інакше просити вибрати продукт; надавати перевагу базовим записам корпусу.

**Докази:**

```text
Комора: «молоко 2 л». Аркуш «Додати прийом їжі» -> «З комори» -> «молоко»: картка 'Молоко топлене 4% | 84 ккал · Б 3 г · Ж 4 г · В 5 г / 100 г' (звичайне молоко 2.5-3.2% = 52-60 ккал). В іншому прогоні перший локальний збіг для «молоко» був «Молоко вівсяне».
```

**Відтворення:**

```text
Скрипт 37-consume.mjs: користувач з «молоко» в коморі, /nutrition/log -> «Додати прийом їжі» -> кнопка «молоко» у «З комори».
```

**Верифікатор:**

```text
Confirmed, with stronger evidence than the finding. Tapping a pantry item calls useMealSourcePick.onPantryItemPicked -> useSourceAutoPick.schedule, which takes search.foodHits[0] ?? search.offHits[0]. The local searchFoods ranks every 'молоко…' prefix match at score 0 and breaks ties by updatedAt. Seed items get Date.now() and random ids at seed time, so the first hit is effectively arbitrary. In two fresh contexts the first local hit for 'молоко' was 'Молоко згущене' at 321 kcal/100 g, about 6x regular milk. Mitigation: the auto-pick only moves the sheet to the fill step, where the product name and КБЖВ are shown, and saving needs an explicit tap (documented in the useSourceAutoPick header). So it is a visible pre-fill, not fully 'silent', which supports low.
```

**Додаткові докази верифікатора:**

```text
v12.mjs: for two pool users, the first local hits for 'молоко' were 'Молоко згущене | 321 ккал' then 'Молоко топлене 4% | 84 ккал'. Plain 'Молоко 2.5%' is not first even though the server API returns it first. Code refs: useSourceAutoPick.ts:83-93, useMealSourcePick.ts:63-69, foodDb.ts:254-281 (score + updatedAt tie-break), foodDb.ts:135-176 (seed ids via generatePrefixedId, updatedAt Date.now()).
```

### [low] Журнал: можна вести записи на майбутні дні, і тижнева картка рахує їх у середньому

- **ID:** `browser-surfaces/nutrition-flows#14` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/components/LogCard.tsx (shiftDate без обмеження), WeekKcalCard
- **Вплив:** Випадковий запис не на той день викривлює тижневу статистику; дві картки показують різні середні.
- **Що зробити:** Обмежити навігацію сьогоднішнім днем або явно позначати майбутні дні як план і не включати їх у фактичні середні.

**Докази:**

```text
«Наступний день» x2 -> «04.10.2026 неділя» -> додано «Майбутня вечеря 500 ккал» без попередження. Огляд: '2 498 ккал · сер. 833/день' (з майбутнім днем), а «Аналітика (тренди)»: 'Середні ккал 999 ккал за 2 активні дні'.
```

**Відтворення:**

```text
/nutrition/log -> «Наступний день» -> «Додати прийом їжі» -> зберегти; відкрити «Огляд». Скрипт 35-days.mjs
```

**Верифікатор:**

```text
Verified in code. LogCard.shiftDate has no upper bound, and formatDate labels 'Завтра', so future navigation is deliberately possible. NutritionDashboard.weekRows takes the calendar week Mon..Sun (deviceWeekStartKey()+6) through getMacrosForDateRange. computeWeekKcalChart counts any day with kcal>0 in daysLogged/avgKcal, so meals logged on later days of the current week enter the 'сер./день' figure. The analytics card's calcNutritionPeriodAverages uses caller-supplied day keys ending today, which explains the different averages (2498/3=833 vs 1998/2=999 in the finding). Logging ahead may be a legitimate planning use (addMealFromPlan comments mention future days), so the core defect is mainly the inconsistent averaging. Low.
```

**Додаткові докази верифікатора:**

```text
Code refs: apps/web/src/modules/nutrition/components/LogCard.tsx:39-50,85-87; NutritionDashboard.tsx:80-84; packages/nutrition-domain/src/weekKcalChart.ts:140-148; quickStats.ts calcNutritionPeriodAverages. Precedent: Routine got an owner-approved domain gate against future-day completion (docs/work/specs/audits/2026-09-13-product-full-review.md PR-R3, closed 2026-09-14). Nutrition has no equivalent gate or note.
```

### [low] Категоризація комори: корені «мед»/«авокадо»/«масл» дають хибні категорії й місця (сире м'ясо в «Комору»)

- **ID:** `browser-surfaces/nutrition-flows#8` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** packages/nutrition-domain/src/foodCategories.ts (корінь «мед» у pantry; «авокадо» перенесено в овочі в c7c09607; «масл» у молочних)
- **Вплив:** Сире м'ясо автоматично кладеться в комору кімнатної температури, олії потрапляють у холодильник/молочні; фільтр за місцем і список покупок показують неправдиву картину.
- **Що зробити:** Матчити «мед» лише як ціле слово/форму (мед, меду), додати правила форми для «олія X»/«масло соняшникове|оливкове» перед коренями овочів і молочних; доповнити foodCategories.test.ts цими кейсами.

**Докази:**

```text
UI (/nutrition/pantry/items, «По одному»): «Медальйони свинячі 400 г» -> «Олії, спеції та бакалія» (місце «Комора»); «Олія авокадо 250 мл» -> «Овочі», тост «Холодильник: додано»; «Масло соняшникове 1 л» -> «Молочні та яйця», «Холодильник»; «Медовик» -> бакалія. categorizeFood: Медальйони свинячі -> pantry | place: home; Олія авокадо -> vegetables | fridge; Масло соняшникове -> dairy_eggs | fridge. Скрін cat-collisions.png.
```

**Відтворення:**

```text
Додати в комору названі позиції або запустити node --import tsx agents/browser-surfaces-nutrition-flows/13-cat.mts
```

**Верифікатор:**

```text
Reproduced against categorizeFood/placeForFood at HEAD c7c09607. 'Медальйони свинячі' lands in pantry, place home: the 3-letter root 'мед' matches the start of the token 'медальйони' at position 0, and the meat roots have no 'свиняч' ('свинин' does not match). 'Олія авокадо' goes to vegetables/fridge because the corpus whole-matches the single-word entry 'Авокадо' and the corpus runs before keywords. 'Масло соняшникове' goes to dairy_eggs/fridge through the single-word corpus alias 'масло' for butter, which the code comment at foodCategories.ts:880-883 acknowledges. Mitigation: the placeForFood doc says the place is only a suggestion and the user can change it in ItemEditSheet. The misclassification is still real and plausible for user-typed names, so low is the right severity.
```

**Додаткові докази верифікатора:**

```text
Ran <scratch>/agents/verify-browser-surfaces-nutrition-flows/cat.mts. Медальйони свинячі 400 г -> pantry | home. Медальйони яловичі -> pantry. Медуза -> pantry. Олія авокадо -> vegetables | fridge. Масло соняшникове -> dairy_eggs | fridge. Масло оливкове and Масло кокосове -> dairy_eggs | fridge. Медовик and Медівник -> pantry. Extra gap from the same root-list issue: 'Ошийок свинячий' and 'Реберця свинячі' -> other, because meat has no 'свиняч' root. 'Стейк свинячий' reaches meat only through genericKeywords. Control cases: 'Олія оливкова' and 'Олія соняшникова' -> pantry (correct). None of these names appear in foodCategories.test.ts or in the pantry-categorization data/spec.
```

### [low] Комора: правка кількості приймає 1e3/0x10, «порожнє поле прибирає позицію» не правда, нульові й позамежні кількості тихо спотворюються

- **ID:** `browser-surfaces/nutrition-flows#9` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/components/ItemEditSheet.tsx (Number(normalizeAmountInput(qty)), опис Sheet); pantry single-add парсер; PantryManagerSheet (дублікати назв місць)
- **Вплив:** Неочевидні значення залишків, плутані одиниці й мовчазна заміна введеної кількості на «1 шт»; дрібні, але псують довіру до комори.
- **Що зробити:** Використати parseDecimalInput (як у формі прийому) замість Number(); виправити опис або реально прибирати позицію при порожній кількості; не показувати одиницю без числа; позамежну кількість відхиляти з помилкою, а не підміняти; заборонити дублікати назв місць без урахування регістру.

**Докази:**

```text
Правка «молоко»: '1e3' -> 'молоко 1 000 л'; '0x10' -> 'молоко 16 л'. Порожня кількість у «курка» -> рядок 'курка г' (одиниця без числа), позиція не прибрана, хоча опис аркуша каже «Порожнє поле прибирає позицію». '0' -> 'лосось 0 г' лишається як наявна без жодної позначки. Додавання «рис 99999999 кг» -> 'рис 1 шт Закінчується', «-5 кг цукру» -> 'цукру 1 шт', «0 г масла» -> 'масла 1 шт'. Місце «холодильник» створюється поряд із «Холодильник».
```

**Відтворення:**

```text
/nutrition/pantry/items -> «Редагувати <позиція>» -> поле «Кількість» = 1e3 / 0x10 / порожньо / 0 -> «Зберегти». Скрипти 14-pantry-edit.mjs, 10-pantry-add.mjs, 15-places.mjs
```

**Верифікатор:**

```text
Confirmed in code. ItemEditSheet.tsx:174-190 computes Number(normalizeAmountInput(qtyStr)), so '1e3' gives 1000 and '0x10' gives 16, and both pass the 0..100000 check. The shared parseAmountToMinor rejects exactly these shapes. The Sheet description at line 56 says «Порожнє поле прибирає позицію», but empty qty only sets qty=null: useNutritionPantries.onSaveItemEdit:375-386, and a test pins 'clears qty to null'. formatReceiptQty(null, 'г') then returns the bare unit, which renders as 'курка г'. In the add path, parseLoosePantryText sanitizeQty drops out-of-range/negative/zero qty on purpose (comment: a bare name is more honest than 'Цукор 0 г'). mergeItems.ts:166-169 then turns any bare name into '1 шт', so the user sees an invented '1 шт' and no error. usePantryPlaces.onSavePantryForm has no duplicate-name check. Partly intended: qty 0 in the edit sheet looks deliberate (only <0 is rejected; the journal uses 0 checkpoints, ADR-0077), so the '0 г without a marker' sub-claim is weak.
```

**Додаткові докази верифікатора:**

```text
verify parse.mts: 'рис 99999999 кг' -> parsed {qty:null,unit:null} -> mergeItems -> {qty:1,unit:'шт'}. '-5 кг цукру' -> name 'цукру', merged 1 шт. '0 г масла' -> merged 1 шт. The list parser also takes 'молоко 1e3 л' -> qty 1000 л. Code refs: ItemEditSheet.tsx:56,176-177; packages/nutrition-domain/src/pantryTextParser.ts:319-327,375-383; mergeItems.ts:164-169; apps/web/src/shared/lib/format/receiptQty.ts:105; usePantryPlaces.ts:80-97.
```

### [low] Після входу немає повернення на вихідну сторінку: чат обіцяє «я повернусь до розмови», а людину кидає на «/» і питання губиться

- **ID:** `browser-surfaces/public-auth-pages#6` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx (гілка SIGN_IN_PATH: `&lt;RedirectTo to="/" /&gt;`), core/hub/chat/ChatAuthGate (текст «…і я повернусь до розмови»); /chat?q=…
- **Вплив:** Розірваний конверсійний флоу: чат прямо обіцяє повернути до розмови, а ціль (чат, pricing, глибоке посилання) губиться. Людина мусить шукати її заново.
- **Що зробити:** Додати параметр `returnTo` лише для відносних same-origin шляхів (починається з '/', не з '//' чи '/\'), передавати його з useOpenSignIn/ChatAuthGate і використовувати в RedirectTo після входу. Інакше прибрати обіцянку з тексту гейта.

**Докази:**

```text
17-chat-signin-return.mjs: /chat?q=«Скільки я витратив цього тижня?» → «Увійти в акаунт» → вхід → nav `[…"/chat?q=…","/sign-in","/sign-in","/"]`, landed `/`, хаб «Головна». 09-signin-success.mjs: /sign-in?next=https://evil.example/pwn&redirect=…&callbackURL=… → після входу `http://127.0.0.1:4173/`. Параметри next/redirect ігноруються, тож open redirect немає. Серверні callbackURL на /api/auth/reset-password/* і /api/auth/verify-email з https://evil.example, //evil.example, /\evil.example повертають 403 INVALID_CALLBACK_URL (08-api-redirects.mjs).
```

**Відтворення:**

```text
Анонімно відкрий /chat?q=test, натисни «Увійти в акаунт», увійди. Опинишся на /, а не в чаті з питанням. Так само з /pricing («Увійти й почати»).
```

**Верифікатор:**

```text
Перевірив у коді й наживо (v17-return.mjs). ChatAuthGate.tsx:52 обіцяє «Вхід займе хвилину, і я повернусь до розмови», а посилання там голе href="/sign-in" без параметрів (у DOM href:"/sign-in"). Після входу гілка SIGN_IN_PATH у StandaloneRoutes.tsx:182-194 безумовно рендерить <RedirectTo to="/" />. Механізму returnTo/next у core/auth, core/app і core/hub/chat немає взагалі, а Google-вхід має callbackURL:"/" (AuthContext.tsx:462,495). Авторизований /sign-in?returnTo=%2Fchat…&next=%2Fchat приземляється на "/". Тому питання з /chat?q=… (HubChatPage читає q) губиться. Open redirect немає, параметри ігноруються. Це UX-розрив з невиконаною обіцянкою в копії, без шкоди даним, тож low.
```

**Додаткові докази верифікатора:**

```text
anon /chat?q=…: gate:true, href:"/sign-in", текст «…і я повернусь до розмови». authed /sign-in?returnTo=/chat?q=test → lands "/". hubChatUtils.ts:77 CHAT_AUTH_REQUIRED_TEXT дає ту саму обіцянку.
```

### [low] Аноніму «Спробувати Premium» показує «Оплата тимчасово недоступна» замість пропозиції увійти

- **ID:** `browser-surfaces/public-auth-pages#8` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/PricingPage.tsx:176-215 (handlePremiumCta), :378-380 (onPremiumClick без перевірки signedOut); POST /api/v1/billing/checkout
- **Вплив:** Відвідувач, готовий платити, отримує хибне повідомлення про недоступність оплати й іде у waitlist замість реєстрації. Втрата конверсії й неправдиве пояснення.
- **Що зробити:** У handlePremiumCta для `signedOut` вести на вхід (з returnTo=/pricing), як це робить handleSignInCta, а 401 від checkout трактувати як «потрібен вхід».

**Докази:**

```text
19-pricing.mjs [anon]: клік «Спробувати Premium» → `401 POST /api/v1/billing/checkout {"error":"Потрібна автентифікація"…}` → alert «Оплата тимчасово недоступна. Можеш залишити email нижче, напишу, коли можна буде оплатити.» Скрін pricing-premium-click-anon.png. Free-CTA для аноніма правильно веде на вхід (handleSignInCta).
```

**Відтворення:**

```text
Анонімно відкрий /pricing і натисни «Спробувати Premium».
```

**Верифікатор:**

```text
Відтворено. `handlePremiumCta` (PricingPage.tsx:176-215) не перевіряє `signedOut` і ловить будь-яку помилку однією гілкою: `setCheckoutError(t.errors.checkoutUnavailable)`. Для аноніма сервер відповідає 401 (`requireSession()` на POST /api/billing/checkout, routes/billing.ts:110-112), і UI показує «Оплата тимчасово недоступна…», хоча Free-CTA для гостя веде на вхід. Але повідомлення зараз не хибне. Premium не запущений (ціна «Скоро», uk.pricing.ts:35), провайдерів немає, і залогінений userA отримує той самий текст через 400 PROVIDER_UNAVAILABLE. Тож сьогодні анонім потрапляє у waitlist так само, як і всі. Втрата конверсії й неправда з'являться, коли оплату ввімкнуть. Тоді клієнт мав би розрізняти 401 і вести на вхід. Severity лишаю low: проблема поки латентна.
```

**Додаткові докази верифікатора:**

```text
v1-pricing.mjs: [anon] `401 POST /api/v1/billing/checkout {"code":"UNAUTHORIZED"}` → alert «Оплата тимчасово недоступна…»; [userA] `200 GET /billing/providers {"providers":[]}`, `400 POST /billing/checkout {"code":"PROVIDER_UNAVAILABLE"}` → той самий alert. Скріни premium-click-anon.png / premium-click-userA.png у scratchpad/agents/verify-browser-surfaces-public-auth-pages/.
```

### [low] /pricing?checkout=success показує «Підписку активовано, Premium уже діє» будь-кому без перевірки статусу

- **ID:** `browser-surfaces/public-auth-pages#9` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/PricingPage.tsx:143-173
- **Вплив:** Будь-яке посилання (або повернення від провайдера до вебхука) стверджує, що Premium діє, коли це не так. Звідси плутанина і звернення в підтримку; також можна підробити «успішну оплату» в листі чи соцмережах.
- **Що зробити:** Показувати success-toast лише після підтвердження billing/status (plan=pro, status active) для автентифікованого користувача. Інакше нейтральне «Перевіряємо оплату…».

**Докази:**

```text
37-checkout-toast.mjs, анонімний контекст: toast «Підписку активовано, Premium уже діє. Перейти у налаштування», хоча картка Premium показує «Скоро». Скрін pricing-checkout-success-anon.png. Код показує toast лише за query-параметром, не дочекавшись billingKeys.status.
```

**Відтворення:**

```text
Відкрий http://127.0.0.1:4173/pricing?checkout=success без сесії.
```

**Верифікатор:**

```text
Відтворено у свіжому анонімному контексті: /pricing?checkout=success показує toast «Підписку активовано, Premium уже діє. Перейти у налаштування». Паралельно GET /billing/status відповідає 401. Ефект у PricingPage.tsx:143-173 показує success-toast лише за query-параметром. Інвалідація `billingKeys.status` іде паралельно, і на результат ніхто не чекає. Знахідку посилює ще одне: success-URL провайдерів безумовний. `liqpay.ts:400` `result_url: .../pricing?checkout=success`, `plata.ts:281` `redirectUrl: .../pricing?checkout=success`. LiqPay і Plata повертають користувача на цю адресу після завершення оплати, у тому числі неуспішної. Отже після запуску білінгу toast «Premium уже діє» побачить і людина з відхиленою карткою. Зараз білінг не запущений, тому low.
```

**Додаткові докази верифікатора:**

```text
v2-checkout-toast.mjs [anon]: toasts ["Завантаження…","Підписку активовано, Premium уже діє.Перейти у налаштування"], api: `401 GET /api/v1/billing/status`. Перша спроба (друга вкладка в тому ж контексті) показала екран «Sergeant уже відкрито в іншій вкладці». Це артефакт мого скрипта, не знахідки.
```

### [low] /onboarding не має auth-гейту: залогінений бачить анонімний сплеш з «У мене вже є акаунт», а «Почати» перезаписує activeModules акаунта

- **ID:** `browser-surfaces/route-matrix#3` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/core/onboarding/route.tsx:32-46 (рендерить WelcomeScreen безумовно); порівняти з гейтом /welcome у apps/web/src/core/app/StandaloneRoutes.tsx (~рядки 420-445: `if (!authLoading &amp;&amp; user) return &lt;RedirectTo to="/" /&gt;`)
- **Вплив:** Документований канонічний маршрут дає залогіненому користувачеві повторно пройти онбординг. Пікер стартує з «усі чотири ввімкнено», а не з поточного вибору, і тихо перезаписує налаштування модулів акаунта на всіх пристроях. Також пропонує увійти в акаунт, у який людина вже увійшла (той самий дефект, який для /welcome закрили в аудиті 2026-08-04, знахідка 5).
- **Що зробити:** Застосувати в onboarding/route.tsx той самий гейт, що й для /welcome: `!authLoading &amp;&amp; user` → `&lt;Navigate to="/" replace&gt;`, з тими ж умовами storageReady/shouldShowOnboarding. Або прибрати маршрут, якщо на нього ніщо не посилається (жодного Link у коді немає).

**Докази:**

```text
Авторизований (pool03 і pool27): /onboarding і /onboarding/step-2 показують «З чого почати?», «Почати» і кнопку «У мене вже є акаунт» (скрін shots/browser-surfaces-route-matrix/d_onboarding.png). При цьому /welcome того ж юзера редиректить на `/`. Після зняття Фінік і Рутина та «Почати»: GET /api/v1/me/preferences до: `"activeModules":null`, після: `"activeModules":["fizruk","nutrition"]`. Хаб показує «Фінік: неактивний…», «Рутина: неактивний…» і знову FTUX-hero «З чого хочеш почати?». Попередній аудит (2026-09-01-product-audit/progress.md) фіксував для `/welcome, /onboarding/*` поведінку «залогінений → /», тобто це регресія.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/onb.mjs (юзер route-matrix-shop). Вручну: залогінитись, відкрити /onboarding, зняти модулі, натиснути «Почати», потім перевірити /api/v1/me/preferences.
```

**Верифікатор:**

```text
Відтворено на авторизованому vrm-shop-1. Контроль: `/welcome` редиректить на `/`. А `/onboarding` лишається на `/onboarding`, показує «З чого почати? Усі чотири ввімкнено…», «Почати» і кнопку «У мене вже є акаунт» (count=1). Зняв Рутину й Фінік і натиснув «Почати». У /api/v1/me/preferences `activeModules` змінився з null на ["fizruk","nutrition"] (updatedAt 04:03:35), хаб показує «Модулів увімкнено: 2 з 4» і FTUX «З чого хочеш почати?». У коді onboarding/route.tsx:32-45 рендерить WelcomeScreen без жодного гейту на `user`/`authLoading`, тоді як /welcome у StandaloneRoutes.tsx має `if (!authLoading && user) return <RedirectTo to="/" />` (той самий фікс знахідки 5 аудиту 2026-08-04). `completeOnboarding` викликає `pushActiveModules(picks)`. Severity знижено до low. На `/onboarding` у коді немає жодного Link чи navigate, тож сюди потрапляють лише вручну введеним URL або старою закладкою. Перезапис модулів стається тільки після явного вибору і натискання «Почати». Шкода в тому, що анонімна копія та «вже є акаунт» показуються залогіненому, а пікер стартує з «усі чотири» замість поточного вибору.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/onb.mjs. prefs before: "activeModules":null; prefs after: "activeModules":["fizruk","nutrition"]. grep ONBOARDING_PATH знаходить лише appPaths.ts (визначення та isOnboardingPath) і sentry.ts (sample rate), навігаційних посилань немає. Скрін: shots/verify-browser-surfaces-route-matrix/onb_authed.png, onb_hub_after.png.
```

### [low] Нормалізація URL непослідовна: кінцевий слеш і регістр дають 404 на standalone-сторінках, а модулі відкриваються, але показують не ту сторінку

- **ID:** `browser-surfaces/route-matrix#8` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx:480-505 (`entry.paths.includes(pathname)`, точний збіг); apps/web/src/modules/finyk/hooks/useFinykRoute.ts:121-127 (case-sensitive `startsWith("/finyk")`) проти case-insensitive матчингу React Router; appPaths.ts titleForPath
- **Вплив:** Зовнішні посилання з кінцевим слешем або в іншому регістрі (пошта, месенджери, рекламні лінки, ручний ввід) на юридичні сторінки, тарифи й вхід ведуть на 404. Для модулів відкривається не та вкладка, а title не відповідає вмісту.
- **Що зробити:** Нормалізувати pathname один раз на вході (у RootLayout або в beforeunload-редиректі): прибирати кінцевий слеш, згортати дублікати слешів, приводити до нижнього регістру через `&lt;Navigate replace&gt;`. Робити lookup у STANDALONE_ROUTES за нормалізованим шляхом.

**Докази:**

```text
404 «Сторінку не знайдено»: `/pricing/`, `/legal/privacy/`, `/sign-in/`, `/welcome/`, `/status/`, `/profile/`, `/PRICING`, `/SIGN-IN`, `/Legal/Privacy`, `/index.html`. Водночас працюють `/finyk/`, `/nutrition/log/`, `/settings/`, `/insights/`, `/Settings`, `/Insights`. `/FINYK` рендерить Фінік із загальним title «Sergeant · Твій персональний хаб життя»; `/Finyk/Budgets` показує «Огляд» замість «Бюджетів». `//finyk` і `///` дають 404. Сам appPaths.isOnboardingPath прямо нормалізує слеш («/welcome/ — той самий екран»), тобто намір нормалізації є, але в реєстрі standalone-маршрутів його немає.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/edges.mjs (див. edges-auth.log); вручну відкрити /pricing/ або /legal/privacy/.
```

**Верифікатор:**

```text
Відтворено на HEAD c7c09607. `renderStandaloneRoute` шукає маршрут точним збігом (`entry.paths.includes(pathname)`, StandaloneRoutes.tsx:480-485), а `isPathBasedModulePath` враховує регістр. Тому кінцевий слеш або інший регістр на standalone-сторінці дає `<NotFoundPage/>`. Для модулів React Router матчить `finyk/*` без урахування регістру (caseSensitive за замовчуванням false), а `pathnameToSegments` у useFinykRoute.ts перевіряє регістрозалежний `startsWith("/finyk")` і повертає `[]`, тож рендериться overview. `titleForPath` теж шукає `MODULE_TITLES["FINYK"]`, не знаходить і віддає APP_TITLE. На проді це не нейтралізовано: в apps/web/vercel.json немає `trailingSlash`, а SPA-rewrite віддає index.html на будь-який шлях. Наміри нормалізувати є лише в `isOnboardingPath`. Severity low лишаю: падіння немає, 404 має кнопку «На головну», і такі варіанти URL трапляються рідко.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/rm2.mjs (anon; лог у rm2-anon.json). 404 «Сторінку не знайдено» на /pricing/, /PRICING, /legal/privacy/, /Legal/Privacy, /sign-in/, /SIGN-IN, /status/, /welcome/, /index.html. /finyk/ дає Огляд із title «Sergeant · Фінік». /FINYK дає h1 «Огляд», але title «Sergeant · Твій персональний хаб життя». /Finyk/Budgets дає h1 «Огляд» замість «Бюджети». З userA ті самі результати для /FINYK і /Finyk/Budgets.
```

### [low] «N разів на тиждень»: рядки «Активність по звичках» рахують кожен невідмічений день провалом і не сходяться зі «Зведенням»

- **ID:** `browser-surfaces/routine-flows#4` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** packages/routine-domain/src/habitRangeRows.ts:121-171; http://127.0.0.1:4173/routine/stats; також DayReportSheet (денний звіт)
- **Вплив:** Для гнучких звичок (головна обіцянка «дні обирати не треба») статистика показує 33–56 % при виконанні за планом і суперечить сама собі на одній сторінці.
- **Що зробити:** Для isFlexibleHabit рахувати рядок через flexibleCompletionForDays (target-based), як у completionRateForRange; клітинки незакритого тижня не фарбувати як «не виконано»; у денному звіті не відносити гнучку звичку до «Пропущено», поки тижнева ціль досяжна.

**Докази:**

```text
Сценарій (clock 2026-09-26 10:00): Flex 3 (ціль 3/тиж, з 14.09) відмічено 14,15,16,21,22.
Місяць: «Flex 3 | 5/9 · 56 %», а «Лідери та аутсайдери»: «Flex 3 83 % · 5/6»; «Зведення» 26/29 (сума рядків 6+17+9=32).
Тиждень: «Flex 3 | 2/6 · 33 %», зведення 11/14 (сума рядків 3+7+6=16).
Денний звіт 2026-09-23 20:00: «Пропущено (1) | Flex 3 … 2 з 3 виконано (67 %)», хоча тижнева ціль ще досяжна. Коментар у habitRangeRows прямо вимагає, щоб рядки сходились зі «Зведенням».
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/streak2.mjs (побудова історії), statsTabs.mjs / streak3.mjs (читання /routine/stats), dayreport.mjs 2026-09-23T20:00:00+03:00.
```

**Верифікатор:**

```text
buildHabitRangeRows (habitRangeRows.ts:121-151) для гнучкої звички питає щоденний предикат habitScheduledOnDate з weekDoneCount. Кожен невідмічений день до досягнення тижневої цілі рахується як 'missed' і йде в знаменник. «Зведення» (completionRateForRange → flexibleCompletionForDays) і «Лідери» (habitCompletionRate) рахують за цільовою арифметикою тижня. Спека routine-flexible-weekly-frequency.md прямо вимагає, щоб споживачі «класу Б» (серед них habitRangeRows.ts) «не питали предикат для гнучких звичок». Власний AI-CONTEXT у habitRangeRows вимагає, щоб рядки сходились зі «Зведенням». Розбіжність підтверджена детерміновано на доменному рівні з точними числами зі знахідки. Частину про денний звіт («Пропущено» в середу, поки ціль досяжна) окремо не перевіряв, і вона дискусійніша. Основне твердження підтверджене. Low.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-routine-flows/domain_check.mts (node --import tsx на src пакета). Flex 3 (ціль 3, з 14.09) відмічено 14,15,16,21,22, сьогодні 26.09. Вікно 7 днів: рядок 2/6 (33 %), зведення 2/4. Вікно 30 днів: рядок 5/9 (56 %), зведення 5/6. Це збігається з «5/9 · 56 %» і «83 % · 5/6» у знахідці. Споживачі: HabitRangeGrid.tsx:98 → buildHabitRangeRows, HabitLeadersBlock.tsx:33 → habitCompletionRate, RoutineStatsPanel → completionRateForRange.
```

### [low] Картка звички: «Поточна серія» більша за «Найдовшу серію» (15 vs 8), а /routine/stats каже «за весь час 15»

- **ID:** `browser-surfaces/routine-flows#5` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/routine/components/HabitStatsSection.tsx:100-103 (bestStreak = maxStreakAllTime — жорсткий алгоритм) vs поточна серія з flexible-стріку; RoutineStatsPanel (flexibleMaxStreakAllTimeAcrossHabits)
- **Вплив:** Логічно неможливе число (поточна &gt; рекордної) і різні «рекорди» на двох екранах одного модуля підривають довіру до стріків — центральної мотиваційної механіки.
- **Що зробити:** У HabitStatsSection брати рекорд із flex-аналога (той самий, що в RoutineStatsPanel), щоб поточна серія завжди ≤ найдовшої.

**Докази:**

```text
Daily G щодня з 10.09: відмічено 10–16, пропуск 17, 18–25; сьогодні 26.09 10:00. Картка: «15 днів поспіль · 1 заморозка витрачено … Поточна серія 15 | Найдовша серія 8 | Усього 15» (скрін shots/routine-flows/streak-detail-Daily_G.png). /routine/stats: «Найкраща серія: сьогодні 15 · за весь час 15».
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/streak2.mjs (clock 2026-09-26T10:00+03:00, юзер routine-flows-streak) → «Деталі: Daily G».
```

**Верифікатор:**

```text
HabitStatsSection.tsx:68-103: поточна серія береться з flexibleStreakBreakdown, з grace-заморозками. «Найдовша серія» береться з maxStreakAllTime, жорсткого алгоритму, який рветься на першому запланованому пропуску. Тому поточна може перевищувати рекорд. RoutineStatsPanel використовує flexibleMaxStreakAllTimeAcrossHabits, звідси два різні «рекорди» в одному модулі. Доменний розрахунок дає рівно 15 проти 8, а flexibleMaxStreakAllTime дає 15. Це не задокументований намір: модуль streaks.ts сам каже, що продуктові поверхні мають читати гнучкі функції. Low.
```

**Додаткові докази верифікатора:**

```text
domain_check.mts: Daily G щодня з 10.09, відмічено 10–16 і 18–25, сьогодні 26.09. flexibleStreakBreakdown → days 15, graceUsed 1. maxStreakAllTime → 8. flexibleMaxStreakAllTime → 15. Re-export apps/web/src/modules/routine/lib/streaks.ts:8-23 прямо коментує: «продуктові поверхні читають гнучкі».
```

### [low] Кільце «Прогрес дня» рахує гнучку звичку, що вже виконала тижневу ціль (2/3 при 2 рядках і звіті 2 з 2)

- **ID:** `browser-surfaces/routine-flows#7` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** packages/routine-domain/src/dayProgress.ts:28-40 → streaks.ts:196-206 (flexibleCompletionForDays); apps/web/src/modules/routine/useRoutineDerivedData.ts:272-289
- **Вплив:** Головний індикатор дня ніколи не доходить до «закрито», коли гнучка звичка вже виконана на тиждень, і суперечить списку та денному звіту.
- **Що зробити:** Для однодневного прогресу передавати weekDoneCount (weekDoneCountExcludingDate), як у списку подій/heatmap, і не рахувати гнучку звичку після досягнення цілі.

**Докази:**

```text
2026-09-18 20:00, Flex 3 виконано 14,15,16 (ціль 3/3 досягнута). Список дня: лише Daily G і MWF S, обидва «Зроблено»; кільце aria-label «Прогрес дня: 2 з 3»; денний звіт: «Виконано (2) … 2 з 2 виконано (100 %)». Скрін shots/routine-flows/ring-sep18.png.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/ring18.mjs і dayreport.mjs (clock 2026-09-18T20:00+03:00, юзер routine-flows-streak).
```

**Верифікатор:**

```text
calcRoutineDayProgress (dayProgress.ts) викликає completionRateForRange на однодневному вікні. Для гнучкої звички flexibleCompletionForDays бере `weekDoneCount: 0`, тож день вважається запланованим, і target = min(1 день, 3) = 1 з done 0. Гнучка звичка з уже виконаною тижневою ціллю додає 1 у знаменник кільця. Список дня (клас А, з weekDoneCount) її не показує, бо habitScheduledOnDate з weekDoneCount=3 дає false. Звідси «2 з 3» при двох рядках «Зроблено». Відтворено детерміновано на доменному рівні.
```

**Додаткові докази верифікатора:**

```text
domain_check.mts: 18.09, Flex 3 відмічено 14,15,16, Daily G і MWF S відмічено 18. calcRoutineDayProgress → {completed:2, scheduled:3}. habitScheduledOnDate(flex, '2026-09-18', {weekDoneCount: 3}) → false, тобто в списку дня її немає. Виклик: useRoutineDerivedData.ts:272-289.
```

### [low] Серія днів у нормі калорій падає в 0 після першого прийому їжі і повертається ввечері

- **ID:** `client-static/domain-logic#10` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/nutrition-domain/src/kcalStreak.ts:73 (і докстрінг :38-46); споживач apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:203-210
- **Вплив:** Увесь день після сніданку людина з 29-денною серією бачить 0; віха серії залежить від години перегляду.
- **Що зробити:** Для i===0 пропускати день, поки kcal &lt; нижньої межі норми (недобір — ще не промах), обривати лише при перевищенні верхньої межі.

**Докази:**

```text
Сьогодні пропускається лише при `kcal === 0`; будь-який запис нижче 95 % цілі обриває серію. Скрипт f6: `29 good days, today nothing logged -> 29`, `today breakfast 450 -> 0`, `today 1950 (in norm) -> 30`. Докстрінг каже протилежне: «якщо сьогодні ще не в нормі, лічильник починає з учора».
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/f6_kcal_streak.mts
```

**Верифікатор:**

```text
The logic reproduces: today is skipped only when kcal === 0 (kcalStreak.ts:73). Any partial under-target intake (breakfast 450 of 2000) breaks the streak to 0, which contradicts the function's docstring (:39-42: 'якщо сьогодні ще не в нормі, лічильник починає з учора'). The inline comment and the test 'сьогоднішній перебір обриває серію' justify only an OVERSHOOT today. The undershoot case is not covered and runs against the docstring's own reasoning, so it is not a documented intent. The visible impact is overstated, though. countKcalStreakDays has exactly one consumer: NutritionDashboard.tsx:203-210 → useStreakMilestoneCelebration (the 7/30/100 toast). The number itself is not rendered anywhere, so the user does not 'see 0'. The real effect: the milestone toast reached yesterday is not shown if the app is opened after the first meal. It is lost entirely if today ends off-norm (claims are never reset, so there is no double fire). Hence low.
```

**Додаткові докази верифікатора:**

```text
node --import tsx f6_kcal_streak.mts: 29 good days, nothing today → 29; breakfast 450 → 0; 1950 (in norm) → 30. grep countKcalStreakDays: the only non-test caller is NutritionDashboard.tsx:204. claimStreakMilestone (packages/shared/src/lib/streakMilestones.ts:107-140) never resets claims when the streak drops.
```

### [low] Незавершене вчасно тренування: ккал рахуються на всю тривалість сесії і роздувають ціль калорій

- **ID:** `client-static/domain-logic#11` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/fizruk-domain/src/lib/kcalBurned.ts (itemDurationsSec, sessionDurationSec, computeWorkoutKcalBurned); споживачі apps/web/src/modules/nutrition/hooks/useAdaptiveNutritionGoal.ts:130-143, apps/web/src/core/profile/useAverageWorkoutKcal.ts:40-67
- **Вплив:** Одне тренування, завершене наступного ранку, на два тижні піднімає денну ціль калорій (і показує тисячі «спалених» ккал).
- **Що зробити:** Обмежити тривалість, що йде в оцінку (напр. сума підходів × типовий час підходу+відпочинку, або стеля 3 год), і пропонувати виправити endedAt для сесій довших за поріг.

**Докази:**

```text
Тривалість силових вправ = (endedAt − startedAt) розподілена за кількістю підходів, без стелі (MAX_DURATION_SEC є лише у формі). Скрипт f12: 5 підходів жиму (MET 6), 80 кг: `1h session kcal: 480`, `same sets, finished 14h later: 6720`. У режимі countWorkoutsInGoal середнє /14 днів додається до цілі (+~450 ккал/день на два тижні). Обробки «забутого» відкритого тренування в useWorkoutsLifecycle немає.
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/f12_kcal_forgotten.mts
```

**Верифікатор:**

```text
The math is confirmed. In itemDurationsSec, strength items get (endedAt − startedAt) split by set count, with no cap. sessionDurationSec has no cap either. MAX_DURATION_SEC (numericBounds.ts) clamps only the cardio form input. endWorkout (useWorkouts.ts:190-210) sets endedAt = now, and useWorkoutsLifecycle has no auto-close for a stale session. A detailed session does not store kcalBurned, so the estimate is recomputed on every read. Corrections to the impact: (1) the detailed-session estimate is NOT shown anywhere. WorkoutsHome.tsx:345 displays only a stored kcalBurned (quick log/activity), so 'показує тисячі ккал' does not hold. (2) It reaches the goal only with the opt-in countWorkoutsInGoal (default false): via useAverageWorkoutKcalPerDay (/14) and the adaptive recalculation. In DailyPlanGoalSelectors the inflated average goes into the 'розрахувати з профілю' preset, which writes a PERMANENT dailyTargetKcal. The user can fix the times by hand in WorkoutTimeEditor, but nothing prompts them to.
```

**Додаткові докази верифікатора:**

```text
f12_kcal_forgotten.mts: the same 5 sets (MET 6, 80 kg) give 480 kcal for 1 h and 6720 kcal at 14 h (≈ +480 kcal/day to the 14-day average). Consumers of computeWorkoutKcalBurned in web: only useAdaptiveNutritionGoal.ts:141 and core/profile/useAverageWorkoutKcal.ts:65.
```

### [low] Аналітика: легасі ручні категорії (groceries, cafe) не зводяться до канонічних — два рядки «Продукти», тренд категорії без готівки

- **ID:** `client-static/domain-logic#13` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/finyk-domain/src/domain/selectors.ts:128-171 (computeCategorySpendIndex), packages/finyk-domain/src/domain/trends.ts:94-103; apps/web/src/modules/finyk/hooks/useAnalytics.ts:66-90, apps/web/src/modules/finyk/pages/Analytics.tsx:503-512
- **Вплив:** Для користувачів зі старими ручними записами донат і «дельти по категоріях» показують дві однакові «Продукти»; тренд категорії не бачить готівки, а ліміт бачить — різні числа про одне.
- **Що зробити:** У computeCategorySpendIndex ключувати за `canonicalManualCategoryId(cat.id)` (як categoryBucketIds у лімітах).

**Докази:**

```text
Скрипт f10 (банк Silpo 500 food + легасі ручний «groceries» 300 + «cafe» 200): `Analytics distribution: food:Продукти=500, groceries:Продукти=300, cafe:Кафе та ресторани=200`; `Limit 'food' spent: 800`; `Trend for category 'food' (Sep): 2026-09=500`. Канон manualTaxonomy: canonicalId — «у яку ця ручна категорія агрегується в бюджетах, аналітиці й палітрі».
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/f10_cat_split.mts
```

**Верифікатор:**

```text
computeCategorySpendIndex (selectors.ts:128-171) keys spend by the literal cat.id from getExpenseCategoryForTransaction, with no canonicalManualCategoryId. The Analytics page merges manual expenses into activeTx (Analytics.tsx:382-434), and useMonthlyTrend adds them through withManualExpenses. A bank 'restaurant' and a manual 'cafe' therefore become two rows, both labelled 'Кафе та ресторани'. The category trend (CategoryTrend.tsx → buildMonthlyTrend with categoryId) misses the manual part, while calcLimitCategorySpent counts it. This is not only legacy data: the onboarding preset PresetSheet.tsx:122 still writes category: "cafe" today. FinykApp.tsx:424 expects 'cafe' from the form, and the write path stores the slug as is, so new users hit it too.
```

**Додаткові докази верифікатора:**

```text
My script v13_cat.mts: bank restaurant 400 + manual 'cafe' 95 (as from the onboarding preset) → spend index {restaurant: 400, cafe: 95}; distribution ['restaurant:Кафе та ресторани=400','cafe:Кафе та ресторани=95']; limit restaurant 495; trend restaurant 2026-09=400. The related UNIFY-1-11 (unification-modules.md §1.11) covers only budgets/calcCategorySpent; the analytics instance (computeCategorySpendIndex/trends) is not named there.
```

### [low] getMonoTotals: борг на не-гривневих рахунках додається до пасивів 1:1 як гривні

- **ID:** `client-static/domain-logic#14` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/finyk-domain/src/lib/accounts.ts:76-87
- **Вплив:** Капітал/пасиви зі доларовим/євровим овердрафтом занижені в ~40 разів; асиметрія з активами, де валютні рахунки виключено.
- **Що зробити:** Фільтрувати debt тим самим UAH-правилом (і показувати лічильник виключених валютних рахунків, як для manual assets) або конвертувати за курсом.

**Докази:**

```text
balance фільтрується `currencyCode === UAH`, debt — ні. f13: `getMonoTotals([{currencyCode:840,balance:-30000},{currencyCode:980,balance:100000}])` → `{ balance: 1000, debt: 300 }` (−$300 записано як 300 ₴).
```

**Відтворення:**

```text
cd /home/user/sergeant && TZ=Europe/Kyiv node --import tsx <scratch>/agents/client-static-domain-logic/f13_misc.mts
```

**Верифікатор:**

```text
In getMonoTotals (accounts.ts:68-88), balance is filtered by currencyCode === UAH, but debt is not: isMonoDebt/getMonoDebt take any account with a negative balance or a credit limit and add its minor units /100 as hryvnias. computeAssetsSummary (aggregates.ts:142-160) and hubChatContext/finance.ts use this result for liabilities and networth. The result is an asymmetry: a currency account's positive balance is excluded from assets, while its negative one counts in liabilities at 1:1. The trigger is rare: Monobank currency accounts normally have no credit limit, and a negative balance on them is an edge case (commission reversal, overdraft). Hence low.
```

**Додаткові докази верифікатора:**

```text
My script v14_mono.mts: accounts USD −30000, EUR +50000, UAH +100000 → getMonoTotals {balance: 1000, debt: 300}; computeAssetsSummary totalAssets 1000 (EUR excluded), totalLiabilities 300 (−$300 counted as 300 ₴), networth 700.
```

### [low] Ціль накопичення в день дедлайну показує «Термін минув»

- **ID:** `client-static/domain-logic#15` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/finyk-domain/src/lib/goals.ts:255-263 (calcMonthlyNeeded); apps/web/src/modules/finyk/pages/budgets/BudgetsGoalsSection.tsx:175-186
- **Вплив:** У останній день, коли ще можна довкласти, картка каже, що термін минув, і не показує «потрібно відкласти».
- **Що зробити:** Порівнювати `target &lt; today` (строго) і прокидати `now` у calcMonthlyNeeded.

**Докази:**

```text
`target <= nowMiddayUtc` → isOverdue при target == сьогодні. f13: ціль 10 000, відкладено 9 000, targetDate = сьогодні → `{ isOverdue: true }`, label `Термін минув`. Також calculateGoalProgress приймає `now`, але calcMonthlyNeeded його ігнорує (new Date()).
```

**Відтворення:**

```text
cd /home/user/sergeant && TZ=Europe/Kyiv node --import tsx …/client-static-domain-logic/f13_misc.mts
```

**Верифікатор:**

```text
Відтворено. packages/finyk-domain/src/lib/goals.ts:64-72 (а не 255-263, як вказано в знахідці; файл має 86 рядків): `nowMiddayUtc = Date.UTC(y1,m1,d1,12)` і `target` теж нормалізовано на полудень UTC, тож при targetDate == сьогодні `target <= nowMiddayUtc` дає true → isOverdue. getGoalMonthlyLabel (budget.ts:526+) тоді повертає «Термін минув». Додатково: calculateGoalProgress рахує `daysLeft = ceil((new Date(targetDate) - now)/86400000)`, а `new Date('YYYY-MM-DD')` це північ UTC (03:00 Києва), тож у день дедлайну daysLeft=0 і GoalBudgetCard.tsx:246-249 теж пише «Термін минув». Виправлення лише calcMonthlyNeeded не допоможе, треба й daysLeft. calcMonthlyNeeded справді ігнорує `now` (використовує new Date()), але для користувача це непомітно, бо веб передає `now = new Date()`. Нейтралізатора немає; намір неоднозначний: тест calcMonthlyNeeded.test.ts:114-127 має назву «target date is today → still has at least 1 month window», але приймає обидва результати. Ціни помилки мало: показ у межах однієї доби, гроші не зачеплено. Тому low.
```

**Додаткові докази верифікатора:**

```text
TZ=Europe/Kyiv, now=2026-10-02: deadline today → daysLeft=0, monthly={monthlyNeeded:null,monthsLeft:0,isOverdue:true}, label «Термін минув»; deadline tomorrow → daysLeft=1, «Потрібно відкладати: 1 000 ₴/міс.». Скрипт: <scratch>/agents/verify-client-static-domain-logic/v15_18_misc.mts. Ті самі функції використовує мобільний BudgetsPage.tsx:434-435.
```

### [low] Мобільний огляд (domain overview.ts): «через N дн» з’їжджає на +1 через перехід на зимовий час

- **ID:** `client-static/domain-logic#17` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/finyk-domain/src/domain/overview.ts:162-164, 194-196, 228-230 (Math.ceil(ms/86400000) між host-local північчю)
- **Вплив:** Раз на рік на мобільному платежі показуються на день пізніше, «завтра» не з’являється (мобайл на паузі, баг-фікси дозволені).
- **Що зробити:** Використати kyivCalendarDaysBetween (як у web useFlowSchedule) або Math.round.

**Докази:**

```text
f13 (TZ=Europe/Kyiv): підписка з billingDay 26, дивимось 24.10.2026 (25.10 — 25-годинна доба) → `3 через 3 дн`; 25.10 → `2 через 2 дн` замість «завтра». Веб уже на kyivCalendarDaysBetween (useFlowSchedule.ts), мобільний (PlannedFlowsCard/Overview) — на цих будівниках.
```

**Відтворення:**

```text
cd /home/user/sergeant && TZ=Europe/Kyiv node --import tsx …/client-static-domain-logic/f13_misc.mts
```

**Верифікатор:**

```text
Відтворено, і зачеплено більше, ніж сказано в знахідці. overview.ts:162-164/194-196/228-230 рахують `Math.ceil((dueDate - todayStart)/86400000)` між північчю за локальним часом пристрою (parseLocalDate/kyivCalendarDate будують `new Date(y,m,d)`). Якщо інтервал перетинає кінець літнього часу (25-годинна доба 25.10), ceil додає один день. Тому всі потоки з датою після 25.10, які людина бачить до 25.10, зсунуті на +1, а не лише «раз на рік на один день»: підписка на 3.11, видима 20.10, показує 15 замість 14, борг до 01.12, видимий 20.10, показує 43 замість 42. Навесні (23-годинна доба) ceil дає правильний результат. Цими будівниками користується лише мобільний Overview.tsx:194-202. Веб (useFlowSchedule.ts) рахує через kyivCalendarDaysBetween, тож там проблеми немає. Залежить від того, що пристрій у часовому поясі з переходом на зимовий час (типово Київ). Мобільний контур на паузі (ADR-0094), але баг-фікси дозволені. Low.
```

**Додаткові докази верифікатора:**

```text
TZ=Europe/Kyiv: підписка billingDay 26, видима 2026-10-24 → daysLeft=3 «через 3 дн» (kyivCalendarDaysBetween дає 2); видима 2026-10-25 → «через 2 дн» замість «завтра»; billingDay 3, видима 2026-10-20 → 15 (правильно 14); борг до 2026-12-01, видимий 2026-10-20 → 43 (правильно 42); контроль навесні (підписка на 30.03, видима 28.03) → 2, правильно.
```

### [low] Регресія c7c09607: правило форми «згущ/топлене масло» перебиває назву продукту — вафлі, морозиво, сирки, млинці йдуть у «Бакалію» і «на полицю»

- **ID:** `client-static/domain-logic#7` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** packages/nutrition-domain/src/foodCategories.ts:995-1000, 1022-1025 (FORM_GHEE/FORM_CONDENSED у FORM_RULES, що виконуються ДО корпусу й позиційних ключових слів, :1052-1066)
- **Вплив:** Комора/список покупок групують солодощі й охолоджені продукти як «Бакалію», а місце зберігання пропонується «вдома» (кімнатна температура) для сирків і млинців — хибна підказка для швидкопсувних продуктів. Свіжий коміт HEAD.
- **Що зробити:** Застосовувати FORM_CONDENSED/FORM_GHEE лише коли збіг стоїть на початку назви (`^\s*`), або виключати конструкції з прийменником «з/зі/на … згущеним/топленим»; додати ці кейси в foodCategories.test.ts.

**Докази:**

```text
Скрипт f5 (HEAD vs c7c09607^): `Вафлі зі згущеним молоком -> pantry` (було sweets_snacks), `Морозиво зі згущеним молоком -> pantry` (sweets_snacks), `Сирок глазурований зі згущеним молоком -> pantry` (dairy_eggs), `Млинці зі згущеним молоком -> pantry` (ready_meals), `Кава зі згущеним молоком -> pantry` (drinks), `Печиво з топленим маслом -> pantry` (sweets_snacks), `Каша на топленому маслі -> pantry` (dairy_eggs). f5b placeForFood: `Сирок глазурований… now: pantry home | before: dairy_eggs fridge`, `Млинці… now: pantry home | before: ready_meals fridge`. Регекс не має якоря на голову назви, тож начинка в хвості виграє.
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/f5_foodcat.mts && node --import tsx …/f5_foodcat_prev.mts && node --import tsx …/f5b_place.mts
```

**Верифікатор:**

```text
Регресію коміту c7c09607 відтворив незалежно: зібрав попередню версію foodCategories.ts через git show c7c09607^ у власну теку. FORM_GHEE і FORM_CONDENSED (foodCategories.ts:995-1000) входять у FORM_RULES (:1022-1025), а ті виконуються раніше за корпус і ключові слова (:1060-1066). Якоря на голову назви немає, а FLAVOUR_TAIL зрізає лише «зі смаком/ароматом», тож начинка «зі згущеним молоком» чи «з топленим маслом» перебиває головне слово. Рішення власника (А′) стосується самого згущеного молока, топленого масла й гі як бакалії. Складених продуктів воно не охоплює, у тестах і спеці таких кейсів немає. Severity знижено до low: це евристика категорії й місця. Хибна підказка місця зберігання небезпеки не несе, бо людина бачить план «розкласти по місцях» до застосування (planRedistribution) і може перенести позицію.
```

**Додаткові докази верифікатора:**

```text
Власний скрипт verify-client-static-domain-logic/v7_foodcat.mts: «Вафлі зі згущеним молоком now: pantry home | prev: sweets_snacks home»; «Сирок глазурований зі згущеним молоком now: pantry home | prev: dairy_eggs fridge»; «Млинці зі згущеним молоком now: pantry home | prev: ready_meals fridge»; «Трубочки зі згущеним молоком now: pantry home | prev: dairy_eggs fridge»; «Кава зі згущеним молоком now: pantry | prev: drinks»; «Каша на топленому маслі now: pantry home | prev: dairy_eggs fridge». placeForFood використовується в resolvePlaceForItem (автомісце нових позицій) і в planRedistribution/redistributePantries (pantryPlacement.ts:57-68, 147-185).
```

### [low] Картка звички: «Найдовша серія» менша за «Поточну»; інсайт «повториш рекорд» порівнює різні метрики й одиниці

- **ID:** `client-static/domain-logic#9` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/routine/components/HabitStatsSection.tsx:72-103; apps/web/src/modules/routine/hooks/useStreakRecordPendingInsight.ts:33-52
- **Вплив:** Суперечливі числа на одній картці знецінюють рекорд; інсайт обіцяє рекорд «завтра», коли наступний крок буде через тиждень.
- **Що зробити:** У HabitStatsSection і useStreakRecordPendingInsight використати flexibleMaxStreakAllTime / flexibleMaxStreakAllTimeAcrossHabits і не змішувати тижневі серії гнучких звичок з денними.

**Докази:**

```text
Відомий клас unification-modules.md §1.22 виправлено в RoutineStatsPanel (flexibleMaxStreakAllTimeAcrossHabits), але не тут: current = flexibleStreakBreakdown (з grace), best = суворий maxStreakAllTime. f8 (1): `current = 18 | 'Найдовша серія' (maxStreakAllTime) = 11 | flexibleMaxStreakAllTime (unused) = 18`. Інсайт: current = flexibleMaxActiveStreak (дні, гнучкі звички поденно), longest = maxStreakAllTime (для гнучких — ТИЖНІ). f8b: `{ currentStreakShownAsDays: 6, longest: 7, insightFires: true }` → «Серія: 6 днів · Ще день, і повториш рекорд 7 днів» для звички «басейн 1×/тиждень».
```

**Відтворення:**

```text
cd /home/user/sergeant && TZ=Europe/Kyiv node --import tsx …/client-static-domain-logic/f8_best_vs_current.mts; node --import tsx …/f8b_record.mts
```

**Верифікатор:**

```text
In HabitStatsSection.tsx, for a non-flexible habit, current = flexibleStreakBreakdown(...).days (with grace/skip/pause), while the 'Найдовша серія' line uses strict maxStreakAllTime (:100-103). That is exactly the 1.22 class, which was fixed only in RoutineStatsPanel (flexibleMaxStreakAllTimeAcrossHabits, :60). The card hero and the record line sit side by side, so the contradiction shows. For flexible habits current and best are both in weeks, so the card is consistent there. In useStreakRecordPendingInsight.ts:33-51, currentStreak = flexibleMaxActiveStreak (days, with a flexible habit counted as done-days), while longestStreak = max(maxStreakAllTime) (strict days for daily habits, WEEKS for flexible ones). The units and algorithms are mixed, and the title 'Серія: N днів · Ще день, і повториш рекорд' is false whenever the leading habit is flexible. The insight needs the exact equality current === longest-1, so it is a coincidence-dependent case, but it does reproduce.
```

**Додаткові докази верифікатора:**

```text
Re-ran f8_best_vs_current.mts: daily habit 7 done, 1 forgiven miss, 11 done → current 18 | maxStreakAllTime 11 | flexibleMaxStreakAllTime 18. f8b_record.mts: flexible habit 1x/week, 6 Mondays, plus an old 7-day daily streak → {currentStreakShownAsDays: 6, longest: 7, insightFires: true}. The verification registry docs/work/specs/audits/verification/findings.json has UNIFY-1-22 ('Поточна серія більша за максимальну в одній картці') with status open, but its anchor is RoutineStatsPanel only (already fixed there). HabitStatsSection and the record insight are not named, so this instance is not tracked.
```

### [low] Read-тули асистента рахують день звичок і їжі за Києвом, хоча записи йдуть за годинником пристрою (ADR-0078)

- **ID:** `client-static/gap-ai-chat-action-executors#10` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/chatActions/crossActions/briefingHandlers.ts:18-30,73,89; routineActions.ts:573-595 (habit_stats); routineActions.helpers.ts:92,121-122 (habit_trend); queryRoutineActions.ts:125-131,214; queryNutritionActions.ts:78-82
- **Вплив:** Для користувачів поза київським поясом (подорожі, діаспора) асистент у вечірньому вікні каже «не виконано» або «0 ккал сьогодні». Він може запропонувати повторно відмітити звичку, стрік і статистика в чаті розходяться з екраном.
- **Що зробити:** Використовувати deviceDayKey/anchoredCompletionBounds для звичок, їжі й ваги в усіх read-тулах (як dailySeries). Kyiv лишити для грошей. Додати тест біля межі доби.

**Докази:**

```text
mark_habit_done writes `anchoredCompletionBounds().todayKey` (device-local), log_meal writes `todayISODate()` = deviceDayKey. But morning_briefing checks `completions[h.id].includes(getKyivDayKey(now))` and `nutritionLog[todayKey]` with a Kyiv key. habit_stats, habit_trend, query_habits (`lastDayKeys`) and query_nutrition build Kyiv day ranges. dailySeries.ts:8-14 already does this correctly (deviceDayKey for habits and food, Kyiv only for money), so the two paths disagree.
```

**Відтворення:**

```text
Static. In a Europe/Lisbon timezone between 22:00 and 24:00 local, mark a habit done and ask for the morning briefing: "Звички: 0/N" (Kyiv key is already tomorrow).
```

**Верифікатор:**

```text
Verified in code.

Writes use the device-local day:
- mark_habit_done uses anchoredCompletionBounds().todayKey (dayAnchor.ts, ROUTINE_DAY_ANCHOR="device-local").
- log_meal uses todayISODate(), which is deviceDayKey(new Date()) (nutrition-domain nutritionFormat.ts:13-15).

The read tools use Kyiv keys:
- morningBriefing: `getKyivDayKey(now)` for habit completions and nutritionLog[todayKey] (briefingHandlers.ts:18-49); weeklySummary does the same (:73, :89).
- habit_stats: routineActions.ts:574-595.
- habit_trend: routineActions.helpers.ts:92, 121-122.
- query_habits: queryRoutineActions.ts:124-131 (lastDayKeys) and :214.
- query_nutrition: queryNutritionActions.ts:78-82.

Meanwhile get_daily_series (dailySeries.ts:8-14, 168) deliberately uses deviceDayKey for personal metrics, per the owner decision of 2026-10-01 (f6). ADR-0078 §2 explicitly rejects option C, mixing Kyiv and device-local for one personal entity. routineActions.ts:5-8 even warns against using getKyivDayKey for completions in the same file.

Impact is limited to users whose device timezone differs from Kyiv, in the hours where the two calendar days differ. Ukrainian users (the main audience) are unaffected. The impact is wrong read-outs and possibly a suggestion to re-mark a habit, with no data loss. Low severity is correct.
```

**Додаткові докази верифікатора:**

```text
docs/work/specs/audits/2026-09-01-product-audit/findings.md LOG-1 (lines 56, 158-173) already flagged habit_stats for its "Київ-ключ" and asked for "тим самим day-anchor, що в UI". It was closed as ✅ after only swapping in flexibleStreakBreakdown/habitCompletionRate, so the day-key part was never fixed. LOG-3 moved the routine UI and five direct Kyiv readers to device-local, but not the chat read tools. No open tracking entry exists in docs/open-work.md.
```

### [low] delete_transaction не може видалити витрату, яку щойно створив сам чат (UUID без префікса m_), а серверний create_transaction не має undo

- **ID:** `client-static/gap-ai-chat-action-executors#9` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/chatActions/finykActions/transactions.ts:111-128; serverActions.ts:183-242
- **Вплив:** Помилково записану через асистента витрату не прибрати ні undo, ні командою «видали» (модель отримує хибне «це монобанк-операція»). Лишається лише ручне видалення в UI.
- **Що зробити:** Розпізнавати ручні витрати за джерелом у канонічному кеші (`getCachedFinykSqliteState().manualExpenses`), а не за префіксом id. Додати DELETE /api/finyk/manual-expenses/:id (або soft-delete через dual-write) і undo для серверного шляху.

**Докази:**

```text
deleteTransaction: `if (!id.startsWith("m_")) return "... можна видаляти лише ручні (m_…). Для монобанк-операцій використай hide_transaction."`. The server path stores `id: expense.id` (randomUUID, manualExpenses.ts:96), and its own docblock says the server path has no undo. search.ts:41-50 states "AI/server manual expenses use a server UUID". The existence check also reads the kv key `finyk_manual_expenses_v1` that the UI never writes, so UI-created expenses fail too.
```

**Відтворення:**

```text
Static: create_transaction (expense, online) → result "(id:<uuid>)" → delete_transaction {tx_id:<uuid>} → refusal text that calls it a Monobank operation.
```

**Верифікатор:**

```text
Verified in code beyond doubt.

When online, handleCreateTransaction (serverActions.ts:183-242) sends every expense to POST /api/finyk/manual-expenses. The server assigns `id: randomUUID()` (manualExpenses.ts:96), and the chat result string returns `(id:<uuid>)` to the model. deleteTransaction (transactions.ts:111-128) then rejects any id without the `m_` prefix and calls it a Monobank operation. The server tool def (toolDefs/finyk.ts:224-236) also tells the model that manual ids start with 'm_'.

The gap is wider than reported. UI-created manual expenses get `id: Date.now().toString()` (useFinykStorageMutations.ts:73), so they fail the prefix check too. The existence check reads LS `finyk_manual_expenses_v1`, which the UI no longer writes after the Stage 8 tombstone (useFinykStorageSlots.ts:187-192: "LS writes are gone"). In practice delete_transaction works only for chat-created entries that took the local path (income or offline fallback).

The server path's lack of undo is documented in its own docblock as a known limitation. The user can still delete the entry manually in the Finyk UI, so low severity stands.
```

**Додаткові докази верифікатора:**

```text
search.ts:36-50 states the opposite assumption: "never re-derive it from the `m_` id prefix (AI/server manual expenses use a server UUID)". So the read side was already fixed and the delete side was not. The "server create_transaction has no undo" half is already recorded in docs/work/specs/audits/ai-pipeline-2026-08-05.md:210-213. The delete_transaction prefix/UUID mismatch is not recorded anywhere (grep for delete_transaction / m_ prefix in audits and open-work.md).
```

### [low] Інертні кроки CI: умови кроків суперечать тригерам джоб, частина гейтів ніколи не виконується

- **ID:** `client-static/infra-headers-ci-deps#13` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** .github/workflows/ci.yml:597-599 vs 678-683 (coverage ratchet bump), 376-378 vs 452-457 (bundle PR comment); .github/workflows/docs-automation.yml:23-26 vs 273 (pr-body-validator); .github/workflows/storybook-deploy.yml (лише workflow_dispatch vs кроки з `event_name == 'push'`); package.json:91 vs check:ci (e2e-seed-boundary)
- **Вплив:** Гейти виглядають наявними, але мовчать: покриття може зрости й тихо впасти назад без сигналу, PR-шаблон не валідується, а від випадкового `VITE_E2E_SEED=true` у Vercel env прод нічого не захищає.
- **Що зробити:** Привести умови кроків у відповідність до тригерів (або видалити мертві кроки). Додати `node scripts/ci/check-e2e-seed-boundary.mjs` у check:ci і в buildCommand apps/web/vercel.json після `vite build`.

**Докази:**

```text
coverage: `if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`, а крок «Push coverage-ratchet baseline bump»: `if: github.event_name == 'pull_request' && ...`, тож baseline ніколи не комітиться і ratchet не росте. docs-automation працює лише в schedule/dispatch, а pr-body-validator має `if: github.event_name == 'pull_request'`. storybook-deploy: workflow лише dispatch, а Configure Pages, upload і deploy мають `if: github.event_name == 'push'`, тож збирає й нічого не публікує. `pnpm check` закінчується `node scripts/ci/check-e2e-seed-boundary.mjs`, а CI запускає `pnpm check:ci` без цього кроку, і Vercel Git-збірки (основний шлях прод-деплою web) його теж не запускають: guard від потрапляння `window.__sergeantScenario` у прод живе лише в ручному deploy-vercel.mjs.
```

**Відтворення:**

```text
Прочитати вказані рядки; порівняти `check` і `check:ci` у package.json.
```

**Верифікатор:**

```text
Every sub-claim checks out against the triggers. ci.yml coverage job: `if: schedule || workflow_dispatch` (598), but the step 'Push coverage-ratchet baseline bump' requires `github.event_name == 'pull_request'` (680-683), so it can never run. The baseline is never auto-raised, though the ratchet still fails on a drop below the committed baseline. bundle-budgets: schedule/dispatch only (378), while 'Bundle size PR comment' requires pull_request (453-456), so it is dead. That also leaves its `pull-requests: write` unused. docs-automation.yml is schedule/dispatch only (23-26), while pr-body-validator has `if: github.event_name == 'pull_request'` (273), so it is dead. storybook-deploy.yml is dispatch only, while the Pages configure/upload/deploy steps (63, 86, 102) require push and the PR-artifact step (93) requires pull_request, so it builds and publishes nothing. ADR-0102 moved these workflows to schedule/dispatch but does not mention that these steps became inert. package.json:91 `check` ends with `node scripts/ci/check-e2e-seed-boundary.mjs`, but `check:ci` (92), which CI runs, does not. No ci.yml step runs it, and the apps/web/vercel.json buildCommand doesn't either. The spec docs/work/specs/e2e-repeatable-states.md:21 claims 'повний режим merge-gate його виконує', which is false for CI. Mitigations: the static import guard in check-imports.mjs does run in `pnpm lint`, and `window.__sergeantScenario` only seeds the current user's own local state. A leak would need VITE_E2E_SEED=true set in Vercel env, so the real-world impact of that piece is small. Low overall.
```

**Додаткові докази верифікатора:**

```text
ci.yml:598 vs 680-683. ci.yml:378 vs 453-456. docs-automation.yml:23-26 vs 273. storybook-deploy.yml:25-26 (dispatch only) vs 63/86/93/102. package.json:91-92. grep finds no check-e2e-seed-boundary in .github/. Recent PR run 36950968697 shows coverage and bundle-budgets as `skipped` on pull_request.
```

### [low] Фінік Огляд/Бюджети та кілька екранів Фізрука фіксують «зараз» при монтуванні — «Сьогодні» і місяць застарівають після півночі

- **ID:** `client-static/react-correctness#6` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/pages/overview/useOverviewData.ts:101,111,119,189-198; apps/web/src/modules/finyk/pages/budgets/Budgets.tsx:189-190; apps/web/src/modules/finyk/pages/budgets/PlanningSubscriptions.tsx:111; apps/web/src/modules/fizruk/hooks/useRecovery.ts:53; apps/web/src/modules/fizruk/pages/Progress.tsx:108
- **Вплив:** Неправильні суми «сьогодні», денний ліміт і прогноз місяця на першому екрані Фініка після сну застосунку; у Фізруку — застарілий статус відновлення мʼязів.
- **Що зробити:** Замінити замороження на годинник, що оновлюється на межі доби і на `visibilitychange` (київський аналог `useDeviceDayKey` для Фініка, `useDeviceDayKey` для Фізрука), і класти день-ключ у залежності memo.

**Докази:**

```text
`const [nowMs] = useState(() => Date.now());` → `todayKey = getKyivDayKey(nowMs)`, `kyivMonthPrefix`, `getCurrentMonthContext(new Date(nowMs))` (daysPassed/daysInMonth); Budgets: `const now = useMemo(() => new Date(), [])` → `monthStart, daysPassed`. Жодного оновлення на зміну доби/`visibilitychange` (на відміну від `useBankBannerClock`, де ту саму проблему вже виправили для банера, і `useDeviceDayKey`).
```

**Відтворення:**

```text
Статично. Сценарій: лишити Фінік на «Огляді» ввечері останнього дня місяця, відкрити PWA вранці 1-го без перезавантаження: «Сьогодні» = витрати вчорашнього дня, місячні агрегати й денний бюджет — за минулий місяць, доки не перейти на іншу вкладку модуля.
```

**Верифікатор:**

```text
Code confirmed. useOverviewData.ts:101 `const [nowMs] = useState(() => Date.now())` feeds `todayKey`, `kyivMonthPrefix` and `getCurrentMonthContext` (daysPassed/daysInMonth). Budgets.tsx:189 `useMemo(() => new Date(), [])`, PlanningSubscriptions.tsx:111, useRecovery.ts:53 and Progress.tsx:108 freeze "now" the same way. None of them refresh on a day boundary or on `visibilitychange`. The finyk module already fixed the identical problem for the bank banner in `useBankBannerClock`, whose header describes the same failure mode. Mitigations are partial: remounting when switching module tabs, and autoUpdate's reload after idle only when a new service worker is waiting. Display-only staleness, so low is fair.
```

**Додаткові докази верифікатора:**

```text
Not run live (static verification only). useBankBannerClock.ts header: «Раніше `now` фіксувався при монтуванні … після повернення на Огляд без ремаунту банер не показувала» — the same class of bug, fixed only for the banner. autoUpdate.ts:244-271 reloads after idle only if `reg.waiting`.
```

### [low] UTC-день замість дня користувача: дедуп нагадування про імпорт і дати в назвах файлів експорту

- **ID:** `client-static/react-correctness#9` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/unification-modules.md
- **Де:** apps/web/src/modules/finyk/pages/overview/useImportReminder.ts:167; apps/web/src/core/settings/DataExportSection.tsx:15; apps/web/src/core/hub/HubBackupPanel.tsx:83; apps/web/src/core/profile/MemoryBankSection.tsx:127
- **Вплив:** Дрібна неточність: подвійна/пропущена подія показу нагадування на межі доби, файл бекапу з датою попереднього дня (плутанина при відновленні).
- **Що зробити:** Використати `deviceDayKey()`/`getKyivDayKey()` (за доменом) замість `toISOString().slice(0,10)`.

**Докази:**

```text
`const today = new Date(nowMs).toISOString().slice(0, 10);` — UTC-день; у Києві з 00:00 до 02:00/03:00 це ще вчорашня дата. Дедуп `shownDay` (аналітика `FINYK_IMPORT_REMINDER_SHOWN`) і файли `sergeant-...-YYYY-MM-DD.json`, `hub-backup-YYYY-MM-DD.json` отримують попередню дату.
```

**Відтворення:**

```text
Статично; експорт о 01:00 за Києвом дає файл зі вчорашньою датою.
```

**Верифікатор:**

```text
All four places take the date with `new Date(...).toISOString().slice(0, 10)`, which is the UTC day: useImportReminder.ts:167 (the shownDay dedup for FINYK_IMPORT_REMINDER_SHOWN), DataExportSection.tsx:15 (exportFilename), HubBackupPanel.tsx:83 (hub-backup-*.json) and MemoryBankSection.tsx:127 (sergeant-memory-bank-*.json). AGENTS.md says personal day keys are device-local and display dates are Kyiv, and UTC is neither. No code comment marks the UTC day as intended. The effect is small. The dedup is consistent per UTC day, so the event fires at most once per UTC day, but it can fire twice within one Kyiv day across the 00:00-03:00 window. The filenames carry yesterday's date in that same window. This is cosmetic analytics and naming noise with no data impact, so low is the right severity (info would also be defensible).
```

**Додаткові докази верифікатора:**

```text
Computed in node (dst.mjs): the instant 2026-10-02T01:00+03:00 gives toISOString day 2026-10-01, while its Kyiv day is 2026-10-02. The import-reminder half is already recorded as a stray defect in docs/work/specs/audits/unification-modules.md:522 ("useImportReminder.ts:167 будує день-ключ через toISOString().slice(0,10) (UTC)... читає його лише дедуп аналітичної події"). The three export filenames are not tracked there.
```

### [low] Список «volatile» префіксів SW порівнюється з неверсіонованими шляхами, а клієнт ходить у /api/v1/* — /api/v1/coach/* кешується; предикат ігнорує origin

- **ID:** `client-static/service-worker-pwa#5` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/sw/cachePolicy.ts:30-35, 50-59; apps/web/src/sw/cache.test.ts:44-48; packages/api-client/src/httpClient.ts:70, 96-116; apps/web/src/shared/lib/api/apiUrl.ts:60-84
- **Вплив:** Виняток, який мав не пускати coach-відповіді в кеш, не діє: GET /api/v1/coach/memory віддається з кешу до 30 хв на повільній мережі. Будь-який новий volatile-ендпоінт, доданий за інструкцією в коментарі, теж не буде виключений.
- **Що зробити:** Нормалізувати шлях перед перевіркою (зрізати /^\/api\/v\d+(?=\/)/ → /api) і додати в тест форми /api/v1/... ; у match-колбеку обмежити origin (self.location.origin + VITE_API_BASE_URL).

**Докази:**

```text
VOLATILE_API_PREFIXES = ["/api/sync/", "/api/v2/sync/", "/api/coach", "/api/weekly-digest"], а applyApiPrefix переписує /api/coach/memory → /api/v1/coach/memory. exp1.log: у api-cache лежить `http://127.0.0.1:3000/api/v1/coach/memory?__u=ff97af49...` з тілом {"ok":true,"memory":null}. Тест cache.test.ts перевіряє лише форму `/api/coach`, тож гейт зелений. Предикат `({url, request}) => shouldUseRuntimeCache(url.pathname, ...)` не дивиться на url.origin — під NetworkFirst потрапляє будь-який сторонній GET з шляхом /api/... (напр. PostHog /api/surveys/).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-service-worker-pwa/exp1-cache.mjs → exp1.log, ключі кешу `api-cache-v*`.
```

**Верифікатор:**

```text
Підтверджено кодом. VOLATILE_API_PREFIXES (cachePolicy.ts:30-35) порівнюються з pathname, а клієнт ходить у /api/v1/*: apiUrl.applyVersion і httpClient.applyApiPrefix переписують /api/coach/memory → /api/v1/coach/memory. Отже "/api/v1/coach/memory".startsWith("/api/coach") === false, і запит іде в NetworkFirst-кеш. exp1.log це показує: у api-cache лежить /api/v1/coach/memory?__u=…. Тест cache.test.ts перевіряє лише неверсіоновані форми. Реальний вплив вузький: із виключених префіксів єдиний GET — coach.getMemory. weekly-digest і coach/insight ідуть POST і не кешуються. /api/v2/sync/ виключено правильно, бо версіоновані шляхи не переписуються. Предикат справді ігнорує origin, але CORS-GET третіх сторін лише займають місце в кеші на 60 записів. Severity low.
```

**Додаткові докази верифікатора:**

```text
packages/api-client/src/endpoints/coach.ts:18 getMemory → http.get("/api/coach/memory"); weeklyDigest.ts:34 це POST. exp1.log: "http://127.0.0.1:3000/api/v1/coach/memory?__u=ff97af49…" з тілом {"ok":true,"memory":null} у api-cache-v*.
```

### [low] Build-id hard-floor порівнює SHA незалежно задеплоєних фронта і API: хибна плашка «Доступна нова версія», а «Оновити» перезавантажує той самий бандл

- **ID:** `client-static/service-worker-pwa#8` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/app/autoUpdate.ts:274-328; apps/web/src/core/app/useSWUpdate.ts:74-93; apps/web/vercel.json (ignoreCommand); apps/server/src/http/buildIdHeader.ts:24-41; apps/web/vite.config.js:84-89
- **Вплив:** Або регулярний хибний промпт, який нічого не оновлює (привчає ігнорувати справжні оновлення), або, якщо GIT_SHA на Coolify не передається, механізм мовчки вимкнений.
- **Що зробити:** Порівнювати не SHA, а явну версію контракту API (наприклад, X-Api-Contract-Version, яку бампають при несумісних змінах), або версію фронта, яку сервер отримує з Vercel. У hard-floor-гілці перед reload викликати registration.update() і показувати тост лише якщо з'явився waiting-SW.

**Докази:**

```text
Клієнт: VITE_BUILD_ID = VERCEL_GIT_COMMIT_SHA; сервер: X-Server-Build-Id = GIT_SHA образу. Vercel перезбирає web лише якщо `turbo query affected --packages @sergeant/web`, бекенд викочується лише коли змінились шляхи образу (AGENTS.md § Прод не оновлюється сам). Отже SHA збігаються тільки коли останній деплой обох був з одного коміту; зараз останній коміт web a7be9c1a, server f31c6142. Через 1 год розбіжності dispatchUpdateReady() → тост; applyUpdate без waiting-SW робить reload, а `/` віддається з того самого precache → через годину знову.
```

**Відтворення:**

```text
Статично; локально заголовок відсутній (GIT_SHA не задано), прод-конфіг не перевірено. На проді: відкрити застосунок після деплою лише сервера, тримати вкладку >1 год → «Доступна нова версія» → «Оновити» → та сама версія → повтор.
```

**Верифікатор:**

```text
I verified the logic in code. The client build id is VITE_BUILD_ID = VERCEL_GIT_COMMIT_SHA (vite.config.js:84-89), cut to 7 chars (autoUpdate.ts normalizeBuildId). The server build id is the 7-char cascade SENTRY_RELEASE→GIT_SHA→… (buildIdHeader.ts:24-41). The two sides deploy on separate path gates. Vercel's ignoreCommand skips the web build unless `turbo query affected --packages @sergeant/web` is true. deploy-api.yml:104-111 skips the backend unless backend paths changed since the prod commit. So the SHAs match only when both last deployed from the same commit. That rarely holds: in git, the last server-affecting commit on main is f31c6142 and the last web-affecting one is c7c09607/a7be9c1a. When they differ, reportServerBuildId arms the 1-hour timer and dispatchUpdateReady() opens the 'Доступна нова версія' toast. applyUpdate (useSWUpdate.ts:74-93) finds no waiting SW and does location.reload(). No new web build exists, so the same bundle loads and the cycle repeats an hour later. The SW docs (service-worker.md § Шар 4) only describe the 'stale client vs newer server' case and never discuss independently gated deploys, so this is not documented intent. Caveat: whether prod sends the header at all is unverified. The Dockerfile comment says deploy-api.yml passes --build-arg GIT_SHA, but the current deploy-api.yml only POSTs to Coolify and passes no build arg. So in prod this is either a recurring false prompt or a silently disabled layer. The finding states both branches.
```

**Додаткові докази верифікатора:**

```text
deploy-api.yml:105-111 diffs PROD_SHA..TARGET_SHA over apps/server packages/shared ... and skips if 0; apps/web/vercel.json ignoreCommand uses `turbo query affected --packages @sergeant/web`. `git log -1` of server paths = f31c6142 vs web paths = c7c09607. deploy-api.yml has no GIT_SHA/--build-arg (grep), contradicting the Dockerfile.api:248-254 comment. In autoUpdate.ts the firedForBuildId guard resets on every reload, so the prompt re-fires each session after 1h.
```

### [low] `/onboarding/*` без гварда: залогінений бачить анонімний сплеш «У мене вже є акаунт», а завершення перезаписує вибір модулів на акаунті

- **ID:** `client-static/web-route-guards#4` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/onboarding/route.tsx:32-45; apps/web/src/core/app/WelcomeScreen.tsx:238-262; порівняти з StandaloneRoutes.tsx:408-440 (/welcome)
- **Вплив:** Залогіненому пропонують «увійти в акаунт», у якому він уже є; проходження пікера тихо переписує серверний набір активних модулів на всіх пристроях і псує онбординг-воронку в аналітиці.
- **Що зробити:** Дати `/onboarding/*` той самий гвард, що й `/welcome` (authed → `/`, `!shouldShowOnboarding()` → `/`), або редиректити `/onboarding*` → `/welcome` однією точкою.

**Докази:**

```text
`/welcome` має `if (!authLoading && user) return <RedirectTo to="/" />` і `shouldShowOnboarding()`; `onboarding/route.tsx` рендерить `<WelcomeScreen>` безумовно (і для `/onboarding/<будь-що>`). completeOnboarding → `pushActiveModules(picks)` (PATCH me/preferences activeModules), markOnboardingDone, повторні ONBOARDING_* події.
Браузер: залогінений (fresh ctx) /welcome → `/` (Головна), а /onboarding → h1 «Ласкаво просимо», «З чого почати? … У мене вже є акаунт»; анонім з пройденим онбордингом: /welcome → `/`, /onboarding → сплеш знову. Попередній аудит (2026-09-01-product-audit/progress.md:68) стверджує «залогінений → /» для `/onboarding/*` — не відповідає коду.
```

**Відтворення:**

```text
FRESH=1 WAIT=14000 node <scratch>/agents/client-static-web-route-guards/sweep.mjs rg-sweep "/welcome,/onboarding"; node anon-returning.mjs
```

**Верифікатор:**

```text
onboarding/route.tsx renders <WelcomeScreen> with no checks. The /welcome entry in StandaloneRoutes.tsx:408-440 has `!authLoading && user → RedirectTo('/')` plus the storageReady and shouldShowOnboarding() guards; /onboarding has none of them. No in-app link targets /onboarding: the only mention is a doc example `/onboarding/replay` in whatsNew/releases.ts, and tour replay lives in Settings and uses the wizard, not this route. The open route is therefore unintended rather than a replay entry point. Reproduced as a logged-in user: /welcome → `/` (Головна), while /onboarding and /onboarding/whatever stay put and show «Ласкаво просимо … З чого почати? … У мене вже є акаунт». Finishing the picker calls pushActiveModules (PATCH me/preferences activeModules) and markOnboardingDone. That overwrite is an explicit choice in the picker rather than silent, so the impact is minor. The prior audit 2026-09-01-product-audit/progress.md:68 claims «залогінений → /» for /onboarding/*, which is wrong per code and browser.
```

**Додаткові докази верифікатора:**

```text
r2/onb.mjs output: `/welcome => /`; `/onboarding => /onboarding | account-btn: true`; `/onboarding/whatever => /onboarding/whatever | account-btn: true`. Screenshot r2/onboarding-authed.png.
```

### [low] URL-шими гублять/перехоплюють параметри: `?module=` на будь-якому standalone-шляху викрадає маршрут (reset-password токен губиться), legacy-hash шими скидають query

- **ID:** `client-static/web-route-guards#6` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/app/HubPage.tsx:80-85; apps/web/src/core/hooks/useHubNavigation.ts:100-102,200-208; apps/web/src/core/app/HashRedirect.tsx:61-115; apps/web/src/modules/finyk/hooks/useFinykRoute.ts:49-62; apps/web/src/modules/fizruk/hooks/useFizrukRoute.ts:110-118; apps/web/src/modules/routine/hooks/useRoutineRoute.ts:47-56 + useRoutineAppState.ts:296-325
- **Вплив:** Посилання з листів/сторонніх систем з додатковими параметрами відкривають не ту сторінку; deep-link параметри (фільтри, utm, action) тихо зникають; поведінка залежить від порядку ефектів.
- **Що зробити:** Застосовувати legacy `?module=` лише на `/` (pathname === "/"); у всіх hash-шимах зберігати наявний `location.search` (merge) і subSegment; routineDay-обробник має працювати від актуальної локації після hash-редиректу.

**Докази:**

```text
activeModule береться з `?module=` незалежно від pathname, а HubPage робить `<RedirectTo to={/${activeModule}${hash}}>` до розбору standalone-маршрутів.
Браузер (anon): /reset-password?token=abc&module=finyk → /finyk (токен і сторінка скидання втрачені); /legal/privacy?module=routine → /routine; /finyk?keep=1#budgets → /finyk/budgets (query скинуто); /?x=1#fizruk/workouts → /fizruk/workouts; /routine?routineDay=2026-09-10#stats → /routine#stats (два one-shot ефекти гонять: hash-шим і routineDay-обробник, підсумковий URL з мертвим hash). fizruk-шим ще й губить subSegment (`workout/<id>/<item>`).
```

**Відтворення:**

```text
WAIT=4000 node <scratch>/agents/client-static-web-route-guards/sweep.mjs anon "/reset-password?token=abc&module=finyk,/legal/privacy?module=routine,/?x=1#fizruk/workouts,/routine?routineDay=2026-09-10#stats"
```

**Верифікатор:**

```text
HubPage.tsx:82-85 redirects to `/${activeModule}${hash}` whenever `?module=` is present, before renderStandaloneRoute runs. useHubNavigation derives activeModule from the pathname first and otherwise from `?module=`, so `?module=` on a non-module path such as /reset-password wins. useFinykRoute (49-62) and parseRootLegacyHash/HashRedirect build the target only from the hash (keeping only an in-hash `?…`), so the real location.search is dropped. All claims reproduced (anon): /reset-password?token=abc&module=finyk → /finyk, token lost; /legal/privacy?module=routine → /routine; /finyk?keep=1#budgets → /finyk/budgets, query dropped; /?x=1#fizruk/workouts → /fizruk/workouts; /routine?routineDay=2026-09-10#stats → /routine#stats; /fizruk#workout/abc/item1 → /fizruk/workout/abc, subSegment dropped. Real-world reach is small: only legacy hash links or crafted `?module=` links trigger it, so low (near info).
```

**Додаткові докази верифікатора:**

```text
r2/shims.mjs output lines exactly as listed in the reasoning.
```

### [low] Інструмент recall_memory рекламує моделі джерела (chat, finyk, fizruk, nutrition, routine, journal), які сервер відхиляє 400, а живе джерело profile не згадано

- **ID:** `server-static/ai-layer#12` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/chat/toolDefs/memory.ts:80-107; packages/shared/src/schemas/api.ts:592-615; apps/web/src/core/lib/chatActions/serverActions.ts:149-163
- **Вплив:** Пошук у памʼяті з фільтром ламається на рекомендованих самим описом значеннях; фільтр за основним живим джерелом (profile) моделі недоступний.
- **Що зробити:** Синхронізувати опис/enum інструмента з RECALL_MEMORY_SOURCES (digest, profile), додати `enum` і `maximum: 50` у input_schema; на клієнті відкидати невідомі джерела й клампити topK.

**Докази:**

```text
Опис і параметр sources: «chat, finyk, fizruk, nutrition, routine, journal, digest»; top_k «1..50» без maximum у схемі. RecallMemoryRequestSchema `.strict()` з `sources: z.array(z.enum(["digest","cofounder","product","profile"]))` і `topK: max(50)`. Клієнтський виконавець передає sources і top_k як є -> 400 -> «Не вдалося отримати памʼять асистента».
```

**Відтворення:**

```text
Статично; наживо recall локально віддає 503 AI_MEMORY_DISABLED ще до парсингу. У проді з увімкненою памʼяттю: попросити «знайди в памʼяті мої фінансові нотатки» -- модель передасть sources:['finyk'] і отримає помилку.
```

**Верифікатор:**

```text
Verified. The recall_memory tool description and the `sources` parameter description still list chat/nutrition/fizruk/journal/routine/finyk/digest and never mention `profile`. top_k says 1..50, but input_schema has no enum and no maximum. RecallMemoryRequestSchema is .strict(), with sources limited to enum ['digest','cofounder','product','profile'] and topK max 50. handleRecallMemory (serverActions.ts:149-163) passes sources through as-is and only floors topK. A 400 falls into the generic branch 'Не вдалося отримати памʼять асистента. Спробуй ще раз.' Initiative 0024 PR-3 narrowed the schema but left the tool description stale. The impact needs prod AI memory (enabled) and Pro (recall is gated, 402 for Free).
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-server-static-ai-layer/recall-v3.mts: {sources:['finyk']} REJECT 'expected one of digest|cofounder|product|profile'; {sources:['profile']} OK; {topK:60} REJECT '<=50'; {sources:['chat','digest']} REJECT. toolDefs/memory.ts:82-104; api.ts:592-615.
```

### [low] Денний USD-cap транскрипції рахує вартість за байтами, а не за тривалістю: дрібні та низькобітрейтні записи недооцінюються в рази

- **ID:** `server-static/ai-layer#13` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/transcribe/usdCap.ts:31, 67, 110-115
- **Вплив:** Заявлена стеля $0.10 на користувача на добу не тримає: Pro-користувач скриптом може витрачати в рази більше; rate-limit 60/хв лишається єдиним обмеженням.
- **Що зробити:** Рахувати резерв за мінімальним білінгом (max(10 c, оцінка тривалості)) і фіксувати фактичну вартість за durationSec з відповіді Groq у recordTranscribeUsdSpend.

**Докази:**

```text
`GROQ_WHISPER_USD_MICROS_PER_10MB = 40_000` і `estimateMicros = ceil(bytes / 10MB * 40_000)`; cap $0.10/добу. Groq тарифікує за секунди аудіо (з мінімальним білінгом ~10 с на запит), а Groq у відповіді повертає duration, який ігнорується. Запит на 2 KB оцінюється у 8 мікродоларів, тож до cap вміщується ~12 500 таких запитів, які за мінімальним білінгом коштують ~$1.4 (у ~14 разів більше за cap); Opus 6-8 kbps дає ~3 години на 10 MB при оцінці як за ~1 годину.
```

**Відтворення:**

```text
Статично (розрахунок). Наживо не перевірено: немає GROQ_API_KEY, а маршрут Pro-only.
```

**Верифікатор:**

```text
Verified statically. estimateMicros is ceil(bytes/10MB*40_000). It is used both for the reservation (assertTranscribeUsdCap) and for recordTranscribeUsdSpend(req, body.length, model), and ignores Groq's returned duration and the model (whisper-large-v3 costs about 2.8x turbo). Groq bills audio time with a 10 s minimum per request, which is about 111 micros at $0.04/h turbo. A ~2 KB clip is estimated at 8 micros, about 14x too low. The $0.10 cap therefore admits about 12,500 tiny requests (≈3.5 h at the 60/min per-user limit), roughly $1.4/day real cost. Very low-bitrate Opus is also under-estimated, by about 3-4x. Nuance: at typical browser bitrates (64-128 kbps) the byte estimate OVER-charges, so normal users are not hurt. The exposure is limited to Pro users scripting the API, and the voice UI flag is currently off. Bounded cost abuse, low.
```

**Додаткові докази верифікатора:**

```text
usdCap.ts:31 GROQ_WHISPER_USD_MICROS_PER_10MB=40_000; :110-115 estimateMicros bytes-only; :326-351 recordTranscribeUsdSpend uses estimateMicros(audioBytes); transcribe.ts:137-141 cap check by body.length, :168 record by body.length; routes/transcribe.ts rate-limit 60/min/user, requirePlan pro.
```

### [low] anthropicBudgetGuard втрачає стан hard-breach після рестарту/деплою або на другій репліці, коли Redis-прапор уже стоїть: деградація на floor більше не вмикається до кінця доби

- **ID:** `server-static/ai-layer#4` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/obs/anthropicBudgetGuard.ts:294-303, 500-534; apps/server/src/modules/chat/aiQuota.ts:686
- **Вплив:** Коли власник увімкне ANTHROPIC_BUDGET_HARD_DEGRADE_ALL (рекомендація A5), стеля спрацює лише до першого деплою або лише на одній репліці; решту доби витрати йдуть без гальма. Хибне відчуття захищеності: алерт прийшов, а деградація мовчки знята.
- **Що зробити:** Відокремити «стан перевищення» від «дедупу алерту»: hardBreached = (spendUsd &gt;= hardUsd) на кожному тіку незалежно від результату fireOnce; NX-прапор використовувати лише для одноразової відправки в Sentry. Додати тест на сценарій «ключ уже в Redis». Окремо: вирішити A5 і поширити гейт на перший тур чату, дайджест і vision.

**Докази:**

```text
runBudgetCheckTick: `hardFired = await this.fireOnce("hard", ...); if (hardFired) { this.state.hardBreached = true; }` -- hardBreached ставиться лише тим процесом, який виграв Redis `SET NX`. markFlag при вже наявному ключі (`result !== "OK"`) робить `firedAlerts.add(key); return false;`. Після рестарту (прод автодеплоїться кілька разів на добу; REDIS_URL у Coolify заданий) прапор живе ще 36 год, тож новий процес ніколи не виставить hardBreached. Симуляція (<scratch>/agents/server-static-ai-layer/budget.mts, node --import tsx): `tick: {"spendUsd":12.34,...,"hardUsd":5,"hardFired":false}` / `isHardBreached after restart with spend $12.34 > hard $5: false`, а для процесу, що виграв NX: `true`. Контекст (уже відома A5 з ai-pipeline-2026-08-05.md): за замовчуванням hard -- лише алерт (ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=false), а isAnthropicBudgetHardExceeded має одного споживача -- resolveProTier (синтез чату і коуч); перший тур, дайджест, vision не гальмуються.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-ai-layer/budget.mts -- guard із redis.set, що повертає null (ключ уже є), і витратами $12.34 при hard $5 дає isHardBreached()=false.
```

**Верифікатор:**

```text
Підтверджено симуляцією на справжньому класі AnthropicBudgetGuard зі спільним фейковим Redis із семантикою SET NX. Процес 1 при витратах 9.99 і hard 5 дає hardFired=true, isHardBreached=true. Новий інстанс із тим самим Redis (рестарт після деплою або друга репліка) дає hardFired=false, isHardBreached=false, і так на кожному наступному тіку. Причина: hardBreached ставиться лише тоді, коли fireOnce виграв NX (anthropicBudgetGuard.ts:294-303), а markFlag для наявного ключа повертає false. Без Redis in-memory fallback після рестарту знову стріляє і стан ставить, тож баг виявляється лише з Redis. За доками Redis у проді задано (notifications.md:35). Іронія: шапка модуля описує саме цю ваду («hardBreached теж скидався… друге пробиття тієї ж доби було ще й тихим») як закриту, а вона лишилась. Severity знижую до low: єдиний споживач isAnthropicBudgetHardExceeded - resolveProTier, і лише при ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=true, а дефолт false. Зараз у проді ефекту нуль, вада латентна. Однак попередні аудити радять увімкнути прапорець як достатній фікс (коду не треба), а з цією вадою цього недостатньо.
```

**Додаткові докази верифікатора:**

```text
verify-server-static-ai-layer/budget-v2.mts: process#1 hardFired=true isHardBreached=true; process#2 (after restart) hardFired=false spend=9.99 isHardBreached=false; alerts captured: [hard] один раз. Споживач: aiQuota.ts:686 if (hardBreachDegradeAllEnabled() && isAnthropicBudgetHardExceeded()). A5 у ai-pipeline-2026-08-05.md:924 та ai-abuse-2026-08-05.md:197 рекомендує лише увімкнути прапорець.
```

### [low] ISO-мітки часу з Z чи офсетом дають день-ключ за UTC-префіксом: нічні операції з'їжджають на попередню добу

- **ID:** `server-static/gap-finyk-import-receipts-correctness#13` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** packages/tabular-import/src/csvParser.ts:124,139-142
- **Вплив:** Імпорт CSV з інших трекерів, що пишуть UTC-інстанти, переносить пізні вечірні операції на попередній день (денні бюджети, дедуп ±1 доба).
- **Що зробити:** Якщо після дати є час із Z чи ±HH:MM, парсити як інстант і брати день у Europe/Kyiv (або в зоні, яку передасть клієнт, ADR-0078). Без зони лишати поточну поведінку.

**Докази:**

```text
parseCalendarDateKey("2026-08-16T23:30:00Z") повертає "2026-08-16", хоча за Києвом (і для пристрою в UA) це 2026-08-17 02:30. Regex бере перші 10 символів і ігнорує зону.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/amount.ts (секція --dates)
```

**Верифікатор:**

```text
Reproduced both by unit call and in the live preview: "2026-08-16T23:30:00Z" → "2026-08-16", although in Kyiv that is 02:30 on 2026-08-17. The regex /^(\d{4})-(\d{1,2})-(\d{1,2})/ takes the prefix and ignores the zone. The docstring says the trailing time is ignored on purpose, but the Z case was evidently not considered. One correction: the "or offset" half of the claim mostly does not hold. With an offset such as +03:00 the date prefix already is the local date in that zone, which for a Ukrainian user is the correct day. Only UTC instants (Z) cause the shift. Ukrainian bank exports (mono, Privat) write local time without a zone, so this only affects imports from rare sources.
```

**Додаткові докази верифікатора:**

```text
amount.ts --dates: "2026-08-16T23:30:00Z" => 2026-08-16. Live preview with mapping (no dateFormat): date "2026-08-16" for 2026-08-16T23:30:00Z.
```

### [low] Відхилені пари matcher відфільтровує вже після матчингу: відхилена транзакція далі «конкурує», і чек (або сусідній чек) назавжди лишається ambiguous; relink дозволяє привʼязати один чек до кількох транзакцій

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#13` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/silpo/receiptsMatch.ts:188-206; packages/finyk-domain/src/domain/receiptMatching.ts:146-182; apps/server/src/modules/silpo/receiptsRead.ts:270-292
- **Вплив:** Після одного «Це не той чек» автоматичне зіставлення для цього чека і сусідніх з тією ж сумою перестає працювати. Ручний relink через API може створити подвійні лінки й дублікати рядків у списку чеків.
- **Що зробити:** Передавати відхилення в matcher (виключати пару з candidatesByReceipt/receiptIdsByTx до підрахунку ambiguity). Додати UNIQUE (user_id, receipt_id) у silpo_tx_receipt_links або в relink спершу знімати попередній лінк цього чека.

**Докази:**

```text
matchAndLink викликає matchReceiptsToTransactions(receipts, transactions) з ПОВНИМ набором кандидатів і лише потім відкидає `rejected.has(tx receipt)`. Відхилений tx1 далі рахується як кандидат і конкурент: якщо для чека R пізніше з'явиться справжній tx2 (Mono приїхав із запізненням чи ручна витрата), R отримає candidates {tx1,tx2}, тобто ambiguous назавжди. Інший чек R2, для якого tx1 справжній, бачить competitors=[R,R2] і теж ambiguous. Коментар («той самий чек має лишатись кандидатом на іншу транзакцію») не виконується. Окремо: relinkReceiptToTransaction вставляє (tx, R) без перевірки, що R уже привʼязаний до іншої транзакції. Унікальності по (user_id, receipt_id) у silpo_tx_receipt_links немає, тож LEFT JOIN у listReceipts/getReceiptDetail дублює чек або бере довільний transactionId.
```

**Відтворення:**

```text
Статично: R пов'язано з tx1 -> DELETE /api/silpo/receipts/link/tx1 -> з'являється tx2 з тією ж сумою ±1 доба -> POST /api/silpo/sync -> R у ambiguous замість лінку на tx2.
```

**Верифікатор:**

```text
Відтворено на чистому матчері, з тим самим пост-фільтром відхилень, що й у receiptsMatch.ts:195-206. Сценарій A: пару (tx1,R) відхилено, з'являється tx2 з тією ж сумою ±1 доба. Результат {accepted:[], ambiguous:["R"]}, хоча з префільтром R однозначно лінкується на tx2. Сценарій B: (tx1,R) відхилено, а tx1 справді належить R2. Результат {accepted:[], ambiguous:["R","R2"]}, бо відхилений R далі рахується конкурентом за tx1. Отже намір із коментаря («той самий чек має лишатись кандидатом на іншу транзакцію») не виконується. Друга частина: relinkReceiptToTransaction (receiptsRead.ts:280-288) не перевіряє, чи R уже прив'язаний до іншої транзакції. PK лінків — (user_id, transaction_id), UNIQUE на (user_id, receipt_id) немає (\d silpo_tx_receipt_links). LEFT JOIN у listReceipts і getReceiptDetail тоді дублює рядок або бере довільний transactionId. Пом'якшення: ambiguous має ручний вихід через «Прикріпити чек» (spec :950-956), а пікер у UI показує лише чеки з transactionId === null (SilpoReceiptPickerSheet.tsx:79). Тож подвійний лінк через UI можливий лише через гонку або застарілий список, або прямим викликом API на власних даних. Обидва сценарії вимагають двох транзакцій з точно однаковою сумою в копійках у вікні ±1 доба, тож low.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-server-static-gap-silpo-and-shared-product-catalog/matcher.mts (node --import tsx): `A: {"accepted":[],"ambiguous":["R"],"unmatched":[]}`, `A': {"matches":[{"receiptId":"R","transactionId":"tx2"...}]}`, `B: {"accepted":[],"ambiguous":["R","R2"],"unmatched":[]}`.
```

### [low] resolveBranchContext ковтає auth_required і повертає schema_drift: при протухлому токені кошик і пошук не роблять refresh, людина бачить «Сільпо змінили формат», у Sentry летить хибний дрейф

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#6` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/silpo/branchContext.ts:101-136 (return null на будь-яку помилку), :163-178 (kind: "schema_drift"); apps/server/src/modules/silpo/cart.ts:80-82; apps/server/src/modules/silpo/foodSource.ts:468-469
- **Вплив:** Після закінчення 30-денного токена кошик показує «недоступно», доки синк чеків (до 8 год, полер) випадково не оновить токен. Дашборд отримує хибні алерти «schema drift», а саме цей алерт власник читає як сигнал правити код.
- **Що зробити:** У fetchFromCart і fetchFromBranches пробрасувати McpError з kind auth_required (а також rate_limited і upstream_unavailable) нагору, а не перетворювати на null. schema_drift повертати лише тоді, коли обидві тули відповіли, але без потрібних полів.

**Докази:**

```text
fetchFromCart і fetchFromBranches роблять `if (!cartRef.ok ...) return null`, `if (!branches.ok) return null`, тож 401 губиться. Перевірка (silpo-auth.mts, блок C): усі запити 401 -> `C resolveBranchContext all-401 -> {"ok":false,"error":{"kind":"schema_drift","message":"Не вдалося визначити контекст філії Сільпо..."}}`. callWithFreshAccessToken рефрешить лише на auth_required, тож previewCart -> silpoErrorToAppError -> 502 SILPO_SCHEMA_DRIFT + captureSilpoFailure('schema_drift'), а foodSource мовчки повертає [].
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/silpo-auth.mts (блок C); сценарій: кеш контексту холодний (рестарт або 15 хв TTL) + протухлий access-токен -> POST /api/silpo/cart/preview
```

**Верифікатор:**

```text
branchContext.ts: fetchFromCart і fetchFromBranches роблять `if (!x.ok) return null`, тобто McpError (включно з auth_required) губиться. Коли обидва шляхи дали null, resolveBranchContext повертає kind 'schema_drift'. callWithFreshAccessToken рефрешить лише на auth_required, тож refresh не стається. Блок C silpo-auth.mts (усі запити 401) повертає schema_drift. cart.ts:81 (previewCart) повертає ctx як є, і далі silpoErrorToAppError -> captureSilpoFailure('schema_drift') + 502 SILPO_SCHEMA_DRIFT. foodSource мовчки повертає []. Синк чеків стоїть окремо: там офлайн-канал пропускається, але fetchOnlineOrders отримує 401 і робить refresh, тож токен оновиться під час синку. Це збігається з описом знахідки («доки синк чеків не оновить токен»). Сценарій вузький: холодний кеш контексту (15 хв TTL або рестарт) плюс протухлий access-токен. Тож low.
```

**Додаткові докази верифікатора:**

```text
Вивід silpo-auth.mts: `C resolveBranchContext all-401 -> {"ok":false,"error":{"kind":"schema_drift","message":"Не вдалося визначити контекст філії Сільпо (кошик і список філій недоступні)"}}`. receipts.ts:432-460: офлайн-гілка деградує, а онлайн-гілка повертає auth_required нагору, тож синк чеків refresh таки робить.
```

### [low] /api/sync/audit: фільтри op_type/outcome не знають v2-значень (v2_push, v2_pull, partial), тож інструмент інцидентів не фільтрує нічого

- **ID:** `server-static/sync-contract#11` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/audit.ts:51-63 (enum push|pull|push_all|pull_all; outcome без partial), запис: apps/server/src/modules/sync/syncV2-core.ts:133-145 (op_type v2_push/v2_pull, module 'v2', outcome partial)
- **Вплив:** Адмін-перегляд конфліктів і часткових пушів при інциденті не працює: валідний фільтр дає порожньо, справжнє значення дає 400.
- **Що зробити:** Оновити enum-и до фактичних значень v2 (v2_push, v2_pull, partial) і віддавати помилку через стандартний errorHandler/parseQuery.

**Докази:**

```text
?op_type=push 200 {"rows":[]...}
?op_type=v2_push 400 {"error":"Invalid query",..."expected one of \"push\"|\"pull\"|\"push_all\"|\"pull_all\""}
?outcome=partial 400 ...
Водночас рядки в журналі мають opType "v2_push"/"v2_pull". Крім того, тіло 400 тут {error, details}, а не стандартний конверт {error,message,code,requestId}.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-sync-contract/audit-probe.mjs
```

**Верифікатор:**

```text
Підтверджено, але вплив перебільшено. audit.ts:51-63: op_type приймає лише v1-значення push|pull|push_all|pull_all, а recordSyncV2 (syncV2-core.ts:133-145) пише лише v2_push/v2_pull. Тому фільтр op_type повністю мертвий: валідні значення дають 0 рядків, справжні дають 400. outcome=partial теж дає 400, хоча в БД є 43 рядки з outcome 'partial'. Відповідь 400 має форму {error, details} замість стандартного конверта {error,message,code,requestId}. Проте «інструмент не фільтрує нічого» неправда: без фільтрів, з outcome=ok|empty|conflict і з module=v2 ендпоінт працює коректно. Споживачів у web/admin UI в репо немає, це ручний діагностичний ендпоінт. Отже це дрібний баг, low (на межі info).
```

**Додаткові докази верифікатора:**

```text
v4-all.mjs (#11). ?op_type=push => 200 rows=0. ?op_type=v2_push => 400 'expected one of "push"|"pull"|"push_all"|"pull_all"'. ?outcome=partial => 400. ?outcome=conflict => 200 rows=4 [v2_push,conflict]. ?module=v2&limit=3 => 200 rows=3. psql: sync_audit_log містить лише op_type v2_push/v2_pull і outcome ok/empty/conflict/partial.
```

### [low] Internal /api/internal/billing/upgrade мовчки не дає Pro юзеру з простроченим рядком

- **ID:** `server-static/webhooks-billing-quota#12` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/internal/billing.ts:44-51
- **Вплив:** Ручний інструмент founder-а для comp-акаунтів рапортує успіх, а доступу не дає; до того ж рядок лишається з provider='liqpay'/'plata', тож провайдерні шляхи далі можуть його змінити.
- **Що зробити:** У DO UPDATE ставити status='active', provider='manual', current_period_end=NULL, cancel_at_period_end=FALSE, grace_period_ends_at=NULL (або спершу переводити прострочені рядки в canceled і вставляти новий).

**Докази:**

```text
`INSERT INTO subscriptions (user_id, plan, status, provider) VALUES ($1,'pro','active','manual') ON CONFLICT (user_id) WHERE status IN ('active','trialing','past_due') DO UPDATE SET plan = 'pro', updated_at = NOW()` — при конфлікті не змінює status/current_period_end/grace. getUserPlan вимагає current_period_end > NOW() (або grace для past_due).
```

**Відтворення:**

```text
Юзер із простроченим reverse-trial ('trialing', current_period_end у минулому) або з LiqPay/Plata-рядком, що 'active' з минулим current_period_end після скасування → POST /api/internal/billing/upgrade {userId} → 200 {ok:true, subscription:{status:'trialing'...}}, але /api/billing/status → access.state 'free'.
```

**Верифікатор:**

```text
Підтверджено в коді без сумнівів. `routes/internal/billing.ts:44-51` робить `ON CONFLICT (user_id) WHERE status IN ('active','trialing','past_due') DO UPDATE SET plan = 'pro', updated_at = NOW()`, тож status, current_period_end, provider і grace лишаються як були. `getUserPlan` (`getUserPlan.ts:80-92`) пускає лише `active/trialing` з `current_period_end IS NULL OR > NOW()` або `past_due` у межах grace. Прострочені рядки реально існують і не прибираються. `reverseTrial.ts:8-11` прямо каже «Cron спливання не потрібен», тож `trialing` лишається з минулим current_period_end назавжди. LiqPay- і Plata-скасування ставлять лише `cancel_at_period_end=TRUE` при `status='active'`, а Plata past_due після grace лишається `past_due`. У всіх цих випадках upgrade повертає 200 `{ok:true, subscription:{status:'trialing'|...}}`, хоча `/api/billing/status` показує free. Живцем не відтворено: потрібен internal bearer, а `.env` читати заборонено. Severity low: це ops-інструмент founder-а, захищений bearer-ом.
```

**Додаткові докази верифікатора:**

```text
Downgrade-роут поруч (`internal/billing.ts:88-91`) ставить і status, і cancel_at_period_end, тобто асиметрію видно в одному файлі. Користувачі upgrade: лише ручний інструмент founder-а (`2026-08-05-orphaned-code-audit.md:210`). Не трекається.
```

### [low] LiqPay: проміжні статуси (3ds_verify, otp_verify, prepared, hold_wait…) трактуються як невдале списання

- **ID:** `server-static/webhooks-billing-quota#16` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/billing/liqpay.ts:51-53,328-331,368-376
- **Вплив:** Хибний dunning активних платників (стан grace, листи/UI «проблема з оплатою»); залежно від дат — втрата доступу до наступного успішного колбеку.
- **Що зробити:** Явний allowlist фінальних статусів невдачі (failure, error) і обробка решти як pending; past_due ставити лише для action=regular того самого order, що в provider_subscription_id.

**Докази:**

```text
PENDING_STATUSES = {wait_secure, wait_accept, processing}; будь-що поза SUCCESS/PENDING/sandbox/reversed падає в `UPDATE subscriptions SET status = 'past_due' WHERE user_id = $1 AND provider = 'liqpay' AND status = 'active'` — без огляду на order_id/action. LiqPay має ширший набір проміжних статусів (3ds_verify, otp_verify, cvv_verify, prepared, hold_wait, invoice_wait, wait_card, try_again…).
```

**Відтворення:**

```text
Користувач з активною LiqPay-підпискою починає ще один checkout (немає гарду), колбек нового order з status=3ds_verify → його оплачена підписка стає past_due.
```

**Верифікатор:**

```text
Перевірено в коді liqpay.ts. PENDING_STATUSES = {wait_secure, wait_accept, processing}. Будь-який статус поза SUCCESS, PENDING, sandbox і reversed/unsubscribe провалюється в `UPDATE subscriptions SET status='past_due' WHERE user_id=$1 AND provider='liqpay' AND status='active'` (рядки 368-376), без перевірки order_id чи action. Коментар у коді прямо припускає, що «решта» — це лише failure/error, хоча LiqPay документує ширший набір статусів у callback (3ds_verify, otp_verify, prepared, hold_wait, wait_card, try_again, unsubscribed для action≠unsubscribe тощо). Роут /api/billing/liqpay-callback нічого не фільтрує між перевіркою підпису й processWebhook. Дефект підтверджується і без проміжних статусів: звичайний `failure` на іншому order того самого користувача (друга оплата, старий таб) теж переведе його активну підписку в past_due. Що знижує вагу: LIQPAY_ENABLED за замовчуванням false, LiqPay вмикається лише після бети, тож дефект латентний. PricingPage вимикає CTA для Premium, і друга оплата можлива тільки з неактуального табу або прямим API-викликом. Наслідок м'якший, ніж заявлено: past_due у getUserPlan дає доступ до current_period_end+3д (а до кінця періоду ще місяць), і наступний success/regular повертає active. Реальна шкода — хибний банер «оплата не пройшла» (state=grace), а не втрата доступу. Чи справді LiqPay шле такі статуси на server_url для action=subscribe, наживо не перевірено.
```

**Додаткові докази верифікатора:**

```text
liqpay.ts:51-53 (PENDING_STATUSES), 328-331, 365-376; routes/billing.ts:355-380 (без фільтра статусів); getUserPlan.ts:84-89 (grace = COALESCE(grace_period_ends_at, current_period_end+3d)); env.ts:407 LIQPAY_ENABLED default false; feature-flags.md:87 «Вмикається на старті платежів після бети». У liqpay.test.ts є тест лише на wait_secure, на 3ds_verify, otp_verify та інші тестів немає.
```

### [low] Plata dunning дає 6 днів grace замість 3 за спекою

- **ID:** `server-static/webhooks-billing-quota#17` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/billing/plataSync.ts:156-163; apps/server/src/modules/billing/getUserPlan.ts:84-89,113-121
- **Вплив:** Неоплачений доступ удвічі довший за рішення в access-tiers.md; розбіжність між Plata і LiqPay (там grace від реальної дати періоду).
- **Що зробити:** У applyPastDue писати grace_period_ends_at = now+3д і не чіпати current_period_end (або навпаки), щоб формула getUserPlan давала рівно 3 дні.

**Докази:**

```text
applyPastDue: `const graceUntil = new Date(Date.now() + GRACE_DAYS * 24*60*60*1000); UPDATE subscriptions SET status = 'past_due', current_period_end = $2` (now+3д). getUserPlan/accessStateOf для past_due: `COALESCE(grace_period_ends_at, current_period_end + make_interval(days => 3)) > NOW()` → ще +3 дні поверх уже зсунутого current_period_end.
```

**Відтворення:**

```text
Звірка бачить walletData.failureDescription → current_period_end = now+3д, grace_period_ends_at NULL → /api/billing/status показує graceEndsAt = now+6д, requirePlan пускає 6 днів.
```

**Верифікатор:**

```text
Перевірено в коді й арифметикою в БД. applyPastDue (plataSync.ts:144-163) при current_period_end у минулому ставить current_period_end = now+3д і не пише grace_period_ends_at. Тест plataSync.test.ts:69-105 закріплює саме це як «fresh 3-day grace». getUserPlan і accessStateOf поверх цього рахують COALESCE(NULL, current_period_end + 3 days). `SELECT COALESCE(NULL::timestamptz,(now()+interval '3 days')+make_interval(days=>3))-now()` повертає `6 days`. Специфікація access-tiers.md:91 каже «3 дні, потім Free». Тобто подвійний grace. Окремо знайшов наслідок, який знахідка не помітила. runSlowTick вибирає і past_due-рядки, а коли вікно спливає, current_period_end знову в минулому, alreadyGraced=false, і grace зсувається ще на +3д. Через fallback +3д доступ не зникає до наступного добового тіку, тож поки monobank повертає walletData.failureDescription, grace може поновлюватись нескінченно. failureDescription перевіряється раніше за status, тому так буде навіть для деактивованої підписки. Severity лишаю low, бо PLATA_ENABLED за замовчуванням false, а вмикання заблоковане питанням фіскалізації (feature-flags.md:88). Після вмикання це варто трактувати як medium через безоплатний Pro.
```

**Додаткові докази верифікатора:**

```text
psql: `6 days`. plataSync.ts:240-247 (slow tick включає past_due), 166-174 (failureDescription перевіряється до status), 144-163 (повторний зсув, щойно current_period_end у минулому). getUserPlan.ts:84-89, 113-121. env.ts:420 PLATA_ENABLED default false. Ні в audits, ні в open-work.md про grace-логіку білінгу нічого немає.
```

### [low] Build-id hard-floor у проді дає вічний false-positive: «Доступна нова версія» щогодини, «Оновити» перезавантажує в ту саму збірку

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#4` · **Вердикт:** сумнівно · **Категорія:** `logic` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/core/app/autoUpdate.ts:275-330 (reportServerBuildId/fireBuildIdMismatch), apps/web/src/core/app/useSWUpdate.ts:74-91 (без waiting → location.reload()), apps/web/vercel.json:5 (ignoreCommand: збірка лише коли змінено @sergeant/web), .github/workflows/deploy-api.yml:100-111 (деплой бекенду лише коли змінено шляхи бекенду)
- **Вплив:** Після будь-якого деплою лише фронту або лише бекенду кожна сесія довша за годину отримує хибне «Доступна нова версія», а кнопка нічого не оновлює. Тост з'являється поверх відкритих форм, і тап «Оновити» знищує ввід. Це привчає ігнорувати справжні оновлення.
- **Що зробити:** Порівнювати не SHA бекенду з SHA фронту, а версію фронту, яку віддає сервер/CDN (наприклад, /version.json з Vercel-деплою або заголовок із build-id web). Або прибрати hard-floor, поки деплої path-filtered. Мінімум: не показувати prompt повторно для того самого serverBuildId після reload (зберігати firedForBuildId у sessionStorage).

**Докази:**

```text
Живий прогін 10-buildid-floor.mjs (API-відповіді проштамповано `X-Server-Build-Id: abc1234`, клієнт 1790885): `after +30:00 updReady:false`, `after +29:00 updReady:false`, `after +02:00 toasts:["Доступна нова версія Оновити Пізніше"]` (відкрита форма ціла, примусового reload немає); тап «Оновити» → reload (`navs:[/finyk]`, form:null, waiting:null, тобто та сама збірка) → `after another +61min … "Доступна нова версія"… updReady:true`. Статично: Vercel пропускає білд web, якщо коміт не зачіпає @sergeant/web, а deploy-api пропускає деплой, якщо не змінено apps/server|packages/shared|…, тож у проді GIT_SHA бекенду і VERCEL_GIT_COMMIT_SHA фронту зазвичай різні. Screenshots: 10-buildid-toast-over-form.png, 10-buildid-toast-again.png
```

**Відтворення:**

```text
node 10-buildid-floor.mjs: context.route додає до /api/* на :3000 `X-Server-Build-Id` з іншим SHA, page.clock.install, відкрити аркуш витрати, fastForward 61 хв → тост; «Оновити» → reload у ту саму збірку; ще 61 хв → тост знову.
```

**Верифікатор:**

```text
The client logic is as described. Server and client SHAs are compared, the timer fires after 1 h, and applyUpdate falls back to location.reload() when nothing is waiting, which reloads into the same build. firedForBuildId lives only in memory, so after the reload the timer re-arms and the prompt comes back about an hour later. Vercel's ignoreCommand and deploy-api.yml's path filter do make one-sided deploys normal, so if the server sends a commit SHA, a mismatch is the common state. The premise «у проді GIT_SHA бекенду ... зазвичай різні» cannot be checked from the repo, though, and it looks doubtful. Coolify now builds Dockerfile.api from GitHub on the server. No workflow passes `--build-arg GIT_SHA` any more (grep over .github/workflows finds nothing; the Dockerfile.api:248-252 comment about deploy-api.yml passing it is stale). Coolify's own commit variable is SOURCE_COMMIT, which resolveServerBuildId does not read. Unless the owner set GIT_SHA or SENTRY_RELEASE in Coolify's environment, prod sends no X-Server-Build-Id, and the hard floor never fires: no false positive, but layer 4 is dead. If SENTRY_RELEASE is set to a fixed non-SHA value, the false positive would be permanent rather than path-dependent. The original agent reproduced it only by stamping the header itself. Real prod impact depends on configuration outside the repo, hence uncertain. If prod does send a commit SHA, I would rate it medium.
```

**Додаткові докази верифікатора:**

```text
Dockerfile.api:253-254 `ARG GIT_SHA=""`, `ENV GIT_SHA=${GIT_SHA}` (empty unless provided); `grep GIT_SHA .github/workflows/*.yml` finds nothing; buildIdHeader.ts cascade = SENTRY_RELEASE, GIT_SHA, VERCEL_GIT_COMMIT_SHA, GITHUB_SHA, BUILD_ID (no SOURCE_COMMIT); autoUpdate.ts:277,284-286,307 (in-memory firedForBuildId); useSWUpdate.ts:90-91 (reload when there is no waiting worker).
```

### [low] LiqPay: один `reversed` назавжди блокує order — наступні регулярні списання ігноруються, а підписку в LiqPay не скасовано

- **ID:** `server-static/webhooks-billing-quota#5` · **Вердикт:** сумнівно · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/billing/liqpay.ts:295-309,316-326,340-348
- **Вплив:** Гроші: після будь-якого рефанду/реверсу користувач щомісяця платить, але Pro не отримує ніколи; у DB підписки нема, тож «Скасувати» віддає 409 NO_ACTIVE_SUBSCRIPTION і списання не зупинити із застосунку.
- **Що зробити:** На `reversed` або викликати LiqPay unsubscribe для order, або трактувати reversed як скасування лише конкретного payment_id; у hasCancellationEvent враховувати порядок подій (успіх після реверсу для іншого payment_id має відновлювати доступ) і алертити на liqpay_success_after_cancellation_ignored.

**Докази:**

```text
`const isCancel = action === "unsubscribe" || status === "reversed";` → лише `UPDATE subscriptions SET status = 'canceled'` (LiqPay unsubscribe не викликається). Подальший success того ж order_id: `if (await hasCancellationEvent(client, orderId)) { logger.warn({ msg: "liqpay_success_after_cancellation_ignored" ...}); return; }`, де hasCancellationEvent шукає `event_type LIKE '%:reversed'` для цього order_id без огляду на час/payment_id.
```

**Відтворення:**

```text
Активна LiqPay-підписка (order O). Власник робить повернення одного платежу в кабінеті LiqPay → колбек status=reversed → рядок canceled. Через місяць LiqPay списує action=regular status=success з тим самим order_id → проігноровано. Кожне наступне списання — так само.
```

**Верифікатор:**

```text
Поведінку коду підтверджено. applyLiqPayCallback вважає `status==='reversed'` скасуванням і лише ставить status='canceled', без unsubscribe у LiqPay. hasCancellationEvent шукає `%:reversed` для order_id без огляду на payment_id чи час, тож будь-який наступний success або regular для цього order ігнорується (warn `liqpay_success_after_cancellation_ignored`). Рядок стає canceled, тому cancelSubscription повертає 'none', і зупинити списання із застосунку неможливо. order_id унікальний на кожен checkout (encodeOrderId з nonce), тож блок стосується лише цієї підписки. Шкода для грошей залежить від неперевіреної зовнішньої семантики: чи продовжує LiqPay регулярні списання після реверсу одного платежу. У репо цього не задокументовано, і локально перевірити не можна. Тригер — ручний рефанд власником або реверс, а LIQPAY_ENABLED=false у проді, тому severity знижено до low.
```

**Додаткові докази верифікатора:**

```text
liqpay.ts:316-326 isCancel = unsubscribe || reversed → лише UPDATE status='canceled'. liqpay.ts:295-309 hasCancellationEvent фільтрує лише за order_id. liqpay.ts:340-348 success після реверсу → return. liqpay.ts:118-122 encodeOrderId додає випадковий nonce. feature-flags.md:87 LIQPAY_ENABLED=false.
```

## info

### [info] Невідомі підшляхи й legacy-аліаси модулів показують іншу сторінку, а URL лишається хибним (redirectFrom обчислюється, але не використовується)

- **ID:** `browser-surfaces/route-matrix#9` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/web/src/modules/finyk/lib/finykRouter.ts:38-48 + hooks/useFinykRoute.ts:38-42; apps/web/src/modules/nutrition/lib/nutritionRouter.ts:58-75; routine/lib/routineRouter.ts:30-38; fizruk/lib/fizrukRouter.ts:58-75
- **Вплив:** Поділитися посиланням або додати в закладки «правильну» сторінку неможливо: URL у рядку не відповідає вмісту. Навігація всередині модуля з такого URL поводиться непередбачувано (активна вкладка без збігу з URL). Аналітика за pathname бруднішає.
- **Що зробити:** Коли парсер повернув redirectFrom або fallback, робити `navigate(canonicalPath, { replace: true })`. Для невідомих підшляхів або канонізувати на корінь модуля, або показувати 404 модуля, як вимагає routes.md («контрольований 404 або задокументований fallback»).

**Докази:**

```text
URL лишається як є, а вміст інший: `/finyk/nope` → Огляд; `/finyk/budgets/extra` → Бюджети; `/finyk/payments` → Бюджети; `/finyk/cards` → Активи; `/finyk/overview` → Огляд; `/nutrition/products` → Комора; `/nutrition/menu/zzz` → Меню; `/nutrition/pantry/zzz` → Комора; `/routine/today`, `/routine/calendar`, `/routine/nope` → Огляд; `/fizruk/nope`, `/fizruk/dashboard` → Огляд; `/fizruk/atlas/fake-muscle` і `/fizruk/atlas/__proto__` → атлас без фокусу; `/finyk/%E2%80%8B`, `/finyk/..%2F..%2Fsettings` → Огляд. `parseFinykSegments` повертає `{ page, redirectFrom }`, але useFinykRoute бере лише `.page` і не робить replace на канонічний шлях. Білих екранів і крашів не було, XSS-проби в сегментах діалогів не викликали.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/edges.mjs
```

**Верифікатор:**

```text
Факти по коду підтверджено. `parseFinykSegments` і `parseNutritionSegments` повертають `redirectFrom`, але ніхто в apps/web/src його не читає (grep). Шим useFinykRoute переписує на канонічний шлях лише legacy-ХЕШІ, а path-аліаси й невідомі сегменти лишають URL як є. Severity я знизив, бо finding перебільшує. (1) Fallback на дефолтну вкладку задокументований у коді («Returns { page: "overview" } for empty / unknown / malformed inputs»). routes.md вимагає для невідомого підшляху «задокументований fallback, не білий екран», тобто вимогу виконано, а не порушено. Там само як сумісність описано legacy-аліаси payments→budgets, products/shop→pantry, plan/recipes→menu і /routine/today. (2) Частина прикладів показує правильну сторінку: `dashboard`, `overview` і `calendar` є валідними id сторінок, тож /fizruk/dashboard, /finyk/overview і /routine/calendar рендерять потрібний вміст, просто з неканонічним URL. (3) Твердження «навігація поводиться непередбачувано» не підтвердилось. `navigateToPage` порівнює pathname з канонічним targetPath, тож клік по вкладці з /finyk/cards чи /finyk/nope нормально переходить на /finyk/assets чи /finyk. Лишається косметика: неканонічний URL у рядку адреси й закладках, брудніша аналітика за pathname і мертве поле `redirectFrom`.
```

**Додаткові докази верифікатора:**

```text
rm2.mjs, anon: /finyk/nope лишає URL /finyk/nope і показує h1 «Огляд». /finyk/cards лишає /finyk/cards і показує «Активи» з активною вкладкою «Активи». /finyk/payments лишає /finyk/payments і показує «Бюджети». З userA /fizruk/dashboard показує «Огляд», і це валідна сторінка dashboard. Пов'язаний старий пункт GLOBAL-20260804-8 (/finyk/cards → Огляд) у docs/work/specs/audits/2026-08-04-global-qa-findings.md закрито legacy-редиректом на рівні вмісту, а канонізацію URL він не покривав.
```

### [info] Оцінка 1ПМ за Еплі для одного повтору завищує вагу на 3,3 % (рекорд «103 кг» за реальні 100)

- **ID:** `client-static/domain-logic#18` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/fizruk-domain/src/lib/workoutStats.ts:31-40 (epley1rm), використовується в topPRs/exerciseDetail/LoadCalculator
- **Вплив:** Топ-рекорди й калькулятор зон для синглів завищені на 3 %; дрібно, але це саме вага на штанзі.
- **Що зробити:** Повертати weightKg при reps === 1.

**Докази:**

```text
f13: `Epley 100kg x1 = 103.33333333333334`. Формула застосовується і до reps=1, де 1ПМ відомий точно.
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx …/client-static-domain-logic/f13_misc.mts
```

**Верифікатор:**

```text
Поведінку відтворено: epley1rm(100,1) = 103.33. Однак саме так формулу записано в каноні: docs/product/modules/fizruk.md:211 визначає 1RM як `weightKg * (1 + reps/30)` з E1RM_REP_CAP=10, без окремого випадку для reps=1. Тобто код відповідає канону, а знахідка про те, що канон не врахував відому особливість Еплі (формулу зазвичай застосовують за r>1). Шкода мала: для ваги сингла завищення 3,3%, LoadCalculator при 80% дає ~82,7% справжнього максимуму. Порівняння рекордів між собою лишається узгодженим (обидва через Еплі). Якщо зробити особливий випадок для r=1, з'явиться розрив: 97×2 = 103,5 «поб'є» 100×1 = 100. Тому це рішення для канону, а не баг. Info.
```

**Додаткові докази верифікатора:**

```text
epley1rm: 100x1=103.33, 100x2=106.67, 97x2=103.47. Тест exerciseDetail.test.ts:230 використовує 100×1, але перевіряє лише розбивку по тижнях. Аудит product-knowledge-fizruk.md (E-1) і findings.md LOG-5 стосуються лише ліміту повторів (high-rep), а не reps=1.
```

### [info] Відновлення історії чату з бекапу фактично нічого не робить, хоча діалог обіцяє її перезаписати

- **ID:** `client-static/gap-backup-restore-file-imports#14` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/web/src/core/hub/hubBackup.ts:173-181; apps/web/src/core/hub/hubChatSessions.ts:96-103,141-158,214-219; apps/web/src/core/hub/HubBackupPanel.tsx:30,81
- **Вплив:** Для будь-кого, хто вже користувався чатом, відновлення історії чату є no-op при обіцянці «повністю замінить». Дрібна, але неправдива копія.
- **Що зробити:** Або прибрати chatHistory з restore та з переліку в діалозі, або відновлювати в sessions-формат (і тоді враховувати власника чату, CHAT_OWNER_KEY).

**Докази:**

```text
Restore writes only the legacy key `hub_chat_history`. migrateLegacyIfNeeded reads it only when `hub_chat_sessions_v1` is empty (`if (existing) return null;`), and the next saveSessions overwrites the legacy key with the tail of the newest session. The dialog lists «Hub: останній відкритий розділ і історія чату із Сержантом». The panel's own export never includes chat (`includeChat: false`).
```

**Відтворення:**

```text
Code read: hubBackup apply -> hubChatSessions.loadSessions order.
```

**Верифікатор:**

```text
I confirmed this in code. Restore writes only the legacy key `hub_chat_history` (hubBackup.ts:178-180). loadSessions reads the legacy key only when both the primary and mirror sessions are empty (hubChatSessions.ts:141-158, 96-103), and saveSessions overwrites the legacy key with the newest session's tail (lines 214-219). For anyone with existing chat sessions, the restored chat is a no-op. The reach is tiny, so I downgraded it below low. No UI path builds a backup with chat: the only caller is HubBackupPanel.tsx:81 with `includeChat:false`. Nothing in apps/web writes `hub_last_module` any more either, so the app's own exports have no `hub` section at all; both exports I checked lacked `hub`. The «Hub: … історія чату» line in the confirm dialog therefore appears only for legacy or hand-made files. The behaviour is real but sits on a dead legacy path.
```

**Додаткові докази верифікатора:**

```text
grep includeChat: only HubBackupPanel.tsx:81 (false). grep hub_last_module/lastModule in apps/web/src (non-test, outside hubBackup.ts): no writers. The exports r8-export.json and vx2-export.json have keys [kind, schemaVersion, exportedAt, finyk, fizruk, routine, nutrition] with no hub.
```

### [info] «Вчора» в заголовках днів транзакцій рахується як Date.now() − 24 год — хибне на добу після переходу на літній час

- **ID:** `client-static/react-correctness#10` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/pages/transactions/transactionsLib.ts:255
- **Вплив:** Косметична помилка підпису раз на рік протягом години.
- **Що зробити:** Рахувати вчорашній ключ календарно від `getKyivDayKey()` (зсув на −1 день через UTC-полудень, як `shiftDayKey`).

**Докази:**

```text
`const yesterdayKey = getKyivDayKey(new Date(Date.now() - 86400000));` У понеділок 00:00–01:00 після весняного переходу (неділя триває 23 год) мінус 24 год потрапляє в суботу, тож «Вчора» отримує субота, а неділя — звичайну дату. Поруч `shiftDayKey` у digestCorrelations.ts уже робить календарну арифметику правильно.
```

**Відтворення:**

```text
Статично; або page.clock на 2027-03-29T00:30+03:00.
```

**Верифікатор:**

```text
transactionsLib.ts:255 computes `yesterdayKey = getKyivDayKey(new Date(Date.now() - 86400000))`, which subtracts a fixed 24 h, not one calendar day in Europe/Kyiv. In spring, during Monday 00:00-01:00 after the 23-hour Sunday (2027-03-29), it lands on Saturday 2027-03-27. Sunday then gets a weekday label and Saturday is labelled «Вчора». In autumn, during Sunday 23:00-24:00 after the 25-hour day (2026-10-25), minus 24 h still lands on the same day. The todayKey check matches first, so Saturday 10-24 gets «субота, 24 жовтня» instead of «Вчора». The existing test (transactionsLibHelpers.test.ts:153-163) does not freeze the clock at a DST boundary. This is a cosmetic, one-hour-a-year label error, so info is right.
```

**Додаткові докази верифікатора:**

```text
Computed with Intl Europe/Kyiv (dst.mjs): 2027-03-29T00:30+03:00 gives today 2027-03-29 and yesterdayKey 2027-03-27; 2026-10-25T23:30+02:00 gives today 2026-10-25 and yesterdayKey 2026-10-25. Audit unification-modules.md §1.24 covers a different problem in the same function: fmtDate uses device midnight while formatStickyDayLabel uses Kyiv day keys. It does not cover this DST −24h arithmetic. Calendar helpers already exist (shiftDayKey, used in core/insights/quietLinks.ts).
```

### [info] «Сильний» матч чека порівнює mono receiptId (квитанція check.gov.ua) з фіскальним номером ДПС, тож майже ніколи не спрацьовує

- **ID:** `server-static/gap-finyk-import-receipts-correctness#17` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/finyk/receipts/matcher.ts:59-81
- **Вплив:** Пріоритет «сильного» лінку фактично не працює, тож уся точність тримається на слабкому матчі з ризиком хибних лінків.
- **Що зробити:** Звірити на живих даних. Якщо поля справді різні, прибрати strong-гілку або шукати інший сильний ключ (наприклад, суму + MCC + час ±10 хв).

**Докази:**

```text
`AND t.receipt_id = $2` з fiscalNum, тобто з ORDERTAXNUM або fn із QR. За документацією Monobank API, receiptId це «Номер квитанції для check.gov.ua» (платіжна квитанція банку), а не фіскальний номер ПРРО магазину. Практично кожен чек іде в слабкий матч сума+день (див. першу знахідку).
```

**Відтворення:**

```text
Статично, порівнянням семантики полів.
```

**Верифікатор:**

```text
In matcher.ts:59-81 the strong branch compares `mono_transaction.receipt_id = fiscalNum`. Monobank's receiptId is the check.gov.ua payment-receipt code: a 16-character XXXX-XXXX-XXXX-XXXX format, which is also the repo's own test fixture in apps/server/src/modules/mono/read.test.ts:548. Public sources confirm that check.gov.ua verifies bank payment receipts by a 16-character code. It does not verify fiscal receipts from cash registers (РРО/ПРРО). A DPS fiscal number (ORDERTAXNUM, or the QR `fn`) is a different identifier in a different format, so the equality essentially never holds. In practice the branch is even more dead than the finder says. The vision path, the only one live in prod, always sets `fiscalNum: null` (analyze.ts:206), so the strong query is skipped entirely. The DPS path is parked (DPS_API_TOKEN unset). The intent comes from the spec (receipt-scan.md:72, "`mono_transaction.receipt_id` — сильний лінк"), but it rests on a misreading of what the field means. It causes no harm, because the weak amount+date match carries every link exactly as it does for vision receipts today. That makes this an observation (info), not a defect with impact.
```

**Додаткові докази верифікатора:**

```text
read.test.ts:548 uses receiptId "XXXX-XXXX-XXXX-XXXX". analyze.ts:206 sets `fiscalNum: null`. The local DB has 0 mono_transaction rows (no Monobank locally), so a live check against data was not possible and the verdict rests on documented field semantics. receipt-scan.md:206 plans a follow-up, "Автоматичне підтягування чеків за mono_transaction.receipt_id", built on the same misconception. Sources consulted: https://api.monobank.ua/docs/index.html (receiptId example XXXX-XXXX-XXXX-XXXX) and the search results on check.gov.ua's 16-digit payment-receipt codes (e.g. https://minfin.com.ua/ua/company/a-bank/review/402778/).
```

### [info] cart/apply не обмежує кількість: без верхньої межі, без кроку для штучних товарів, дублікати позицій дозволені, lagerId не підписаний

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#15` · **Вердикт:** підтверджено · **Категорія:** `logic` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** packages/shared/src/schemas/silpo.ts:418-424 (quantity: z.number().positive()); apps/server/src/modules/silpo/cartNormalize.ts:33-56 (decodeLagerId без підпису); apps/server/src/modules/silpo/cart.ts:377-391
- **Вплив:** Баг клієнта (наприклад, грами замість штук) або змінений запит кладе в справжній кошик Сільпо абсурдну кількість. Шкода обмежена власним кошиком людини.
- **Що зробити:** Додати max (наприклад, 99 для шт, 50 кг для вагових), multipleOf(1) для невагових, дедуп lagerId. Підписувати lagerId (HMAC) або зберігати preview на сервері й приймати лише токени з нього.

**Докази:**

```text
cart-dto.mts: `apply quantity 1e9 / 0.0001 accepted: true`, `decode foreign token: {"productId":"../../x","companyId":"","branchId":"<script>"}`. Сервер передає quantity як є в silpo_add_or_update_cart_products (реальний кошик), дві selections з тим самим lagerId теж проходять. Клієнт сьогодні округлює qty до цілого >= 1, але сервер — останній рубіж перед записом у зовнішню систему.
```

**Відтворення:**

```text
cd /home/user/sergeant/apps/server && node --import tsx <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/cart-dto.mts
```

**Верифікатор:**

```text
Відтворено: запуск cart-dto.mts дає `apply quantity 1e9 / 0.0001 accepted: true`. Обидва числа приймає `SilpoCartSelectionSchema` (`quantity: z.number().positive()`, packages/shared/src/schemas/silpo.ts:418-421), і `makeApplySelections` (cart.ts:377-391) передає кількість у silpo_add_or_update_cart_products без змін. Тож верхньої межі на сервері справді немає. Реальний вплив значно менший, ніж описано. (1) Пишеться лише в кошик самої людини, під її власним Silpo-токеном. Запис іде після confirm-before-write: людина бачить «× N» у степері до підтвердження, а оформлення замовлення однаково відбувається в застосунку Сільпо. (2) Непідписаний lagerId нічого не відкриває: людина й так може покласти будь-який товар у свій кошик через застосунок Сільпо. Аргументи йдуть у JSON-RPC як дані, тож path- чи XSS-ін'єкції немає. Upstream-схема тули (__fixtures__/tools-list.json) вимагає UUID-pattern для productId, companyId і branchId, тому «../../x» чи «<script>» відхилить Сільпо. (3) Дублікати lagerId при `addQuantity: false` просто замінюють позицію і нічого не накопичують. Upstream теж не має max для quantity (`exclusiveMinimum: 0`). Опис тули просить викликача обмежувати кількість залишком на складі, і сервер цього не робить. Це defense-in-depth, а не баг: severity понижено до info.
```

**Додаткові докази верифікатора:**

```text
Повторний прогін <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/cart-dto.mts підтвердив обидва рядки. Клієнт: useSilpoCart.ts:128-129 і 188-190 округлює qty до цілого >= 1, але верхньої межі теж не має. parseLeadingQuantity (silpoCartItems.ts:28-33) перетворює рядок без одиниці «500» на 500, тож велика кількість можлива і без змінених запитів. Вона все одно видна людині до підтвердження. Upstream-схема silpo_add_or_update_cart_products: productId, companyId і branchId мають UUID pattern, quantity має exclusiveMinimum 0 і не має max.
```

## Спростовані кандидати

Верифікатор відкинув ці кандидати. Вони тут, щоб наступні аудити не подавали їх повторно.

- `server-static/sync-contract#12`: Контракт push: статус "duplicate" задекларований (OpenAPI, api-client), але сервер його не віддає; повтор ключа з іншим payload мовчки повертає старий результат. Причина: Поведінку відтворено, але вона навмисна, задокументована в тестах і безпечна. Повтор idempotency_key повертає кешований статус із sync_op_log ('applied'/'rejected'), а не 'duplicate'. Integration-тести прямо фіксують це як рішення: syncV2.integration.test.ts:334-337 «accepted=1 бо ми повертаємо кешований applied (а не "duplicate") — для UI clients це коректно, бо first-write мав ефект», і так само
