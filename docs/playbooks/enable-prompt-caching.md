# Playbook: Enable Anthropic Prompt Caching

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Status:** ✅ active (PR-12.A, Sprint 0)

**Trigger:** «Зменшити cost Anthropic» / «Anthropic API занадто дорогий» / `aiTokensTotal{kind="prompt"}` росте лінійно з трафіком, бо стабільні `SYSTEM_PREFIX` і `TOOLS` повторюються на кожному запиті.

---

## Контекст

`SYSTEM_PREFIX` (`apps/server/src/modules/chat/toolDefs/systemPrompt.ts`) і `TOOLS` (`apps/server/src/modules/chat/tools.ts`) — стабільні на всіх `/api/chat` запитах: змінюється тільки appended `context` блок з даними юзера. Anthropic prompt caching дозволяє позначити стабільну частину `cache_control: { type: "ephemeral" }`; перший запит «запишеться» у кеш (cost трохи вищий — `cache_creation_input_tokens`), наступні протягом ~5 хв читатимуть з кешу за ~10% від звичайної ціни (`cache_read_input_tokens`).

Деталі — `AGENTS.md` → _SYSTEM_PREFIX is a prompt-cache candidate_. Цей playbook — конкретний rollout.

**Передумови:**

- Модель підтримує prompt caching. На момент написання — всі актуальні Claude (3.5 Sonnet, Sonnet 4 і `claude-sonnet-4-6`, який зараз у `chat.ts`) підтримують.
- Будь-який `model` upgrade пізніше — перевір Anthropic docs/release notes: підтримку prompt caching і мінімальний cacheable prompt length для цієї моделі.
- `SYSTEM_PREFIX` уже стабільний (не міксує per-user дані). Якщо ти збираєшся рефакторити промпт у тому ж PR — спочатку зроби prompt caching, потім окремим PR — рефактор. Інакше cache miss-и за перші 5 хв після деплою накладуться.

---

## Важливий урок з PR #790

Не покладайся тільки на `cache_control` на `SYSTEM_PREFIX`.

Live smoke з реальним Anthropic key показав:

```text
SYSTEM_PREFIX-only:
request 1: cache_creation=0 cache_read=0
request 2: cache_creation=0 cache_read=0
SMOKE NOT OK
```

Причина: у PR #790 `SYSTEM_PREFIX` був ~987 токенів, нижче Sonnet-порогу 1024 токени, який діяв для поточної моделі. Anthropic не повертає error для занадто короткого breakpoint-а — request проходить, але usage має `cache_creation_input_tokens = 0` і `cache_read_input_tokens = 0`.

Viable rollout для Sergeant:

1. Залишити `SYSTEM_PREFIX` як окремий cached `system` block — forward-looking marker.
2. Додати другий breakpoint на останній stable tool definition — це реально проходить minimum length, бо `TOOLS` значно більші за `SYSTEM_PREFIX`.

Observed smoke після tools breakpoint:

```text
+ tools breakpoint:
request 1: input=360 cache_creation=12284 cache_read=0
request 2: input=3   cache_creation=357   cache_read=12284
SMOKE OK
```

---

## Steps

### 1. Перетвори `system` з string на блоки

`apps/server/src/modules/chat/chat.ts` має передавати `system` як масив — кешований префікс і динамічний контекст:

```ts
interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

function buildSystem(context: string): AnthropicSystemBlock[] {
  const cached: AnthropicSystemBlock = {
    type: "text",
    text: SYSTEM_PREFIX,
    cache_control: { type: "ephemeral" },
  };
  if (!context) return [cached];
  return [cached, { type: "text", text: context }];
}
```

**Чому два блоки, а не один:** `cache_control` помічає границю кешу. Все ДО і ВКЛЮЧНО з блоком `cache_control` йде в кеш; що після — динамічна частина. Якщо лишити одну строку `SYSTEM_PREFIX + context`, то `context` теж потрапить у кеш-ключ і кожен різний user отруїть свій slot.

**Правила:**

- `SYSTEM_PREFIX` — окремий `text` block із `cache_control`.
- `context` — окремий `text` block **без** `cache_control`.
- Якщо `context === ""`, не додавай empty text block: Anthropic відхиляє empty text blocks.
- Застосуй `buildSystem(context)` і для першого request-а, і для tool-result continuation.

### 2. Додай tools breakpoint

`SYSTEM_PREFIX` може бути нижче мінімальної довжини cached prefix, тому додай `cache_control` до останнього tool. Не мутуй імпортований `TOOLS`, бо він реекспортується і може використовуватись у тестах/інших модулях.

```ts
function applyToolsCacheBreakpoint(
  tools: typeof TOOLS,
): Array<(typeof TOOLS)[number] & { cache_control?: { type: "ephemeral" } }> {
  if (tools.length === 0) return tools;
  const cloned = tools.slice();
  const last = cloned[cloned.length - 1];
  cloned[cloned.length - 1] = {
    ...last,
    cache_control: { type: "ephemeral" },
  } as typeof last & { cache_control: { type: "ephemeral" } };
  return cloned as Array<
    (typeof TOOLS)[number] & { cache_control?: { type: "ephemeral" } }
  >;
}

const TOOLS_WITH_CACHE = applyToolsCacheBreakpoint(TOOLS);
```

Payload-и мають використовувати `TOOLS_WITH_CACHE`:

```ts
{
  model: "claude-sonnet-4-6",
  max_tokens: 1500,
  system: buildSystem(context),
  tools: TOOLS_WITH_CACHE,
  messages: cleaned,
}
```

Серверний `chat.ts` тримає rollout invariant як `system` → `tools` → `messages`: `SYSTEM_PREFIX` і tool definitions мають бути стабільними, а `context` лишається окремим non-cached system block. Для Sergeant важливий практичний контракт: usage має показати non-zero `cache_creation_input_tokens` на першому запиті і non-zero `cache_read_input_tokens` на повторному.

### 3. (Опц.) Beta header — лише для старих моделей

На моделях, що офіційно підтримують prompt caching у GA (Sonnet 4-сімейство, 3.5 Sonnet після Sep 2024), beta header **не обов'язковий**. Якщо переходиш на legacy модель або хочеш бути захищеним від drift Anthropic — додай у `apps/server/src/lib/anthropic.ts` рядок ~166 і ~245:

```ts
headers: {
  "Content-Type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
  // NOTE: Prompt caching у GA для актуальних моделей; header додаємо
  // як страхування для legacy моделей у майбутніх експериментах.
  "anthropic-beta": "prompt-caching-2024-07-31",
},
```

Якщо пропускаєш цей крок — нічого не зламається на актуальних моделях. Прочитай Anthropic release notes перед увімкненням, якщо нова модель додалась.

### 4. Версіонуй `SYSTEM_PREFIX`

Додай константу версії, щоб **навмисні** зміни промпту легко логувати у Prometheus:

```ts
// apps/server/src/modules/chat/toolDefs/systemPrompt.ts
export const SYSTEM_PROMPT_VERSION = "v4";
export const SYSTEM_PREFIX = `Ти персональний асистент …`;
```

Бампай при кожній свідомій зміні `SYSTEM_PREFIX`. Після bump — перші запити кожного юзера будуть cache miss (нова cache key), що очікувано і коротко.

### 5. Метрики `cache_creation` / `cache_read`

`apps/server/src/lib/anthropic.ts` `recordUsage()` сьогодні логує тільки `input_tokens` / `output_tokens`. Після увімкнення кеш-у Anthropic повертає у `usage`:

```ts
interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
```

Розшир `recordUsage`:

```ts
if (Number.isFinite(usage.cache_creation_input_tokens)) {
  aiTokensTotal.inc(
    { provider: "anthropic", model, kind: "cache_write" },
    usage.cache_creation_input_tokens,
  );
}
if (Number.isFinite(usage.cache_read_input_tokens)) {
  aiTokensTotal.inc(
    { provider: "anthropic", model, kind: "cache_read" },
    usage.cache_read_input_tokens,
  );
}
```

Те саме застосуй у `recordUsage` для streaming варіанта (`anthropicMessagesStream`).

### 6. Тести

Мінімальний набір для `apps/server/src/modules/chat/chat.test.ts`:

- `system` — масив: cached `SYSTEM_PREFIX` + non-cached `context`.
- Empty `context` не створює empty text block.
- Останній tool має `cache_control: { type: "ephemeral" }`, попередні tools — без breakpoint-ів.
- Tool-result continuation також використовує cached `SYSTEM_PREFIX`.

Запуск:

```bash
pnpm --filter @sergeant/server exec vitest run src/modules/chat
pnpm --filter @sergeant/server exec vitest run src/lib/anthropic
```

### 7. Manual verification у dev

```bash
# 1. Старт сервера з реальним ANTHROPIC_API_KEY (не AI_QUOTA_DISABLED smoke).
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @sergeant/server dev

# 2. Перший запит до /api/chat від тестового юзера.
#    У логах response.usage → шукай cache_creation_input_tokens > 0.

# 3. Другий ідентичний запит протягом ~5 хв.
#    cache_read_input_tokens > 0.
```

Якщо у другому запиті `cache_read_input_tokens === 0`:

- Перевір, що cached prefix достатньо довгий для моделі.
- Перевір, що між двома запитами не змінився cached block (`TOOLS`, `SYSTEM_PREFIX`, whitespace, model, tool_choice).
- Перевір, що другий запит пішов після того, як перший response почався/завершився; паралельні запити можуть не бачити щойно створений cache entry.

### 8. Production rollout

- Деплой → перші ~5 хв cache miss-и для всіх юзерів (що нормально).
- Через 5–15 хв подивись Grafana `aiTokensTotal{kind="cache_read"}` — має лінійно рости.
- Cost: target — багаторазове зниження billed input tokens на repeated chat-flow.

Якщо `cache_read` лишається на 0 при non-zero traffic — зроби smoke з real key і подивись raw `usage`; length-based caching failures silent.

---

## Verification

- [ ] `system` у обох викликах `chat.ts` — block array: cached `SYSTEM_PREFIX` + optional dynamic `context`.
- [ ] `context` не кешується і empty context не додає empty text block.
- [ ] Останній stable tool у payload має `cache_control: { type: "ephemeral" }`.
- [ ] (Якщо застосовно) `anthropic-beta: prompt-caching-2024-07-31` додано і в звичайний, і в стрімовий клієнт.
- [ ] `SYSTEM_PROMPT_VERSION` додано і логічно підвищується з кожною свідомою зміною промпту.
- [ ] `recordUsage` пише `kind: "cache_write"` і `kind: "cache_read"` у `aiTokensTotal`.
- [ ] Dev smoke: два послідовні `/api/chat` дають `cache_creation > 0` (1-й) і `cache_read > 0` (2-й).
- [ ] Тести `chat.test.ts` оновлені під нову структуру `system` і green.
- [ ] PR description містить: token-cost diff або smoke output, reference на Anthropic prompt caching docs, Grafana/metrics notes.

## Notes

- **Не міняй `SYSTEM_PREFIX` часто.** Кожна зміна — повний cache invalidation, для всіх активних юзерів. Якщо потрібно подіагностувати tone — кешуй stable prefix і додай експериментальний rider у `context` блок (не у кеш).
- **Не додавай breakpoint-и всюди.** Anthropic має ліміт cache breakpoints на request; тримай один forward-looking system breakpoint і один practical tools breakpoint, доки немає виміряної потреби.
- **TTL ephemeral кешу — ~5 хв** з останнього read. Для sparse трафіку (юзер заходить раз на годину) prompt caching не дасть значної економії; має сенс для активних сесій / інтенсивного chat-flow.
- **Cache key чутливий побайтно.** Невидимий whitespace-diff, BOM, нерозривні пробіли — все робить cache miss. Не редагуй `SYSTEM_PREFIX` у редакторі без unicode-aware diff.
- **Minimum length failures silent.** Якщо prompt нижче порогу моделі, request успішний, але `cache_creation_input_tokens` і `cache_read_input_tokens` лишаються 0.

## Моніторинг (як перевірити в production)

### Prometheus метрики

1. **Token-level** (наявні): `aiTokensTotal{kind="cache_write"}` / `aiTokensTotal{kind="cache_read"}` — кількість токенів записаних / прочитаних з кешу.
2. **Request-level** (новий): `anthropic_prompt_cache_hit_total{version="<SYSTEM_PROMPT_VERSION>", outcome="hit|miss"}` — кількість запитів з cache hit / miss. Outcome `hit` якщо `cache_read_input_tokens > 0`.

### Grafana queries

```promql
# Cache hit rate (%)
sum(rate(anthropic_prompt_cache_hit_total{outcome="hit"}[5m]))
/
sum(rate(anthropic_prompt_cache_hit_total[5m]))

# Token savings from cache reads
sum(rate(ai_tokens_total{kind="cache_read"}[5m]))

# Cache invalidation спалахи (після бампу SYSTEM_PROMPT_VERSION)
sum(rate(anthropic_prompt_cache_hit_total{outcome="miss"}[5m])) by (version)
```

### Після деплою

- Перші ~5 хв — очікувані cache miss-и для всіх юзерів.
- Через 5–15 хв: `anthropic_prompt_cache_hit_total{outcome="hit"}` має зростати.
- Якщо `outcome="hit"` лишається на 0 — див. секцію "Manual verification у dev".

## See also

- [tune-system-prompt.md](tune-system-prompt.md) — як міняти `SYSTEM_PREFIX` без поломки tool-calling (виконуй до або в окремому PR від caching rollout)
- [AGENTS.md](../../AGENTS.md) — секції _Architecture: AI tool execution path_ і _SYSTEM_PREFIX is a prompt-cache candidate_
- `apps/server/src/lib/anthropic.ts` — `anthropicMessages` / `anthropicMessagesStream` / `recordUsage`
- `apps/server/src/modules/chat/chat.ts` — `buildSystem`, `applyToolsCacheBreakpoint`, request payload-и.
- Anthropic docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
