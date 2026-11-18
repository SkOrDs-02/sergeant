# SPEC: Стрім першого ходу чату (С-1 (а))

> **Last touched:** 2026-11-18 by @claude (§ Замір 2026-11-18: стрім не скорочує, план заміру глибини міркувань); раніше 2026-11-18 by @claude (створено: спека й реалізація за рішенням founder-а § 11.9). **Next review:** 2027-02-18.
> **Status:** Active

## Проблема

Перший хід HubChat не стрімився: веб слав `POST /api/chat` без `stream`,
сервер чекав повну відповідь моделі (`callAnthropicWithContinuation`, спроба
до 12 с, один повтор, стеля 30 с) і віддавав JSON. Людина бачила «Думаю…»
усю найдовшу частину очікування (медіана ≈6,7 с, максимум 13,7 с за
заміром 2026-09-01, `AGENTS.md` § Performance budgets). Підпис кроку
С-1 (б) тут не допомагав: модель ще не обрала інструмент, тож показати було
нічого (журнал `hub-coach.md`, 2026-11-18, «Обмеження»). Вступ моделі перед
викликом інструмента («Зараз знайду…») губився зовсім: коментар у
`useChatSend.ts` казав «вже дострімлена в UI», але перший хід не стрімився
(С-1 розбору
[`2026-11-17-modules-teardown-vs-leaders.md` § 11.5](../research/2026-11-17-modules-teardown-vs-leaders.md)).

## Мета

Людина бачить ранній підпис кроку («Шукаю операцію»), щойно модель обрала
інструмент, і текст першого ходу, поки модель його пише. Вступ моделі стоїть
над картками. Обрив посеред відповіді лишає написане з кнопкою «Ще раз».
Дії на пристрої виконуються лише після зібраної відповіді. Старі клієнти й
старий сервер працюють як раніше. Надійність не гірша: зависання до першого
кадру лікує тиха повторна спроба, як сьогодні повтор після 12 с.

## Рішення дизайну

Продуктові (founder 2026-11-18, § 11.9 розбору, блок «Стрім першого ходу
чату»):

- **Видно і підпис кроку, і текст, що зʼявляється.** Кроками: спершу ранній
  підпис (кадр `{ tool }` на `content_block_start` блоку `tool_use`), потім
  текст (кадри `{ t }`). Підпис береться з готового `progressLabel`
  (`packages/shared/src/lib/assistantCatalogue.ts`, `describeToolStep`), кілька
  різних інструментів дають «Виконую кілька дій», як у С-1 (б).
- **Обрив посеред відповіді лишає написане з кнопкою «Ще раз».** Джерело:
  § 11.9. Інженерні дефолти довкола: під текстом рядок «Відповідь обірвалась.»
  і кнопка «Ще раз» (`apps/web/src/shared/i18n/uk.hubChatStream.ts`); кнопка
  шле те саме питання новим ходом; обірвана відповідь лишається на екрані, але
  не йде в історію сервера (`withoutInterrupted`), щоб модель не дописувала
  свій уривок. Обрив, коли видно лише підпис кроку без тексту, дає звичайну
  бульбашку помилки (написаного немає).
- **Швидкість важливіша за звірку чисел до показу.** Звірка (ADR-0097,
  `numberVerify/shadow.ts`) іде на зібраній відповіді після показу, як у
  турі синтезу (`chatStream.ts`).
- **Викочується всім одразу**, без етапу «спершу founder і бета» і без
  прапорця на людину. Джерело: § 11.9 (відхилення від поради).

Інженерні (головна сесія, бриф 2026-11-18; не продуктові):

- **Режим вмикає клієнт.** Веб шле `stream: true` на першому ході
  (`chatApi.firstTurn`, `packages/api-client/src/endpoints/chat.ts`). Сервер
  стрімить перший хід лише на цей прапорець, тож старі клієнти (JSON, зокрема
  мобільний `useInlineAiRail.ts` і вебовий `budgetsLib.ts`) не змінились.
- **Фронт їде в прод раніше за бекенд** (`AGENTS.md` § Deployment). Старий
  сервер на `stream: true` першого ходу відповідає JSON; клієнт дивиться на
  `content-type`, а не на свій прапорець, і йде старим шляхом без помилки.
- **Протокол кадрів** (`ChatStreamFrameSchema`, `packages/shared/src/schemas/api.ts`):
  `{ t }`, `{ tool }` (лише імʼя `^[a-z][a-z0-9_]{0,63}$`), `{ final }` з тим
  самим вмістом, що JSON-відповідь (`ChatFirstTurnResponseSchema`: `text`,
  `tool_calls`, `tool_calls_raw`, `round_trip_ticket`), `{ err, code? }`,
  кінець `[DONE]`. Аргументи інструментів (`input_json_delta`) клієнту не
  стрімляться: сервер збирає їх і віддає лише у `final`; частковим аргументам
  віри немає.
- **Дії на пристрої — лише після `final`.** Клієнт виконує `tool_calls`
  (і гейт підтвердження деструктивних, канон § 8) тим самим кодом, що для JSON.
- **На зібраній відповіді** працюють ліміт M7 (`MAX_TOOL_ITERATIONS = 8`,
  у стрімі — кадр `err` з `code: "MAX_TOOL_ITERATIONS"` і повернення квоти),
  квиток раунду (`attachRoundTripTicket`), кеш відповіді (`chatResponseCache.ts`;
  попадання віддається тими самими кадрами: текст одним кадром, кроки, `final`)
  і тіньова звірка чисел. Континуація на `max_tokens` для текстової відповіді
  (AI-DANGER у `chatUpstream.ts`) є і в стрімі.
- **Квота, ліміти швидкості, heartbeat (`SSE_HEARTBEAT_MS`), модель першого
  ходу (`env/chatModels.ts`, `google/gemini-3.7-flash` через OpenRouter) і
  префікс промпта не змінено.** Касети tool-eval не перезаписуються.
- **Надійність.** До першого видимого кадру — одна тиха повторна спроба:
  бюджет першої спроби `CHAT_ATTEMPT_TIMEOUT_MS` = 12 с (той самий, що
  лікує прод-зависання в JSON-шляху, `chat.ts`), друга живе до стелі
  `CHAT_TOTAL_TIMEOUT_MS` = 30 с; повтор також на мережевий збій і 429/5xx.
  Збій до відкриття потоку — та сама JSON-помилка й повернення квоти, що без
  стріму. Після першого видимого кадру повтору немає: кадр `err`, написане
  лишається, квота не повертається (людина щось отримала, та сама логіка, що
  в `chatStream.ts`). Стеля одного стріму 60 с, як у турі синтезу.
- **Метрики.** `chat_first_turn_phase_ms{phase="total"}` лишається і на
  стрімі означає повну відповідь (фаза `upstream` триває до зібраної
  відповіді). Нові: `chat_first_turn_first_visible_ms{kind, source}` (від
  входу в handler до першого кадру `{tool}` або `{t}`; `source` = `model` або
  `cache`) і `chat_first_turn_silent_retry_total{reason}`. **Ціль для першого
  видимого знаку ратифікувати після заміру** (див. Верифікацію); числа тут
  свідомо немає.
- **Hard Rule #21.** Кадри й текст моделі не логуються; лог збою несе лише
  модель, статус, `shown` і причину провайдера.
- **Розмір модулів (Hard Rule #18).** `chat.ts` стояв рівно на 600 рядках,
  тож `callAnthropicWithContinuation` винесено в `chatUpstream.ts` без змін;
  стрім живе в `chatFirstTurnStream.ts`. На вебі логіка стріму в
  `hub/chat/firstTurnStream.ts`, `useChatSend.ts` 583 рядки.

## Поверхня змін

- `apps/server/src/modules/chat/chatFirstTurnStream.ts` — новий: тихий повтор,
  SSE-канал, збірка блоків, кадри, континуація, повтор із кешу.
- `apps/server/src/modules/chat/chatUpstream.ts` — новий: винесений
  `callAnthropicWithContinuation` (без змін поведінки).
- `apps/server/src/modules/chat/chat.ts` — гілка `stream` першого ходу,
  спільний кінець ходу (M7, кеш, квиток, звірка) для JSON і стріму.
- `apps/server/src/modules/chat/chatStream.ts` — експорт `mergeStreamUsage`,
  `SSE_GENERIC_ERROR`.
- `apps/server/src/obs/metrics.ts` — дві нові метрики.
- `apps/server/scripts/stream-check.ts` — `--first-turn`, `--repeat`.
- `packages/shared/src/schemas/api.ts`, `packages/shared/src/openapi/*`,
  `docs/engineering/api/openapi.json` — контракт кадрів (Hard Rule #3).
- `packages/api-client/src/endpoints/chat.ts` — `firstTurn`,
  `parseChatStreamFrame`, `ChatStreamError`.
- `apps/web/src/core/hub/chat/firstTurnStream.ts`, `useChatSend.ts`,
  `HubChatBody.tsx`, `apps/web/src/core/hub/HubChat.tsx`,
  `apps/web/src/core/components/ChatMessage.tsx`,
  `apps/web/src/core/lib/hubChatUtils.ts` (поля `interrupted`, `retryText`),
  `apps/web/src/shared/i18n/uk.hubChatStream.ts`.
- Канон: `docs/product/modules/hub-coach.md` § Журнал рішень; доки метрик
  `docs/operations/observability/metrics.md` § 6a; `AGENTS.md`,
  `apps/server/AGENTS.md` (рядок «перший хід не стрімиться»).
- Owner-скіл: `sergeant-module-ai` (+ `sergeant-server-api`, `sergeant-web-ui`).

## Поза скоупом v1

- Мобільний клієнт (`apps/mobile`, ADR-0094): лишається на JSON.
- Стрім `tool_use`-аргументів у UI (показ «шукаю "Сільпо"» до `final`):
  аргументи до `final` неповні, віри їм немає.
- Ціль SLO для першого видимого знаку: після платного заміру.
- Повтор після першого видимого кадру (замість «Ще раз»): суперечить
  рішенню founder-а.

## Верифікація (обовʼязково)

1. Тести (RED → GREEN):
   - `pnpm --filter @sergeant/server exec vitest run src/modules/chat/chat.firstTurnStream.test.ts`
     — кадри тексту й кроку, `final` у формі JSON, аргументи лише у `final`,
     метрика першого знаку, JSON без `stream`, обрив після тексту (`err`, без
     повтору й повернення квоти), тихий повтор на 5xx і на зависання, JSON-помилка
     до потоку, M7 кадром, кеш тими самими кадрами; кожен кадр проходить
     `ChatStreamFrameSchema`.
   - `pnpm --filter @sergeant/api-client exec vitest run src/endpoints/chat.test.ts`
     — `firstTurn`: колбеки, старий сервер JSON, `ApiError` до потоку,
     `ChatStreamError` на `err` і на обрив без `final`.
   - `pnpm --filter @sergeant/web exec vitest run src/core/hub/chat/useChatSend.stream.test.tsx src/core/components/ChatMessage.test.tsx src/core/hub/chat/HubChatBody.test.tsx`
     — ранній підпис, дії лише після `final`, текст під час генерації, вступ
     над картками (стрім і старий JSON), обрив → текст лишається з «Ще раз»,
     обірвана відповідь не йде в історію.
2. Платний замір (робить головна сесія): прод-форма першого ходу, час до
   першого `content_block_start` проти повного часу:
   `OPENROUTER_API_KEY=proxy-injected pnpm --filter @sergeant/server eval:stream --first-turn --models=google/gemini-3.7-flash --repeat=5`
   (3 сценарії × 5 = 15 викликів). Таблиця «перший кадр / ранній підпис /
   повна відповідь» іде в цю спеку, ціль ратифікує founder.
3. Після деплою (`AGENTS.md` § Прод не оновлюється сам): у Grafana
   `histogram_quantile(0.5, sum by (le, kind) (rate(chat_first_turn_first_visible_ms_bucket{source="model"}[1h])))`
   нижче за `chat_first_turn_phase_ms{phase="total"}` того ж вікна;
   `rate(chat_first_turn_silent_retry_total[1h])` порядку колишніх повторів
   після 12 с; частка `HUBCHAT_ERROR{kind:"interrupted"}` у PostHog.
4. Click-through на прод-білді 390 × 844: «знайди останню покупку в Сільпо» —
   спершу «Шукаю операцію», потім вступ, потім картка під ним і відповідь;
   «як мені менше витрачати на продукти» — текст зʼявляється шматками;
   вимкнути мережу посеред відповіді — текст лишається, «Відповідь
   обірвалась. Ще раз».

## Замір 2026-11-18

Платний замір п. 2 «Верифікації»: `google/gemini-3.7-flash` через OpenRouter,
`pnpm --filter @sergeant/server eval:stream --first-turn --repeat=5`, 3 сценарії
× 5 = 15 викликів. Медіани:

| Сценарій                    | Перший видимий знак | Повна відповідь |
| --------------------------- | ------------------- | --------------- |
| пошук (`find_transaction`)  | ранній підпис 3,6 с | 3,8 с           |
| запис (витрата 250 грн)     | ранній підпис 3,0 с | 3,0 с           |
| текст (порада про продукти) | перший токен 5,3 с  | 5,8 с           |

Висновок: модель 3–5 с міркує до першого токена (`thinking_delta`), а
інструмент чи текст видає в самому кінці. Стрім майже нічого не скорочує;
важіль — глибина міркувань на першому ході. Чат її досі не задавав (вирішує
шлюз; для цієї моделі дефолт `medium`).

**Рішення founder-а: «спершу заміряти».** Глибину знижуємо лише якщо
правильність вибору інструмента не впала і вигаданих id нуль; інакше цифри
йдуть founder-у. Поведінка проду цим кроком не змінюється.

Що для цього зроблено:

- Змінна `CHAT_FIRST_TURN_REASONING_EFFORT` (`env/aiRoutingEnv.ts`, реєстр —
  `feature-flags.md` § 3.1): `none | low | medium | high | xhigh`. Не задана —
  поля в запиті немає, як сьогодні. Діє лише на першому ході (JSON і стрім
  мають один `firstTurnPayload` у `chat.ts`) і лише через шлюз.
- Форма поля. Перший хід ходить на Anthropic-сумісний `/api/v1/messages`, а
  не на chat-completions, тож поля `reasoning`, яким користується
  `OpenRouterProvider`, там немає. Шлюз приймає `output_config.effort`
  (`low | medium | high | xhigh | max`) і `thinking: {type: "disabled"}` та
  сам перекладає їх у уніфікований `reasoning` для будь-якої моделі
  (документація OpenRouter, «Reasoning with the Anthropic Messages API»).
  `minimal` цей ендпоінт не приймає, тому його немає й у переліку змінної.
  Переклад — `chat/chatReasoning.ts::firstTurnReasoningFields`.
- Можливості моделі за `GET /api/v1/models` на 2026-11-18:
  `google/gemini-3.7-flash` — `mandatory: true`, рівні `high | medium | low`,
  дефолт `medium`. Отже нижчий доступний рівень — `low`; вимкнути міркування
  (`none`) для цієї моделі не можна.
- Стенди: `eval:tools --reasoning=<рівень>` (усі `ALL_CASES`, і з
  `--follow-up`) та `eval:stream --first-turn --reasoning=<рівень>` шлють ту
  саму форму тією самою функцією; у підсумкових таблицях стовпець глибини
  (`шлюз` = поля не було). `--reasoning` разом із `--record` відмовляє:
  касета пінить прод-форму.

План заміру (робить головна сесія, ключ — заглушка):

1. `OPENROUTER_API_KEY=proxy-injected pnpm --filter @sergeant/server eval:tools`
   — контроль без глибини: 82 кейси, до 87 викликів (багатоходові кейси
   додають ходи).
2. `OPENROUTER_API_KEY=proxy-injected pnpm --filter @sergeant/server eval:tools --reasoning=low`
   — те саме з `low`, до 87 викликів.
3. `OPENROUTER_API_KEY=proxy-injected pnpm --filter @sergeant/server eval:tools --follow-up --repeat=5`
   і те саме з `--reasoning=low` — по 15 викликів.
4. `OPENROUTER_API_KEY=proxy-injected pnpm --filter @sergeant/server eval:stream --first-turn --models=google/gemini-3.7-flash --repeat=5 --reasoning=low`
   — 15 викликів; контроль — таблиця вище.

Критерій: `low` у п. 2 дає `Correct` не нижче за п. 1 і `Invented ids` = 0, і
те саме для п. 3. Тоді — пропозиція founder-у задати `low` і ратифікувати ціль
першого видимого знаку за п. 4. Інакше обидві таблиці йдуть founder-у як є.

## Ризики та відкриті питання

- **Фронт раніше за бекенд.** Новий веб на старому сервері отримує JSON і йде
  старим шляхом (тест api-client «старий сервер відповідає JSON»). Після
  деплою бекенду стрім вмикається сам, без прапорця (рішення founder-а).
- **Проксі, що буферизують SSE.** Заголовки ті самі, що в турі синтезу
  (`X-Accel-Buffering: no`, `no-transform`), той самий heartbeat; якщо
  корпоративний проксі тримає потік, людина побачить усе одразу в кінці, як
  раніше, без помилки.
- **OpenRouter і `tool_use` у стрімі.** Збірка `input_json_delta` для
  `gemini-3.7-flash` на прод-формі підтверджується платним заміром (п. 2);
  запис у `env/chatModels.ts` дає 0 зривів із 8 на звʼязці «стрім +
  інструменти». Битий JSON аргументів = збій ходу (`bad_tool_input`), а не
  виконання з порожніми аргументами.
- **Кеш відповіді віддає текст одним кадром.** Стрімом це не виглядає, але
  швидше за модель; окремо видно в метриці (`source="cache"`).
- **Мітка «Озвучити» на обірваній відповіді лишається** (озвучує написане);
  окремого рішення не потребує.
- Відкритих продуктових питань у цій спеці немає: все, що не задали відповіді
  founder-а, — інженерні дефолти вище.
