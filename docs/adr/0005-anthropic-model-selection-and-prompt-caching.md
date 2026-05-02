# ADR-0005: Anthropic model selection + prompt caching

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/adr/0002-tool-lifecycle.md`](./0002-tool-lifecycle.md) — ADR-2.7 (cache breakpoint), ADR-2.8 (model selection / version bumps вийняті в окремий ADR — цей).
  - [`apps/server/src/modules/chat/chat.ts`](../../apps/server/src/modules/chat/chat.ts) — `model: "claude-sonnet-4-6"`, `applyToolsCacheBreakpoint`, `buildSystem`.
  - [`apps/server/src/modules/chat/toolDefs/systemPrompt.ts`](../../apps/server/src/modules/chat/toolDefs/systemPrompt.ts) — `SYSTEM_PROMPT_VERSION = "v6"`.
  - [`apps/server/src/lib/anthropic.ts`](../../apps/server/src/lib/anthropic.ts) — usage-метрики (`cache_creation_input_tokens`, `cache_read_input_tokens`).
  - [`apps/server/src/obs/metrics.ts`](../../apps/server/src/obs/metrics.ts) — `anthropic_prompt_cache_hit_total{version, outcome}`.

---

## 0. TL;DR

ADR-0002 (`ADR-2.8: Не-цілі`) явно винесв model selection і version bumps у
окремий ADR. На сьогодні код вживає `claude-sonnet-4-6` у 10+ місцях
(grep `model:` показує: `chat.ts` ×2, `coach.ts`, `weekly-digest.ts`,
`nutrition/{analyze-photo, refine-photo, day-plan, day-hint, week-plan,
parse-pantry, recommend-recipes, shopping-list}.ts`). Жодного env-flag-у,
жодного A/B, жодної policy "коли бампати". Цей ADR фіксує:

- **Single tier для MVP:** `claude-sonnet-4-6` для всіх Anthropic-викликів.
  Жодних haiku-fallback-ів, жодного opus-pesumption.
- **Prompt-cache breakpoint:** 1 cache_control на останньому tool-у
  (~6000+ токенів system + tools). SYSTEM_PREFIX свій breakpoint має, але
  поки не активується (під 1024-токеновим мінімумом).
- **Version-bump policy:** будь-яка зміна `SYSTEM_PREFIX` → `+1` до мажора
  у `SYSTEM_PROMPT_VERSION`. Це лейбл для `anthropic_prompt_cache_hit_total`,
  не "семвер" моделі.
- **Model bump policy:** через single-source const `ANTHROPIC_MODEL` (TBD у
  follow-up PR), не grep-replace 10 файлів. Bump = окремий PR з KPI-фазою з
  ADR-2.

| Аспект              | Decision                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| Default model       | `claude-sonnet-4-6` (єдиний tier на MVP)                                      |
| Model fallback      | Немає. Якщо Sonnet down → 503 + refund quota (`refundQuotaOnUpstreamFailure`) |
| Cache strategy      | `cache_control: { type: "ephemeral" }` на останньому tool-у                   |
| SYSTEM_PREFIX cache | Forward-looking: cache slot активується автоматично коли prefix > 1024        |
| Per-user `context`  | Без cache_control (per-user fragmentation)                                    |
| Version label       | `SYSTEM_PROMPT_VERSION = "v6"` → label у Prometheus                           |
| When to bump        | Будь-яка зміна `SYSTEM_PREFIX`-тексту (пункт нижче)                           |

---

## ADR-5.1 — Default model: `claude-sonnet-4-6`, без fallback-ів

### Status

accepted.

### Context

Anthropic пропонує три tier-и: Haiku (швидкий, дешевий, слабший reasoning),
Sonnet (collateral за швидкістю/якістю), Opus (топ якість, у 5× дорожчий).
Sergeant викликає Anthropic з 10+ контекстів — chat (з tools), coach insights,
weekly digest, nutrition photo-analysis (vision), pantry parsing,
recipe recommendations.

Аргументи за Haiku як default:

- Дешевше: ₴-cost per chat-message ~5-10× нижче.
- Швидше: 2-3× швидший first-token latency.

Аргументи проти:

- На tool-calling Haiku помиляється у виборі `tool_use` ~15-20% більше
  (Anthropic-доку benchmarks). У Sergeant це означає: модель пропонує
  `query_food_db` замість `log_meal`, юзер бачить "у тебе 0 калорій" і
  втрачає trust. Cost-saving не виправдовує.
- Vision (analyze-photo, refine-photo) на Haiku не distinguish-ить між
  схожими стравами. Це фронт-лінія nutrition-модуля; помилка тут =
  юзер вилогінюється.

Аргументи за Opus:

- Якість на complex reasoning (cross-module digest) — помітна.

Аргументи проти Opus:

- 5× cost. На MVP при `effectiveLimits` `5 chat msg/day` для Free це не
  страшно, але для Pro безлімітного — токен-burn значний.
- Latency: 8-12s first-token. Юзер думає, що сервер крашнутий.

### Decision

**`claude-sonnet-4-6` — єдиний tier для всіх Anthropic-викликів.**
Hardcoded на сьогодні; centralize через ADR-5.4 follow-up.

Жодного fallback-у. Якщо Anthropic 503 → ми 503 + refund quota
([`chat.ts:381-383`](../../apps/server/src/modules/chat/chat.ts#L381-L383)).
Альтернативу "fallback на Haiku при Sonnet outage" відкидаємо: різна якість
відповіді при тих самих тулзах буде джерелом репорту "AI зробив фігню", і
ми не зможемо reproduce — `tool_call` таблиця не зберігає, який саме model
викликався.

### Consequences

**Позитивні:**

- Один номер моделі у всіх КPI / cost-projection / Grafana-dashboard-ах.
- Tool quality — predictable. ADR-2.7 (cache_control) має сенс лише при
  фіксованому tier-і; cache invalidate-иться при зміні моделі.
- Юзер на Pro має consistent experience.

**Негативні:**

- При high-volume juser-ах (Pro, безлімітні AI-запити) — cost ~$0.015 per
  chat-message. На 1000 Pro × 30 msg/day = $450/місяць пейлоадів. Acceptable
  на MVP (Free 5/day cap основну масу обмежує).
- Якщо у Phase 4 з'явиться "експерт-режим" для Opus-якості — треба
  per-endpoint model. Не блокер сьогодні.

### Alternatives considered

- **Haiku для не-tool ендпоінтів (coach, digest):** відкинуто, бо digest —
  cross-module narrative, складність reasoning порівнянна з chat.
- **Per-user A/B Sonnet vs Haiku:** відкинуто. Анальоз тулзов-error-rate
  потребує 30+ днів і dashboard-у; передчасна оптимізація.
- **Auto-fallback на Haiku при Sonnet 503:** відкинуто (див. вище).

---

## ADR-5.2 — Prompt cache strategy: один breakpoint на останньому tool-у

### Status

accepted.

### Context

Anthropic prompt-caching: `cache_control: { type: "ephemeral" }` маркер на
будь-якому блоці кешує **все ДО нього включно** на 5 хвилин. Cache key —
hash(model + system + tools + messages_до_breakpoint-а). При cache_read
платимо 0.1× input_tokens замість 1.0×.

У Sergeant є три потенційні breakpoint-и:

1. SYSTEM_PREFIX (~987 токенів станом на v6) — 80% контексту, рідко
   міняється. Логічний breakpoint #1.
2. Tools array (~5500 токенів, 40+ tools) — рідко міняється, перший tool у
   ADR-0002 lifecycle. Breakpoint #2.
3. Last user-message — мінятиметься з кожним запитом, кешувати немає сенсу.

Anthropic API має ліміт **4 cache_control блоки** на request. Min cacheable
size: **1024 tokens для Sonnet** (haiku — 2048).

### Decision

**Один cache_control на ОСТАННЬОМУ tool-у в `tools` array.** Реалізація:

```ts
// apps/server/src/modules/chat/chat.ts:62-83
function applyToolsCacheBreakpoint(tools: typeof TOOLS) {
  const cloned = tools.slice();
  const last = cloned[cloned.length - 1];
  cloned[cloned.length - 1] = {
    ...last,
    cache_control: { type: "ephemeral" },
  };
  return cloned;
}
```

Anthropic трактує останній breakpoint у порядку `system → tools → messages`
як "кешуй все до цього блоку включно" — отже SYSTEM + всі tools кешуються
одним slot-ом. Ефективно це ~6500+ токенів cache, з яких ~5500 — tools.

**SYSTEM_PREFIX — другий cache_control "forward-looking".** Зараз префікс
~987 токенів — рівно під 1024-мінімумом для Sonnet, тому slot фактично не
реєструється. Залишаємо breakpoint бо: (а) prefix зросте з часом
(governance-instructions, додаткові tool-policies); (б) Anthropic
автоматично активує slot, як тільки розмір перевищить мінімум — ніяких
змін у коді.

```ts
// apps/server/src/modules/chat/chat.ts:52-60
function buildSystem(context: string): AnthropicSystemBlock[] {
  const cached: AnthropicSystemBlock = {
    type: "text",
    text: SYSTEM_PREFIX,
    cache_control: { type: "ephemeral" }, // forward-looking
  };
  if (!context) return [cached];
  return [cached, { type: "text", text: context }];
}
```

**Per-user `context` — БЕЗ cache_control.** Інакше створимо own cache slot
per-юзера → fragmentation cache pool-у Anthropic-у. Replace cache slot
кожні 5 хвилин для одного юзера = марна оплата cache_write. Натомість
context — звичайний text-блок після prefix-а; cache key охоплює весь system,
тож фрагментація все одно є (один slot per user), але без додаткового
cache_write-payment.

### Consequences

**Позитивні:**

- Реальний cache hit-rate ~70% (per-user в межах 5-хвилинної сесії).
  Це було видно з PR-12.A ([#864](https://github.com/Skords-01/Sergeant/pull/864))
  через `anthropic_prompt_cache_hit_total{version, outcome}`.
- Cache_read = 0.1× ціни → економимо ~60% на input tokens у активних
  юзерів.
- Один-cache_control = 1 з 4 доступних slots — є запас на майбутні
  breakpoint-и.

**Негативні:**

- Cache invalidate-иться при будь-якій зміні `tools` (додавання чи
  видалення). При batch-add 5 tools — один cache miss на 5 минут.
  Mitigation з ADR-2.7: робити batch-add одним PR, не N окремих.
- Per-user fragmentation — у нас 100 паралельних юзерів = 100 cache slots,
  Anthropic може поскидати older-LRU-slots. Acceptable: 5-хв TTL для
  active-юзера достатньо.

### Alternatives considered

- **Cache_control на messages[N-1]:** для chat-сесії з 10+ повідомлень
  потенціал, але ми не зберігаємо conversation-state у БД (stateless API);
  кожен `/api/chat` приходить з повним `messages[]` від клієнта, тож
  предметний пориви cache-hit-у на messages = мінімальні.
- **Two breakpoints (SYSTEM + tools):** еквівалентно одному на tools для
  поточного prefix-розміру (<1024 не активується). Лишимо forward-looking
  на SYSTEM, активних slots — все одно один.
- **`extended-cache-control` (1h TTL):** beta-feature Anthropic. На
  short-session use-case (Sergeant chat — 5-10 хв) не дає переваги, додає
  cost при cache_write. Розглянемо при появі stable beta.

---

## ADR-5.3 — Version-bump policy для SYSTEM_PROMPT_VERSION

### Status

accepted.

### Context

`SYSTEM_PROMPT_VERSION = "v6"` (`apps/server/src/modules/chat/toolDefs/systemPrompt.ts:24`)
використовується як `version` лейбл у `anthropic_prompt_cache_hit_total`.
Без чіткої політики ця версія дрейфує: при PR-style refactor-ах
`SYSTEM_PREFIX` хто-то bump-ить, хто-то ні. Метрика втрачає смисл:
ми бачимо `cache_hit{version="v6"}=80%`, не знаючи, що 3 з 5 PR-ів
змінили текст без bump-у.

### Decision

**Будь-яка свідома зміна тексту `SYSTEM_PREFIX` → `+1` до версії.** Без
формального semver'у — це лейбл для метрик, не контракт. Криptерії "свідома
зміна":

- Додавання/видалення інструкції (наприклад, нової tool-policy).
- Зміна формулювання, що міняє behavior (translation, fewer/more directive).
- Whitespace-only / comment-only — НЕ bump (cache hash не зміниться у
  Anthropic, бо whitespace нормалізується до hash-у; також при rebase ці
  зміни тривіальні).

ESLint-rule або pre-commit перевірка на bump — TBD у follow-up. Сьогодні —
review-rule: при зміні `systemPrompt.ts` reviewer перевіряє bump.

### Consequences

**Позитивні:**

- Grafana-query `cache_hit{version="v7"}` після bump-у показує миттєвий
  drop hit-rate-у в перші 5 хвилин (ми очікуємо це; cache miss-cycle).
- Easy to reason: "коли catastrophic regression в quality — bisect-имо по
  versions у git log, не по hash-у текста".
- KPI-фаза з ADR-2 знаходить просто bump-and-correlate по version-у.

**Негативні:**

- Реактивна enforce. До first miss reviewer може not bump, ми це бачимо
  лише через cache-miss-rate spike "на ровному місці".
- Mitigation: TBD ESLint-rule (`require-system-prompt-version-bump-on-prefix-change`).

### Alternatives considered

- **Auto-bump через git hash:** надмірно складний; також не дає
  human-readable history.
- **Semver (major.minor.patch):** для лейблу не потрібно. Простий
  inkrementuj `vN`.

---

## ADR-5.4 — Centralize model name (TBD у follow-up PR)

### Status

proposed.

### Context

`grep -rn "claude-sonnet" apps/server` показує 10+ файлів. Майбутній model
bump (на `claude-sonnet-5-x`, наприклад) = grep-replace — error-prone і
unreviewable.

### Decision

**Винести в `apps/server/src/lib/<anthropicModel>.ts` (планований шлях) як `ANTHROPIC_MODEL`
const.** Імпортується у `chat.ts`, `coach.ts`, `weekly-digest.ts`, всі
`nutrition/*.ts`. Один PR — один git-diff, один CHANGELOG entry.

> _Update 2026-04-30_: на момент імплементації окремого файлу
> `anthropicModel.<ts>` немає; модель прописана inline у [`apps/server/src/modules/chat/chat.ts`](../../apps/server/src/modules/chat/chat.ts)
> та [`coach.ts`](../../apps/server/src/modules/chat/coach.ts) (`"claude-sonnet-4-6"`),
> а observability-helpers живуть у [`apps/server/src/lib/anthropic.ts`](../../apps/server/src/lib/anthropic.ts).
> Винесення — все ще `proposed`; ADR не змінено.

Не робимо це у цьому ADR-PR (бо ADR — рішення, не імплементація). Окремий
PR з міткою `chore(server): centralize Anthropic model constant`.

### Consequences

**Позитивні:**

- Bump = one-line PR, automerge-able через bot.
- Тести на `chat.test.ts` блокуються import-фікстурою — не fragile.

**Негативні:**

- Перехід на per-endpoint model (Phase 4) вимагатиме refactor-у назад до
  per-call. Acceptable trade-off на MVP.

### Alternatives considered

- **Env-var `ANTHROPIC_MODEL`:** зайве. Model — це деталь implementation,
  не deployment. Розгортання з різними models = різна якість UX, на що
  ми не хочемо.
- **Per-endpoint enum:** надмірно складне для one-tier MVP.

---

## ADR-5.5 — Що НЕ робимо (out of scope)

### Status

accepted.

### Decision

Цей ADR **не** покриває:

- **Vision-only / text-only model split.** Anthropic Sonnet vision вже
  працює через ту саму endpoint; не виносимо у окремий model-tier.
- **Streaming vs non-streaming model selection.** Streaming використовує
  той самий model (`anthropicMessagesStream` у `lib/anthropic.ts:268`).
- **Anthropic API version (`anthropic-version: 2023-06-01`).** Bump
  цього header-а — окремий operational PR; не міняє API-shape сьогодні.
- **OpenAI/Gemini fallback.** Vendor lock-in на Anthropic — свідомий
  trade-off на MVP. ADR про multi-vendor — Phase 6+.
- **Token-budget guards (max_tokens на endpoint).** Вже у коді
  (`max_tokens: 2500` для chat-tool-result, 1500 для chat first-step,
  see `chat.ts:347` and `chat.ts:416`); фіксуємо при потребі окремого ADR.

---

## Open questions

1. **Quality monitoring для tool-call accuracy.** Як ми дізнаємось, що
   Sonnet деградував або новий version regress-нув? Ідея: sampling 1%
   conversations через `tool_call_quality_total{version, model, outcome}`
   counter, де outcome = `expected | unexpected_tool | no_tool_when_expected`.
   Ground truth — manual review. TBD playbook.
2. **Prompt-cache hit-rate threshold для алерту.** `<50% hit-rate` за
   1 годину — алерт? Поки немає baseline, treadmill-ом збираємо метрики 7
   днів post-launch, потім задаємо threshold.
3. **Coach pre-warming.** Якщо coach-insight генерується щовечора в
   фіксований час, можна попередньо викликати Anthropic-API "пустим"
   запитом, щоб прогріти cache. Marginal economy; розглянемо при cost > $300/міс.
