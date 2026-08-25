# Аудит AI-шару: код, безпека, телеметрія, стенди (2026-08-25)

> **Last touched:** 2026-08-25 by @claude. **Next review:** 2026-11-25.
> **Status:** Active

Повторний прохід по AI-шару через 20 днів після [ai-pipeline-2026-08-05](./ai-pipeline-2026-08-05.md).
Той аудит лишається чинним (B3–B30 відкриті); цей — **не дублює** його знахідки,
а додає нові, звіряє стан eval-стендів і телеметрії та відповідає на питання
founder-а: що потрібно для живого тестування, чи перепроводити стенди, де межа
детермінізм ↔ AI.

**Метод.** Статичний аудит коду (4 паралельні агенти: карта інтеграцій,
chat-пайплайн, телеметрія, стенди) + ручна верифікація кожної знахідки по
файлу/рядку + механічні перевірки: `pnpm audit` (чисто: 4 high — усі під
датованими винятками в [audit-exceptions](../../04-governance/security/audit-exceptions.md)),
`promptPrefixBudget` / `toolSearch` / `chat.redaction` / `evalPromptParity` /
`toolParity` — зелені, `eval:models --dry-run` — працює (після
`pnpm --filter @sergeant/db-schema build`). Живих LLM-викликів не було — немає
ключів у середовищі (див. § «Що потрібно для живого тестування»).

## Що тримається добре (перевірено прицільно)

- Огорожі `<user_data>` / `<tool_output>` + порядок «маска → усічення →
  огорожа» — інваріант захищений тестом `chat.redaction.test.ts`.
- Квоти: atomic UPSERT, refund на всіх upstream-фейлах, circuit breaker,
  budget guard (soft/hard/monthly), Voyage-бюджет.
- Prompt-budget гейт (`promptPrefixBudget.test.ts`: префікс ≤9 000 B, факт
  7 564 B, реєстр 78 tools не всихає) і parity-гейт tool defs ↔ executors.
- Стенд ↔ прод промпти звірені механічно (`evalPromptParity.test.ts`).
- Ключі: `requireAnthropicKey` не називає env-var, ESLint-правило
  `no-anthropic-key-in-logs`, ключі в `REDACT_KEY_NAMES`.
- Ризикові tool-и (5 destructive) гейтяться confirm-ом ДО виконання, батч
  скасовується цілком.

## Нові знахідки

Нумерація продовжує B-серію попереднього аудиту (B31+). Дублікати з 08-05
(асиметрія екранування = B8, повторний резолв сесії = B9, редакція ключів =
B18) тут не повторюються.

### Пріоритет 1

#### B31 — rate limiter чату рахує по IP, а не по користувачу

`routes/chat.ts:32-43`: `rateLimitExpress` стоїть **перед** `requireSession()`,
а `rateLimitSubject` (`http/rateLimit.ts:253-258`) бере `req.user` лише якщо
попередній middleware його вже поклав. На момент спрацювання лімітера `req.user`
порожній → кожен запит падає в `ip:<addr>`. Наслідки: коментар «6 стрімів/хв на
користувача» не виконується; NAT/CGNAT-користувачі ділять один bucket; IPv6-/64
обхід, який той самий файл описує для квоти (знахідка A1 аудиту
[ai-abuse-2026-08-05](./ai-abuse-2026-08-05.md)), працює і проти лімітера.
**Фікс:** перенести `rateLimitExpress` після `requireSession()` (квота вже
стоїть правильно).

#### B32 — `tool_calls_raw` — невалідований прохід у assistant-роль

Схема (`packages/shared/src/schemas/api.ts`) типізує `tool_calls_raw` як
`z.array(z.unknown()).max(60)`, а `chat.ts:353-357` кладе його сирим у
`{role:"assistant", content: tool_calls_raw}`. Сервер перевіряє лише кількість
`tool_use`-блоків (cap M7). Клієнт може вписати довільні `text`-блоки від імені
асистента — єдиної ролі, яка навмисно **не** огороджується `<user_data>` /
`<tool_output>`. Це повний обхід injection-фенсингу (self-scoped, але отруює
`remember` → `ai_memories`, і звідти — наступні сесії через RAG).
**Фікс:** дозволити в масиві лише блоки типів
`tool_use | server_tool_use | tool_search_tool_result`, решту відкидати з 400.

### Пріоритет 2

#### B33 — сирий текст внутрішньої помилки тече в SSE-стрім

`chatStream.ts:176-182`: catch навколо body-reader-а пише
`data: {"err": <e.message>}` — будь-яке повідомлення undici/zlib/fetch доїжджає
до браузера. Двома гілками нижче (`:348-355`) той самий файл свідомо шле
generic `"AI continuation failed"`. **Фікс:** уніфікувати на generic-текст.

#### B34 — компресія стискає SSE: guard мертвий, heartbeat буферизується

`http/compression.ts:29-33` пропускає компресію лише коли
`req.headers.accept === "text/event-stream"`, але api-client завжди шле
`Accept: application/json` (`httpClient.ts:324`; стрім іде через `http.raw`).
Далі `compression.filter` бачить `Content-Type: text/event-stream`, який
`compressible` вважає стисливим (`^text/`) → стрім гзіпиться з порогом 1 KB:
перший токен затримується, а keep-alive `: ping` (кожні 15 с) буферизується —
рівно той idle-timeout, від якого heartbeat мав захищати. **Фікс:** фільтрувати
по **response** `Content-Type` (або слати `Accept: text/event-stream` у
стрім-запиті).

#### B35 — `sanitizeMessages` лишає найстаріше з сусідніх user-повідомлень

`chat.ts:593-598`: при двох поспіль повідомленнях однієї ролі виживає
**перше** (`continue` на новішому). Якщо невдалий хід не додав assistant-бульку,
модель відповідає на застаріле питання, а нове мовчки викидається. Гілка
tool-результатів робить навпаки — бере найновіше (`.reverse().find`,
`chat.ts:342`). **Фікс:** keep-newest в обох місцях.

#### B36 — `tool_results` XOR `tool_calls_raw` тихо провалюється у перший хід

`chat.ts:304` вимагає обох полів разом; запит рівно з одним трактується як
свіжий перший хід — tool round-trip мовчки губиться. **Фікс:** 400 на XOR.

#### B37 — модель коуча має два джерела істини, дефолт — доведено битий

`aiRoutingEnv.ts:34` дефолтить `OPENROUTER_COACH_MODEL = "openai/gpt-5.1"`;
tier-таблиця (`aiQuotaTierModels.ts:104-106`) з 2026-08-07 свідомо ставить
`anthropic/claude-sonnet-4.6` з розлогим поясненням, що gpt-5.1 у проді 9/10
разів падав у fallback (reasoning-токени з'їдали 20-с таймаут). Але шлях
`coach.ts` → `getLLMProvider()` поза tier-таблицею досі бере env-дефолт
gpt-5.1. **Фікс:** змінити дефолт у `aiRoutingEnv.ts` на
`anthropic/claude-sonnet-4.6` (одна правка, узгоджує обидва шляхи).

#### B38 — прайс-таблиця не знає дефолтних chat-моделей

`aiPricing.ts` містить claude-\*, `openai/gpt-5.1`,
`google/gemini-2.5-flash-lite`, але **не** `deepseek/deepseek-v4-flash` і
`z-ai/glm-5.2` — фактичні дефолти чату під `CHAT_VIA_OPENROUTER=true`
(`chatModels.ts:80-97`). `est_cost_usd` для основного трафіку = 0;
рятує лише `actual_cost_usd` від шлюзу, коли той віддає `usage.cost`
(це і був симптом «cost-метрика не рухається» з аудиту 08-05, §B1).
**Фікс:** додати обидві моделі в таблицю + тест «кожна модель із
`chatModels`/`aiRoutingEnv`-дефолтів має запис у прайсі».

#### B39 — «перезапис» без підтвердження і без undo

Правило founder-а в `toolRisk.ts:8-10` покриває «видалення і перезапис», але
`set_monthly_plan`, `set_budget_limit`, `update_budget`, `change_category`
відсутні в `TOOL_RISK`, а їхні виконавці (`finykActions/budgets.ts`) не
повертають `undo`. Модель (або інʼєкція через tool result) може мовчки
переписати місячний план/ліміти. Додатково: confirm-діалог показує лише **ім'я**
tool-а (`useDestructiveConfirm.ts:27-30`) — користувач затверджує
`batch_categorize`, не бачачи патерна і ≤50 зачеплених транзакцій.
**Фікс:** додати перезаписні tool-и в `TOOL_RISK` (reversible + undo зі старим
значенням), у діалог — короткий підсумок аргументів.

### Пріоритет 3

- **B40 — інʼєкція-детектор лише англійський.** `PROMPT_INJECTION_PATTERNS`
  (`toolOutputWrapping.ts:54-63`) не матчить «ігноруй попередні інструкції» /
  «ты теперь…» — україно/російськомовний продукт не рахує
  `chat_prompt_injection_attempt_total` для рідних мов. Огорожа тримає, це діра
  видимості, не обходу. Додати UA/RU-патерни.
- **B41 — глобальний 120-с таймаут без SSE-винятку.** `http/timeout.ts` робить
  `req.destroy()` для всіх роутів; worst-case стрім (60 с + 3 continuation)
  перевищує ліміт. Сьогодні маскується клієнтським abort-ом на 90 с.
- **B42 — немає сумарного дедлайну через retry.** 429 з `retry-after: 60`
  (clamp до 30 с) + свіжий 30-с fetch ≈ 90 с+ на один логічний запит.
- **B43 — редакція структурно не покриває chat-контент.** У
  `REDACT_KEY_NAMES` немає `content`/`messages`/`context` — захист «ми цього
  сьогодні не логуємо», а не policy. Один майбутній `logger.error({ req })` на
  chat-шляху публікує розмову. Додати deny-запис або дзеркало в `redactPaths`.
- **Мітка інʼєкцій колапсує в `unknown`** при неспівпадінні client-controlled
  `tool_use_id` → per-tool дашборд сліпне (`toolOutputWrapping.ts:67-70`).

## Телеметрія: що зламано або не існує

| Що                                    | Стан                                                                                                                                                         | Де                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| TTFT «p95 first token < 1.5 s»        | **задекларовано, не міряється ніде** — `ai_request_duration_ms` фіксується на кінці стріму; єдиний вимір TTFT — офлайн `apps/server/scripts/stream-check.ts` | `apps/server/AGENTS.md:42`, SLO.md                |
| Sentry-семплінг vision                | правило `/api/photo/analyze` **мертве** — реальний роут `/api/nutrition/analyze-photo`; падає у 0.05 fallback                                                | `sentry.ts:70-74`                                 |
| Sentry-семплінг chat/coach/digest     | правил немає — найдорожчі роути на generic fallback                                                                                                          | `sentry.ts:37-90`                                 |
| Помилки Anthropic/OpenRouter у Sentry | **не долітають взагалі**: `ExternalServiceError` operational → `errorHandler` не капчить. Аутедж провайдера видно лише в Prometheus/логах                    | `obs/errors.ts:88-110`, `http/errorHandler.ts:96` |
| `hubchat_tool_invoked`                | оголошений у контракті, задокументований, затверджений тестом — **немає жодного emitter-а**                                                                  | `analyticsEvents.ts:163`                          |
| Loki                                  | порожній 29 днів, причина невідома — прод-діагностика по логах сліпа                                                                                         | SLO.md § «Зламано»                                |
| Мобільна AI-телеметрія                | нуль подій (чат/коуч/фото)                                                                                                                                   | `apps/mobile/src/lib/analytics.ts`                |
| Anthropic budget-алерти               | обходять Prometheus (in-process loop + Sentry), Voyage — через нормальне правило; асиметрія                                                                  | `anthropicBudgetGuard.ts:55-61`                   |

Добре: `ai_requests_total` / `ai_tokens_total` / `ai_cost_estimate_usd_total` +
денний ledger `ai_usage_daily` (з `actual_cost_usd` від шлюзу) + Grafana
`ai-cost.json` — каркас обліку вартості є, точність упирається в B38.

## Стенди оцінки моделей: стан і вердикт

Стенд (`apps/server/scripts/eval/` + `eval:models|vision|tools|stream`) —
робочий і якісно обвʼязаний тестами (prompt parity, cache cost, judge reason,
vision fail-close). Але:

1. **Закомічені звіти від 2026-08-04 — stub-прогони** ($0, нуль токенів, нуль
   латентності). Живого платного результату під версійним контролем немає.
2. **Прод-дефолти чату вже інші**: `deepseek/deepseek-v4-flash` (перший хід) і
   `z-ai/glm-5.2` (синтез). Обґрунтування deepseek — прогін `eval:tools` v15
   «12 кейсів × 2» описаний лише в коментарі `chatModels.ts`; самого звіту в
   репо немає. Звіт eval-у коуча від 2026-06-26 (базис для gpt-5.1 → який потім
   виявився битим, див. B37) — теж не в репо.
3. ADR-0005 сам визнає себе застарілим і просить новий model-tiering ADR — його
   досі немає; істина живе тільки в `aiRoutingEnv.ts`/`chatModels.ts`.

**Вердикт: так, стенди треба перепровести** — живим прогоном, зі збереженням
звітів у `docs/90-work/planning/` і фіксацією рішень новим ADR. Мінімальний
набір: `eval:models --repeat=3` (12 пайплайнів), `eval:vision`, `eval:tools`
(з deepseek-v4-flash у порівнянні, бо він тепер прод), `eval:stream` (TTFT).
Це закриє і борг «звіти = stub», і перевірить чинні дефолти проти свіжих
моделей.

## Що потрібно для живого тестування (відповідь founder-у)

1. **`OPENROUTER_API_KEY` — так, це головне.** Всі чотири стенди ходять через
   OpenRouter (Anthropic-моделі — через «Anthropic Skin»), прод-дефолти теж
   OpenRouter. **Баланс: $10 вистачить із запасом.** Оцінка повного прогону
   (`eval:models --repeat=3` + vision + tools + stream) — порядку $2–5:
   моделі дешеві (flash-lite ≈ $0.10–0.40/MTok, deepseek ≈ $0.3–1.2/MTok,
   haiku ≈ $1/$5/MTok), кейсів сотні, не тисячі. Топ-ап $10 покриває
   кілька ітерацій + ручне продуктове тестування чату.
2. **`ANTHROPIC_API_KEY` — опційно.** Потрібен лише щоб перевірити
   direct-транспорт і prompt-cache метрики (`CHAT_VIA_OPENROUTER=false`) —
   стендам не потрібен. $5 депозиту досить.
3. **`VOYAGE_API_KEY` — не потрібен зараз:** live-режим RAG-eval не
   реалізований (`eval:rag` працює mock/simulate).
4. **Для продуктового E2E:** або URL стейджа + тестовий акаунт, або локальний
   запуск (`pnpm dev:db && pnpm dev:server`) з ключем у `.env` — тоді я можу
   прогнати чат/фото/чек-скан руками через реальний пайплайн.

Ключі передавати через env середовища (Coolify / локальний `.env`), не через
чат і не в репо.

## Межа детермінізм ↔ AI

**Не чіпати (детермінізм правильний і навмисний):**

- Матчер чеків Сільпо (`packages/finyk-domain/src/domain/receiptMatching.ts`) — точність
  до копійки + часове вікно; AI тут додає лише недетермінізм у грошах.
- Правило переваги MCC/детермінованих правил над AI-категоризацією
  (ADR-0027): AI заповнює прогалини, не переписує.
- Серіалізатори, мапери, bigint-коерція, контракти — Hard Rules #1/#3.
- `insightsEngine.ts` / `digestCorrelations.ts` — детерміновані кореляції
  client-side; це якраз Free-tier межа монетизації (no-LLM = Free, LLM = Pro).

**Куди докрутити AI (у пріоритетному порядку):**

1. **LLM-judge у стенді** замість частини евристичних суддів — уже в backlog
   v2 (`ai-eval-harness-v2.md` § out of scope); з OpenRouter-ключем це дешево
   (glm-4.7-flash уже і так суддя частини кейсів).
2. **Продуктизувати детерміновані кореляції як Free-value** (знахідка
   anti-slop-strategy §339) — без LLM, але це продуктовий AI-шар.
3. Ініціатива 0024 (мертві джерела AI-memory) і 0023 (multi-item фото) —
   чекають рішення founder-а, не коду.
4. Нових місць, де детермінований код варто міняти на LLM, аудит **не
   знайшов**: наявні мапери — це гроші/контракти, там детермінізм — фіча.

## Порядок робіт

1. B31 (порядок middleware) + B33 (generic err) + B36 (XOR → 400) — три
   дрібні правки, один PR.
2. B32 (валідація `tool_calls_raw`) + B35 (keep-newest) — один PR по
   `chat.ts`.
3. B34 (компресія SSE) — окремий PR, перевірити TTFT до/після.
4. B37 + B38 (модель коуча, прайс-таблиця + тест) — один PR по env/pricing.
5. B39 (перезаписні tool-и в `TOOL_RISK` + undo) — web-PR.
6. Телеметрія: TTFT-гістограма в `chatStream` (перший `content_block_delta`),
   Sentry-правила для chat/coach/digest, фікс мертвого vision-правила,
   emitter для `hubchat_tool_invoked` (або прибрати з контракту).
7. Живий прогін стендів (після отримання ключа) → звіти в
   `docs/90-work/planning/` → новий model-tiering ADR, що закриє борг
   ADR-0005.
8. B40–B43 — за залишковим принципом.

## Обмеження цього аудиту

Без ключів не перевірено наживо: фактичну поведінку моделей на промптах v23,
prompt-cache hit-rate під direct Anthropic, TTFT, роботу quota-refund під
реальними 429. Продуктові фло (чат у браузері, фото, чек-скан) не проганялися —
немає доступного стейджа з цього середовища. Це закривається пунктом 7 порядку
робіт після надання ключа.
