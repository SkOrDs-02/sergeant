# ADR-0057: Upgrade @anthropic-ai/sdk 0.36.3 → 0.95.x у tools/console

- **Status:** Accepted
- **Date:** 2026-05-11
- **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** PR-39 у [`docs/initiatives/stack-pulse-2026-05/pr-39-tools-console-anthropic-sdk.md`](../initiatives/stack-pulse-2026-05/pr-39-tools-console-anthropic-sdk.md)

---

## Context and Problem Statement

`tools/console` використовував `@anthropic-ai/sdk@^0.36.3` — застарілу версію з deprecated
внутрішніми типами. Найновіший стабільний реліз — `0.95.x`.

PR-39 у `docs/initiatives/stack-pulse-2026-05/` був написаний 2026-05-07 з припущенням, що
Anthropic GA-нула SDK v1 десь у Q2-2026. Це припущення на момент 2026-05-13 не реалізувалось:
`npm view @anthropic-ai/sdk dist-tags` → `latest: 0.95.2` (released 2026-05-11), `alpha:
0.34.0-alpha.0` (історичний, не пов'язаний з v1). Жодного v1.x релізу або v1-alpha-у в каналах
немає.

## Considered Options

1. **Мігрувати на ^0.95.x** — замінити версію у `package.json`, перевірити сумісність call-sites.
2. **Залишити 0.36.x** — безкоштовно зараз, але технічний борг зростає; нові можливості SDK недоступні.
3. **Перейти на HTTP-клієнт вручну** — зайва складність без переваг.
4. **Чекати v1 GA для одночасної міграції** — затримує покращення; v1 ETA невідомий.

## Decision

Обрано варіант 1: bumped `@anthropic-ai/sdk` до `^0.95.2` у `tools/console/package.json` (історично
0.36.3 → 0.95.1 у попередньому PR; PR-39 додатково pin-ить до `^0.95.2`). Усі
call-sites (`new Anthropic({ apiKey })`, `client.messages.create()`, type-only imports
`Anthropic.Tool`, `Anthropic.MessageParam`, `Anthropic.ToolResultBlockParam`, `Anthropic.TextBlock`)
повністю сумісні — streaming API (`messages.stream()`) console не використовує.

PR-39 також **enable-ить prompt caching opt-in** через env-флаг `ANTHROPIC_PROMPT_CACHE=1` —
див. розділ "Prompt caching opt-in (PR-39)" нижче. Це частина DoD optional-criterion з spec-у;
SDK v1 GA треку не блокує.

## Rationale

- 0.95.x — найновіший стабільний реліз; 0.36.x — застарілий.
- Нуль змін у бізнес-логіці: жодного streaming, жодного deprecated endpoint.
- Мінімальний ризик: lockfile оновлюється лише у `tools/console`.

## Consequences

### Positive

- Доступ до нових можливостей SDK (batch API, prompt caching helpers, нові моделі).
- Усунення security-warnings від npm audit для старого major.
- Prompt caching `CacheControlEphemeral` type вже доступний у stable `messages.d.mts` (не beta-only).

### Negative

- Lockfile змінився для `tools/console`.

### Neutral

- Публічний API `messages.create` / типи не змінились — нуль diff у бізнес-коді.

## Compliance

`pnpm --filter @sergeant/console typecheck` проходить без помилок. `pnpm --filter
@sergeant/console test` — 300 tests passed (з них 10 нових у `run-agent-loop.test.ts` під
prompt caching).

## Prompt caching opt-in (PR-39)

### Що і де

`tools/console/src/agents/run-agent-loop.ts` тепер експортує `isPromptCachingEnabled()` і коли
env-флаг `ANTHROPIC_PROMPT_CACHE` truthy (`1`, `true`, `yes`, регістронезалежно), додає
`cache_control: { type: "ephemeral" }` до двох breakpoint-ів у кожному виклику
`client.messages.create({ ... })`:

1. **System prompt** — обертається з string-форми у array `[{ type: "text", text, cache_control:
{ type: "ephemeral" } }]`.
2. **Tools** — на ОСТАННЬОМУ елементі `tools[]` додається `cache_control: { type: "ephemeral" }`
   (broadest coverage: cache breakpoint застосовується до всього префіксу запиту, включно з
   маркованим блоком, тож markup-нути хвіст `tools` = закешувати system + tools цілком).

Default — flag відсутній або не truthy → нуль diff проти попередньої поведінки. Test coverage у
`run-agent-loop.test.ts` гарантує regression-safety для обох гілок.

### Економіка

Anthropic prompt caching billing (ephemeral TTL = 5 хв, з можливістю extend-у до 1h):

- **Cache write** (перший виклик, або після 5-хв idle): +25% від base input pricing на токени
  префіксу.
- **Cache read** (subsequent calls у TTL window): 10% від base input pricing на ті ж токени.

Net-win умова: ≥2 виклики у 5-хв вікні з однаковим префіксом. Console-агенти, що проходять
тривіальний tool-use loop (≥2 turn-и за один user-message), отримують win одразу: 1-й turn
платить premium, наступні turn-и в тому самому 5-хв вікні читають з кешу. Для `/ops`,
`/marketing`, OpenClaw цикли — це норма.

Мінімальний eligible-context для caching: ~1024 input tokens (Sonnet/Haiku) / ~2048 (Opus).
Console-агенти переважно мають system+tools у діапазоні 2–5k tokens — eligible.

### Чому opt-in (а не always-on)

1. **Cost shape change** — поки не маємо PostHog/Sentry dashboard-у з cache-hit rate
   per-агент. Wave-rollout через env-флаг безпечніший.
2. **Cache-control compatibility** — деякі моделі / Anthropic beta-headers вимагають додаткового
   header `anthropic-beta: prompt-caching-2024-07-31`. Поточний SDK 0.95.x шле його автоматично
   при наявності `cache_control` у запиті, але опт-ін дає змогу швидко вимкнути якщо нашариться
   incompatibility.
3. **A/B observability** — Sentry breadcrumb-и в PR-наступнику можуть зчитувати
   `response.usage.cache_creation_input_tokens` / `cache_read_input_tokens` для перевірки
   reality-vs-expectation.

### Operations

- `ANTHROPIC_PROMPT_CACHE=1` у Railway/локальному `.env` → опт-ін.
- Без флагу або з будь-яким іншим значенням (`0`, `false`, `off`, …) → старий поведінковий
  default зберігається.

### Future work (out of scope для PR-39)

- Зчитувати `response.usage.cache_creation_input_tokens` + `cache_read_input_tokens` і логувати
  через `obs/metrics.ts` → Sentry breadcrumb для cost-tracking.
- Поширити cache breakpoints на `tools/console/src/agents/openclaw.ts` (own loop, не через
  `run-agent-loop`).
- Pin TTL на `1h` для морфологічно-стабільних агентів (ops, marketing) — Anthropic дозволяє
  переплатити за довший TTL.

## SDK v1 tracking

Поточний стан (2026-05-13): `npm view @anthropic-ai/sdk dist-tags` — `latest: 0.95.2`. Жодного
v1-pre / v1-alpha у каналах. Spec PR-39 був написаний з ETA "v1 GA у Q2-2026" — не виправдалось.

Коли v1 з'явиться (`latest` стане `1.x.x`), окремий PR:

1. Підкреслить breaking changes у новому ADR (або updated цей).
2. Bumped `^0.95.x → ^1.x.x` у `tools/console/package.json`.
3. Перевірить migration matrix call-sites (constructor, `messages.create`, type imports).
4. Re-run console test suite. Manual smoke `/start` Telegram round-trip.

До того моменту — лишаємось на 0.95.x. Прогрес треку: GitHub releases
[anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript/releases) +
quarterly review цього ADR.

## Links

- [Anthropic SDK changelog](https://github.com/anthropics/anthropic-sdk-typescript/releases)
- [Anthropic prompt caching docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- PR-39 spec: [`docs/initiatives/stack-pulse-2026-05/pr-39-tools-console-anthropic-sdk.md`](../initiatives/stack-pulse-2026-05/pr-39-tools-console-anthropic-sdk.md)
