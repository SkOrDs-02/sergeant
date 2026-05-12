# SPIKE — openclaw 5.7 plugin SDK reality-check

> **Last validated:** 2026-05-12 by Devin (update 13:30 UTC — Row 1 corrected: lifecycle hooks реєструються через `api.on`, не `api.registerHook`). **Next review:** після Stage 4b live smoke-test після PR #2471 (`api.on` migration).
> **Status:** Active
> **Owner:** @Skords-01 · **Created:** 2026-05-12
> **Roadmap reference:** [`docs/planning/openclaw-migration-plan.md` § Reality update 2026-05-12](../../planning/openclaw-migration-plan.md) — Stage спайк рядок (`🔬 Spike`).
> **Supersedes (for SDK shape claims):** [`docs/notes/spikes/openclaw-poc.md`](./openclaw-poc.md) § "SDK contract type-safely fits". PoC `sdk-types.ts` був локальним guess-ом; цей спайк фіксує реальний SDK.

## Мета

Stage 2 уже працює у production на real `openclaw@2026.5.7` SDK, але до Stage 3 (write-tools) і Stage 4 (hooks) треба зняти 4 unknown-и з плану:

1. **Hook API.** Реальний `api.registerHook` — назви подій, payload shape, контракт відмови (`block` vs `throw` vs повернути `requireApproval`).
2. **Approval API.** Чи має SDK native `requiresConfirmation`/`requiresApproval` на самому tool-і, чи лише через hook? Це визначає, чи `Locked decision #5 = Variant B (custom hook)` ще актуальне.
3. **Per-persona allowlist.** Як скрутити доступ персони до підмножини tools — JSON-config, SKILL.md frontmatter, чи окремий API?
4. **Scheduler API.** Чи є `registerCronSkill`/`scheduleSkill` для morning-digest (heartbeat 09:00 Kyiv), чи це через нативний `cron.*` блок конфігу, чи через n8n fallback?

Метод: `npm install openclaw@2026.5.7 typebox` у scratch-директорії + `grep -rn` по `node_modules/openclaw/dist/plugin-sdk/**/*.d.ts`. SDK ship-ає компільовані `.d.ts` — це джерело правди.

## TL;DR висновки

| #   | Питання                                             | Реальність                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Імплікація для плану                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hook API                                            | **Два різних method-и** на `api`, які легко переплутати. **Для lifecycle hooks** (`before_dispatch`, `llm_input`, `agent_end`, `before_tool_call` і всі інші з `PluginHookName` enum) canonical — **`api.on(hookName, handler, opts?)`** (пушить у `registry.typedHooks`, який `hookRunner` зачитує). Реальний канонічний enum — **34 hook-и** (`PluginHookName` у `plugin-sdk/src/plugins/hook-types.d.ts`). **`api.registerHook(events, handler, opts)`** — це **OKREMA internal command bus** (`InternalHookEventType: "command"\|"session"\|"agent"\|"gateway"\|"message"`), не для lifecycle. Найкорисніші lifecycle hooks для нас: `before_dispatch` (Stage 4b Layer 0), `llm_input`, `llm_output`, `before_agent_finalize`, `agent_end`, `before_tool_call`, `after_tool_call`, `tool_result_persist`, `session_start`, `session_end`, `heartbeat_prompt_contribution`. **`before_agent_start` позначений `@deprecated`** у real SDK (`hook-types.d.ts:566` JSDoc) — used as Stage 4a audit-open hook **тимчасово**, з відомою TODO-міграцією. **Для conversation hooks** (`llm_input`, `llm_output`, `before_agent_finalize`, `agent_end`) loader вимагає `plugins.entries.<id>.hooks.allowConversationAccess: true` у конфігі для non-bundled plugins.                                                                                                                                                                                                                                                                                                                                                                                                                       | Stage 4a (budget+audit) поки використовує `llm_input` (per-call gate) + `agent_end` (finalize) + `before_agent_start` (open invocation — needs follow-up: real event shape є `{ prompt, runId?, messages? }`, не `userMessage`, тому реальні `userMessage`-reads повертають `undefined`; міграція на `session_start` або `agent_turn_prepare` у окремому PR). **Stage 4b shortcut router живе на `before_dispatch`, не `before_agent_start`** — див. рядок 5 нижче для канонічного контракту.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2   | Approval API                                        | На самому tool-і поля `requiresConfirmation`/`requiresApproval` **нема**. Approval — це **return-value контракт hook-а `before_tool_call`**: handler повертає `{ requireApproval: { title, description, severity?, timeoutMs?, timeoutBehavior?, onResolution? } }`, і runtime сам зробить gating через UI/console. Decision enum — `PluginApprovalResolution`: `"allow-once" \| "allow-always" \| "deny" \| "timeout" \| "cancelled"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Locked decision #5 треба переглянути.** Не "Variant B (custom hook + Telegram buttons)" — SDK дає native approval через `before_tool_call.requireApproval`. Це fewer moving parts: лишається custom hook **тільки якщо** ми хочемо доставити підтвердження ззовні (Telegram inline keyboard) поза openclaw UI. Sublocked: для Stage 3 write-tools цього взагалі не треба — Stage 4a реалізує hook.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | Per-persona allowlist                               | Канонічно: `agents.<id>.tools: AgentToolsConfig` у `openclaw.json`, де `AgentToolsConfig` = `{ profile?: ToolProfileId, allow?: string[], alsoAllow?: string[], deny?: string[], byProvider?: …, elevated?: …, exec?: …, fs?: …, … }` (`plugin-sdk/src/config/types.tools.d.ts`). Той самий тип, що й `tools.alsoAllow` на root — просто scoped під персону.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Stage 5a — це чисто config-as-code change у `ops/openclaw/openclaw.example.json`: переніс плоский `tools.alsoAllow` під `agents.<persona>.tools.alsoAllow` (з deny-list-ом, що відсікає write-tools там, де персона їх не має — наприклад `seo` не повинен мати `create_github_issue`). Жодних `register*Allowlist` API на стороні плагіна не треба.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4   | Scheduler API                                       | Є `api.registerSessionSchedulerJob(job)` — але це **per-session** (job прив'язаний до `sessionKey`), для cleanup при reset/delete сесії. Для глобального cron (morning-digest `0 9 * * *` Kyiv) канонічний механізм — секція `cron.*` у `openclaw.json` + native cron-store (`plugin-sdk/cron-store-runtime.d.ts`, `commands/doctor-cron-*.d.ts`). Альтернативно — `registerHook("heartbeat_prompt_contribution", …)` для injection-у промпта при ранковому heartbeat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Stage 5d (morning-digest) — два варіанти: (a) **config-level** через `cron.*` у `openclaw.json` (декларативно, host управляє таймером); (b) **plugin-level** через `heartbeat_prompt_contribution` hook (плагін inject-ить нагадування під час heartbeat). Обидва native, n8n fallback можна не використовувати. Per-session `registerSessionSchedulerJob` — не для morning-digest, а для майбутніх "снуз цей нагадай на 15 хв" use case-ів.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | `before_dispatch` (Layer 0 hook)                    | `api.registerHook("before_dispatch", handler)` — канонічний hook для **intercept inbound message + reply without invoking the agent**. Event: `{ content: string, body?, channel?, sessionKey?, senderId?, isGroup?, timestamp? }` (`hook-types.d.ts:163+` — `PluginHookBeforeDispatchEvent`). Result: `{ handled: boolean, text?: string }` (`hook-types.d.ts:179+` — `PluginHookBeforeDispatchResult`). Коли handler повертає `{ handled: true, text }`, runtime **(a)** шле `text` у оригінальний канал (Telegram) verbatim, **(b)** скіпає dispatch агента взагалі ($0 LLM cost). Контраст з deprecated `before_agent_start`: цей хук **навіть** не отримує inbound text у polymorphic-shape — він дістає `{ prompt }` ПІСЛЯ того як runtime вже зібрав system+user message stack для агента, і його result type (`PluginHookBeforeAgentStartResult`) — це `PluginHookBeforePromptBuildResult & PluginHookBeforeModelResolveResult`, тобто `{ systemPrompt?, prependContext?, appendContext?, modelOverride?, providerOverride? }` без жодного `block`/`blockReason`. | **Stage 4b shortcut router МАЄ бути на `before_dispatch`, не `before_agent_start`.** Live smoke-test 2026-05-12 на Gateway (`sergeant-openclaw-gateway`, deploy `0a648dfd`) підтвердив: hook на `before_agent_start` ніколи не короткозамикав — `event.userMessage` (наша guessed-field) завжди `undefined`, hook повертав `undefined`, `{ block, blockReason }` ігнорувався runtime-ом, агент пробігав повний цикл на кожне з 4 shortcut-команд (`/metrics`, `/runway`, `/status`, `Дай метрики`). $0 cost — не виконане. Fix-forward — PR #2468: реєстрація на `before_dispatch`, `event.content` замість `event.userMessage`, `{ handled: true, text }` замість `{ block: true, blockReason }`. Sentinel `__ROUTED__:` (drop у PR #2467) — однаково був dead code, бо blockReason ніколи не доходив до runtime.                                                                                                        |
| 6   | **`opts.name` REQUIRED для кожного `registerHook`** | Loader-валідатор `requireRegistrationValue(entry?.hook.name ?? opts?.name?.trim(), "hook registration missing name")` у `dist/loader-B-GXgDrk.js:1490` кидає `Error` якщо в `opts.name` нема непорожнього trim-нутого рядка. SDK 5.7 **не** має fallback на `id` / `event` / counter — name мусить бути ЕКСПЛІЦИТНО передано. Без нього `registerHook(event, handler)` throw-ить ДО додавання у `pluginHooks` registry → hook ніколи не виконується. Виключення глушиться нашим try/catch і логиться як `logger.info("sergeant.hooks.registered", { failures })` — Railway log-forwarder strip-ає structured fields з INFO level, тому 5/5 silent failure не видно в logs.                                                                                                                                                                                                                                                                                                                                                                                                | **Усі 5 Stage 4a+4b hook-ів (audit-open, audit-end, write-approval, budget-gate, shortcut-router) silently failed на prod з моменту Stage 1 SDK rewrite (`14ee42e2`, 2026-05-11), який видалив `safeRegisterHook()` helper що його ввели у `305a4a03`.** Друге live smoke-test 2026-05-12 на Gateway (deploy `92402345`, коміт `5cb31858` — PR #2468 merge на `before_dispatch`) також провалилось — НЕ через hook-choice, а через відсутність `opts.name`. Підтвердив через grep `node_modules/openclaw/dist/loader-B-GXgDrk.js`. Fix-forward — PR #2469: передавати `{ name: "sergeant.<unique-id>" }` у кожен `registerHook` виклик, упдейтнути ambient type щоб `opts.name` був required, додати `logger.error` per failure (ERROR level не strip-ає Railway). Імена: `sergeant.shortcut-router`, `sergeant.budget-gate`, `sergeant.audit.before-agent-start`, `sergeant.audit.agent-end`, `sergeant.write-approval`. |

## Як це працює (з цитатами з реального SDK)

> Усі шляхи нижче — відносні до `node_modules/openclaw@2026.5.7/dist/`.

### 1. `definePluginEntry` (вже фіксували у Stage 1)

`plugin-sdk/src/plugin-sdk/plugin-entry.d.ts:10–25`:

```ts
type DefinePluginEntryOptions = {
  id: string;
  name: string;
  description: string;
  kind?: OpenClawPluginDefinition["kind"];
  configSchema?:
    | OpenClawPluginConfigSchema
    | (() => OpenClawPluginConfigSchema);
  reload?: OpenClawPluginDefinition["reload"];
  nodeHostCommands?: OpenClawPluginDefinition["nodeHostCommands"];
  securityAuditCollectors?: OpenClawPluginDefinition["securityAuditCollectors"];
  register: (api: OpenClawPluginApi) => void;
};
export declare function definePluginEntry(
  opts: DefinePluginEntryOptions,
): DefinedPluginEntry;
```

Підтверджує Stage 1 rewrite: об'єкт, не функція. `(api, configJson) => Plugin` сигнатура з PoC-у — guess.

### 2. `OpenClawPluginApi` — реєстраційний surface

`plugin-sdk/src/plugins/types.d.ts:1886+` (фрагмент із усіма write-related register-ами):

```ts
export type OpenClawPluginApi = {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    rootDir?: string;
    registrationMode: PluginRegistrationMode;
    config: OpenClawConfig;                 // ← повний openclaw.json
    pluginConfig?: Record<string, unknown>; // ← наш блок plugins.entries.sergeant.config
    runtime: PluginRuntime;
    logger: PluginLogger;
    registerTool: (tool: AnyAgentTool | OpenClawPluginToolFactory, opts?: OpenClawPluginToolOptions) => void;
    // Internal command bus — НЕ для lifecycle hooks (`before_dispatch`, etc.):
    registerHook: (events: string | string[], handler: InternalHookHandler, opts?: OpenClawPluginHookOptions) => void;
    // Canonical lifecycle hook registration (`PluginHookName` enum нижче, § 4):
    on: <K extends PluginHookName>(
        hookName: K,
        handler: PluginHookHandlerMap[K],
        opts?: { priority?: number; timeoutMs?: number },
    ) => void;
    registerHttpRoute: (params: OpenClawPluginHttpRouteParams) => void;
    registerChannel: (registration: …) => void;
    registerCommand: (command: OpenClawPluginCommandDefinition) => void;                       // ← bypass-LLM commands ("/plan" і т.д.)
    registerSessionSchedulerJob: (job: PluginSessionSchedulerJobRegistration) => …;            // ← per-session jobs (НЕ для cron)
    registerToolMetadata: (metadata: PluginToolMetadataRegistration) => void;                  // ← UI risk hints; не security
    registerTrustedToolPolicy: (policy: PluginTrustedToolPolicyRegistration) => void;          // ← bundled-plugin only
    // ... + ~40 інших register*-ів (provider, channel, harness, migration, etc.)
};
```

Stage 5b (strategic-modes `/plan` `/analyze` `/okr`) виходить дешевшим, ніж очікувалось: `registerCommand` дає bypass-LLM canned-template-и без агента взагалі.

### 3. `AgentTool` контракт (з `@mariozechner/pi-agent-core`)

`pi-agent-core/dist/types.d.ts:295–311`:

```ts
export interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
}
export interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = any,
> extends Tool<TParameters> {
  label: string; // ← Stage 2.2 fix
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: ToolExecutionMode; // "sequential" | "parallel"
}
```

`AgentToolResult`:

```ts
export interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];
  details: T;
  terminate?: boolean;
}
```

`content` і `details` обидва обов'язкові на success path. У read-tools поточний `src/index.ts` повертає `{ content: [{ type: "text", text }], details: response }` — це коректно. Підтверджено для write-tools тримати ту саму shape.

### 4. Hook canonical enum

> **WARNING:** `api.registerHook(events, handler, opts)` — це **не** те API, яке реєструє хук для жодної з нижче згаданих `PluginHookName`. Канонічний method — `api.on(hookName, handler)`. `registerHook` працює з окремим внутрішнім bus-ом (`InternalHookEventType`) для command/session/agent/gateway/message events. Див. § 0.5 у [Stage 4b debugging handoff](./openclaw-stage-4b-debugging-handoff-2026-05-12.md) для повного розбору різниці + реальної регресії (кожен випадок, коли лифецикл-хук реєструють через `registerHook`, він буде мовчки не fires).

`plugin-sdk/src/plugins/hook-types.d.ts:17–18`:

```ts
export type PluginHookName =
  | "before_model_resolve"
  | "agent_turn_prepare"
  | "before_prompt_build"
  | "before_agent_start"
  | "before_agent_reply"
  | "model_call_started"
  | "model_call_ended"
  | "llm_input"
  | "llm_output"
  | "before_agent_finalize"
  | "agent_end"
  | "before_compaction"
  | "after_compaction"
  | "before_reset"
  | "inbound_claim"
  | "message_received"
  | "message_sending"
  | "message_sent"
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  | "before_message_write"
  | "session_start"
  | "session_end"
  | "subagent_spawning"
  | "subagent_delivery_target"
  | "subagent_spawned"
  | "subagent_ended"
  | "gateway_start"
  | "gateway_stop"
  | "heartbeat_prompt_contribution"
  | "cron_changed"
  | "before_dispatch"
  | "reply_dispatch"
  | "before_install";
```

Hook handler payloads ходять у `*Event` типах поряд (наприклад `PluginHookBeforeToolCallEvent`, `PluginHookAfterToolCallEvent`, `PluginHookMessageReceivedEvent`). Return-value контракт — `PluginHook<EventName>Result` (`block?`, `params?`, `text?`, `handled?`, спец-полями типу `requireApproval`).

### 5. Approval через `before_tool_call`

`plugin-sdk/src/plugins/hook-types.d.ts:230+`:

```ts
export type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
};
export declare const PluginApprovalResolutions: {
  readonly ALLOW_ONCE: "allow-once";
  readonly ALLOW_ALWAYS: "allow-always";
  readonly DENY: "deny";
  readonly TIMEOUT: "timeout";
  readonly CANCELLED: "cancelled";
};
export type PluginApprovalResolution =
  (typeof PluginApprovalResolutions)[keyof typeof PluginApprovalResolutions];
export type PluginHookBeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
  requireApproval?: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    timeoutMs?: number;
    timeoutBehavior?: "allow" | "deny";
    pluginId?: string;
    onResolution?: (decision: PluginApprovalResolution) => Promise<void> | void;
  };
};
```

Це і є native approval. Plugin лише повертає `requireApproval` → runtime сам показує UI, чекає рішення, продовжує/блокує виклик і кличе `onResolution(decision)`. Audit логіка лягає у `onResolution` (або в окремий `after_tool_call` hook для post-execution outcomes).

### 6. Per-persona allowlist (`agents.<id>.tools`)

`plugin-sdk/src/config/types.tools.d.ts:274+`:

```ts
export type AgentToolsConfig = {
  profile?: ToolProfileId; // "coding" | "research" | etc.
  allow?: string[];
  alsoAllow?: string[]; // merged into allow + profile-default allowlist
  deny?: string[]; // blacklist after merge
  byProvider?: Record<string, ToolPolicyConfig>;
  elevated?: { enabled?: boolean; allowFrom?: AgentElevatedAllowFromConfig };
  exec?: ExecToolConfig;
  fs?: FsToolsConfig;
  // ... loop detection, etc.
};
```

`agents.<id>.tools` = той самий `AgentToolsConfig` (`plugin-sdk/src/config/types.agents.d.ts:117`). Тобто Stage 5a виглядатиме так у `openclaw.example.json` (приклад для `seo` персони, яка не має write-tools і не повинна мати `query_app_db`):

```jsonc
{
  "agents": {
    "defaults": {
      /* ... */
    },
    "seo": {
      "model": { "primary": "anthropic/claude-sonnet-4-5" },
      "tools": {
        "alsoAllow": [
          "recall_memory",
          "read_strategy_docs",
          "seo_gsc_query",
          "seo_psi_audit",
          "seo_serp_lookup",
          "get_posthog_stats",
          "read_github",
        ],
        "deny": [
          "create_github_issue",
          "commit_to_strategy_doc",
          "post_to_topic",
          "pause_workflow",
          "mute_alert",
        ],
      },
    },
  },
}
```

Жодного плагін-side enforcement не треба — host робить filter на etapі tool dispatch.

### 7. Scheduler

`plugin-sdk/src/plugins/host-hooks.d.ts:110+`:

```ts
export type PluginSessionSchedulerJobRegistration = {
  id: string;
  sessionKey: string; // ← обов'язково прив'язаний до сесії
  kind: string;
  description?: string;
  cleanup?: (ctx: {
    reason: PluginHostCleanupReason;
    sessionKey: string;
    jobId: string;
  }) => void | Promise<void>;
};
```

Тобто `registerSessionSchedulerJob` — це **не** cron. Це гачок для cleanup тимчасових задач при `disable`/`reset`/`delete`/`restart` сесії. Реальний cron — два шляхи:

- **Декларативний:** `cron.*` секція у `openclaw.json` (host тримає cron-store, dispatches messages → виглядає як user input → агент сам приймає рішення). Файли `plugin-sdk/src/commands/doctor-cron-*.d.ts` + `cron-store-runtime.d.ts` — це supporting tooling для цього шляху. Тут morning-digest — це просто entry у конфігу з cron-expression `0 9 * * *` (Kyiv) і pre-baked promptом.
- **Реактивний:** `registerHook("heartbeat_prompt_contribution", …)` — плагін додає системну ін'єкцію у промпт при кожному heartbeat. Працює, якщо OpenClaw і так уже піднімає heartbeat-події (підтверджено наявністю `PluginHeartbeatPromptContributionEvent` / `…Result` у `host-hook-turn-types`).

Для Stage 5d рекомендую декларативний шлях — менше runtime-логіки на плагін-side.

## Що це міняє у плані

| Місце у плані                                            | Було                                                                                                 | Тепер                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| § Locked decisions #5 (approval variant)                 | "Variant B (custom hook + Telegram inline keyboard)"                                                 | Native `before_tool_call.requireApproval` достатньо для більшості сценаріїв. Custom-hook-варіант ЗАЛИШАЄТЬСЯ тільки якщо нам критично проводити UX через Telegram inline keyboard (Locked залишається, але треба окремо обґрунтувати у Stage 4a — або переглянути після того, як побачимо native UI). |
| § Stage 4a (budget + audit hooks)                        | "llm_input per-call → /budget, agent_turn_end → /invocations/finalize" (з `agent_turn_end` як guess) | Реальні events — `llm_input` + `agent_end` (last). `agent_turn_end` у SDK не існує. Треба зрегеструвати `["llm_input", "agent_end"]`.                                                                                                                                                                 |
| § Stage 5b (strategic-modes `/plan` `/analyze` `/okr`)   | "wiring slash-handlers + `strategicModes` блок у openclaw.json"                                      | `registerCommand` (bypass-LLM) — простіший шлях. `strategicModes` блок у конфігу не обов'язковий, якщо commands вистачає.                                                                                                                                                                             |
| § Stage 5a (per-persona allowlist)                       | "schema research потрібен"                                                                           | Schema відома — `AgentToolsConfig`. Просто config-as-code change.                                                                                                                                                                                                                                     |
| § Stage 5d (morning-digest)                              | "Native scheduler API не підтверджений; fallback на n8n Tier A"                                      | Native шлях існує (`cron.*` config-block + опціонально `heartbeat_prompt_contribution` hook). n8n fallback не потрібен для MVP.                                                                                                                                                                       |
| § Reality update 2026-05-12 → "Що блокує наступний крок" | 4 unknown-и                                                                                          | 0 unknown-ів. Stage 3 + 4 + 5 розблоковані.                                                                                                                                                                                                                                                           |

## Що **не** перевіряли (out-of-scope для цього спайку)

- Live smoke-test register-у hook-ів на Gateway. Цей спайк — type-level only. Перший Stage 4a PR має поставити простий `llm_input` no-op handler і верифікувати, що runtime його викликає.
- Поведінка `requireApproval.onResolution` при `timeoutBehavior: "deny"` — потребує живого тесту.
- Per-provider tool policy (`AgentToolsConfig.byProvider`) — для нас irrelevant (один Anthropic provider).
- Trusted tool policy (`registerTrustedToolPolicy`) — bundled-plugin-only, ми не bundled.

## Приклади коду (готові паттерни для Stage 4a/5a)

### Native approval via `before_tool_call` hook (Stage 4a)

```ts
const WRITE_TOOLS = new Set([
  "create_github_issue",
  "commit_to_strategy_doc",
  "post_to_topic",
  "pause_workflow",
  "mute_alert",
]);

api.registerHook("before_tool_call", async (event) => {
  if (!WRITE_TOOLS.has(event.toolName)) return undefined;
  return {
    requireApproval: {
      title: `Write-tool: ${event.toolName}`,
      description: renderApprovalSummary(event.toolName, event.params),
      severity: "warning",
      timeoutMs: 300_000,
      timeoutBehavior: "deny",
      onResolution: async (decision) => {
        await http.post("/write-audit/log", {
          tool: event.toolName,
          invocationId: event.toolCallId,
          action:
            decision === "allow-once" || decision === "allow-always"
              ? "approved"
              : "rejected",
          input: event.params,
        });
      },
    },
  };
});
```

### Per-call budget gate via `llm_input` hook (Stage 4a)

```ts
api.registerHook("llm_input", async (event) => {
  const verdict = await http.post<{ allowed: boolean; reason?: string }>(
    "/budget",
    { kind: "per_call", capUsd: config.maxPerCallUsd /* … */ },
  );
  if (!verdict.allowed) {
    return {
      block: true,
      blockReason: verdict.reason ?? "per-call budget exceeded",
    };
  }
  return undefined;
});
```

### Per-persona allowlist (Stage 5a) — `openclaw.example.json`

```jsonc
{
  "agents": {
    "defaults": {
      /* keeps tools.alsoAllow as "common read-tools" baseline */
    },
    "eng": {
      "tools": {
        "alsoAllow": [
          "read_github",
          "github_search",
          "github_tree",
          "github_diff",
          "github_prs",
          "query_app_db",
          "recall_memory",
          "record_decision",
          "create_github_issue",
        ],
      },
    },
    "seo": {
      "tools": {
        "alsoAllow": [
          "seo_gsc_query",
          "seo_psi_audit",
          "seo_serp_lookup",
          "read_strategy_docs",
          "read_github",
          "get_posthog_stats",
          "recall_memory",
        ],
        "deny": [
          "create_github_issue",
          "commit_to_strategy_doc",
          "post_to_topic",
          "pause_workflow",
          "mute_alert",
        ],
      },
    },
  },
}
```

## Cleanup

Scratch install (`/tmp/sdk-spike`) можна видалити — він не у репо. SDK типи джерельно живуть у `node_modules/openclaw/dist/plugin-sdk/**/*.d.ts` після Gateway Dockerfile-білду; повторний lookup можна робити прямо там.
