# AI quota kill-switch policy

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2027-11-22.
> **Status:** Active

## TL;DR

`AI_QUOTA_DISABLED=true` (or `=1`) globally disables `assertAiQuota()` —
every per-user / per-IP daily limit becomes a no-op and the AI subsystem
runs without consulting `ai_usage_daily`. **In production this is
hard-blocked at startup.** The flag exists exclusively for CI/test
environments where end-to-end suites need to call the real Anthropic API
without burning real user quota.

## Why a kill-switch exists

Nightly Playwright e2e suites (`.github/workflows/extended-e2e.yml`,
`visual-regression.yml`, `ci.yml`) talk to the real Anthropic API to
exercise the full chat / coach / nutrition flows end-to-end. Counting
those calls against the per-user daily limit would either:

1. Make the tests flaky (they would 429 themselves after a few runs in
   the same window), or
2. Force the tests to share a real user account whose quota would be
   trivially exhausted by repeated CI runs.

> **Update 2026-08-24 ([ADR-0086](../adr/0086-no-anonymous-ai-sign-in-required.md)).**
> This section used to name a per-IP `AI_DAILY_ANON_LIMIT=40` as the limit the
> suites would hit. There is no anonymous quota any more — and there never was
> one at runtime: every AI route sits behind `requireSession()` (audit A1), so
> an anonymous caller is rejected with 401 before `assertAiQuota` runs. The env
> field and the whole anonymous branch were removed as dead code. The e2e
> pressure is therefore entirely on the **authenticated** cap, which is exactly
> what the kill-switch relieves.

The simplest fix is to wholesale disable the quota subsystem when the
env reports `NODE_ENV=test`. The runtime check
(`isAiQuotaDisabled()` in `apps/server/src/modules/chat/aiQuota.ts`)
short-circuits before the `pool.query` UPSERT into `ai_usage_daily`, so
the tests can hammer Anthropic without hitting any per-day cap.

## Why production is hard-blocked

`AI_QUOTA_DISABLED` in production is a fail-open kill-switch on billing.
Once it's true, every resolved daily limit becomes `null`,
`assertAiQuota()` returns `true` unconditionally, no `ai_usage_daily`
row gets touched, and there is **no other gate** between an authenticated
user and Anthropic.

A single misconfigured Coolify secret (copy-pasted from the staging or
test environment, or smuggled in via `APP_ENV=production` + a `.env.local`
left over from local debugging) lets any client burn unlimited Anthropic budget. There is no
per-user cost cap below the quota, and the upstream Anthropic budget
guard is account-wide — by the time the alert fires, the damage is
already done.

The previous safeguard was an advisory `logger.warn` that fired once at
module import. In practice that warning was indistinguishable from any
of the dozens of legitimate "X is not configured" warnings during
production boot, and nobody saw it on staging when it shipped. Replacing
the advisory log with a startup throw means a misconfigured deploy
**refuses to boot** rather than silently leaking budget — the misconfig
is caught by the Railway crash-loop alert instead of by the next billing
cycle.

## Where the hard-block lives

Source of truth: `apps/server/src/env/env.ts` → `assertStartupEnv()`.

```ts
// Validated env exposes AI_QUOTA_DISABLED as a boolean (default false).
AI_QUOTA_DISABLED: z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1"),

// In assertStartupEnv():
if (isProduction && env.AI_QUOTA_DISABLED) {
  throw new Error(
    "AI_QUOTA_DISABLED MUST NOT be set in production. …",
  );
}
```

`isProduction` (= `isDeployedProduction()`) covers both `NODE_ENV=production`
**and** `APP_ENV=production`. The second signal covers a host that boots the
server without `NODE_ENV` explicitly set to production. The legacy
`RAILWAY_ENVIRONMENT` / `RAILWAY_SERVICE_NAME` signals were removed after
ADR-0074 (Railway retired) and are no longer treated as production.

`assertStartupEnv()` is invoked from `apps/server/src/index.ts` before
the HTTP listener binds, so a tripped check produces an unrecoverable
boot error and the process exits non-zero.

## Allowed configurations

| Environment                        | `AI_QUOTA_DISABLED` | Behaviour                               |
| ---------------------------------- | ------------------- | --------------------------------------- |
| Local dev (`NODE_ENV=development`) | `false` (default)   | Quota active, normal per-day limits     |
| Local dev (`NODE_ENV=development`) | `true` / `1`        | Allowed — quota disabled                |
| CI (`NODE_ENV=test`)               | `true` / `1`        | Allowed — quota disabled                |
| Production (`NODE_ENV=production`) | `false` (default)   | Quota active, normal per-day limits     |
| Production (`NODE_ENV=production`) | `true` / `1`        | **Hard-block** — server refuses to boot |
| Coolify (`APP_ENV=production`)     | `true` / `1`        | **Hard-block** — server refuses to boot |

## Test coverage

`apps/server/src/env/__tests__/assertStartupEnv.test.ts` — full matrix
covering:

- Production + truthy spelling (`true`, `1`) → throws.
- Production via `APP_ENV=production` without `NODE_ENV=production` → throws;
  retired `RAILWAY_*` names alone do not.
- Production + falsy spelling (`false`, `0`, unset) → does not throw.
- `NODE_ENV=test` + `AI_QUOTA_DISABLED=true` → does not throw.
- `NODE_ENV=development` + `AI_QUOTA_DISABLED=1` → does not throw.

`apps/server/src/modules/chat/aiQuota.test.ts` — runtime behaviour of
`assertAiQuota()` and `consumeToolQuota()` when the flag is set; these
tests use `process.env.AI_QUOTA_DISABLED = "1"` directly so each case
mutates the runtime state without re-importing `env.js`.

## Operational guidance

### When you need to disable the quota subsystem in a non-test env

If something pathological is happening with `ai_usage_daily` (corrupt
rows, stuck row-locks, runaway upsert errors) and you genuinely need to
disable the quota subsystem in production while you fix it:

1. Acknowledge that this exposes the Anthropic budget. Decide whether
   to hard-pause AI routes at the gateway / feature flag instead — that
   is the safer alternative.
2. If you still need to flip the flag, **un-set** `APP_ENV` **and** set
   `NODE_ENV=development` for the
   affected service. The service will boot but will be visibly
   misconfigured (Sentry / metrics / `BETTER_AUTH_TOKEN_ENC_KEY`
   warnings will surface).
3. Document the reason in an incident ticket and remove the override
   immediately after.

### What to monitor

- Railway boot crash-loop alerts (`Error: AI_QUOTA_DISABLED MUST NOT be
set in production`) — fires the moment the misconfig hits.
- Anthropic billing dashboard daily spend — secondary signal if the
  hard-block is somehow bypassed.
- `ai_quota_blocks_total` (Prometheus counter) — sustained zero in
  production while traffic is non-zero is a smoke signal.

## Runbook: per-tool cost-override механізм

Окрім kill-switch-а, AI-квота має **per-tool** шар поверх плоского
`default`-bucket-а (chat/coach/digest/nutrition, cost=1). Tool-use виклики
(коли модель викликає function на нашій стороні) йдуть у власні bucket-и
`tool:<name>` у `ai_usage_daily` через `consumeToolQuota()`
(`apps/server/src/modules/chat/aiQuota.ts`). Деталі формули та precedence —
у docstring-ах `toolCost()` / `toolLimit()` / `consumeToolQuota()`; нижче —
операційна вижимка.

### Два незалежні важелі

| Важіль          | Що задає                           | Env                                | Default                   | Per-tool?      |
| --------------- | ---------------------------------- | ---------------------------------- | ------------------------- | -------------- |
| **Cost** (вага) | НАСКІЛЬКИ дорогий один tool-виклик | `AI_QUOTA_TOOL_COST`               | `3` (`DEFAULT_TOOL_COST`) | Ні (глобально) |
| **Limit**       | СКІЛЬКИ одиниць квоти на день      | `AI_QUOTA_TOOL_LIMITS` (JSON-мапа) | див. precedence нижче     | Так            |

Гейт спрацьовує атомарно в `consumeQuota`:
`request_count + toolCost() > toolLimit(name)` → блок. Тому реальна кількість
дозволених викликів на день = `floor(limit / cost)`. Напр. `limit=30`,
`cost=3` → 10 викликів `tool:change_category` на день.

### Default cost-формула

- `default`-bucket (звичайний chat) — `cost=1` (hardcoded у `assertAiQuota`).
- `tool:<name>`-bucket — `cost = AI_QUOTA_TOOL_COST` (default `3`). Вартість
  **глобальна**: усі tool-и коштують однаково; per-tool override саме ВАРТОСТІ
  наразі немає. Невалідне/від'ємне значення env-а ігнорується (`parseLimit`) і
  падає на дефолт.

### Precedence ліміту (від найвищого до найнижчого)

`toolLimit(toolName)` обирає денний ліміт так:

1. `AI_QUOTA_TOOL_LIMITS[toolName]` — явний per-tool ліміт із JSON-мапи
   (`{"change_category":30, ...}`), якщо ключ присутній і значення — валідне
   невід'ємне число.
2. `AI_QUOTA_TOOL_DEFAULT_LIMIT` — fallback для tool-ів поза мапою (а також
   коли `AI_QUOTA_TOOL_LIMITS` взагалі не задано).
3. `null` (unlimited у межах загальної user-квоти) — якщо й дефолт не задано.

Битий JSON у `AI_QUOTA_TOOL_LIMITS` → fail-open на default-ліміт +
`logger.warn("ai_quota_tool_limits_parse_failed")` (advisory-фіча не повинна
блокувати запити).

### Як тюнити в проді

1. Щоб подорожчати ВСІ tool-и одразу — підняти `AI_QUOTA_TOOL_COST`
   (Railway secret). Зачіпає всі `tool:*`-bucket-и.
2. Щоб обмежити конкретний дорогий tool — додати/змінити ключ у
   `AI_QUOTA_TOOL_LIMITS` JSON-мапі (значення — в ОДИНИЦЯХ КВОТИ, не у
   викликах: щоб дозволити N викликів, постав `N * AI_QUOTA_TOOL_COST`).
3. Щоб вимкнути tool через квоту — постав його ліміт `0`
   (`consumeToolQuota` поверне `ok=false, reason="disabled"`).
4. Канонічний приклад значень — `docs/02-engineering/integrations/env-vars.md`
   (`AI_QUOTA_TOOL_COST` / `AI_QUOTA_TOOL_DEFAULT_LIMIT` /
   `AI_QUOTA_TOOL_LIMITS`). `.env.example` тримає поточний робочий JSON.

> На відміну від `assertAiQuota`, `consumeToolQuota` НЕ відправляє 429 сам —
> caller у chat-хендлері вирішує, як сигналізувати (зазвичай текстова
> відповідь "ліміт вичерпано" замість виклику tool-а). DB-недоступність →
> fail-open (`reason="store_unavailable"`), узгоджено з рештою модуля.

## Runbook: preset-відро (сценарні режими)

Третій тип bucket-а поряд із `default` і `tool:<name>` —
`preset:<name>` для сценарних режимів чату (`CHAT_PRESETS` у
`@sergeant/shared`; сьогодні це `profile_interview` і `profile_add_info`,
кнопки секції «Пам'ять ШІ» у профілі).

**Навіщо.** Онбординг-інтерв'ю пам'яті не влазило у Free-ліміт. Рахунок:
`FREE_LIMITS.aiRequestsPerDay = 5`, і кожен тур їх їсть — тур із tool-call-ом
коштує ДВА запити (перший + синтез після `remember`, обидва проходять
`assertAiQuota`). Інтерв'ю на 4 обміни ≈ 8 запитів, тож новий користувач
упирався в paywall посеред онбордингу, з половиною незбережених фактів.

**Як влаштовано** (`resolvePresetBudget` у
[`aiQuotaBudget.ts`](../../../apps/server/src/modules/chat/aiQuotaBudget.ts)):

| Властивість | Значення                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| Bucket      | `preset:<name>` — **окремий лічильник на кожен preset**, не спільний              |
| Вікно       | **тиждень** — `usage_day` = понеділок київського тижня (колонка лишається `DATE`) |
| Ліміт       | per-preset, див. precedence нижче; вбудовані дефолти `10` / `4`                   |
| Cost        | `1`, як у `default`                                                               |
| 429         | `code: "AI_QUOTA_PRESET"` — текст веде до безкоштовного ручного заповнення        |

### Precedence ліміту (від найвищого до найнижчого)

`presetWeeklyLimit(preset)` — дзеркало `toolLimit()`:

1. `AI_QUOTA_PRESET_LIMITS[preset]` — JSON-мапа
   (`{"profile_interview":10,"profile_add_info":4}`), точкове налаштування
   одного режиму;
2. `AI_QUOTA_PRESET_WEEKLY_LIMIT` — одне число на **всі** режими (глобальний
   важіль; `0` вимикає сценарні режими цілком через 429);
3. вбудований per-preset дефолт: `profile_interview` = `10`
   (≤4 повідомлення × 2 запити + запас на повтор), `profile_add_info` = `4`
   (один-два обміни за раз, але дію повторюють протягом тижня).

Битий JSON у `AI_QUOTA_PRESET_LIMITS` → fail-open на наступний рівень +
`logger.warn("ai_quota_preset_limits_parse_failed")`. «Безлімітного» варіанту
немає навмисно: відро існує саме як стеля.

### Стеля зловживання

Поле `preset` приходить від клієнта, і сервер не може перевірити, що це
справді заповнення профілю — будь-хто може причепити `preset` до звичайного
запиту й обслужитись із цього відра замість денного. Оборона тришарова, і
жоден шар не є «захистом» сам по собі:

1. **Масштаб** — тижневе вікно замість денного. При денному стеля була б
   `+limit` **щодня**; при тижневому — `+limit` на весь тиждень. Сумарно
   сьогодні це `+14` на тиждень понад денні 5 (`10` + `4`).
2. **Сенс** — `OFF_TOPIC_RULE` у
   [`chatPresets.ts`](../../../apps/server/src/modules/chat/chatPresets.ts):
   у сценарному режимі асистент не виконує сторонніх запитів, а повертає
   користувача до питання. Вкрадений бюджет не конвертується у безкоштовний
   універсальний LLM — тобто трюк не просто обмежений, а безрезультатний.
   Це промпт, а не контракт; він знімає мотив, а не можливість.
3. **Що під ним** — `requireSession()` на роуті (вектор прив'язаний до
   акаунта, не до IP — знахідка A1), per-route rate-limit (6 стрімів/хв) і
   account-wide Anthropic budget guard.

Лічильники навмисно **окремі, а не спільні**: `profile_add_info` — дія, яку
повторюють тижнями, і спільний бюджет означав би, що людина, яка пройшла
інтерв'ю, до кінця тижня не може додати жодного факту. Ціна цього рішення —
стеля = сума лімітів усіх режимів; **додаєш новий preset → перерахуй її**.

Сильніший варіант (сервер сам видає квиток на режим, `preset` із тіла
ігнорується) свідомо НЕ реалізований: він потребує per-user стану з TTL і
лічильником ходів, а закриває вектор вартістю в центи на тиждень з акаунта.
Вмикати за сигналом із метрики нижче, не раніше.

### Що моніторити

- `ai_cost_consumed_total{bucket_type="preset"}` — єдиний прямий сигнал.
  Здоровий профіль: рідкісні сплески, по одному на нового користувача.
  **Тривожний:** багато акаунтів стабільно впираються в стелю тижня —
  це вже не онбординг, а систематичне використання відра як обхідного
  каналу. Тоді або опускай ліміт через `AI_QUOTA_PRESET_LIMITS`, або йди у
  варіант із серверним квитком.
- `ai_quota_blocks_total{reason="limit"}` разом зі сплеском `preset`-cost —
  користувачі впираються у стелю; розрізняй «інтерв'ю не влазить» (тоді
  ліміт замалий) і «хтось молотить» (тоді завеликий).
- Частка 429 з `code: "AI_QUOTA_PRESET"` у логах роуту `/api/chat`.

**Порядок резолву в `assertAiQuota`:** founder-bypass → plan-limit (`null` =
Pro, вихід без відра) → `resolvePresetBudget()` → інакше `default`. Тобто
Pro-юзер preset-відра взагалі не торкається, а невідоме значення `preset`
(enum-звірка в `isChatPreset`) тихо падає у звичайне денне відро — підсунути
собі нове відро довільним рядком не можна.

**Як вимкнути:** `AI_QUOTA_PRESET_WEEKLY_LIMIT=0` блокує всі сценарні режими
(429 з `AI_QUOTA_PRESET`), або точково через `AI_QUOTA_PRESET_LIMITS`
(`{"profile_interview":0}`).

## Related docs

- ADR-0022 — `docs/04-governance/adr/0022-atomic-sql-quotas.md` (ADR-12.3: buckets
  `default` vs `tool:<name>`, atomic UPSERT-гейт).
- ADR-0042 — `docs/04-governance/adr/0042-password-hashing-strategy.md` (similar
  fail-closed pattern for bcrypt 72-byte cap).
- `docs/04-governance/security/rate-limit-failure-mode.md` — same fail-closed mental
  model for `/api/auth/*`.
- `docs/90-work/initiatives/stack-pulse-2026-05/pr-15-ai-quota-disabled-hardblock.md`
  — original plan record.
