# OpenClaw Migration Plan: Internal Bot → External OpenClaw Gateway

> **Last validated:** 2026-05-12 by Devin (update 21:10 UTC — **Stage 6a MERGED**: parity-harness реактивована у CI під real `openclaw@2026.5.7` SDK — новий модуль `packages/openclaw-plugin/src/parity/` з 21 golden-fixture-ом (17 Layer 0 shortcuts + 3 strategic modes + `/council`), `routeMessage()` runner дзеркалить канонічний 3-layer pipeline (`shortcut` → `strategic-mode` → `council` → `fallthrough`), 34 нові vitest specs, включно з drift-gate `COUNCIL_DEFAULT_SEQUENCE` ↔ `ops/openclaw/skills/council-roundtable/SKILL.md § Default sequence` (recap §6 open follow-up закрито); plugin тестів **351/351** (+34 vs Stage 5d 317), lint/typecheck/prettier clean; merged direct до `main` як `23dc3c58` 2026-05-12 21:10 UTC. **Наступний крок — Stage 6b (operational manual parallel-run, ≥1 тиждень)** або одразу Stage 7 cutover playbook draft. Previous validation: 20:36 UTC — **Stage 5d MERGED**: morning-digest cron провіжниться native scheduler-ом (`cron.*` config-block у `openclaw.example.json` + idempotent `ops/openclaw/provision-cron.mjs` upserts job у `~/.openclaw/cron/jobs.json` перед запуском Gateway) — schedule `"0 9 * * *"` Europe/Kyiv, payload `/digest day` через Layer 0 shortcut router ($0 LLM cost), delivery=Telegram announce у DM founder-а; 18 нових `node:test` unit-тестів (canonical shape, golden snapshot drift-gate, idempotency, unrelated-job preservation, malformed store refusal, end-to-end roundtrip) + `ops/openclaw/skills/morning-digest/SKILL.md` переписаний під реальний 4-tool Layer 0 path; PR [#2490](https://github.com/Skords-01/Sergeant/pull/2490) merged `b187bfaf` 2026-05-12 20:36 UTC. **Наступний code-stage — Stage 6a** (parity-harness reactivation у CI). Previous validation: 18:35 UTC — **Stage 5c COMPLETE**: `/council <питання>` round-table orchestration shipped — port `legacy/council.ts` → `src/council/index.ts` + new `before_dispatch` council gate hook ($2.0 budget pre-flight, fail-closed) + `before_agent_start` council mode hook (injects `COUNCIL_PRIMER`); plugin тестів **317/317** (+43 vs Stage 5b 274), lint/typecheck/build/prettier clean. Previous validation: 18:15 UTC — **Stage 5b COMPLETE**: PR-4 `/okr` shipped, parent Stage 5b flips ✅ merged; tracker `5b/analyze` row corrected from stale `🚧 PR open` → ✅ merged PR [#2483](https://github.com/Skords-01/Sergeant/pull/2483) `51290121` 17:20 UTC. Previous validation: 15:30 UTC — Stage 4c MERGED: PR [#2477](https://github.com/Skords-01/Sergeant/pull/2477) merged у `main` як `2ed02f1e`, всі тести green локально та в CI, Railway auto-deploy для `sergeant-openclaw-gateway` тригернеться з `main`). **Next review:** 2026-08-10. Повний розбір — § 0.5 і § 11 у [Stage 4b debugging handoff](../notes/spikes/openclaw-stage-4b-debugging-handoff-2026-05-12.md). **Попередня root cause #3 ("Railway не watch-ить GitHub") вже не актуальна** — service `sergeant-openclaw-gateway` у проекті `Sergeant` підключений до GitHub і auto-deploy працює (останній deploy `3d4f9e1d` 14:03:50 UTC включає PR #2471 = `api.on` migration). PR #2467/2468/2469 задеплоєні, але били не ту проблему — реальний фікс приніс PR #2471.
> **Status:** Active (v3.11.0 — **Stage 6a MERGED** (parity-harness реактивована у CI як 34 vitest specs під real SDK, drift-gate COUNCIL_DEFAULT_SEQUENCE ↔ SKILL.md закрив recap §6 open follow-up, commit `23dc3c58` 2026-05-12 21:10 UTC) на додачу до **Stage 5a MERGED** (per-persona tool allowlist + gate-test) на додачу до **Stage 4c LIVE-VERIFIED** [#2477](https://github.com/Skords-01/Sergeant/pull/2477) `2ed02f1e` 2026-05-12 15:26 UTC, production smoke **12/12 PASS** [16:0X UTC](https://github.com/Skords-01/Sergeant/pull/2478#issuecomment-4432335476): `/classify` endpoint 7/7 + Telegram `@kOPENCLAW_GATEWAY_BOT` 4/4 — natural-lang metrics → Layer 0 shortcut, chat → Haiku verbatim, thinking → Layer 2 Sonnet, slash `/metrics` → Layer 0 only ($0 Layer 1); **Stage 4b RESOLVED**, live-verified 2026-05-12 17:08–17:09 EEST: `/metrics`, `/runway`, UA `Дай метрики` повертають canned Markdown ≤2 сек без Opus loop). **Наступний крок — Stage 6b (≥1 тиждень manual parallel run, grammy vs Gateway live smoke на `/plan` `/analyze` `/okr` `/council`)** або одразу Stage 7 cutover playbook draft (ADR-0056 supersedes ADR-0055 § cutover + deletion checklist для `src/legacy/**`). Stage 5a/5b/5c/5d вже merged: per-persona allowlist (PR [#2480](https://github.com/Skords-01/Sergeant/pull/2480) + schema fix [#2485](https://github.com/Skords-01/Sergeant/pull/2485)), strategic modes (`/plan` PR [#2482](https://github.com/Skords-01/Sergeant/pull/2482), `/analyze` PR [#2483](https://github.com/Skords-01/Sergeant/pull/2483), `/okr` PR [#2487](https://github.com/Skords-01/Sergeant/pull/2487)), council (PR [#2488](https://github.com/Skords-01/Sergeant/pull/2488)), morning-digest cron (PR [#2490](https://github.com/Skords-01/Sergeant/pull/2490) `b187bfaf`). ✅ `query_app_db` HTTP 400 у `/runway` snapshot — **fix-forward (merged 2026-05-12 PR [#2473](https://github.com/Skords-01/Sergeant/pull/2473))**: root cause був `business_snapshot`/`ai_decisions` SQL у шорткатах (таблиці ніколи не існували в міграціях) → server повертав 400 на allowlist-перевірці. `runway` мігровано на `openclaw_invocations`, `decisions` мігровано на `openclaw_decisions`, додано регресійний тест у `all-shortcuts.test.ts`. ✅ `openclaw_invocations.user_message` колонка завжди мала `"(empty user message)"` — **fix-forward (merged 2026-05-12 PR [#2474](https://github.com/Skords-01/Sergeant/pull/2474))**: Stage 4a audit-hook читав вгадане `event.userMessage`, але real openclaw 5.7 `before_agent_start` шле `{ prompt, runId?, messages? }` (див. spike-doc § 1). Hook тепер читає `event.prompt` (canonical) з fallback на `event.userMessage` для legacy fixtures, 3 нові precedence-тести у `audit.test.ts`. Поточний production-stan — **Stage 4b (25 read-tools + 5 write-tools + 5 hooks + Layer 0 shortcut router з 17 shortcuts)** на real `openclaw@2026.5.7` SDK. Phase 0 Gateway infra розкатано (ADR-0055). PR-A…PR-F v3.1 трекерні рядки збережені нижче для історії, але код PR-B…PR-F **не активний** — він перенесено у `packages/openclaw-plugin/src/legacy/` під час Stage 1 rewrite (PR [#2438](https://github.com/Skords-01/Sergeant/pull/2438) merged 2026-05-12, `14ee42e2`) бо locally-вгадані `sdk-types.ts` не співпали з реальним `openclaw@2026.5.7` plugin SDK. Stage 2 (PR [#2449](https://github.com/Skords-01/Sergeant/pull/2449) merged 2026-05-12, `257ca2ef`) долив решту 22 read-tools на справжньому SDK. Stage 3 (PR [#2463](https://github.com/Skords-01/Sergeant/pull/2463), merged 2026-05-12, `1b68f159`) долив 5 write-tools + spike doc. Stage 4a (PR [#2464](https://github.com/Skords-01/Sergeant/pull/2464), `fc6ca5be`, merged 2026-05-12) долив 4 hooks + native approval. Stage 4b: PR [#2465](https://github.com/Skords-01/Sergeant/pull/2465) (роутер + sentinel), PR [#2467](https://github.com/Skords-01/Sergeant/pull/2467) (drop sentinel), PR [#2468](https://github.com/Skords-01/Sergeant/pull/2468) (fix-forward part 1: міграція з `before_agent_start` на `before_dispatch`), PR **#2469** (fix-forward part 2: відновлення `opts.name` для реєстрації hook-ів після другого live smoke-test 2026-05-12 виявив, що жоден з 5 hook-ів ніколи не реєструвався в runtime через silent throw у loader-валідаторі). Persona SKILL-и + stage-status overlay — PR [#a03f4e74](https://github.com/Skords-01/Sergeant/commit/a03f4e74). Що далі — див. § Reality update 2026-05-12 нижче.

## Reality update 2026-05-12 — Stage rewrite (Stage 1 → Stage 2 → Stage 3 → Stage 4a → Stage 4b live)

> Цей блок — single source of truth по тому, що **насправді** працює у `packages/openclaw-plugin/` сьогодні. v3.1 Tracker нижче (§ PR-стратегія → Tracker) лишається як **історія**, але формальний статус `merged` для PR-B…PR-F треба читати як «merged into main, але код переведений у `src/legacy/` після Stage 1 rewrite — у production-плагіні неактивний».

### Що сталося

1. **План v3.1** (PR-A…PR-F, merged 2026-05-10..11) будувався на **локальних type-stubs** у `packages/openclaw-plugin/src/sdk-types.ts` (267 LOC). Stubs покривали `definePluginEntry`, `registerTool`, `registerHook`, payload-shape — все вгадане з open-source OpenClaw docs.
2. **Перший деплой на Railway** (Gateway service `sergeant-openclaw-gateway`) відкривав по одному mismatch-у з реальним `openclaw@2026.5.7` SDK при кожному фіксі:
   - `definePluginEntry` приймає **об'єкт** `{ id, name, register(api) }`, а не **функцію** `(api, configJson) => Plugin` (як було у stubs).
   - Параметри — `typebox@1.1.x` (новий package від `sinclairzx81`), а не `@sinclair/typebox` або Zod. Внутрішні Symbol-keys різні → openclaw мовчки drop-ав tool-и.
   - `label` — required поле на `AgentTool` (pi-agent-core); tools без нього silently зникали з agent palette.
   - Config читається через `api.config` / `api.pluginConfig`, а не через string-аргумент entry-функції.
   - Plugin entry-файл — `./src/index.ts` (OpenClaw runtime завантажує TypeScript source); немає `build` step.
3. **Stage 1 MVP rewrite** ([PR #2438](https://github.com/Skords-01/Sergeant/pull/2438), `14ee42e2`, merged 2026-05-12): увесь pre-rewrite plugin перенесено у `packages/openclaw-plugin/src/legacy/` як reference. Новий `index.ts` — мінімальний плагін на real openclaw 5.7 SDK, 3 read-tools (`recall_memory`, `query_app_db`, `read_github`) як proof-of-life. Без hooks, без write tools.
4. **Stage 1 fixes** (PR-и `#2439`–`#2442`, далі `#2440 6213fc64` — config resolve з env коли `api.pluginConfig` empty; `#2442 aaf7879f` — `tools.allow` exposing; `#2448 13394dc7` — wipe stale workspace skills бо persona docs згадували 24+ tools а MVP мав 3, отруюючи агента).
5. **Stage 2 read-tools migration** ([PR #2449](https://github.com/Skords-01/Sergeant/pull/2449), `257ca2ef`, merged 2026-05-12): решта 22 read-tools переписані під real SDK. Тепер у плагіні **25 read-tools**, повністю покривають TG bot `/help`.
6. **Stage 2 deploy fixes**:
   - [PR #2452](https://github.com/Skords-01/Sergeant/pull/2452) `4229ed28` — `typebox` (не `@sinclair/typebox`).
   - [PR #2453](https://github.com/Skords-01/Sergeant/pull/2453) `f5e8dd95` — required `label` на кожному tool.
   - [PR #2455/#2456](https://github.com/Skords-01/Sergeant/pull/2456) `9a0c8e1c`/`4173be1d` — pin `@mistralai/mistralai@2.2.1` + `--ignore-scripts` (раніше `@mistralai/mistralai@latest` падав на `prepare` script у Gateway Dockerfile).
   - [PR #2458](https://github.com/Skords-01/Sergeant/pull/2458) `e5ed0cb7` — переніс Sergeant tools з `tools.allow` у `tools.alsoAllow` (правильний openclaw 5.7 patern).
7. **Persona skills restore** ([PR `a03f4e74`](https://github.com/Skords-01/Sergeant/commit/a03f4e74), 2026-05-12): після того як Stage 1 entrypoint wipe-ав workspace skills (бо вони згадували неіснуючі tools), Stage 2 повертає 10 persona SKILL.md + cheap-router prompt + n8n-allowlist через `docker-entrypoint.sh`. Додає `_stage-status/SKILL.md` overlay — агент знає, що `create_github_issue` (єдиний write-tool у persona allowlist-ах) **не зареєстрований** і має чесно повідомляти founder-у замість галюцинувати.
8. **SDK reality-check spike** ([`docs/notes/spikes/openclaw-sdk-5.7-real-api.md`](../notes/spikes/openclaw-sdk-5.7-real-api.md), 2026-05-12): зафіксовані реальні сигнатури `api.registerHook` (34 hook-и), approval mechanism (`before_tool_call` повертає `requireApproval` payload), per-persona allowlist (`agents.list[].tools: AgentToolsConfig` — масив, НЕ `agents.<id>` keys; corrected 2026-05-12 18:00 UTC після Stage 5a crash-loop), та scheduler (`cron.*` config-block; `registerSessionSchedulerJob` per-session only — **не** для morning-digest). 4 unknown-и з § "Що блокує наступний крок" вище зняті — Stage 3, 4a, 5a, 5d розблоковані з відомими патернами.
9. **Stage 3 write-tools** ([PR #2463](https://github.com/Skords-01/Sergeant/pull/2463), `1b68f159`, merged 2026-05-12): 5 write-tools (`create_github_issue`, `commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`, `mute_alert`) зареєстровані через `api.registerTool` як HTTP-проксі до вже існуючих `/api/internal/openclaw/write/*` endpoint-ів. Approval gate на Stage 3 залишався server-side (allowlist + `/write-audit/log`) + chat-prompt contract в `_stage-status` overlay. Спайк-док (`docs/notes/spikes/openclaw-sdk-5.7-real-api.md`) фіксує реальні SDK signatures — розблокує Stage 4a.
10. **Stage 4a hooks + native approval** (цей PR, 2026-05-12): зареєстровано 4 hook-и через `api.registerHook`:

- `llm_input` — перед кожним LLM-викликом перевіряє daily USD budget через `POST /api/internal/openclaw/budget`. При вичерпанні повертає `{ block: true, blockReason }` — SDK блокує виклик доти як UTC-день не зміниться.
- `before_agent_start` — відкриває invocation row через `POST /invocations/open` і кэшує `invocationId` у in-memory `InvocationCorrelator` (Map<runId, invocationId>) для пізнішого парингу.
- `agent_end` — фіналізує invocation через `POST /invocations/finalize` з rollup (cost, duration, iterations, status). Якщо корелятор не знаходить `invocationId` (open-hook не виконався або timeout) — хук soft-skip-ає без помилки (server fallback'ить за runId).
- `before_tool_call` — для кожного з 5 write-tools повертає `{ requireApproval: { title, description, severity, timeoutMs, timeoutBehavior, onResolution } }` — native SDK approval. Host рендерить кнопки allow/deny, викликає `onResolution(decision)`, який посилає `POST /write-audit/log` з `action: "approved"`/`"rejected"` + decision metadata. Read-tools (25) проходять без гейту. `_stage-status` overlay переписано під Stage 4a contract: агент більше не питає у чаті (SDK сам рендерить approval UI), але описує намір ОДНИМ реченням для дублювання у approval-UI title. **Розблоковує Stage 4b** (shortcut router) і **Stage 4c** (Haiku classifier).

11. **Stage 4b Layer 0 shortcut router** (цей PR, 2026-05-12): на `before_agent_start` зверху Stage 4a audit-open хука під'єднано in-process shortcut-router з **17 shortcuts** (`/metrics`, `/runway`, `/status`, `/sentry`, `/stripe`, `/posthog`, `/prs`, `/releases`, `/builds`, `/workflows`, `/refresh_metrics`, `/heartbeat`+`/health`, `/recall <query>`, `/decisions`, `/digest [day|week]`, `/remind <when> <what>`, `/think <question>` + UA-фрази `дай метрики`, `скільки runway`, `що по sentry`, тощо). Дизайн:

- `src/shortcuts/router.ts` — `ShortcutRouter.match(userMessage)` ітерує `ALL_SHORTCUTS` (17), повертає `{ slug, response, toolResults }` на перший regex-match. Tool calls — parallel за замовчуванням (Promise.all), opt-in sequential через `parallel: false`. `safeExecute` упаковує винятки tool-ів як текстові блоки, щоб render завжди отримав renderable `ToolResult`.
- `src/hooks/shortcut-router.ts` — `createShortcutRouterHook` factory. Якщо `event.userMessage` matches → виконує tool-и через injected `ToolExecutor`, рендерить Markdown template, повертає `{ block: true, blockReason: <rendered response> }` — без sentinel-prefix-а. Якщо ні — `undefined`. Special-case `/think`: render повертає sentinel `__ESCALATE_LAYER2__:thinking:cofounder:<question>` → hook **НЕ** блокує (passthrough на Layer 2). Публічний експорт з пакету — лише `ESCALATE_PREFIX` (Layer 2 проброс відбувається через `userMessage` rewrite, не через `blockReason`). [`#2467`](https://github.com/Skords-01/Sergeant/pull/2467) drop-нув `ROUTED_RESPONSE_PREFIX` / `isRoutedResponse` / `extractRoutedResponse` як YAGNI — OpenClaw runtime не має plug-point-у для host-side стрипання, а `apps/server` не в hot-path-і Gateway-ного Telegram-traffic-у.
- `src/index.ts` — паралельний `toolRegistry: Map<name, (params) => Promise<ToolResult>>` будується пліч-о-пліч з `api.registerTool` loop, тож shortcut-router дзвонить ті ж HTTP-endpoint-и через ту ж `execTool` функцію (zero divergence). `composedBeforeAgentStart` хук викликає shortcut-router спершу і fall-through-ить на Stage 4a audit-open якщо match-а нема.

Cost-impact: для матчів shortcut LLM cost = $0 (агент взагалі не стартує), Anthropic-token spend = 0, latency = sum(tool HTTP RTT). Delivery contract: OpenClaw runtime surface-ить `blockReason` як assistant turn без host-side перетворень — live smoke-test перевірить це припущення. Якщо OpenClaw не рендерить blockReason в chat — відкриємо fallback PR з plugin→`apps/server`→Telegram delivery endpoint (варіант B з [`#2467`](https://github.com/Skords-01/Sergeant/pull/2467) discussion). Type-level + unit + integration-tests (`packages/openclaw-plugin/src/shortcuts/router.test.ts` + `all-shortcuts.test.ts` + `src/hooks/shortcut-router.test.ts` + 4 нових scenarios у `src/index.test.ts`): **168/168 vitest pass** локально після [#2467](https://github.com/Skords-01/Sergeant/pull/2467) (89 → 171 у Stage 4b → 168 після drop-у 3 sentinel-helper тестів). **Розблоковує Stage 4c** (Haiku cheap-router використовуватиме той ж паттерн `blockReason: <rendered>` без sentinel-а + ту ж `executeTool` injection).

12. **Stage 4b fix-forward — `before_dispatch`** (PR **#2468**, 2026-05-12): live smoke-test одразу після PR #2467 merge виявив, що Stage 4b shortcut router **ніколи не короткозамикав агент** у real Gateway. Усі 4 shortcut-команди (`/metrics`, `/runway`, `/status`, UA `дай метрики`) проходили повний agent-cycle, `/status` навіть перехопила OpenClaw built-in. Root-cause analysis на real `openclaw@2026.5.7` SDK (downloaded npm package, inspected `.d.ts`):

- **Hook `@deprecated`.** `node_modules/openclaw/dist/plugin-sdk/src/plugins/hook-types.d.ts:566` має JSDoc-маркер `@deprecated Use before_model_resolve and before_prompt_build.` на `before_agent_start`.
- **Event shape wrong.** Real `PluginHookBeforeAgentStartEvent = { prompt: string; runId?: string; messages?: unknown[] }` — **жодного `userMessage`**. Наша guessed-field-type у `openclaw-ambient.d.ts` ніколи не співпадала з runtime payload-ом. Hook прочитав `event.userMessage` → `undefined` → не залогувався, не повернув значення.
- **Result type не підтримує block.** `PluginHookBeforeAgentStartResult = PluginHookBeforePromptBuildResult & PluginHookBeforeModelResolveResult` = `{ systemPrompt?, prependContext?, appendContext?, modelOverride?, providerOverride? }`. **Жодного `block`/`blockReason`** — навіть якщо б hook викликав return, runtime все одно б його ігнорував.

Fix: переїзд з `before_agent_start` на канонічний `before_dispatch` (`hook-types.d.ts:163+`). Event: `{ content: string, body?, channel?, sessionKey?, senderId?, isGroup?, timestamp? }`. Result: `{ handled: boolean, text?: string }`. Коли handler повертає `{ handled: true, text }`, runtime **(a)** шле `text` у оригінальний канал (Telegram) verbatim, **(b)** скіпає dispatch агента ($0 LLM cost). Цей контракт повністю замінює уявне "OpenClaw runtime сам рендерить blockReason" з Variant A, який не існував.

Зміни у PR #2468 (single commit):

- `packages/openclaw-plugin/src/types/openclaw-ambient.d.ts` — реальні `PluginHookBeforeDispatchEvent`/`Result`/`Context` interfaces. `PluginHookBeforeAgentStartEvent` маркований `@deprecated` з реальними полями (`prompt`, `runId?`, `messages?`); зберігаємо guessed `userMessage?` як backward-compat для Stage 4a audit-open hook поки не мігруємо його.
- `packages/openclaw-plugin/src/hooks/shortcut-router.ts` — реєстрація на `before_dispatch`, читання `event.content`, return `{ handled: true, text }` / `{ handled: false }`.
- `packages/openclaw-plugin/src/index.ts` — registration на `before_dispatch` окремо від `before_agent_start` audit-open (НЕ composed: різні events, різні runtime semantics).
- Tests + README + Spike doc Row 5 (`before_dispatch` контракт).

Sentinel drop у [#2467](https://github.com/Skords-01/Sergeant/pull/2467) **був technically correct** — він про правильне поле (blockReason) на правильному hook (before_agent_start), але hook ніколи не доходив до runtime. Тому ні #2467, ні #2465 не треба revert-ити; #2468 — fix-forward.

Stage 4a audit-hook (`before_agent_start` → `userMessage` read) має той самий issue (real event payload не має `userMessage`). Окремий follow-up PR (TODO): міграція на `session_start` або `agent_turn_prepare` з реальним event shape.

13. **Stage 4b fix-forward part 2 — `opts.name` required** (PR **#2469**, 2026-05-12): друге live smoke-test одразу після PR #2468 merge виявив, що `/runway` (та інші shortcuts) **все ще проходять повний agent-cycle** — short-circuit на `before_dispatch` не спрацював. Root-cause #2: реєстрація hook-у ніколи не відбувалась.

- Loader-валідатор у `node_modules/openclaw/dist/loader-B-GXgDrk.js:1490`: `requireRegistrationValue(entry?.hook.name ?? opts?.name?.trim(), "hook registration missing name")`. SDK 5.7 вимагає **explicit `opts.name`** (non-empty trimmed string) для кожного `registerHook` виклику. Fallback на `id`/`event`/counter — **нема**.
- Без `opts.name` `registerHook(event, handler)` throw-ить **ДО** додавання у `pluginHooks` registry → hook ніколи не виконується runtime-ом.
- Виключення глушиться нашим try/catch і логиться як `logger.info("sergeant.hooks.registered", { failures })`. **Railway log-forwarder strip-ає structured fields з INFO level** — тому 5/5 silent failure не видно в logs.
- Цей самий баг був відловлений у [`305a4a03`](https://github.com/Skords-01/Sergeant/commit/305a4a03) (2026-05-11) `safeRegisterHook` helper-ом. Stage 1 SDK rewrite ([#2438](https://github.com/Skords-01/Sergeant/pull/2438) `14ee42e2`) **видалив цей helper** і регресія пройшла непомічена.

Зміни у PR #2469 (single commit):

- `packages/openclaw-plugin/src/index.ts` — реєстрація hook-ів через explicit array з `name` field, передаємо `{ name }` як 3-й аргумент до `registerHook`. Імена: `sergeant.shortcut-router`, `sergeant.budget-gate`, `sergeant.audit.before-agent-start`, `sergeant.audit.agent-end`, `sergeant.write-approval`.
- Додатковий `logger.error("sergeant.hook.registration_failed", …)` per failure — ERROR level не strip-ається Railway forwarder-ом, тому майбутні регресії в реєстрації будуть видимі одразу.
- `packages/openclaw-plugin/src/types/openclaw-ambient.d.ts` — `opts.name` mark-нутий як required (`{ name: string; priority?: number; timeoutMs?: number }`) щоб typecheck впіймав будь-який майбутній виклик без `name`.
- Новий тест у `src/index.test.ts` — `it("passes a unique non-empty opts.name to every registerHook call …")` валідовує що **усі 5 hook-ів** мають canonical name + names унікальні.

Stage 4a audit-hook (`before_agent_start` shape mismatch) лишається окремою задачею (follow-up PR TODO) — нова реєстрація з `opts.name` забезпечить що hook принаймні **запускається**, але `event.userMessage` все одно `undefined` поки не зробимо переїзд hook-у. Цей PR (#2469) — passive необхідна умова, не sufficient. Розблоковує: Stage 4b live (третя спроба smoke-test після redeploy), Stage 4a audit-hook fix forward (окремий PR після цього merge).

14. **Real root-cause #3 — Railway service НЕ підключений до GitHub** (виявлено 2026-05-12 ~12:10 UTC): третій live smoke-test після PR #2469 merge також провалився — `/metrics` все ще повертав Opus prose. Розслідування Railway state виявило що production-Gateway все ще біжить **первісний deploy `74eab839` від `2026-05-12T10:06:43Z`** з `cliMessage: "Initial clean OpenClaw Gateway deploy"`. **Це була неповна картина** — розслідувався service `openclaw-gateway` у проєкті `openclaw-clean-gateway`, тоді як актуальний production service — `sergeant-openclaw-gateway` у проєкті `Sergeant`, і він **підключений до GitHub** (`Skords-01/Sergeant` на branch `main`). Наступний рух (root cause #4) виявив, що PR #2469 вже задеплоєний через GitHub auto-deploy (`aa0d5db3` від 10:56 UTC).

15. **Real root-cause #4 — lifecycle hooks реєструються через не той API** (виявлено 2026-05-12 13:15 UTC, fix in flight — **PR #2471**): після того, як третя live-перевірка на вже задеплоєному GitHub-auto-deploy-i (`aa0d5db3`) продовжила видавати симптом, розбір SDK 2026.5.7 виявив два **різних** методи на `api`:

- **`api.registerHook(events, handler, opts)`** — для внутрішньої command-bus event-и (`InternalHookEventType: "command" | "session" | "agent" | "gateway" | "message"`). Пушить у `registry.hooks` + `registerInternalHook()`. **Не fires** для `before_dispatch`, `agent_end`, `before_tool_call`.
- **`api.on(hookName, handler, opts?)`** — canonical для lifecycle hooks (всі 34 з `PluginHookName` enum). Пушить у `registry.typedHooks`, який `hookRunner.runBeforeDispatch()` зачитує.

Докази:

- `node_modules/openclaw/dist/plugin-sdk/src/plugins/types.d.ts:1905` — `registerHook: (events, handler: InternalHookHandler, opts?) => void;`
- `node_modules/openclaw/dist/plugin-sdk/src/plugins/types.d.ts:2052` — `on: <K extends PluginHookName>(hookName, handler, opts?) => void;`
- `node_modules/openclaw/dist/loader-B-GXgDrk.js:3137` — `on: (hookName, handler, opts) => registerTypedHook(...)`
- `node_modules/openclaw/dist/hook-runner-global-CCAcWVdN.js:108` — `getHooksForName(registry, hookName)` читає з `registry.typedHooks`.

Sergeant plugin (у ревізії `aa0d5db3`) реєструє всі 5 lifecycle hook-ів (`before_dispatch`, `llm_input`, `before_agent_start`, `agent_end`, `before_tool_call`) через `registerHook` — тобто вони потрапляють у internal command-bus і **ніколи не викликаються runtime-ом для реальних подій**. Log `sergeant.hooks.registered { ok: 5, failed: 0 }` обманює: реєстрація «успішна» з точки зору `registerHook` (`opts.name` валідний), але hook-и живуть у "мертвій" системі.

Додатково: `llm_input` + `agent_end` — conversation hooks (`CONVERSATION_HOOK_NAMES = ["llm_input", "llm_output", "before_agent_finalize", "agent_end"]`). Loader при `registerTypedHook` блокує їх для non-bundled plugins, якщо у конфігі не виставлено `plugins.entries.<id>.hooks.allowConversationAccess: true`. `before_dispatch`, `before_agent_start`, `before_tool_call` — поза цим списком, вільно реєструються.

PR #2471 (in flight):

- `packages/openclaw-plugin/src/index.ts` — заміна `for (...) registerHook(event, handler, { name })` на 5 окремих `api.on("before_dispatch", handler)`, `api.on("llm_input", handler)` тощо. Прибрано `opts.name` (не використовується typed-hook API).
- `packages/openclaw-plugin/src/types/openclaw-ambient.d.ts` — `on?:` як canonical; `registerHook?:` позначений як internal-only.
- `ops/openclaw/openclaw.example.json` — додано `hooks: { allowConversationAccess: true }` у `plugins.entries.sergeant` для розблокування `llm_input` + `agent_end`.
- `packages/openclaw-plugin/src/index.test.ts` — mock `api.on` замість `registerHook`; видалено тест на `opts.name` для lifecycle hooks.
- Оновлений spike doc (§ 4 Hook canonical enum) + Stage 4b handoff doc (§ 0.5).

Чому раніше не зловили:

- Unit-тести використовували self-consistent mock з `registerHook` (мок повертав те саме, що збирав, і тести бачили «5 hooks registered»). Real SDK contract не перевірявся.
- Live smoke не давав сигналу про різницю між «hook registered» і «hook called».
- Spike doc Був написаний автором, що зустрів першим в `OpenClawPluginApi` `registerHook` і прийняв його як canonical. `api.on` взагалі не був згаданий у spike doc до цього update.

Next action — чекати на merge PR #2471 в `main`, GitHub auto-deploy через ~3–5 хв, live smoke-test 5 команд (`/metrics`, `/runway`, `Дай метрики`, `/think ...`, `/status`).

### Session log — 2026-05-12 follow-ups (PR #2473 + #2474)

Після live-verification Stage 4b (17:08–17:09 EEST) залишилися два operational-несумісних артефакти:

1. **`/runway` HTTP 400 у snapshot section.** Шорткат `runway.ts` запитував `SELECT * FROM business_snapshot`, шорткат `decisions.ts` — `SELECT ... FROM ai_decisions`. Жодна з цих таблиць не існує у `apps/server/src/migrations/`, і жодна не в `QUERY_APP_DB_TABLE_ALLOWLIST` (`apps/server/src/modules/openclaw/types.ts:153-175`). Сервер коректно повертав HTTP 400 на allowlist-перевірці, і ця помилка пробрасувалася в rendered Markdown — не баг гейтвея, а баг шортката. **Fix-forward у [PR #2473](https://github.com/Skords-01/Sergeant/pull/2473) (merged 2026-05-12 14:42 UTC):**
   - `runway` → `SELECT COUNT(*) AS invocations, COALESCE(SUM(cost_usd), 0) AS cost_usd_30d FROM openclaw_invocations WHERE invoked_at >= NOW() - INTERVAL '30 days'` (allowlisted) + Stripe + explicit notice that business-snapshot pipeline = Stage 5.
   - `decisions` → `SELECT id, topic, decision, decided_at FROM openclaw_decisions ORDER BY decided_at DESC LIMIT 10` (allowlisted; same table `record_decision` writes via `apps/server/src/modules/openclaw/store.ts:179`).
   - Regression test у `all-shortcuts.test.ts` статично сканує SQL кожного `query_app_db` шортката і фейлить CI, якщо `FROM`/`JOIN` ціль не у дзеркалі `QUERY_APP_DB_TABLE_ALLOWLIST`.

2. **`openclaw_invocations.user_message` = `"(empty user message)"` для кожного рядка з 2026-05-12.** Stage 4a audit-hook читав вгадане `event.userMessage`, але real openclaw 5.7 `before_agent_start` шле `{ prompt, runId?, messages? }` (див. [`openclaw-sdk-5.7-real-api.md`](../notes/spikes/openclaw-sdk-5.7-real-api.md) § 1 — `before_agent_start` позначений `@deprecated` у real SDK саме тому, що його канонічні поля переплутані з `before_prompt_build`). **Fix-forward у [PR #2474](https://github.com/Skords-01/Sergeant/pull/2474) (merged 2026-05-12):**
   - `audit.ts` тепер читає `event.prompt` (canonical) → fallback `event.userMessage` (для legacy fixtures) → `"(empty user message)"` (sentinel).
   - 3 precedence-тести в `audit.test.ts` пінять кожен код-path.
   - Не торкається lifecycle hook-у — переключення зі `before_agent_start` на `session_start` лишається окремим cleanup-ом (real SDK позначив `before_agent_start` `@deprecated`).

Після обох merge-ів `packages/openclaw-plugin` має 175/175 vitest, чистий lint/typecheck/build. Production redeploy відбувається через Railway auto-watch на `main`. Stage 4c (Haiku JSON-classifier) merged [#2477](https://github.com/Skords-01/Sergeant/pull/2477) (`2ed02f1e`, 2026-05-12) — plugin тестів 200/200, server +37 нових; production smoke 12/12 PASS ([PR #2478 comment](https://github.com/Skords-01/Sergeant/pull/2478#issuecomment-4432335476)). Stage 5a (per-persona tool allowlist + gate-test) merged [#2480](https://github.com/Skords-01/Sergeant/pull/2480) (`08802283`, 2026-05-12) — `agents.list[].tools.{alsoAllow,deny}` per-persona, canonical mapping у `packages/openclaw-plugin/src/personas/allowlist.ts` + gate-test `config-gate.test.ts`. **Fix-up:** initial PR використовував `agents.<id>` keys + `agents.defaults.tools` (відкидаються real openclaw 5.7 runtime schema), gateway увійшов у crash-loop 16:40 UTC. Forward-fix flatten-ить у `agents.list[]` + переносить baseline у root-level `tools.alsoAllow` + додає локальний валідатор `scripts/validate-openclaw-config.mjs` (запускати руками перед PR; CI wiring — follow-up PR з workflow-scope token). Наступний крок — Stage 5b (strategic-modes wiring: `/plan`, `/analyze`, `/okr`).

### Що сьогодні реально працює (Stage 4c + Stage 5a production)

- **25 read-tools + 5 write-tools = 30 tools + 5 hooks** у плагіні (`packages/openclaw-plugin/src/index.ts`). Read-tools: `recall_memory`, `read_strategy_docs`, `record_decision`, `query_app_db`, `get_server_stats`, `get_stripe_metrics`, `get_posthog_stats`, `get_sentry_issues`, `read_github`, `github_search`, `github_tree`, `github_diff`, `github_prs`, `get_github_releases`, `n8n_list`, `n8n_describe`, `n8n_trigger`, `n8n_activate`, `refresh_business_snapshot`, `read_workflow_logs`, `read_telegram_topic`, `seo_gsc_query`, `seo_psi_audit`, `seo_serp_lookup`, `set_reminder`. Write-tools: `create_github_issue`, `commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`, `mute_alert`. Усі — HTTP-проксі до `/api/internal/openclaw/<endpoint>` без змін у server API. Hooks: `before_dispatch` (Stage 4b shortcut router — short-circuit з $0 cost), `llm_input` (бюджет гейт), `before_agent_start` (open invocation — `@deprecated` у real SDK; Stage 4a follow-up мігрує), `agent_end` (finalize invocation), `before_tool_call` (native approval для 5 write-tools з логуванням результату в `/write-audit/log`).
- **10 persona SKILL-ів** + **3 strategic-mode SKILL-и** + **`council-roundtable`** + **`morning-digest`** + **`_stage-status`** overlay — у `ops/openclaw/skills/`, копіюються на volume через `docker-entrypoint.sh` при кожному рестарті.
- **Per-persona `agents.list[].tools.{alsoAllow,deny}`** у `ops/openclaw/openclaw.example.json` — кожна з 10 personas — окремий entry у `agents.list[]` масиві з власним subset (cofounder = 30 tools, eng = 9, devops = 10, pm = 7, growth = 7, finance = 4, data = 5, cs = 5, content = 5, seo = 7); shared baseline `recall_memory` живе у root-level `tools.alsoAllow` (НЕ у `agents.defaults` — там `tools` field не дозволено runtime schema). Read-only personas (finance/data/seo) явно deny-ять всі 5 write-tools для defence-in-depth. Canonical mapping живе у `packages/openclaw-plugin/src/personas/allowlist.ts`; gate-test `config-gate.test.ts` ламається якщо SKILL.md ↛ allowlist.ts ↛ openclaw.example.json розходяться. Локальний валідатор `scripts/validate-openclaw-config.mjs` проганяє `openclaw config validate --json` проти example — запускати руками перед PR (CI wiring — follow-up PR з workflow-scope token).
- **Server-side endpoints** — всі 42 endpoint-и під `/api/internal/openclaw/*` готові: read, write (5 write-tools), audit (`/write-audit/log`, `/write-audit/list`), n8n delegation (`/n8n/{list,describe,trigger,activate}`, `/snapshot/refresh`), SEO env-stubs, reminders (`/reminders/{set,list-due,mark-sent,mark-failed,cancel}`). Реалізовані ще у v3.1 PR-C1, продовжують обслуговувати legacy grammy bot `@OpenClaw_sergeant_bot`.
- **Окрема Gateway bot-identity** в Telegram (PR-F ADR-0055): новий бот пейриться як webhook на `sergeant-openclaw-gateway` Railway service; legacy grammy bot живе паралельно як fallback.

### Що НЕ зроблено (gap relative to v3.1 plan)

| #   | Блок                                                                                                             | Стан                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Де лежить legacy-заготовка                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --- |
| 1   | 5 write-tools (`create_github_issue`, `commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`, `mute_alert`) | ✅ 5/5 зареєстровані як HTTP-проксі (Stage 3, PR #2463)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `src/legacy/write-tools/` — reference-only; активні у `src/index.ts`                       |
| 2   | 5 hooks + Layer 0 shortcut router (17 shortcuts + canned templates, $0 LLM cost) + Layer 1 cheap-router          | ✅ 6/6: `before_dispatch` × 2 (Layer 0 shortcut router live + Layer 1 Haiku cheap-router merged PR [#2477](https://github.com/Skords-01/Sergeant/pull/2477) `2ed02f1e` 2026-05-12; reg-order Layer 0 → Layer 1 → agent), `llm_input` (бюджет), `before_agent_start` (audit-open — `@deprecated` у real SDK; PR #2474 переключив hook з guessed `event.userMessage` на canonical `event.prompt`, лишається міграція на `session_start` як окремий cleanup), `agent_end` (finalize), `before_tool_call` (approval). Layer 0 shortcut router з 17 shortcuts (`/metrics`, `/runway`, `/status`, … + UA-фрази) — live. Layer 1 cheap-router (Haiku JSON-classifier) — production smoke **12/12 PASS** 2026-05-12 (див. § «Stage 4c — як тестити» + [PR #2478 comment](https://github.com/Skords-01/Sergeant/pull/2478#issuecomment-4432335476)). | `src/legacy/budget.ts`, `audit.ts`, `shortcut-router.ts` + `shortcuts/`, `cheap-router.ts` |
| 3   | Approval gate для write-tools                                                                                    | ✅ native SDK approval живий (`before_tool_call.requireApproval` — Stage 4a, цей PR). Host рендерить approval UI, `onResolution` логує в `/write-audit/log` з рішенням (`approved`/`rejected`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `src/legacy/write-tools/approval-variants.ts` (хибний PoC stub; не використовувати)        |
| 4   | Council orchestration ($2.0 cap pre-gate, послідовність `devops → eng → pm → growth → finance → cofounder`)      | ✅ live — Stage 5c (this PR). SKILL `ops/openclaw/skills/council-roundtable/` + `src/council/index.ts` (port `legacy/council.ts`) + `before_dispatch` budget gate hook + `before_agent_start` `COUNCIL_PRIMER` injection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/legacy/council.ts` + `council-config.test.ts` (можна ретирувати у Stage 7)            |
| 5   | Strategic-modes wiring (slash-handlers `/plan` `/analyze` `/okr` + `strategicModes` блок у `openclaw.json`)      | ✅ wiring живий — Stage 5b PR-1 `/plan` ([#2482](https://github.com/Skords-01/Sergeant/pull/2482)), PR-2 `/analyze` ([#2483](https://github.com/Skords-01/Sergeant/pull/2483)), PR-4 `/okr` (this PR). `before_agent_start` hook + `ALL_STRATEGIC_MODES` catalogue + 3 byte-for-byte drift gates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/legacy/strategic-modes.test.ts` (13 tests)                                            |
| 6   | Per-persona tool allowlist (`agents.list[].tools.{alsoAllow,deny}` замість плоского `tools.alsoAllow`)           | ✅ Stage 5a merged ([#2480](https://github.com/Skords-01/Sergeant/pull/2480), `08802283`) + fix-up [#2485](https://github.com/Skords-01/Sergeant/pull/2485) (flatten до `agents.list[]` per real openclaw 5.7 schema) + CI validator job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/legacy/persona-allowlist.test.ts`                                                     |
| 7   | Morning-digest cron registration (`0 9 * * *` Kyiv через native scheduler)                                       | SKILL є ✅, scheduler API не підтверджений на openclaw 5.7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `ops/openclaw/skills/morning-digest/SKILL.md`                                              |
| 8   | Parity harness (Phase 6.5 — порівняти Gateway vs grammy bot)                                                     | ❌ — код є, не виконується у CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `src/legacy/parity/`                                                                       |
| 9   | Phase 7 cutover (BotFather identity swap, видалення `tools/console/src/openclaw/` через 28 днів)                 | ❌ — обидва боти живуть паралельно                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | n/a                                                                                        |
| 10  | Reminders cron-poller delivery в Telegram                                                                        | Server endpoints `/reminders/list-due` + `/mark-sent` ✅; treba перевірити, чи polling job dispatches на Gateway-webhook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `apps/server/src/modules/openclaw/reminder-poller.ts`                                      |
| 11  | Voice toggle (`/voice on                                                                                         | off`), Canvas, WhatsApp pairing, ClawHub publishing, multi-channel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | відкладено за планом — окремий micro-ADR після Phase 7                                     | n/a |

### Що блокує наступний крок (Stage 4a hook smoke-test)

SDK reality-check spike закрився 2026-05-12 — деталі у [`docs/notes/spikes/openclaw-sdk-5.7-real-api.md`](../notes/spikes/openclaw-sdk-5.7-real-api.md). TL;DR результатів:

1. **Hook API.** Да, `api.registerHook(name, handler)` існує. Canonical enum — 34 назви; ключові для нас: `llm_input` (per-call budget gate), `agent_end` (turn finalize), `before_tool_call` (approval gate + audit), `after_tool_call` (audit), `heartbeat_prompt_contribution` (cheap-router injection), `before_agent_start` (Layer 0 shortcut).
2. **Approval API.** Нативний mechanism — hook `before_tool_call` повертає `{ requireApproval: { title, description, severity?, timeoutMs?, timeoutBehavior?, onResolution? } }`. **Variant B з v3.1 plan-у НЕ потрібен** — native API покриває все (Locked #5 наслідок переглянуто у спайку).
3. **Per-persona allowlist.** `agents.list[].tools: AgentToolsConfig` (entry у `agents.list[]` array з `id` + опціональний `tools`; той самий тип `AgentToolsConfig` що в root `tools`). Config-only, немає plugin-side API. **NB:** `agents.defaults` НЕ дозволяє `tools` поле і `agents.<id>` keys (без `.list[]` обгортки) відкидаються runtime schema — shared baseline tools на root-level `tools.alsoAllow`. CI gate: `scripts/validate-openclaw-config.mjs`.
4. **Scheduler API.** Глобальний cron — декларативно в `cron.*` config-block (або `heartbeat_prompt_contribution` hook для інъєкції в промпт). `registerSessionSchedulerJob` — лише per-session, **не для morning-digest**.

Наступний unknown — **live smoke-test register-у hook-ів на Gateway** (у Stage 4a): поставити простий `llm_input` no-op handler + 1 `before_tool_call` handler для одного write-tool і верифікувати, що Gateway їх викликає з очікуваним payload shape.

### Запропонована Stage-послідовність (заміняє PR-C2…PR-F скоупи)

| Stage         | Що це                                                                                                                                                        | Залежність                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ризик                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| ✅ 1          | MVP — 3 read-tools на real SDK                                                                                                                               | merged ([#2438](https://github.com/Skords-01/Sergeant/pull/2438))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | n/a                                     |
| ✅ 2          | 25 read-tools migration + persona skills restore                                                                                                             | merged ([#2449](https://github.com/Skords-01/Sergeant/pull/2449) + [#2456](https://github.com/Skords-01/Sergeant/pull/2456) + persona-restore `a03f4e74`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | n/a                                     |
| ✅ 🔬         | SDK reality-check spike (hook / approval / allowlist / scheduler API)                                                                                        | merged ([`openclaw-sdk-5.7-real-api.md`](../notes/spikes/openclaw-sdk-5.7-real-api.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | n/a                                     |
| ✅ 3a         | Register `create_github_issue` write-tool                                                                                                                    | merged (цей PR — разом зі 3b для атомарності \_stage-status overlay)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | n/a                                     |
| ✅ 3b         | Решта 4 write-tools (`commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`, `mute_alert`)                                                              | merged (цей PR)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | n/a                                     |
| ✅ 4a         | Budget + audit hooks (`llm_input` per-call + `before_agent_start` open + `agent_end` finalize) + write-approval (`before_tool_call.requireApproval`)         | merged ([#2464](https://github.com/Skords-01/Sergeant/pull/2464), `fc6ca5be`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | n/a                                     |
| ✅ 4b         | Layer 0 shortcut router (17 shortcuts + canned templates, $0 LLM cost; composed BEFORE audit-open у `before_agent_start`)                                    | merged (цей PR — type-level зелений; live smoke-test після першого Gateway redeploy)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | n/a                                     |
| ✅ 4c         | Layer 1 cheap router (Haiku JSON-classifier)                                                                                                                 | merged ([#2477](https://github.com/Skords-01/Sergeant/pull/2477), `2ed02f1e`, 2026-05-12) — production smoke 12/12 PASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | n/a                                     |
| ✅ 5a         | Per-persona tool allowlist + gate-test                                                                                                                       | merged [#2480](https://github.com/Skords-01/Sergeant/pull/2480) (`08802283`, 2026-05-12) — `agents.<id>.tools.{alsoAllow,deny}` per-persona, canonical mapping + gate-test. **Fix-up:** після merge gateway увійшов у crash-loop (16:40–18:00 UTC) бо initial shape використовував `agents.<id>` keys + `agents.defaults.tools`, які відкидаються real openclaw 5.7 runtime schema. Forward-fix flatten-ить персони у `agents.list[]` array + переносить baseline у root-level `tools.alsoAllow`, додає локальний валідатор `scripts/validate-openclaw-config.mjs` який проганяє `openclaw config validate --json` проти example-config (TODO: wire у CI окремим PR з workflow-scope token). | n/a                                     |
| ✅ 5b         | Strategic-modes wiring (`/plan` `/analyze` `/okr`) — розбито на 4 PR (PR-1 `/plan`, PR-2 `/analyze`, PR-3 docs handoff, PR-4 `/okr` + tracker bump)          | Stage 5a — all four PRs merged 2026-05-12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | низький                                 |
| ✅ 5b/plan    | `/plan <topic>` strategic mode (`before_agent_start` hook + PLAN_PRIMER injection + drift gate з legacy console primer)                                      | merged ([#2482](https://github.com/Skords-01/Sergeant/pull/2482), `ae703ca0`, 2026-05-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | n/a                                     |
| ✅ 5b/analyze | `/analyze <anomaly>` strategic mode (extends `ALL_STRATEGIC_MODES` catalogue + `ANALYZE_PRIMER` byte-for-byte drift gate, integration test reuses host hook) | merged ([#2483](https://github.com/Skords-01/Sergeant/pull/2483), `51290121`, 2026-05-12 17:20 UTC)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | низький                                 |
| ✅ 5b/okr     | `/okr [<topic>]` strategic mode (`topicRequired: false` — bare `/okr` activates, optional topic forwarded as prompt) + `OKR_PRIMER` byte-for-byte drift gate | merged (this PR — Stage 5b PR-4) + parent Stage 5b ⬜→✅ bump                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | низький                                 |
| ✅ 5c         | Council orchestration + $2.0 budget pre-gate (port `legacy/council.ts` → `src/council/index.ts` + `before_dispatch` gate hook + `before_agent_start` primer) | merged (this PR — Stage 5c) — `/council <питання>` slash-handler, `COUNCIL_DEFAULT_SEQUENCE` (Locked #8: devops → eng → pm → growth → finance → cofounder synthesis), fail-closed gate proти `/budget` (≥$2.0 headroom)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | низький                                 |
| ✅ 5d         | Morning-digest cron (native `cron.*` config + idempotent `provision-cron.mjs`)                                                                               | merged ([#2490](https://github.com/Skords-01/Sergeant/pull/2490), `b187bfaf`, 2026-05-12 20:36 UTC) — `cron.*` config-block у `openclaw.example.json` + idempotent `ops/openclaw/provision-cron.mjs`, schedule `"0 9 * * *"` Europe/Kyiv, payload `/digest day` через Layer 0 shortcut router ($0 LLM cost), 18 нових `node:test` unit-тестів                                                                                                                                                                                                                                                                                                                                                | n/a                                     |
| ✅ 6a         | Reactivate parity harness у CI                                                                                                                               | merged (`23dc3c58`, 2026-05-12 21:10 UTC) — `packages/openclaw-plugin/src/parity/` з 21 golden-fixture-ом (17 shortcuts + 3 strategic modes + `/council`), `routeMessage()` 3-layer runner, 34 нові vitest specs (351/351 total), drift-gate `COUNCIL_DEFAULT_SEQUENCE` ↔ `ops/openclaw/skills/council-roundtable/SKILL.md § Default sequence` закрив recap §6 open follow-up                                                                                                                                                                                                                                                                                                                | n/a                                     |
| ⬜ 6b         | ≥1 тиждень manual parallel run (grammy vs Gateway)                                                                                                           | Stage 6a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | високий — час                           |
| ⬜ 7          | Phase 7 cutover playbook (ADR-0056 supersedes ADR-0055 § cutover) + deletion reminder                                                                        | Stage 6b                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | високий — deletion міркувань rollback-у |
| ⬜ 8+         | Voice toggle, Canvas, WhatsApp pairing, ClawHub, multi-channel                                                                                               | Stage 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | n/a — окремі micro-ADR після cutover    |

---

## Мета

Замінити внутрішній OpenClaw co-founder бот (ADR-0031, `tools/console/src/openclaw/`) зовнішнім [OpenClaw](https://github.com/openclaw/openclaw) — open-source персональним AI-асистентом (MIT, 370k+ зірок). Це дасть:

- **25+ каналів** (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, тощо) замість лише Telegram
- **Голосовий ввід/вивід** (macOS/iOS/Android)
- **Multi-model підтримка** (не лише Anthropic)
- **Canvas UI** для візуалізації
- **Community plugins** і **ClawHub** реєстр
- **Self-hosted Gateway** з dashboard

---

## Передумови

Переконайся, що ці речі на місці перед початком:

- **Node 24** (або 22.16+) для Gateway
- **OpenClaw версія — pinned stable** (не beta). Перевірити останній stable tag на release-сторінці і зафіксувати його у `packages/openclaw-plugin/package.json` через `peerDependencies` + у Railway service env-конфігу. Renovate-only PR на апгрейди — без auto-merge.
- **Anthropic API key** (або інший provider)
- **Доступ до Sergeant server API** (`/api/internal/openclaw/*`) — endpoint stays internal, plugin звертається через `INTERNAL_API_KEY`.
- **Telegram Bot Token** — **окрема нова Telegram bot-identity** для Gateway (через @BotFather, наприклад `@OpenClaw_sergeant_v2_bot`). Production grammy-бот `@OpenClaw_sergeant_bot` залишається на старому Railway service `sergeant-openclaw` undisturbed як fallback (він **не** пейриться у Gateway). Phase 0.5 PoC використовував окремий test-bot.
- **GitHub App credentials** (`OPENCLAW_GITHUB_APP_ID`, `OPENCLAW_GITHUB_APP_PRIVATE_KEY`, `OPENCLAW_GITHUB_APP_INSTALLATION_ID`) — обов'язково для production-instance Gateway. Hard Rule #20 забороняє `OPENCLAW_GITHUB_PAT` / `Git_PAT` у production; `read_github` і `create_github_issue` tools у плагіні ходять через ту саму server-side прокладку, тож саме server-side вже використовує App-flow — plugin має лише не зберігати PAT-и в Railway env.

---

## Locked decisions

Зафіксовані рішення з founder-review на 2026-05-10. Все нижче — baseline для PR-A; деталізація живе у відповідних розділах плану. Зміна будь-якого locked рішення = окремий PR з оновленням цієї таблиці + причини.

| #   | Питання                 | Lock                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Railway placement       | Той самий Railway проєкт, що й `apps/server`; persistent volume **5 GB** на `~/.openclaw`.                                                                                                                                                                                                                                                                                                    |
| 2   | OpenClaw version pin    | Latest stable tag на дату merge Phase 0; weekly Renovate PR з manual review (без auto-merge).                                                                                                                                                                                                                                                                                                 |
| 3   | n8n auth                | Той самий env-secret `n8n_API` (без окремого токена для OpenClaw), scope = read + limited-write (Tier A trigger / Tier C activate, без delete).                                                                                                                                                                                                                                               |
| 4   | Cost budget             | Per-call cap **\$0.5**, council cap **\$2.0**, daily cap **\$10/добу** (server-side `/budget`, kind=`per_call` / `council` / `daily`).                                                                                                                                                                                                                                                        |
| 5   | Approval variant        | Phase 0.5 PoC прогоняє **всі три** варіанти (A native / B custom hook / C hybrid); default ставка для Phase 4 — **B (custom hook + own UX)**.                                                                                                                                                                                                                                                 |
| 6   | Strategic Modes         | Phase 3 — **opt-in / optional**; defer scope, не блокує Phase 4. Виносимо в окрему follow-up ініціативу якщо знадобиться.                                                                                                                                                                                                                                                                     |
| 7   | Memory `private` topic  | **Не додаємо** `private` topic у `ai_memories`. Особистий чат founder-а живе окремо від agent-memory (поза скоупом плагіна).                                                                                                                                                                                                                                                                  |
| 8   | Council sequence        | Default order: `devops → eng → pm → growth → finance → cofounder` (synthesis у кінці). `/council` без аргументів — цей порядок.                                                                                                                                                                                                                                                               |
| 9   | Migration ordering      | Дві нові міграції (`ai_memories.persona`+`topic` та `openclaw_reminders`) переїжджають у **PR-B (PoC)** разом з Phase 0.5 spike (раніше були у PR-D / Phase 4). Конкретні номери — наступні вільні на момент відкриття PR-B (наприклад `054`/`055`); попередня версія Lock-таблиці казала `036/037`, але ці номери вже зайняті іншим (`036_transcribe_usd_micros`, `037_rate_limit_buckets`). |
| 10  | Heartbeat thresholds    | Defaults у morning-digest: PR open `> 48h`, decision без owner `> 7d`, metric variance `> 20%` тригерить «червоний» tag для `/Олексій`.                                                                                                                                                                                                                                                       |
| 11  | Audit retention         | `openclaw_invocations` / `openclaw_write_audit`: **HARD DELETE > 90 днів** (без rollup-таблиці; cron у n8n Tier A).                                                                                                                                                                                                                                                                           |
| 12  | `/remind` parser        | Підтримка форматів: **UA** (`завтра 09:00`, `у вівторок`), **EN** (`tomorrow 9am`, `next monday`), **ISO** (`2026-05-15T09:00+03:00`).                                                                                                                                                                                                                                                        |
| 13  | Cofounder name          | Phantom-ім'я cofounder персони: **Андрій** (заміна `Сергій → Андрій` по всьому плану + SKILL.md).                                                                                                                                                                                                                                                                                             |
| 14  | Aliases                 | Лишаємо як є: `/Ім'я` + `/role` (наприклад `/Андрій` ≡ `/cofounder`, `/Артем` ≡ `/eng`).                                                                                                                                                                                                                                                                                                      |
| 15  | Voice toggle            | **Default — text reply.** Voice-reply вмикається явно через `/voice on` (per-conversation toggle). Voice-input приймається завжди (STT).                                                                                                                                                                                                                                                      |
| 16  | WhatsApp setup          | **Два WhatsApp accounts** (eSIM dual-SIM на iPhone founder-а): один production, один test/sandbox. Pairing у Phase 8.                                                                                                                                                                                                                                                                         |
| 17  | Grammy deletion         | Видалення `tools/console/src/openclaw/` + `agents/{openclaw,personas,strategic-modes,dispatcher}.ts` — `set_reminder` на `cutover-day + 28 днів` (auto-PR через `/Артем`).                                                                                                                                                                                                                    |
| 18  | Post-Gateway extensions | ClawHub publishing, спільні plugins, multi-channel beyond WhatsApp — окремий **micro-ADR** після Phase 7 cutover. Не блокує цей план.                                                                                                                                                                                                                                                         |

---

## Інфраструктура та deploy

- **Хостинг Gateway:** окремий Railway service (`sergeant-openclaw-gateway`) у тому ж проекті, що й `apps/server`. Це мінімізує latency на додатковий hop (intra-Railway мережа) і дозволяє ділити private VPC.
- **Конфігурація:** template `ops/openclaw/openclaw.json` живе у репо (config-as-code), на старті контейнера копіюється у `~/.openclaw/openclaw.json` всередині mounted volume. Persistence: skills, canvas state, WhatsApp/Telegram auth-state — на volume. Перезбірка контейнера auth не вбиває.
- **Що config-as-code (репо, PR-review):** `agents.<persona>.tools` allowlists, persona prompts (SKILL.md), model defaults per persona, n8n tier mapping, shortcut catalog, cheap-router config, budget caps.
- **Що через Railway env:** `ANTHROPIC_API_KEY`, `INTERNAL_API_KEY`, `OPENCLAW_FOUNDER_USER_ID`, `OPENCLAW_FOUNDER_TG_USER_ID`, `SERVER_INTERNAL_URL`, GSC/PSI/SerpAPI ключі (опційні, додаються по мірі готовності).
- **Що через dashboard / CLI один раз:** channel-pairing (Telegram webhook setup, WhatsApp QR), OAuth flows для майбутніх каналів, live-операції (mute channel, restart agent).
- **Secrets:** Railway env, окремий namespace від `apps/server`. Немає `OPENCLAW_GITHUB_PAT` у production — Hard Rule #20.
- **Webhook vs long-poll:** Telegram через webhook на Gateway public URL (Railway exposes HTTPS). Channels-specific config — у `openclaw.json`.
- **Networking:** Gateway → server викликає `https://server.internal:3000/api/internal/openclaw/*` через приватний домен Railway.

---

## Команда персон (10 ролей)

Продукт орієнтується на 10k+ MAU; персональні агенти змодельовані як невелика компанія з phantom-іменами, щоб founder спілкувався з конкретними «людьми», а не з абстрактними slug-ами. Кожна персона має `model_default` + `model_for_thinking` (Haiku / Sonnet / Opus) для cost-aware routing.

| Slug        | Ім'я    | Роль                                                                           | Aliases                           | Tools allowlist (high-level)                                                                                                                                                                                                 | `model_default` | `model_for_thinking` |
| ----------- | ------- | ------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------- |
| `cofounder` | Андрій  | CEO / Cofounder — синтез, OKR, executive decisions, опонент-mode               | `/Андрій`, `/cofounder`, `/co`    | full set (read + write всі), record_decision, council                                                                                                                                                                        | Sonnet          | Opus                 |
| `eng`       | Артем   | CTO / Engineering Lead — architecture, code review, PR queue, schema, security | `/Артем`, `/eng`, `/cto`          | read_github, search_code, read_github_tree, read_github_diff, list_open_prs, query_app_db (read-only views), recall_memory, record_decision, create_github_issue (gated)                                                     | Sonnet          | Opus                 |
| `devops`    | Олексій | DevOps / SRE — reliability, incidents, n8n health, deploy                      | `/Олексій`, `/devops`, `/sre`     | read_workflow_logs, list_n8n_workflows, describe_n8n_workflow, trigger_n8n_workflow (Tier A auto / Tier C gated), activate_workflow (gated), pause_workflow (gated), mute_alert (gated), get_sentry_issues, get_server_stats | Haiku           | Sonnet               |
| `pm`        | Олена   | Product Manager — roadmap, JTBD, customer interviews, prioritization           | `/Олена`, `/pm`, `/product`       | read_strategy_docs, get_posthog_stats, query_app_db, recall_memory, record_decision, create_github_issue (gated), commit_to_strategy_doc (gated)                                                                             | Sonnet          | Opus                 |
| `growth`    | Марта   | Growth / Marketing Lead — acquisition, activation, retention, lifecycle        | `/Марта`, `/growth`, `/marketing` | get_posthog_stats, get_stripe_metrics, query_app_db, read_github (releases), recall_memory, post_to_topic (gated)                                                                                                            | Sonnet          | Sonnet               |
| `seo`       | Назар   | SEO Specialist — technical + content SEO, GSC, competitor analysis             | `/Назар`, `/seo`                  | get_search_console_metrics (env-stub), get_lighthouse_score (env-stub), read_competitor_serp (env-stub), read_strategy_docs, read_github (sitemap/robots/meta), get_posthog_stats, recall_memory                             | Sonnet          | Sonnet               |
| `content`   | Софія   | Content / Copywriter — long-form, landing copy, emails, in-app text            | `/Софія`, `/content`, `/copy`     | read_strategy_docs, recall_memory, read_github (read-only), commit_to_strategy_doc (gated, контент-доки), post_to_topic (gated)                                                                                              | Sonnet          | Opus                 |
| `data`      | Ярема   | Data Analyst — cohorts, A/B tests, metrics deep-dive                           | `/Ярема`, `/data`, `/analytics`   | query_app_db (full read-allowlist), get_posthog_stats, get_stripe_metrics, get_server_stats, recall_memory                                                                                                                   | Sonnet          | Sonnet               |
| `cs`        | Ольга   | Customer Success — support, NPS, churn signals, user feedback                  | `/Ольга`, `/cs`, `/support`       | read_telegram_topic_history, query_app_db (support views), get_posthog_stats, recall_memory, post_to_topic (gated)                                                                                                           | Haiku           | Sonnet               |
| `finance`   | Ірина   | Finance — Stripe revenue, refunds, runway, vendor costs                        | `/Ірина`, `/finance`              | get_stripe_metrics, query_app_db (finance views), recall_memory, record_decision                                                                                                                                             | Haiku           | Sonnet               |

**Принципи:**

- Cofounder (Андрій) — єдиний з повним write-set + memory across personas.
- Кожен спеціаліст — read-mostly у своїй смузі + 1-2 write-tools з approval.
- Виклик — явний: `/Ім'я` або `/slug` (`/Артем` ≡ `/eng`, `/Андрій` ≡ `/cofounder`). Default — Андрій якщо префікса немає.
- Council (round-table) — будь-яка підмножина персон; `/council Артем Назар Ярема "питання"`.
- Force-think: `/think <питання>` обходить cheap-router і запускає `model_for_thinking` (Opus у більшості випадків).

---

## 3-шарова cost-aware routing

Щоб не палити токенами на рутині, кожне повідомлення проходить трьома шарами фільтрації від найдешевшого до найдорожчого.

| Шар                                        | Хто                                                | Коли спрацьовує                                                                      | Cost / повідомлення                       |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Layer 0 — Shortcuts** (без LLM)          | Регулярки / slash-команди / pre-LLM hook у плагіні | Точна впізнавана рутина: status checks, digests, refresh, query                      | **$0** (тільки tool execute + cache read) |
| **Layer 1 — Cheap router** (Haiku 3.5)     | Один короткий LLM-call (~200 токенів)              | Природне формулювання → класифікує: routine / thinking / chat                        | **~$0.0002**                              |
| **Layer 2 — Full agent** (Sonnet або Opus) | Повний agent loop з персонами, tools, memory       | Тільки коли Layer 1 каже «thinking», або користувач явно покликав персону / `/think` | **~$0.02–0.50** залежно від задачі        |

**Маршрут message-а:**

1. `llm_input` hook → перевіряє Layer 0 регулярки (точне співпадіння на shortcut → execute, відповідь, exit без LLM).
2. Якщо немає match — Layer 1 cheap-router (Haiku) класифікує: `{ class: "routine_metrics" | "routine_recall" | "routine_remind" | "thinking" | "chat", shortcut?: string, persona?: string }`.
3. Якщо `class` починається з `routine_` — викликаємо відповідний Layer 0 shortcut з parsed params, exit.
4. Якщо `class=thinking` — ескалація до Layer 2 з визначеною персоною. Cofounder за замовч.; cheap-router може запропонувати конкретну (`eng`, `growth`, тощо).
5. Якщо `class=chat` — Haiku сама відповідає коротко (1-2 речення), без tools.

**Cheap-router system prompt** (commited у `ops/openclaw/cheap-router.system.md`):

```text
Класифікуй message українською:
A) routine_metrics — питання про поточні цифри (revenue, signups, PR queue, sentry, status)
B) routine_recall — запит на згадку («що ми вирішили по X», «де я писав про Y»)
C) routine_remind — встановити нагадування / cron
D) thinking — потрібен синтез, decision, planning, code review
E) chat — світська бесіда / уточнення

Output JSON: { "class": "...", "shortcut": "..."|null, "persona": "..."|null, "params": {...}|null }
```

### Каталог Layer 0 shortcut-ів

~17 детермінованих shortcut-ів. Кожен — окремий файл `packages/openclaw-plugin/src/shortcuts/<slug>.ts` з регулярним патерном + canned Mustache template для відповіді.

**Metrics & status (6):**

- `/metrics`, «як справи з метриками», «дай метрики» → Tier A refresh (`63 + 60` паралельно) → read PostHog daily + Stripe today + Sentry top 5 → canned template (опц. Canvas-чарт)
- `/runway` → query app DB + Stripe → «розрахунок runway = X місяців»
- `/status`, «як справи в продукті» → server `/health` + Railway latest deploy + Sentry rate → 3-рядковий статус
- `/sentry` → top 5 unresolved issues last 24h
- `/stripe` → today's revenue + failed payments + refunds
- `/posthog` → today's signups + MAU + key events

**Code & repo (3):**

- `/prs`, «що по PRs» → list open PRs + age + reviewer load
- `/releases` → last 5 GitHub releases
- `/builds` → last 10 Railway deploys + status

**Operations (3):**

- `/workflows` → list n8n workflows + last execution status
- `/refresh_metrics` → fire Tier A (3 workflows паралельно) + чекає 8 сек + читає
- `/heartbeat`, `/health` → ping всіх сервісів

**Memory & decisions (3):** `private` topic не вводимо (Locked decision #7) — особистий чат founder-а живе окремо від agent-memory.

- `/recall <query>` → semantic search ai_memories → top 5
- `/decisions` → останні 10 record_decision записів
- `/digest day|week` → агрегований daily/weekly summary

**Reminders (1):**

- `/remind <when> <what>` → set_reminder без LLM. Parser підтримує (Locked decision #12): **UA** (`завтра 09:00`, `у вівторок 14:30`, `через 2 години`) + **EN** (`tomorrow 9am`, `next monday`, `in 2 hours`) + **ISO** (`2026-05-15T09:00+03:00`).

**Force-think (1):**

- `/think <питання>` → bypass Layer 0/1, запуск Layer 2 з `model_for_thinking` (Opus) і `persona=cofounder` (або вказана префіксом `/Артем /think ...`).

---

## n8n: 4-tier classification

Замість плоского allowlist на trigger — 4 рівні з різною політикою.

| Tier                 | Що це                                                              | Approval | Коли агент використовує                                                                                |
| -------------------- | ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| **A — Авто-refresh** | Snapshot-flows, output яких пишеться у нашу БД / cache             | Ні       | Коли потрібна свіжа дата. Fire & forget, потім читаємо з БД.                                           |
| **B — Не тригерити** | Digest-flows, output яких йде у конкретний Telegram topic / push   | n/a      | Агент **не** тригерить (не спамити #metrics). Замість цього сам читає raw sources і відповідає інлайн. |
| **C — З approval**   | Flows які пишуть зовні: push/email/broadcast до users, repo writes | Так      | Завжди approval-gate у Telegram DM.                                                                    |
| **D — Read-only**    | Webhook-driven flows (зовнішні сервіси їх тригерять)               | n/a      | Агент лише читає `executions` через `read_workflow_logs`.                                              |

### Розкладка по 19 active workflow-ах

| ID                 | Workflow                         | Tier | Чому                                              |
| ------------------ | -------------------------------- | ---- | ------------------------------------------------- |
| `OhDtiheODIp5nNLa` | 63 — Growth Acquisition Snapshot | A    | POST /api/internal/growth/acquisition — пише в БД |
| `lIz5LybDxnKKUNC0` | 60 — Growth Funnel Snapshot      | A    | POST /api/internal/growth/funnel — пише в БД      |
| `L2RZPTbR6RwHPoyB` | 99 — Heartbeat (alive check)     | A    | passive ping, no side effect                      |
| `ksN0PfQeKmi9qXOH` | 08 — Weekly Financial Digest     | B    | Telegram topic                                    |
| `gFd41GXrEFdc2hQo` | 16 — PostHog Daily Metrics       | B    | Telegram #metrics                                 |
| `ZPODB5HzEMzYUbEY` | 10 — Debt/Receivable Reminder    | B    | push + Telegram founder                           |
| `MS9GHZNYY1PLN1Qc` | 04 — Daily Backup Verification   | B    | Telegram-only result                              |
| `ar3BpvEEiPs2d5eT` | 19 — DB Health Report            | B    | Telegram #ops                                     |
| `pYq2LySdC2cL96Vi` | 18 — Nightly Security Audit      | B    | Telegram                                          |
| `T8qcO9Ku6o6wHO15` | 17 — GitHub PR Stale Alert       | B    | Telegram                                          |
| `cB3RqHdxka7WyVHH` | 07 — Morning Briefing Push       | C    | broadcast до **всіх** subscribers                 |
| `jRbQVcN0MaNajM4N` | 09 — Habit Streak At-Risk Alert  | C    | push до **користувачів**                          |
| `dZYn9scxQWOKaWeF` | 05 — Renovate PR Auto-Handler    | D    | GitHub webhook                                    |
| `fFMToeZXJLUQUl7l` | 02 — Failed Payment Recovery     | D    | Stripe webhook                                    |
| `b0c7OTo5ATcwqdQL` | 03 — Sentry Alert Routing        | D    | Sentry webhook                                    |
| `CygZ4vLxTm2ltuRW` | 15 — Railway Deployment Notify   | D    | Railway webhook                                   |
| `xdYhQTEARYVOeWcl` | 06 — Mono Webhook Enrichment     | D    | Mono webhook                                      |
| `0KTuLE8meOYjcNDw` | 01 — Billing Pipeline            | D    | Stripe webhook                                    |
| `iC82EFJzqBny9kxI` | 98 — Global Error Handler        | D    | dead-letter                                       |

Конфіг живе у `ops/openclaw/n8n-allowlist.json`:

```json
{
  "OhDtiheODIp5nNLa": {
    "tier": "A",
    "name": "63 — Growth Acquisition Snapshot"
  },
  "lIz5LybDxnKKUNC0": { "tier": "A", "name": "60 — Growth Funnel Snapshot" },
  "L2RZPTbR6RwHPoyB": { "tier": "A", "name": "99 — Heartbeat" },
  "cB3RqHdxka7WyVHH": { "tier": "C", "name": "07 — Morning Briefing Push" },
  "jRbQVcN0MaNajM4N": { "tier": "C", "name": "09 — Habit Streak At-Risk Alert" }
}
```

Tier B/D **не** з'являються у allowlist — їх просто немає у `trigger_n8n_workflow` scope. Зміна tier-у — 1 рядок у конфізі, без релізу плагіну.

---

## Memory schema extension

Isolated per persona, з cofounder-як-superuser:

- Міграція `054-ai-memories-persona-topic.sql` (наступний вільний номер на момент відкриття PR-B):
  - `ALTER TABLE ai_memories ADD COLUMN persona TEXT NOT NULL DEFAULT 'cofounder';`
  - `ALTER TABLE ai_memories ADD COLUMN topic TEXT;`
  - `CREATE INDEX idx_ai_memories_persona ON ai_memories (founder_user_id, persona);`
  - `CREATE INDEX idx_ai_memories_topic ON ai_memories (founder_user_id, topic);`
- Server-side `recall_memory` `query.persona` параметр:
  - Якщо caller = `cofounder` → читає everything (no filter).
  - Якщо caller = `<specialist>` → `WHERE persona = $caller OR topic = 'shared'`.
- Запис: `record_decision` і memory-write-tool пишуть з `persona = <current>` + inferred `topic`.
- `topic` — вільне поле (наприклад `tacmed-portal`, `finyk-launch`, `sergeant-mvp`, `cross`). Allowlist topics додамо у Phase 2 коли узгодимо проекти.

---

## Heartbeat morning digest

Щоранку 09:00 Kyiv cofounder надсилає zwijowany digest у founder's DM.

Skill `morning-digest` (cron всередині OpenClaw scheduler):

1. Stripe failures за 24h (через `get_stripe_metrics`)
2. Sentry top issues за 24h, severity ≥ warning (через `get_sentry_issues`)
3. PR queue: open PRs > 48h old + reviewer load (через `list_open_prs`)
4. Open decisions без owner (через `decisions/list`)
5. PostHog daily metrics: signups, MAU, key events (через `get_posthog_stats`)
6. n8n executions failed за 24h (через `read_workflow_logs` for each Tier A/B workflow)

**Формат:** коротка зведена відповідь у Telegram DM, з inline-keyboard «деталі по N».

**Heartbeat thresholds (Locked decision #10):**

- PR open `> 48h` (особливо без reviewer-а) — тег `/Артем`.
- Decision без owner `> 7d` — тег `/Андрій` + record у `record_decision/list`.
- Метрика-variance `> 20%` відносно 7-денної baseline (signups / MAU / Stripe revenue / Sentry rate) — «червоний» tag, додатково тегує `/Олексій` (якщо infra-related) або `/Ярема` (якщо analytics-related).

Попередні рівні — defaults; founder може перевизначити через plugin config (без редеплою Gateway).

**Cron:** `0 9 * * *` Europe/Kyiv. Тригериться OpenClaw native scheduler-ом, не n8n.

---

## Voice & Canvas

- **Voice (default text reply, Locked decision #15):** OpenClaw native voice. Voice-нотатки з Telegram/WhatsApp → STT → agent (вхід завжди приймається). **Reply-mode default — text**; voice-reply вмикається явно через `/voice on` (per-conversation toggle, persisted на volume); `/voice off` вимикає.
- **Canvas (on за замовч.):** OpenClaw Canvas. Cofounder/data використовують для inline-чартів (revenue / funnel / Sentry trend) — replies містять structured canvas blocks, які OpenClaw native рендерить у preview.

---

## PR-стратегія

Робота розбита на ~6 PR замість одного великого. Кожен — самостійний, з власним rollback.

**Скоуп per-PR:**

| #      | PR / гілка                                   | Що включає                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Залежить від             |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| PR-A   | `devin/<ts>-openclaw-plan-v2`                | Цей файл — оновлений план (v3.1: 10 персон, 4-tier n8n, 3-layer routing, 18 locked decisions). Без коду.                                                                                                                                                                                                                                                                                                                                                   | —                        |
| PR-B   | `devin/<ts>-openclaw-poc-spike`              | Phase 0.5 PoC: 1 read + 1 write tool, 1 hook, parity-харнес + **2 нові міграції** (`ai_memories.persona`+`topic`, `openclaw_reminders`; конкретні номери — наступні вільні, наприклад 054/055; Locked #9). Гілка не мерджиться у main без зеленої перевірки PoC, але живе у репі для review.                                                                                                                                                               | PR-A                     |
| PR-C1a | `devin/<ts>-openclaw-c1a-readonly`           | Phase 1 — Foundation + 11 read-only HTTP-proxy tools поверх існуючих server endpoints (`read_strategy_docs`, `query_app_db`, `read_github`, `get_stripe_metrics`, `get_sentry_issues`, `get_posthog_stats`, `read_workflow_logs`, `get_server_stats`, `get_github_releases`, `read_telegram_topic`, `record_decision`) + Plugin governance: CODEOWNERS, turbo pipeline, ESLint plugin entries, plop-templates, vitest setup. **0 нових server endpoints.** | PR-B                     |
| PR-C1b | `devin/<ts>-openclaw-c1b-code-seo-reminders` | Phase 1 — 4 code-understanding tools (`github_search`/`tree`/`diff`/`prs`) + 3 SEO env-stub tools (`seo_gsc_query`/`seo_psi_audit`/`seo_serp_lookup`, graceful fallback) + `set_reminder` + cron-poller. **8 нових server endpoints**: `/github/{search,tree,diff,prs}` + `/seo/{gsc,lighthouse,serp}` + `/reminders/{set,list-due}`.                                                                                                                      | PR-C1a                   |
| PR-C1c | `devin/<ts>-openclaw-c1c-n8n-refresh`        | Phase 1 — 4 n8n delegation tools (`n8n_list`/`describe`/`trigger`/`activate`) з tier-aware approval + `refresh_business_snapshot` meta-tool. **5 нових server endpoints**: `/n8n/{list,describe,trigger,activate}` + `/snapshot/refresh` (фаєрить Tier A workflows паралельно).                                                                                                                                                                            | PR-C1b                   |
| PR-C1d | `devin/<ts>-openclaw-c1d-routers`            | Phase 1 — Layer 0 shortcut router (`shortcut-router.ts` + 17 shortcuts + Mustache canned templates) + Layer 1 cheap router (`cheap-router.ts` + Haiku JSON-schema classifier). Integration tests, що покладаються на повний registry з 24 tools. **0 нових server endpoints.**                                                                                                                                                                             | PR-C1c                   |
| PR-C2  | `devin/<ts>-openclaw-plugin-phase2`          | Phase 2: 10 personas як OpenClaw skills у `ops/openclaw/skills/sergeant-{cofounder,eng,devops,pm,growth,seo,content,data,cs,finance}/`, per-agent tool allowlist у `openclaw.json` → `agents.<persona>.tools`, per-persona model tier wiring.                                                                                                                                                                                                              | PR-C1d                   |
| PR-C3  | `devin/<ts>-openclaw-strategic-modes`        | Phase 3 — **opt-in / optional** per Locked #6: `/plan`, `/analyze`, `/okr` як OpenClaw skills або slash-commands. **Не блокує** PR-D; може стартувати паралельно з PR-D або відкластися як окрема follow-up ініціатива.                                                                                                                                                                                                                                    | PR-C1d                   |
| PR-D   | `devin/<ts>-openclaw-plugin-write-tools`     | Phase 4 (approval flow для write-tools, n8n Tier C gates; default variant **B**, Locked #5) + Phase 6 (audit/invocation lifecycle hooks).                                                                                                                                                                                                                                                                                                                  | PR-C2                    |
| PR-E   | `devin/<ts>-openclaw-council-roundtable`     | Phase 5 (council orchestration, multi-persona).                                                                                                                                                                                                                                                                                                                                                                                                            | PR-D                     |
| PR-F   | `devin/<ts>-openclaw-cutover-and-cleanup`    | Phase 6.5 (parallel run на окремих bot-identity) → Phase 7 (нова bot-identity — primary; ADR superseded; reminder на grammy code deletion +28 днів). Grammy код **і runtime** залишаються як fallback (без feature-flag flip у `tools/console`).                                                                                                                                                                                                           | PR-E + ≥1 тиждень parity |

### Tracker (живий статус)

Оновлюємо у тій же гілці, де відкривається/мерджиться PR. `Status` — одне з: `pending` (ще не відкритий) / `open` (PR існує, тривають review/CI) / `merged` / `superseded-by-rewrite` (мерджнуто, але код перенесено у `src/legacy/`, у production-плагіні не активно) / `blocked` (блокер описано у `Notes`). `PR` — посилання на GitHub-PR коли відкритий.

> **2026-05-12 — Stage rewrite update.** PR-B…PR-F нижче formally `merged into main`, але після Stage 1 rewrite ([#2438](https://github.com/Skords-01/Sergeant/pull/2438) `14ee42e2`) увесь plugin-код пeренесено у `packages/openclaw-plugin/src/legacy/` як reference і **не активний** у production. Status цих рядків треба читати як `superseded-by-rewrite`. Активний production plugin — це Stage 1+2 (див. § Reality update 2026-05-12 нагорі та Stage-tracker нижче).

| #      | Status                  | PR                                                       | Branch                                              | Останнє оновлення | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ----------------------- | -------------------------------------------------------- | --------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR-A   | `merged`                | [#2382](https://github.com/Skords-01/Sergeant/pull/2382) | `devin/1778441523-openclaw-plan-locked-decisions`   | 2026-05-10        | План v3.1 + 18 locked decisions + цей tracker. Merged 2026-05-10 (`e07ccbf9`); baseline для PR-B.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PR-B   | `superseded-by-rewrite` | [#2385](https://github.com/Skords-01/Sergeant/pull/2385) | `devin/1778445962-openclaw-poc-spike`               | 2026-05-10        | Phase 0.5 PoC: 1 read tool (`recall_memory`) + 1 write tool (`create_github_issue` × A/B/C) + budget hook + audit hooks + parity харнес (3+ golden conversations) + міграції 054/055. Spike note: `docs/notes/spikes/openclaw-poc.md` (🟢 go for Phase 1). 64 unit tests pass. Merged 2026-05-10 (`6829e1ca`).                                                                                                                                                                                                                                                                                                                                                              |
| PR-C1a | `superseded-by-rewrite` | [#2389](https://github.com/Skords-01/Sergeant/pull/2389) | `devin/1778451062-openclaw-c1a-readonly`            | 2026-05-10        | Phase 1 — Foundation + 11 read-only HTTP-proxy tools поверх існуючих server endpoints + plugin governance (CODEOWNERS, turbo, ESLint, plop). 0 нових server endpoints. Розщеплено з PR-C1 2026-05-10 (4-PR Phase 1 split).                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PR-C1b | `superseded-by-rewrite` | [#2392](https://github.com/Skords-01/Sergeant/pull/2392) | `devin/1778451354-openclaw-c1b-code-seo-reminders`  | 2026-05-10        | Phase 1 — 4 code-understanding + 3 SEO env-stub + reminders + 8 нових server endpoints (`/github/*`, `/seo/*`, `/reminders/*`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PR-C1c | `superseded-by-rewrite` | [#2393](https://github.com/Skords-01/Sergeant/pull/2393) | `devin/1778451538-openclaw-c1c-n8n-refresh`         | 2026-05-10        | Phase 1 — 4 n8n delegation з tier-aware approval + `refresh_business_snapshot` meta-tool + 5 нових server endpoints (`/n8n/*`, `/snapshot/refresh`). Self-contained — parallel-merge safe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PR-C1d | `superseded-by-rewrite` | [#2391](https://github.com/Skords-01/Sergeant/pull/2391) | `devin/1778452267-openclaw-c1d-routers`             | 2026-05-10        | Phase 1 — Layer 0 shortcut router + Layer 1 cheap router + 17 shortcuts + canned templates + integration tests над повним 24-tool registry. 0 нових server endpoints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PR-C2  | `superseded-by-rewrite` | [#2394](https://github.com/Skords-01/Sergeant/pull/2394) | `devin/1778455221-openclaw-c2-personas-allowlist`   | 2026-05-10        | Phase 2: 10 persona skills промоушнуто `Scaffolded → Active`, allowlist у `openclaw.example.json` синхронізовано з 25-tool registry (post-C1), per-persona model tiers стабільні. Додано vitest gate `persona-allowlist.test.ts`. Future write tools (`commit_to_strategy_doc`, `post_to_topic`, `mute_alert`, `pause_workflow`) винесено в `Future write tools (PR-D)` — без entries у allowlist. Merged 2026-05-10 (`7a8d8770`).                                                                                                                                                                                                                                          |
| PR-C3  | `superseded-by-rewrite` | [#2408](https://github.com/Skords-01/Sergeant/pull/2408) | `devin/1778487670-openclaw-c3-strategic-modes`      | 2026-05-11        | Phase 3 (opt-in per Locked #6): 3 strategic-mode skills (`sergeant-mode-{plan,analyze,okr}`) — orthogonal до persona, переносять primer-параграфи з `tools/console/src/agents/strategic-modes.ts` у canonical SKILL.md формат. Wired у `openclaw.example.json` → `strategicModes.{plan,analyze,okr}` (skill / trigger / defaultPersona / auditTrigger). Vitest gate `strategic-modes.test.ts` (13 tests) — schema + trigger-conflict + reverse-coverage. Merged 2026-05-11 (`3451714f`); не блокував PR-D — мерджились паралельно.                                                                                                                                          |
| PR-D   | `superseded-by-rewrite` | [#2411](https://github.com/Skords-01/Sergeant/pull/2411) | `devin/1778488623-openclaw-pr-d-write-tools`        | 2026-05-11        | Phase 4: 4 нові write-tools (commit_to_strategy_doc, post_to_topic, pause_workflow, mute_alert) + Variant B approval factory + n8n Tier C audit gate + write-audit integration через /write-audit/log. 5 write-tools total. Server endpoints вже існують (ADR-0036). Merged 2026-05-11 (`b37a3266`).                                                                                                                                                                                                                                                                                                                                                                        |
| PR-E   | `superseded-by-rewrite` | [#2413](https://github.com/Skords-01/Sergeant/pull/2413) | `devin/1778491118-openclaw-pr-e-council-roundtable` | 2026-05-11        | Phase 5: council round-table scaffold. New `council-roundtable` SKILL у `ops/openclaw/skills/` + plugin-side `COUNCIL_DEFAULT_SEQUENCE` (Locked #8 — devops → eng → pm → growth → finance → cofounder) + `createCouncilBudgetGate` (fail-closed pre-flight against `/budget` vs `$2.0` cap, Locked #4) + sanity test (`council-config.test.ts`). Bug-fix у боці: `openclaw.example.json § council.defaultSequence` втрачав `pm` — додано, тепер 1:1 з Locked #8. Merged 2026-05-11 (`ac9cff1d`); не блокував PR-D — мерджились паралельно.                                                                                                                                  |
| PR-F   | `merged`                | [#2420](https://github.com/Skords-01/Sergeant/pull/2420) | `claude/review-openclaw-migration-HSeEx`            | 2026-05-11        | Phase 0 Gateway infra + Phase 7 cutover docs. Додано: `Dockerfile.openclaw-gateway` (Node 24-alpine, single-stage — plugin runs as TypeScript source), `ops/openclaw/docker-entrypoint.sh`, `railway.openclaw-gateway.toml`, рядок у `docs/architecture/service-catalog.md` для `sergeant-openclaw-gateway`, ADR-0055 (Supersedes 0031/0036/0041), оновлено `docs/playbooks/rotate-openclaw-credentials.md` (§ Gateway bot token). Merged 2026-05-11 (`cfafd697`). Залишається ручним (поза цим PR): Railway service creation + 5 GB volume, BotFather `@OpenClaw_sergeant_v2_bot`, `openclaw plugin install`, Telegram webhook pairing, ≥1 тиждень Phase 6.5 parallel run. |

> **Гайдлайн:** коли відкриваєш новий PR з трека — у тому ж PR онови `Tracker` рядок (status, PR-link, Notes). Це частина PR-checklist-у (Reviewer Notes секція). Якщо PR заблокувався — переведи у `blocked` і коротко опиши чому.

### Stage tracker (2026-05-12 → нинішній source-of-truth)

Цей трекер описує реальну послідовність змін, які працюють у production-плагіні після Stage 1 rewrite. Він заміщує v3.1 PR-C2…PR-F рядки вище (`superseded-by-rewrite`), не v3.1 PR-A/PR-F infra-рядки.

| Stage     | Status    | PR / commit                                                                                                                                                                                                                                     | Скоуп                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Залежить від         |
| --------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Stage 1   | `merged`  | [#2438](https://github.com/Skords-01/Sergeant/pull/2438) (`14ee42e2`)                                                                                                                                                                           | MVP rewrite — пeренесли pre-rewrite plugin у `src/legacy/`, новий `index.ts` на real `openclaw@2026.5.7` SDK: 3 read-tools (`recall_memory`, `query_app_db`, `read_github`) як proof-of-life. Без hooks, без write tools. Build infra: `Dockerfile.openclaw-gateway` ставить `openclaw` + `typebox` через `npm install`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | PR-F (Phase 0 infra) |
| Stage 1.1 | `merged`  | [#2440](https://github.com/Skords-01/Sergeant/pull/2440) (`6213fc64`)                                                                                                                                                                           | Config resolve з env, коли `api.pluginConfig` empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Stage 1              |
| Stage 1.2 | `merged`  | [#2442](https://github.com/Skords-01/Sergeant/pull/2442) (`aaf7879f`)                                                                                                                                                                           | Експонували tools через `tools.allow` у `openclaw.example.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Stage 1.1            |
| Stage 1.3 | `merged`  | [#2448](https://github.com/Skords-01/Sergeant/pull/2448) (`13394dc7`)                                                                                                                                                                           | Wipe stale workspace skills — persona docs згадували 24+ tools, що MVP не реєстрував, агент "не мав recall_memory" → confusing answers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Stage 1.2            |
| Stage 2   | `merged`  | [#2449](https://github.com/Skords-01/Sergeant/pull/2449) (`257ca2ef`)                                                                                                                                                                           | Решта 22 read-tools перенесені з `src/legacy/tools/` на real SDK. У плагіні **25 read-tools**. Без hooks, без write tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Stage 1.3            |
| Stage 2.1 | `merged`  | [#2452](https://github.com/Skords-01/Sergeant/pull/2452) (`4229ed28`)                                                                                                                                                                           | `typebox` package (не `@sinclair/typebox`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Stage 2              |
| Stage 2.2 | `merged`  | [#2453](https://github.com/Skords-01/Sergeant/pull/2453) (`f5e8dd95`)                                                                                                                                                                           | Required `label` поле на кожному tool — без нього tools silently зникали з agent palette.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Stage 2.1            |
| Stage 2.3 | `merged`  | [#2455](https://github.com/Skords-01/Sergeant/pull/2455) + [#2456](https://github.com/Skords-01/Sergeant/pull/2456) (`9a0c8e1c`/`4173be1d`)                                                                                                     | Pin `@mistralai/mistralai@2.2.1` + `npm install --ignore-scripts` у Gateway Dockerfile (раніше `@latest` падав на `prepare` script).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Stage 2.2            |
| Stage 2.4 | `merged`  | [#2458](https://github.com/Skords-01/Sergeant/pull/2458) (`e5ed0cb7`)                                                                                                                                                                           | Переніс Sergeant tools з `tools.allow` у `tools.alsoAllow` — правильний openclaw 5.7 pattern.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Stage 2.3            |
| Stage 2.5 | `merged`  | [`a03f4e74`](https://github.com/Skords-01/Sergeant/commit/a03f4e74)                                                                                                                                                                             | `docker-entrypoint.sh` повертає 10 persona SKILL-ів + cheap-router prompt + n8n-allowlist + генерує `_stage-status/SKILL.md` overlay, що чесно повідомляє агенту, які write-tools ще не зареєстровані (Stage 3 work).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Stage 2.4            |
| 🔬 Spike  | `merged`  | [`openclaw-sdk-5.7-real-api.md`](../notes/spikes/openclaw-sdk-5.7-real-api.md)                                                                                                                                                                  | SDK reality-check: зафіксовані 34 hook-и (`registerHook` + per-name handler signatures), approval mechanism (`before_tool_call` з `requireApproval` return), per-persona allowlist (`agents.<id>.tools: AgentToolsConfig`), scheduler (`cron.*` config-block; `registerSessionSchedulerJob` only per-session). 4 unknown-и зняті — Stages 3a/3b/4a/5a/5d розблоковані.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Stage 2.5            |
| Stage 3a  | `merged`  | [#2463](https://github.com/Skords-01/Sergeant/pull/2463) (`1b68f159`)                                                                                                                                                                           | Register `create_github_issue` write-tool на real SDK (server endpoint `/api/internal/openclaw/write/github-issue` ✅) — разом зі Stage 3b в одному PR (для атомарності \_stage-status overlay-я). Approval gate лишався server-side до Stage 4a.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Spike                |
| Stage 3b  | `merged`  | [#2463](https://github.com/Skords-01/Sergeant/pull/2463) (`1b68f159`)                                                                                                                                                                           | Решта 4 write-tools (`commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`, `mute_alert`) зареєстровані як HTTP-проксі до вже існуючих `/write/*` endpoint-ів. `openclaw.example.json` оновлено під всі 30 tools, `_stage-status` overlay переписано під Stage 3 contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Stage 3a             |
| Stage 4a  | `merged`  | [#2464](https://github.com/Skords-01/Sergeant/pull/2464) (`fc6ca5be`) + follow-up [#2474](https://github.com/Skords-01/Sergeant/pull/2474)                                                                                                      | 4 hooks через `api.registerHook`: `llm_input` (per-call budget gate → `POST /budget`), `before_agent_start` (open invocation → `POST /invocations/open` + `InvocationCorrelator`), `agent_end` (finalize → `POST /invocations/finalize`), `before_tool_call` (native `requireApproval` для 5 write-tools, `onResolution` → `POST /write-audit/log`). **Follow-up #2474 (2026-05-12):** audit-hook читає `event.prompt` (canonical openclaw 5.7 shape) з fallback на legacy `event.userMessage` — раніше `user_message` колонка завжди мала `"(empty user message)"` бо вгадане ім'я поля не співпало з реальним.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Spike                |
| Stage 4b  | `merged`  | [#2465](https://github.com/Skords-01/Sergeant/pull/2465) (`fdda7e30`) + follow-ups #2467/2468/2469/2471/[#2473](https://github.com/Skords-01/Sergeant/pull/2473)                                                                                | Layer 0 shortcut router: 17 shortcuts (`/metrics`, `/runway`, `/status`, `/sentry`, `/stripe`, `/posthog`, `/prs`, `/releases`, `/builds`, `/workflows`, `/refresh_metrics`, `/heartbeat`+`/health`, `/recall`, `/decisions`, `/digest`, `/remind`, `/think` + UA-фрази). Композується перед audit-open у `before_agent_start`. $0 LLM cost для матчів. **172/172 vitest** (171 base → +1 регресія-тест #2473). Sentinel `__ROUTED__:` drop-нуто в follow-up [#2467](https://github.com/Skords-01/Sergeant/pull/2467) (YAGNI: OpenClaw runtime surface-ить blockReason без host-side перетворень). Hook реалізовано через `before_dispatch` після PR #2468/2469/2471 fix-forward chain. **Follow-up #2473 (2026-05-12):** `/runway` мігровано з guessed `business_snapshot` на `openclaw_invocations`, `/decisions` — на `openclaw_decisions`; додано регресійний тест у `all-shortcuts.test.ts` що статично перевіряє кожний `query_app_db` SQL проти `QUERY_APP_DB_TABLE_ALLOWLIST` (сервер раніше повертав 400 для не-allowlisted FROM-таблиць).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Stage 4a             |
| Stage 4c  | `merged`  | [#2477](https://github.com/Skords-01/Sergeant/pull/2477) (`2ed02f1e`)                                                                                                                                                                           | Layer 1 cheap router (Haiku JSON-classifier). Cost saving uplift №2. **Server:** новий `POST /api/internal/openclaw/classify` приймає `{ userMessage, systemPrompt? }`, кличе Anthropic Haiku, повертає `{ class, shortcut?, persona?, params?, chat_response? }`; markdown-fence-tolerant JSON parser з fallback на `{ class: "chat" }`. Helper `modules/openclaw/classify.ts` + 9 unit tests + 7 route tests. `ANTHROPIC_API_KEY` ніколи не виходить з server (Hard Rule #20). **Plugin:** `src/cheap-router/` (types, `HttpCheapRouterClassifier`, `loadCheapRouterSystemPrompt`) + `src/hooks/cheap-router.ts` (Layer 1 `before_dispatch`). Wired у `src/index.ts` як 6-й hook — другий `before_dispatch` ПІСЛЯ Layer 0 shortcut router (claim-order: Layer 0 → Layer 1 → agent). Slash commands і empty content скіпають classifier. Decision tree: `routine_*` → виконати Layer 0 shortcut за `slug`; `chat` → reply `chat_response` verbatim; `thinking` → fall through до Layer 2. Fail-closed: будь-яка HTTP помилка classifier-а → `{ class: "thinking" }` → escalate. System prompt з ENV `OPENCLAW_CHEAP_ROUTER_PROMPT_PATH` (mounted `ops/openclaw/cheap-router.system.md`), fallback на embedded `DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT`. 23 нових plugin tests (8 classifier + 5 system-prompt + 10 hook). **Merge status:** PR [#2477](https://github.com/Skords-01/Sergeant/pull/2477) merged 2026-05-12 (`2ed02f1e`) у `main`; всі тести green локально (200/200 plugin, 37/37 нові server). Production smoke — див. § «Stage 4c — як тестити». | Stage 4b             |
| Stage 5a  | `merged`  | [#2480](https://github.com/Skords-01/Sergeant/pull/2480) (`ab705ecd`) + schema fix [#2485](https://github.com/Skords-01/Sergeant/pull/2485) (`c9a85f37`)                                                                                        | Per-persona tool allowlist через `agents.list[]` (плоский `tools.alsoAllow` залишається як fallback) + vitest gate-тест `persona-allowlist.test.ts`. Schema fix [#2485](https://github.com/Skords-01/Sergeant/pull/2485) виправив crash-loop після першого PR-у: corrected `agents.<id>` keys → `agents.list[].tools: AgentToolsConfig` (массив, не keyed object — див. spike-doc § per-persona allowlist). Додано `openclaw-config-schema` validate CI-job у workflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Stage 3b             |
| Stage 5b  | `merged`  | `/plan` [#2482](https://github.com/Skords-01/Sergeant/pull/2482) (`ae703ca0`) + `/analyze` [#2483](https://github.com/Skords-01/Sergeant/pull/2483) (`51290121`) + `/okr` [#2487](https://github.com/Skords-01/Sergeant/pull/2487) (`5cc3c01a`) | Strategic-modes wiring у 3-PR split: `strategicModes` блок у `openclaw.json` + per-mode slash-handler у `src/strategic-modes/` + byte-for-byte drift-gate проти `legacy/strategic-modes.ts` console primer. Ports `legacy/strategic-modes.test.ts` під real SDK. Architecture handoff — `docs/notes/spikes/openclaw-stage-5b-pr-split-2026-05-12.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Stage 5a             |
| Stage 5c  | `merged`  | [#2488](https://github.com/Skords-01/Sergeant/pull/2488) (`578ed43f`)                                                                                                                                                                           | Council orchestration з `COUNCIL_DEFAULT_SEQUENCE` (Locked #8 — `devops → eng → pm → growth → finance → cofounder`), $2.0 budget pre-gate (fail-closed) у новому `before_dispatch` council-gate hook, slash-handler `/council <питання>` у `src/council/index.ts`. `before_agent_start` council mode hook інжектить `COUNCIL_PRIMER`. Ports `legacy/council.ts` + `council-config.test.ts` під real SDK. Plugin тестів **317/317** (+43 vs Stage 5b 274), lint/typecheck/build/prettier clean. Open follow-up — drift gate між `COUNCIL_PRIMER` (код) і `ops/openclaw/skills/council-roundtable/SKILL.md` (prose) — додати у Stage 6a або як standalone test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Stage 5b             |
| Stage 5d  | `merged`  | [#2490](https://github.com/Skords-01/Sergeant/pull/2490) (`b187bfaf`)                                                                                                                                                                           | Morning-digest cron (`0 9 * * *` Europe/Kyiv) — native `cron.*` config-block у `ops/openclaw/openclaw.example.json` (enabled=true, store=`~/.openclaw/cron/jobs.json`, maxConcurrentRuns=1, retry 3×60s/2m/5m backoff, 24h session retention, failureAlert announce) + idempotent `ops/openclaw/provision-cron.mjs` upsert-ить job у store перед запуском Gateway, кличеться з `docker-entrypoint.sh` після `patch-sergeant-config.mjs`. Payload `/digest day` — Layer 0 shortcut router рендерить canned Markdown ($0 LLM cost), Gateway announce-ить у Telegram DM founder-а (`OPENCLAW_FOUNDER_TG_USER_ID`). 18 нових `node:test` unit-тестів (canonical shape, golden snapshot drift-gate, idempotency, unrelated-job preservation, malformed store refusal, parent-dir auto-create, end-to-end roundtrip). `ops/openclaw/skills/morning-digest/SKILL.md` переписаний під 4-tool Layer 0 path (replaces 6 aspirational tools). No-op коли `OPENCLAW_FOUNDER_TG_USER_ID` unset або `OPENCLAW_SKIP_CRON=1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Stage 4a + Spike     |
| Stage 6a  | `pending` | —                                                                                                                                                                                                                                               | Reactivate parity harness у CI — port `legacy/parity/*.ts` під real SDK, запалити CI gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Stage 4c + 5c        |
| Stage 6b  | `pending` | —                                                                                                                                                                                                                                               | Manual: ≥1 тиждень parallel run + monitoring (grammy `@OpenClaw_sergeant_bot` vs Gateway `@OpenClaw_sergeant_v2_bot`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Stage 6a             |
| Stage 7   | `pending` | —                                                                                                                                                                                                                                               | Cutover playbook (ADR-0056 Supersedes ADR-0055 § cutover). BotFather identity swap, webhook re-pairing, reminder на видалення `tools/console/src/openclaw/` через 28 днів.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Stage 6b             |
| Stage 8+  | `pending` | —                                                                                                                                                                                                                                               | Voice toggle, Canvas, WhatsApp pairing, ClawHub publish, multi-channel — окремі micro-ADR-и після Phase 7 cutover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Stage 7              |

> **Гайдлайн:** коли відкриваєш новий Stage PR — додай commit у branch і онови рядок (status, PR-link). Якщо Stage заблокувався — переведи у `blocked` і опиши блокер.

---

### Stage 4c — як тестити (post-merge smoke checklist; PR [#2477](https://github.com/Skords-01/Sergeant/pull/2477))

> **Контекст:** Stage 4c це **Layer 1 Haiku cheap-router**. Перший hook реєстрації — Layer 0 shortcut router (Stage 4b); другий — Layer 1 cheap-router (цей stage). Обидва на одному event `before_dispatch`; runtime викликає у registration order, перший `{ handled: true }` виграє і agent не запускається.

> **Production smoke результати 2026-05-12 (post-merge):** ✅ **12/12 PASS**. `/classify` endpoint smoke — 7/7 (3 базові класи + 4 negative/positive — див. деталі у comment-і [PR #2478](https://github.com/Skords-01/Sergeant/pull/2478#issuecomment-4432335476)). Telegram smoke через `@kOPENCLAW_GATEWAY_BOT` (live Gateway bot, не legacy `OpenClaw_sergeant_bot`) — 4/4: T1 `як з runway?` → canned `🛫 Runway` Markdown < 2 сек (Layer 1 → routine_metrics → Layer 0 runway shortcut, $0 Layer 2); T2 `привіт` → `Привіт! 👋 Чим я можу тобі допомогти?` (Layer 1 chat verbatim, $0 Layer 2); T3 `Поясни як працює наша recall-система` → двофазна відповідь з memory_status tool-call (Layer 1 → thinking → Layer 2 Sonnet agent, ~$0.01–0.02); T4 `/metrics` → canned `📊 Метрики сьогодні` Markdown (Layer 0 slash router матчить ПЕРШИМ, Layer 1 НЕ викликався). T5 classifier-failure (unset `ANTHROPIC_API_KEY`) — пропустили як destructive. Gateway boot-log `sergeant.cheap_router.prompt_loaded` (info) підтверджує що canonical prompt з `/root/.openclaw/cheap-router.system.md` завантажено через Docker entrypoint copy (server **НЕ** падає на embedded fallback). Live deploy — `0b92f362` (PR [#2476](https://github.com/Skords-01/Sergeant/pull/2476)) о 15:22 UTC; PR #2477 у Railway мав `SKIPPED — No changes to watched files` (це нормально, бо файли з #2476 уже задеплоєні). Tracker bump — PR [#2478](https://github.com/Skords-01/Sergeant/pull/2478) `1ce09ae3`.

**Local unit tests (швидко, < 5 сек):**

```bash
# Plugin tests (200, з них 23 нових Stage 4c):
pnpm --filter @sergeant/openclaw-plugin test

# Server tests (focused — classify route + classifier helper):
pnpm --filter @sergeant/server test -- --run \
  src/modules/openclaw/classify.test.ts \
  src/routes/internal/openclaw.test.ts
# Очікувано: 16/16 нових passed (9 helper + 7 route).

# Lint + typecheck (clean):
pnpm --filter @sergeant/openclaw-plugin lint
pnpm --filter @sergeant/openclaw-plugin typecheck
pnpm --filter @sergeant/server typecheck
```

**Local server endpoint smoke (потрібен `ANTHROPIC_API_KEY` у `apps/server/.env`):**

```bash
# 1. Підняти server:
pnpm dev:server   # http://localhost:3000

# 2. Викликати /classify напряму (3 експекти класи):
curl -sS -X POST http://localhost:3000/api/internal/openclaw/classify \
  -H "Authorization: Bearer ${OPENCLAW_INTERNAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"Як справи з MRR?"}' | jq .
# Очікувано: { "class": "routine_metrics", "shortcut": "metrics", ... }

curl -sS -X POST http://localhost:3000/api/internal/openclaw/classify \
  -H "Authorization: Bearer ${OPENCLAW_INTERNAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"привіт"}' | jq .
# Очікувано: { "class": "chat", "chat_response": "..." }

curl -sS -X POST http://localhost:3000/api/internal/openclaw/classify \
  -H "Authorization: Bearer ${OPENCLAW_INTERNAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"Поясни архітектуру feature flags"}' | jq .
# Очікувано: { "class": "thinking", "persona": "..." }

# 3. Negative — без key (504/503):
unset ANTHROPIC_API_KEY ; pnpm dev:server
# /classify повертає 503 з { error: "anthropic_api_key_not_configured" }.
```

**Production smoke (після merge + Railway auto-deploy Gateway):**

| Сценарій                             | Очікувана поведінка                                                                                           | Як перевірити                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Natural-language metrics (без slash) | Layer 1 класифікує `routine_metrics` → виконує Layer 0 `metrics` shortcut → Markdown ≤2 сек, $0 LLM cost далі | У Telegram написати "як з runway?" / "що по метриках?" — відповідь має прийти швидко, без `cofounder` agent persona у логах                                     |
| Природній чат                        | Layer 1 класифікує `chat` → відповідь Haiku verbatim                                                          | "привіт", "як справи", "доброго ранку" — коротка відповідь, у server logs має бути `openclaw.cheap_router.classify_complete` з `class: "chat"`                  |
| Thinking питання                     | Layer 1 класифікує `thinking` → fall through до Layer 2 Sonnet                                                | "Поясни як працює наша recall-система" — full agent run, у `openclaw_invocations` має з'явитися row з cost > $0.01                                              |
| Slash command                        | Layer 0 матчить першим, Layer 1 НЕ запускається                                                               | `/metrics`, `/think foo` — як у Stage 4b; у логах Layer 1 classify _не повинен_ викликатись                                                                     |
| Classifier failure                   | Fail-closed escalate до Layer 2                                                                               | Тимчасово unset `ANTHROPIC_API_KEY` на server → 503 від `/classify` → plugin escалює; user отримує full agent response (повільніше але не втрачає повідомлення) |

**`OPENCLAW_CHEAP_ROUTER_PROMPT_PATH` env — НЕ потрібен у normal Railway deploy (2026-05-12 verified).** Канонічний prompt з `ops/openclaw/cheap-router.system.md` уже завантажується через два механізми:

1. `ops/openclaw/docker-entrypoint.sh:37` копіює файл на volume `~/.openclaw/cheap-router.system.md` при кожному container start.
2. `packages/openclaw-plugin/src/config.ts:149` має default path `/root/.openclaw/cheap-router.system.md` у `buildConfigFromEnv()`.

Boot-log `sergeant.cheap_router.prompt_loaded` (info, **не** `prompt_load_failed` warn) підтверджує що Gateway читає canonical prompt → server **НЕ** падає на embedded `DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT`. Env-override треба тільки якщо хочеш вказати на нестандартний шлях:

```
OPENCLAW_CHEAP_ROUTER_PROMPT_PATH=/custom/path/to/prompt.md
```

`DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT` у `apps/server/src/modules/openclaw/classify.ts` — це prod-safety hard-coded copy (та сама копія з `ops/openclaw/cheap-router.system.md`) на випадок, якщо ні volume mount, ні env-override не доступні.

**Логи для дебагу (Railway → sergeant-openclaw-gateway):**

- `sergeant.cheap_router.prompt_loaded` (info) — system prompt підхопився з volume, з символами.
- `sergeant.cheap_router.prompt_load_failed` (warn) — fallback на embedded default.
- `openclaw.cheap_router.classify_complete` (info) — successful classification, з `class` і latency.
- `openclaw.cheap_router.classify_error` (error) — fail-closed, escalate до Layer 2.
- `openclaw.cheap_router.routed` (info) — успішне dispatch у Layer 0 shortcut.
- `openclaw.cheap_router.unknown_shortcut` (warn) — Haiku запропонував `slug`, якого нема у каталозі → fall through до Layer 2.
- `openclaw.cheap_router.classifier_throw` (error) — сам hook кинув (не sentinel-баг).

---

## Архітектура: До і Після

### Зараз (внутрішній OpenClaw)

```
Founder DM (Telegram)
      │
      ▼
tools/console (grammy Bot)
  ├── openclaw/handler.ts        ← slash-команди, message routing
  ├── openclaw/handler-agent-turn.ts  ← Anthropic agent loop
  ├── openclaw/handler-audit.ts  ← write-audit logging
  ├── openclaw/approval-store.ts ← inline-keyboard approve/reject
  ├── agents/openclaw.ts         ← agent loop + tool execution
  ├── agents/personas.ts         ← 5 personas (cofounder/ops/growth/eng/finance)
  └── agents/strategic-modes.ts  ← /plan, /analyze, /okr
      │
      ▼ HTTP
apps/server /api/internal/openclaw/*
  ├── modules/openclaw/tools.ts       ← read-only tools (recall, query, strategy docs, GitHub, etc.)
  ├── modules/openclaw/write-tools.ts ← write tools (commit strategy doc, create issue, etc.)
  ├── modules/openclaw/store.ts       ← PostgreSQL (invocations, decisions, write-audit)
  ├── modules/openclaw/prompts.ts     ← system prompts + tone selector
  └── modules/openclaw/budget.ts      ← daily USD budget
```

### Після (зовнішній OpenClaw Gateway)

```
Founder (Telegram / WhatsApp / …)
      │
      ▼
OpenClaw Gateway (Railway service, port 18789)
  ├── Anthropic / OpenAI / інший provider
  ├── Skills (SKILL.md, 10 personas + system skills)
  │   ├── sergeant-cofounder/    ← Андрій, default persona, full tool-set
  │   ├── sergeant-eng/          ← Артем, code review, PR queue
  │   ├── sergeant-devops/       ← Олексій, reliability, n8n
  │   ├── sergeant-pm/           ← Олена, roadmap, JTBD
  │   ├── sergeant-growth/       ← Марта, acquisition, retention
  │   ├── sergeant-seo/          ← Назар, technical + content SEO
  │   ├── sergeant-content/      ← Софія, copy, emails, landings
  │   ├── sergeant-data/         ← Ярема, cohorts, A/B, metrics
  │   ├── sergeant-cs/           ← Ольга, support, NPS, churn
  │   ├── sergeant-finance/      ← Ірина, Stripe, runway, refunds
  │   ├── morning-digest/        ← cron-skill, 09:00 Kyiv
  │   └── council-roundtable/    ← multi-persona orchestrator
  └── Plugin: @sergeant/openclaw-plugin
      ├── shortcut-router.ts                         ← Layer 0: regex/slash-команди
      ├── cheap-router.ts                            ← Layer 1: Haiku класифікація
      ├── registerTool("recall_memory")
      ├── registerTool("read_strategy_docs")
      ├── registerTool("query_app_db")
      ├── registerTool("read_github")
      ├── registerTool("search_code")                ← НОВА: GitHub Search API
      ├── registerTool("read_github_tree")           ← НОВА: листинг каталогу
      ├── registerTool("read_github_diff")           ← НОВА: PR diff
      ├── registerTool("list_open_prs")              ← НОВА: PR queue
      ├── registerTool("get_stripe_metrics")
      ├── registerTool("get_sentry_issues")
      ├── registerTool("get_posthog_stats")
      ├── registerTool("read_workflow_logs")
      ├── registerTool("list_n8n_workflows")         ← НОВА: список з tier-mapping
      ├── registerTool("describe_n8n_workflow")      ← НОВА: trigger node + last execs
      ├── registerTool("get_server_stats")
      ├── registerTool("get_github_releases")
      ├── registerTool("read_telegram_topic_history")
      ├── registerTool("get_search_console_metrics") ← НОВА (env-stub, GSC)
      ├── registerTool("get_lighthouse_score")       ← НОВА (env-stub, PSI)
      ├── registerTool("read_competitor_serp")       ← НОВА (env-stub, SerpAPI)
      ├── registerTool("record_decision")
      ├── registerTool("set_reminder")               ← НОВА: openclaw_reminders + n8n cron-poller
      ├── registerTool("refresh_business_snapshot")  ← НОВА meta: fire Tier A workflows паралельно
      ├── registerTool("commit_to_strategy_doc")     ← gated, optional:true
      ├── registerTool("create_github_issue")         ← gated, optional:true
      ├── registerTool("post_to_topic")               ← gated, optional:true
      ├── registerTool("pause_workflow")              ← gated, optional:true
      ├── registerTool("activate_workflow")           ← НОВА, gated, optional:true
      ├── registerTool("trigger_n8n_workflow")        ← НОВА: Tier A auto / Tier C gated (per allowlist)
      ├── registerTool("mute_alert")                  ← gated, optional:true
      ├── registerHook("llm_input")                   ← budget + shortcut/cheap router + invocation/open
      ├── registerHook("tool_call_pre")               ← write-tool approval gate + Tier C n8n gate
      ├── registerHook("tool_call_post")              ← write-audit log
      └── registerHook("agent_turn_end")              ← invocation/finalize + cost rollup
      │
      ▼ HTTP (той самий контракт)
apps/server /api/internal/openclaw/*
  └── (без змін — server API залишається як є)
```

**Ключовий принцип:** Server API (`apps/server/src/routes/internal/openclaw.ts` + `modules/openclaw/`) **не змінюється**. Це backend з tools, budget, audit, allowlists. Ми міняємо лише **frontend** — замість grammy бота підключаємо OpenClaw Gateway.

---

## Інвентаризація: що є зараз

### Env змінні (tools/console)

| Змінна                               | Опис                                          | Що робити                                                                                                                                       |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_BOT_TOKEN`                 | Telegram Bot API token                        | Замінюється на OpenClaw Telegram channel config                                                                                                 |
| `OPENCLAW_FOUNDER_USER_ID`           | Better Auth user ID                           | Переноситься в plugin config                                                                                                                    |
| `OPENCLAW_FOUNDER_TG_USER_ID`        | Telegram user ID для allowlist                | Замінюється на OpenClaw DM pairing policy                                                                                                       |
| `OPENCLAW_MAX_ITERATIONS`            | Agent loop iteration cap                      | Переноситься в skill/config                                                                                                                     |
| `OPENCLAW_RATE_LIMIT_PER_MIN`        | Rate limiter                                  | OpenClaw має вбудований rate limiting                                                                                                           |
| `OPENCLAW_MAX_PER_CALL_USD`          | Per-call USD cap                              | Переноситься в plugin config + enforced через `llm_input` hook (server-side `/budget` лишається authoritative).                                 |
| `OPENCLAW_COUNCIL_USD_BUDGET`        | Council session headroom                      | Переноситься в plugin config (council-skill)                                                                                                    |
| `OPENCLAW_USE_WEBHOOK`               | Webhook vs long-poll                          | Не потрібен — OpenClaw сам handles delivery                                                                                                     |
| `OPENCLAW_WEBHOOK_URL`               | Webhook endpoint                              | Не потрібен                                                                                                                                     |
| `OPENCLAW_WEBHOOK_SECRET`            | Webhook secret                                | Не потрібен                                                                                                                                     |
| `OPENCLAW_WEBHOOK_PATH`              | Webhook path                                  | Не потрібен                                                                                                                                     |
| `OPENCLAW_WEBHOOK_PORT`              | Webhook port                                  | Не потрібен                                                                                                                                     |
| `OPENCLAW_AGENT_STATUS_CALLBACK_URL` | Status callback                               | Переноситься в plugin hook                                                                                                                      |
| `SERVER_INTERNAL_URL`                | Sergeant server URL                           | Переноситься в plugin config                                                                                                                    |
| `INTERNAL_API_KEY`                   | Internal API auth                             | Переноситься в plugin config                                                                                                                    |
| `ANTHROPIC_API_KEY`                  | Anthropic API key                             | Переноситься в OpenClaw model config                                                                                                            |
| ~~`OPENCLAW_GATEWAY_ENABLED`~~       | ~~Новий feature flag для Phase 6.5~~          | **DEPRECATED 2026-05-11:** cutover тепер identity-based (окрема bot-identity), а не flag-based. Flag не додається у `tools/console`.            |
| `OPENCLAW_CHEAP_MODEL`               | **Новий:** Layer 1 router model               | `claude-3-5-haiku-latest` за замовч.                                                                                                            |
| `N8N_API_URL`                        | **Новий:** n8n REST API endpoint              | Напр. `https://n8n-production-09ac.up.railway.app/api/v1`                                                                                       |
| `n8n_API`                            | **Новий:** n8n API token (Locked decision #3) | Той самий env-secret що в `apps/server` (без окремого токена). Scope = read + limited-write (Tier A trigger / Tier C activate, **без delete**). |
| `GSC_SERVICE_ACCOUNT_KEY`            | **Новий (opt-in):** Google Search Console SA  | `seo` persona env-stub; якщо не задано — tool повертає `{ status: 'not_configured' }`                                                           |
| `GSC_PROPERTY_URL`                   | **Новий (opt-in):** GSC property URL          | Парний до `GSC_SERVICE_ACCOUNT_KEY`                                                                                                             |
| `PSI_API_KEY`                        | **Новий (opt-in):** PageSpeed Insights        | `get_lighthouse_score` env-stub                                                                                                                 |
| `SERP_API_KEY`                       | **Новий (opt-in):** SerpAPI / Ahrefs          | `read_competitor_serp` env-stub                                                                                                                 |
| `MORNING_DIGEST_CRON`                | **Новий:** override cron для heartbeat        | `0 9 * * *` Europe/Kyiv за замовч.; вимкнення = порожнє рядкове значення                                                                        |

### DB таблиці (apps/server — залишаються)

| Таблиця                                | Міграція                                    | Опис                                                           |
| -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `openclaw_invocations`                 | 028                                         | Audit log усіх викликів (trigger, tool_calls, cost, status)    |
| `openclaw_decisions`                   | 028                                         | Decision log (topic, context, decision, rationale, git_pr_url) |
| `openclaw_write_audit`                 | 030                                         | Write-tool approve/executed/rejected transitions               |
| `ai_memories` (source='cofounder')     | 028                                         | Cofounder memory namespace                                     |
| `ai_memories.persona` (новий стовпець) | нова (наступний вільний, напр. 054)         | Cross-persona isolation: cofounder=all, інші=self∨shared       |
| `ai_memories.topic` (новий стовпець)   | нова (той самий файл, що `.persona`)        | Groupings: tacmed-portal / finyk-launch / sergeant-mvp / cross |
| `openclaw_reminders` (нова)            | нова (наступна після `.persona`, напр. 055) | `set_reminder` запис: due_at, channel, message, status         |

**Всі існуючі таблиці залишаються** — plugin буде ходити в ті самі server endpoints. Дві нові міграції (наступні вільні номери на момент відкриття PR-B, наприклад 054/055) додаються у PR-B/Phase 0.5 згідно Locked #9.

### Server API endpoints (залишаються без змін)

**Read-only tools:**

- `POST /api/internal/openclaw/recall` — recall cofounder memory
- `POST /api/internal/openclaw/strategy` — read strategy docs
- `POST /api/internal/openclaw/query` — query app DB (allowlisted tables)
- `POST /api/internal/openclaw/github` — read GitHub (files, issues, PRs)
- `POST /api/internal/openclaw/workflow` — n8n workflow logs
- `POST /api/internal/openclaw/telegram` — Telegram topic history
- `POST /api/internal/openclaw/metrics/stripe` — Stripe metrics
- `POST /api/internal/openclaw/metrics/sentry` — Sentry issues
- `POST /api/internal/openclaw/metrics/server` — server stats
- `POST /api/internal/openclaw/metrics/posthog` — PostHog stats
- `POST /api/internal/openclaw/github/releases` — GitHub releases
- `POST /api/internal/openclaw/decision` — record decision
- `POST /api/internal/openclaw/decisions/list` — list decisions

**Write tools (gated):**

- `POST /api/internal/openclaw/write/strategy-doc` — commit strategy doc PR
- `POST /api/internal/openclaw/write/github-issue` — create GitHub issue
- `POST /api/internal/openclaw/write/post-to-topic` — post to Telegram topic
- `POST /api/internal/openclaw/write/pause-workflow` — pause n8n workflow
- `POST /api/internal/openclaw/write/mute-alert` — mute Sentry alert

**Budget & Audit:**

- `POST /api/internal/openclaw/budget` — check daily budget
- `POST /api/internal/openclaw/invocations/open` — open invocation
- `POST /api/internal/openclaw/invocations/finalize` — finalize invocation
- `POST /api/internal/openclaw/invocations/list` — list invocations
- `POST /api/internal/openclaw/write-audit/log` — log write-audit event
- `POST /api/internal/openclaw/write-audit/list` — list write-audit events

### Console-side код (що **відключаємо**, не видаляємо)

| Шлях                                          | Файли             | Опис                                                                              |
| --------------------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `tools/console/src/openclaw/`                 | 16 файлів (\*.ts) | Handler, session, approval, audit, security, bootstrap, webhook, commands, policy |
| `tools/console/src/agents/openclaw.ts`        | 1                 | Agent loop + tool execution                                                       |
| `tools/console/src/agents/personas.ts`        | 1                 | 5 personas + tool filters                                                         |
| `tools/console/src/agents/strategic-modes.ts` | 1                 | /plan, /analyze, /okr modes                                                       |
| `tools/console/src/agents/dispatcher.ts`      | 1                 | Agent network delegation                                                          |
| `tools/console/src/index.ts`                  | часткове          | OpenClaw bootstrap code                                                           |

**Стратегія:** ~20 файлів + ~30 тестів **залишаються в репо як fallback** після cutover. У Phase 7 grammy bootstrap **залишається працювати** на старій bot-identity `@OpenClaw_sergeant_bot` (без змін у `tools/console` / без unset `OPENCLAW_BOT_TOKEN`); cutover = founder переходить на нову Gateway-bot-identity. ADR-0031 маркиться superseded (architecture), але runtime не вимикається. Видалення коду — окрема ініціатива не раніше ніж через 4 тижні стабільної роботи Gateway, окремим PR з власним rollback-планом.

---

## Phases міграції

### Phase 0: Підготовка (1 день)

1. **Підняти OpenClaw Gateway** як Railway service у **тому ж проєкті, що й `apps/server`** (Locked decision #1):
   - `Dockerfile` з pinned stable OpenClaw version (Locked decision #2 — latest stable на дату merge Phase 0)
   - Persistent volume на `/root/.openclaw`, розмір **5 GB** (Locked decision #1)
   - Healthcheck на `:18789/healthz`
2. **Створити нову Telegram bot-identity** через @BotFather (наприклад `@OpenClaw_sergeant_v2_bot`) і пейрити її до Gateway webhook. Існуючий grammy-бот `@OpenClaw_sergeant_bot` залишається працювати на старому Railway service `sergeant-openclaw` — він **не пейриться** у Gateway ні зараз, ні після cutover.
3. **Переконатися**, що Gateway стартує, відповідає на DM, і Telegram channel працює.
4. **Зберегти конфігурацію** у Railway-env + `~/.openclaw/openclaw.json` (через volume).

### Phase 0.5: Spike PoC (1–2 дні)

**Мета:** до планування Phase 1 переконатися, що critical-path рішення дійсно лягають на OpenClaw Plugin SDK. Без цього оцінки нижче — спекуляція.

PoC plugin реєструє:

- 1 read tool (`recall_memory`) — перевіряє HTTP-клієнт + типи + serialization tool result.
- 1 write tool (`create_github_issue`) — перевіряє approval flow (native OpenClaw `requiresConfirmation` АБО custom `tool_call_pre` hook). **Це development gate**: якщо native не годиться — фіксуємо custom hook як baseline для Phase 4 і коригуємо estimate.
- 1 hook `llm_input` — перевіряє, що `/budget` cap працює і блокує LLM-call коли budget вичерпано.
- 1 hook `agent_turn_end` — перевіряє, що `invocation_id` корелює з OpenClaw `agent_run_id` для audit.
- Parity-харнес — мінімум 3 golden conversations, прогнані на старому grammy bot і новому plugin: tool-calls, cost, response shape мають збігатися (з толерантністю на формулювання).

**Вихід Phase 0.5:** короткий note `docs/notes/spikes/openclaw-poc.md` з висновками + go/no-go для Phase 1. Якщо критичні gap-и — оновлюємо план перед стартом Phase 1.

**Дві нові міграції (Locked decision #9):** переїхали з PR-D у **PR-B (PoC)**, щоб їхня форма була валідована реальними `recall_memory` / `set_reminder` викликами під час PoC, а не придуманями на перед. PR-D лишає за собою лише approval/audit-логіку. Конкретні номери — наступні вільні файли в `apps/server/src/migrations/` на момент відкриття PR-B (наприклад 054 для `ai_memories.persona`+`topic` і 055 для `openclaw_reminders`); попередньо в плані стояло `036/037`, але ті слоти вже зайняті іншим (transcribe USD micros + rate limit buckets).

### Phase 1: Sergeant Tools Plugin (9–12 днів)

Створити TypeScript plugin `@sergeant/openclaw-plugin`, який реєструє всі Sergeant tools через `api.registerTool(...)`, включає shortcut router (Layer 0) + cheap router (Layer 1) + 4 нові code-understanding tools + n8n delegation tools + SEO env-stubs + reminders + refresh-helper.

**Нові server endpoints (додаємо у Phase 1):**

- `POST /api/internal/openclaw/github/search` — GitHub code search
- `POST /api/internal/openclaw/github/tree` — listing
- `POST /api/internal/openclaw/github/diff` — PR diff
- `POST /api/internal/openclaw/github/prs` — PR queue + age + reviewer load
- `POST /api/internal/openclaw/n8n/list` — list active workflows + tier mapping
- `POST /api/internal/openclaw/n8n/describe` — trigger node + last 5 executions
- `POST /api/internal/openclaw/n8n/trigger` — fire workflow (tier-aware approval)
- `POST /api/internal/openclaw/n8n/activate` — activate (gated)
- `POST /api/internal/openclaw/seo/gsc` — GSC metrics (env-stub)
- `POST /api/internal/openclaw/seo/lighthouse` — PSI score (env-stub)
- `POST /api/internal/openclaw/seo/serp` — competitor SERP (env-stub)
- `POST /api/internal/openclaw/reminders/set` — schedule reminder
- `POST /api/internal/openclaw/reminders/list-due` — cron-poller endpoint
- `POST /api/internal/openclaw/snapshot/refresh` — fire Tier A workflows паралельно

Всі нові endpoints — за `INTERNAL_API_KEY`, audit-logged у `openclaw_invocations`, budget-aware через `/budget`.

**Розкладка зусиль Phase 1 (9–12 днів):**

| Блок                                                                                                                 | Оцінка     |
| -------------------------------------------------------------------------------------------------------------------- | ---------- |
| 13 existing read-only tools (HTTP прокладка)                                                                         | 3–4 дні    |
| 4 code-understanding tools (search_code, read_github_tree, read_github_diff, list_open_prs) + server endpoints       | 1.5–2 дні  |
| 4 n8n delegation tools + tier-aware approval logic + allowlist enforcement                                           | 1.5–2 дні  |
| 3 SEO env-stub tools + endpoints з graceful fallback                                                                 | 0.5–1 день |
| `set_reminder` + міграція `openclaw_reminders` (наступна вільна після `ai_memories.persona/topic`) + n8n cron-poller | 0.5 дня    |
| `refresh_business_snapshot` meta-tool                                                                                | 0.3 дня    |
| Shortcut router + 17 shortcuts + canned templates                                                                    | 1.5–2 дні  |
| Cheap router (Haiku) + JSON schema classifier + integration tests                                                    | 0.5–1 день |
| Plugin governance (CODEOWNERS, turbo, ESLint, tests)                                                                 | 0.5 дня    |

**Структура:**

```
packages/openclaw-plugin/
├── package.json
├── openclaw.plugin.json
├── tsconfig.json
├── src/
│   ├── index.ts           ← definePluginEntry + registerTool/registerHook calls
│   ├── shortcut-router.ts ← Layer 0: regex патерни + slash-команди + Mustache templates
│   ├── cheap-router.ts    ← Layer 1: Haiku-call з JSON schema classifier
│   ├── shortcuts/         ← ~17 файлів, кожен — один shortcut
│   ├── canned-templates/  ← Mustache .md темплейти відповідей
│   ├── config.ts          ← plugin config schema (serverUrl, apiKey, founderUserId, perCallUsdCap)
│   ├── http-client.ts     ← thin HTTP wrapper for /api/internal/openclaw/*
│   ├── budget.ts          ← shared budget gate, used by llm_input hook
│   ├── audit.ts           ← invocation lifecycle helpers
│   ├── tools/
│   │   ├── recall-memory.ts
│   │   ├── read-strategy-docs.ts
│   │   ├── query-app-db.ts
│   │   ├── read-github.ts
│   │   ├── get-stripe-metrics.ts
│   │   ├── get-sentry-issues.ts
│   │   ├── get-posthog-stats.ts
│   │   ├── read-workflow-logs.ts
│   │   ├── get-server-stats.ts
│   │   ├── get-github-releases.ts
│   │   ├── read-telegram-topic.ts
│   │   └── record-decision.ts
│   └── write-tools/
│       ├── commit-strategy-doc.ts
│       ├── create-github-issue.ts
│       ├── post-to-topic.ts
│       ├── pause-workflow.ts
│       └── mute-alert.ts
└── skills/
    └── sergeant-cofounder/
        └── SKILL.md        ← shipped skill with plugin
```

**Кожен tool — thin HTTP proxy:**

```typescript
// Приклад: recall-memory.ts
api.registerTool({
  name: "recall_memory",
  description: "Recall cofounder memory from Sergeant AI memory store",
  parameters: Type.Object({
    query: Type.String({ description: "Semantic search query" }),
    topK: Type.Optional(
      Type.Number({ description: "Max results (default 5)" }),
    ),
  }),
  async execute(_id, params) {
    const res = await httpClient.post("/api/internal/openclaw/recall", {
      founderUserId: config.founderUserId,
      query: params.query,
      topK: params.topK,
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
  },
});
```

**Workspace package governance** — без цього CI не зелений:

- Додати `packages/openclaw-plugin/**` до `CODEOWNERS` (Owner: `@Skords-01`, Secondary: `TBD (backend-engineer)`); `pnpm lint:codeowners` валідовує.
- Підключити до `turbo.json` pipeline (build/test/typecheck/lint).
- Додати ESLint/TypeScript конфіги через shared presets (`@sergeant/eslint-config`, base tsconfig).
- Hard Rule #18 (max-lines: 600) діє на TS файли — кожен tool у власному файлі.
- Якщо bundling — врахувати у `size-limit` (швидше за все плагін не bundled, бо завантажується в Node-runtime Gateway, тож skip).

### Phase 2: Personas як Skills + tool allowlist + model tiers (2–3 дні)

Перенести 10 персон з іменами як окремі OpenClaw skills + жорсткий allowlist на рівні agent config + per-persona model tier.

```
ops/openclaw/skills/                    ← живе в репо (config-as-code)
├── sergeant-cofounder/SKILL.md   ← Андрій, default, повний tool-set
├── sergeant-eng/SKILL.md         ← Артем, code/PR queue
├── sergeant-devops/SKILL.md      ← Олексій, reliability
├── sergeant-pm/SKILL.md          ← Олена, roadmap/JTBD
├── sergeant-growth/SKILL.md      ← Марта, acquisition
├── sergeant-seo/SKILL.md         ← Назар, SEO
├── sergeant-content/SKILL.md     ← Софія, copy
├── sergeant-data/SKILL.md        ← Ярема, analytics
├── sergeant-cs/SKILL.md          ← Ольга, support
└── sergeant-finance/SKILL.md     ← Ірина, finance
```

На старті Gateway container копіює це у `~/.openclaw/workspace/skills/`.

**Важливо:** SKILL.md — це prompt, він **не** enforcement. LLM може проігнорувати фразу «використовуй ТІЛЬКИ ці tools». Tool restriction робиться через:

- Реєстрація write-tools з `{ optional: true }` — тоді вони не доступні без явного allowlist.
- Per-agent (per-skill) `tools` allowlist у `openclaw.json` → `agents.<persona>.tools`.
- `cofounder` — full set; `ops/growth/eng/finance` — обмежений підсет (як у `tools/console/src/agents/personas.ts`).

**Приклад `sergeant-ops/SKILL.md`:**

```markdown
---
name: sergeant-ops
description: Sergeant Ops persona — reliability, incidents, n8n health, deployment stability.
---

# Sergeant Ops Persona

PERSONA: ops-engineer. Reliability, incidents, n8n health, deployment
stability. Ти аналізуєш Sentry, Stripe failures, server /healthz і n8n
execution traces. Reply у тоні reliability eng (короткі recommendations,
приоритезація severity, action items).

## Доступні tools

Використовуй ТІЛЬКИ ці tools:

- read_workflow_logs
- get_sentry_issues
- get_server_stats
- get_stripe_metrics
- recall_memory
- pause_workflow (потребує approval)
- mute_alert (потребує approval)
- post_to_topic (потребує approval)

Якщо питання — про strategy або growth — м'яко скажи, що це поза
твоєю смугою, і запропонуй переключитись на sergeant-growth або
sergeant-cofounder.
```

### Phase 3: Strategic Modes (1 день, **opt-in / optional**)

**Locked decision #6:** Phase 3 — opt-in. Не блокує Phase 4. Якщо після Phase 2 founder не повертається до `/plan` / `/analyze` / `/okr` — виносимо в окрему follow-up ініціативу без блокування cutover.

Перенести `/plan`, `/analyze`, `/okr` як:

- **Skills** з structured-thinking primers
- **Або** custom slash-commands через OpenClaw command system

Primers з `strategic-modes.ts` стають частиною відповідного SKILL.md.

### Phase 4: Approval Flow для Write-Tools (3–5 днів)

Найскладніша частина. Внутрішній OpenClaw мав inline-keyboard approve/reject у Telegram. Дизайн фіксується у Phase 0.5 PoC; нижче — варіанти, з яких PoC обере один.

**Варіант A: OpenClaw native gated tools.**
OpenClaw має вбудований механізм approval (перевірити у PoC чи підтримується inline-keyboard у Telegram channel + persistence декларації approval).

**Варіант B: Custom approval через `tool_call_pre` hook.**
Plugin реєструє `tool_call_pre` hook, який:

1. Перехоплює write-tool call
2. Надсилає повідомлення founder-у з describe tool + input (через `api.services.messaging`)
3. Чекає на confirmation (callback або reply)
4. Виконує або відхиляє
5. Логує `approved/rejected/executed` через `/api/internal/openclaw/write-audit/log`

**Варіант C: Hybrid** — native approval + custom audit hook.

**Рекомендація (Locked decision #5):** PoC у Phase 0.5 прогоняє **всі три** варіанти (A native / B custom hook / C hybrid) на одному write-tool (`create_github_issue`), порівнює latency, UX, робастність persistence. **Default ставка для Phase 4 — варіант B (custom hook + own UX)**, якщо PoC не доведе безсумнівну перевагу native-flow. Оцінка: native (A) — 2-3 дні; custom (B) — 4-5 днів; hybrid (C) — 4-5 днів.

### Phase 5: Council Round-Table (3–4 дні)

`/council` без аргументів запускає sequential personas у default-порядку (Locked decision #8): `devops → eng → pm → growth → finance → cofounder synthesis`. Реалізація:

**Варіант A: Multi-agent orchestration.**
OpenClaw підтримує multi-agent setups. Кожна persona — окремий agent. Створити orchestrator-skill, який послідовно викликає кожного.

**Варіант B: Single-agent з tool.**
Один agent з custom `council_roundtable` tool, який послідовно змінює persona context і збирає відповіді.

**Council budget cap** (`OPENCLAW_COUNCIL_USD_BUDGET`) — окрема перевірка перед запуском, через `/budget` endpoint з `kind: "council"`.

### Phase 6: Audit, Invocation Tracking & Observability (1–2 дні)

Зберегти audit logging через ті самі server endpoints + додати observability instrumentation:

- Plugin lifecycle hooks: на `agent_turn_start` → `POST /invocations/open` (зберегти `agent_run_id` ↔ `invocation_id` мапу).
- На `agent_turn_end` → `POST /invocations/finalize` з cost rollup.
- На `tool_call_post` (write-tools) → `POST /write-audit/log` з approve/reject/executed transition.
- **Sentry:** обернути `execute()` кожного tool у `Sentry.startSpan`, помістити `agent_run_id` у `tags`. Errors з tool execute → `Sentry.captureException` з `extra: { tool, params }`.
- **PostHog:** capture `openclaw_tool_invoked`, `openclaw_write_approved`, `openclaw_council_started` events з `distinct_id = founderUserId`.

### Phase 6.5: Parallel Run на окремій bot-identity (мінімум 1 тиждень спостереження)

Не cutover до Phase 7 поки Gateway-bot не відпрацював ≥1 тиждень без regressions.

1. Створити нову Telegram bot-identity через @BotFather (наприклад `@OpenClaw_sergeant_v2_bot`) — НЕ `@OpenClaw_sergeant_bot`.
2. Пейрити **тільки** нову bot-identity до Gateway webhook (`POST /webhook` Gateway service).
3. Існуючий grammy-бот `@OpenClaw_sergeant_bot` залишається працювати на старому Railway service `sergeant-openclaw` undisturbed — `OPENCLAW_BOT_TOKEN` env лишається на місці, bootstrap (`tools/console/src/index.ts`) не змінюється.
4. Паралельний режим: founder має у Telegram обидва боти, тестує реальні взаємодії на новому Gateway-боті, лишає старий як backup-канал.
5. Метрики, що моніторимо щодня на Gateway-боті:
   - кількість invocations за добу
   - p50/p95 latency tool execute
   - cost rollup
   - кількість approved/rejected write-tools
   - Sentry error rate (Gateway service)
6. **Gate to Phase 7:** ≥7 днів без regressions на новій bot-identity, всі 5 personas exercised, ≥3 successful write-tool approval цикли, council запущено хоча б раз.

### Phase 7: Cutover та Cleanup (1–2 дні)

**Що робимо:**

1. **Founder перемикається** на нову Gateway-bot-identity як primary канал спілкування з Sergeant-co-founder. Жодного code-зміни у `tools/console`, жодного env-flip.
2. **Grammy bot `@OpenClaw_sergeant_bot` лишається працювати** на старому Railway service `sergeant-openclaw` як fallback. `OPENCLAW_BOT_TOKEN` env залишається; bootstrap не змінюється; webhook доставка ADR-0041 продовжує жити.
3. **Документація:**
   - `AGENTS.md` — додати посилання на новий `packages/openclaw-plugin/AGENTS.md` (якщо створимо), оновити Module ownership map.
   - ADR-0031 (`docs/adr/0031-openclaw-v0-telegram-cofounder.md`) → Status: Superseded by ADR-XXXX (але runtime лишається active — у статусі написати: «Architecture superseded; runtime kept as production fallback на старій bot-identity»).
   - ADR-0036 (`docs/adr/0036-openclaw-write-tools-with-approval.md`) → Status: Superseded.
   - ADR-0037 (`docs/adr/0037-openclaw-write-audit-persistence.md`) — лишається Active (server-side write-audit).
   - ADR-0041 (`docs/adr/0041-openclaw-telegram-webhook.md`) → Status: Superseded (Gateway тепер сам обслуговує webhook на новій bot-identity; старий webhook лишається активним для fallback bot).
   - Новий ADR `docs/adr/00XX-openclaw-external-gateway.md` — фіксує кінцеву архітектуру + identity-based cutover як design choice.
   - Hard Rule #20 — оновити «Why» секцію, що Gateway теж не зберігає PAT-и.
   - `docs/launch/tech/openclaw-roadmap.md` — позначити завершені віхи.
   - `docs/playbooks/rotate-openclaw-credentials.md` — оновити список secrets (додати Gateway-bot-token окремо від старого `OPENCLAW_BOT_TOKEN`).
4. **Залишається без змін:**
   - `apps/server/src/modules/openclaw/` — server API
   - `apps/server/src/routes/internal/openclaw.ts` — endpoints
   - DB таблиці — дані
   - Міграції — immutable
   - Hard Rule #20 enforcement — `assertStartupEnv()`
   - **Grammy bot runtime** — `tools/console` + `OPENCLAW_BOT_TOKEN` env + Railway service `sergeant-openclaw` всі живуть як fallback (без будь-якої cutover-зміни)
5. **Планове видалення grammy (Locked decision #17, refined 2026-05-11):** на cutover-day Phase 7 (день переходу founder-а на нову bot-identity) автоматично викликається `set_reminder` на `cutover-day + 28 днів`, прив'язаний до `/Артем`: «оцінити, чи Gateway-bot стабільний — якщо так, переходимо до окремої ініціативи видалення `tools/console/src/openclaw/` + agents-файлів + `OPENCLAW_BOT_TOKEN` з secret manager + suspend Railway service `sergeant-openclaw`». Сам PR-F цього видалення НЕ робить.

### Phase 8: Додаткові канали (in-scope: WhatsApp; решта — за бажанням)

Після стабілізації Telegram у Phase 6.5/7 — підключити WhatsApp як підтверджений in-scope канал, плюс опційні.

**WhatsApp (1–2 дні):**

- Виділена WhatsApp business-лінія (друга SIM/eSIM/препейд) — рекомендований two-phone setup з документації OpenClaw.
- Pairing через QR (`openclaw channels login` всередині Railway shell або одноразовий локальний пейринг з ре-аплоадом auth.json до volume).
- `channels.whatsapp.allowFrom` — лише founder's number.
- Tone selector у persona prompts враховує медіум (короткі WhatsApp DM-style replies).
- **Два WhatsApp accounts (Locked decision #16):** founder використовує eSIM dual-SIM на iPhone, щоб мати два окремих WhatsApp-аккаунти: один production (пейриться до Gateway), другий test/sandbox (для всіх експериментів, не б'є основний чат). Pairing виконується по одному разово в Phase 8 старті.

**Опційні канали (поза цим планом, окремі ініціативи):**

- Slack (Bolt workspace app + OAuth)
- Discord (server + DMs + bot intents)
- Signal
- iMessage (macOS only)

Для кожного — окремий micro-ADR з security review (allowlist, identity mapping → `founderUserId`, rate limits per channel). «Просто конфіг» — це лише після того, як identity-pipeline для каналу готовий.

---

## Audit retention

**Locked decision #11:** ретеншн для `openclaw_invocations`, `openclaw_write_audit`, `openclaw_council_runs` — **HARD DELETE > 90 днів** (`created_at < now() - interval '90 days'`). **Без rollup-таблиці** і без archive: founder працює лише з hot-data періоду; довгострокова аналітика живе в PostHog/Sentry.

- **Механізм:** n8n Tier A workflow `openclaw-audit-cleanup`, cron `0 3 * * *` Europe/Kyiv (3:00 щодоби), викликає `POST /api/internal/openclaw/audit/purge?older_than=90d`.
- **Idempotent:** server endpoint повертає `{ deleted: <n>, oldest_remaining_at: <ts> }` для моніторингу.
- **GDPR:** founder-data — їхнє власне; user-data в audit-таблицях обмежений (`founder_user_id`, `tool_name`, `params_hash`); PII не зберігається.
- **Ревью:** якщо founder потребує довшої ретенції (живя compliance use-case) — окремий micro-ADR.

---

## Per-call USD cap і budget enforcement

**Locked decision #4 (cost budget):** per-call cap **\$0.5**, council cap **\$2.0**, daily cap **\$10/добу**. Щоденний cap резетиться о 00:00 Europe/Kyiv.

- **Source of truth:** server-side `apps/server/src/modules/openclaw/budget.ts` + `POST /api/internal/openclaw/budget`. Не дублюємо логіку у плагіні. Endpoint приймає `kind: "per_call" | "council" | "daily"`.
- **Plugin** перевіряє budget у `llm_input` hook (перед кожним LLM-call: per_call + daily) і у `tool_call_pre` (перед write-tool, якщо підвищує cost).
- Якщо `/budget` повертає `{ allowed: false, reason }` — plugin перериває turn з користувацьким message-ом (через `api.services.messaging.send`), пише `invocation finalize` зі `status: "budget_exceeded"`.
- `OPENCLAW_MAX_PER_CALL_USD=0.5` зберігається як plugin config; перевірка локальна (швидко, без HTTP) на оцінку cost перед `model.complete`.
- `OPENCLAW_COUNCIL_USD_BUDGET=2.0` — Phase 5 council orchestrator перевіряє через `/budget` з `kind: "council"`.
- `OPENCLAW_DAILY_USD_CAP=10.0` — сервер агрегує cost всіх invocations за добу; при досягненні — plugin відповідає «daily cap reached, резет о 00:00 Kyiv» і вимикає LLM-routing до резету; Layer 0 shortcut-и продовжують працювати.

---

## GitHub App credentials у production

- Hard Rule #20 забороняє `OPENCLAW_GITHUB_PAT` і `Git_PAT` у production. `assertStartupEnv()` блокує запуск `apps/server`, якщо ці змінні присутні.
- `read_github` і `create_github_issue` tools у плагіні **не** ходять у GitHub напряму. Вони викликають `POST /api/internal/openclaw/github` і `POST /api/internal/openclaw/write/github-issue`, де server-side вже використовує GitHub App-flow (`OPENCLAW_GITHUB_APP_ID` + `_PRIVATE_KEY` + `_INSTALLATION_ID`).
- Railway service `sergeant-openclaw-gateway` **не повинен** мати у env жодного з `OPENCLAW_GITHUB_PAT`/`Git_PAT`/`GITHUB_TOKEN`. Це закріплюється у `docs/playbooks/rotate-openclaw-credentials.md` як обов'язковий чек.
- Smoke-тест у Phase 0 / 0.5: спроба викликати `read_github` з Gateway → має пройти (через server) без жодного PAT-у в Gateway env.

---

## Workspace package governance

Новий `packages/openclaw-plugin/`:

- **CODEOWNERS:** `packages/openclaw-plugin/ @Skords-01` + secondary placeholder (TBD backend-engineer). Без цього `pnpm lint:codeowners` падає.
- **Module ownership map** (`docs/architecture/module-ownership.md` + AGENTS.md) — додати рядок про новий пакет.
- **Turbo pipeline:** build/test/typecheck/lint підключений через `turbo.json` (workspace pattern matching).
- **ESLint:** використовує shared `eslint.config.mjs` через extends.
- **TypeScript:** окремий `tsconfig.json`, що extends-ить root config; `noUncheckedIndexedAccess: true` (Hard Rule #19).
- **Pre-commit:** lint-staged ESLint/Prettier + staged-typecheck покриває новий шлях автоматично.
- **Tests:** Vitest, тести `*.test.ts` поряд з кодом.
- **`pnpm lint:plugins`** (новий?) — якщо ні, додаємо у Phase 1, що валідовує `openclaw.plugin.json` schema.

---

## Оцінка зусиль

| Phase                       | Опис                                                                                                                                            | Оцінка          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 0                           | Підготовка + встановлення Gateway на Railway                                                                                                    | 1 день          |
| 0.5                         | Spike PoC (approval + budget + audit + parity-харнес)                                                                                           | 1–2 дні         |
| 1                           | Sergeant Tools Plugin (13 existing + 4 code + 4 n8n + 3 SEO + reminders + refresh-helper + shortcut router + cheap router + hooks + governance) | 9–12 днів       |
| 2                           | 10 Personas як Skills + agent allowlist + model tiers                                                                                           | 2–3 дні         |
| 3                           | Strategic Modes + heartbeat (morning digest skill)                                                                                              | 1–2 дні         |
| 4                           | Approval Flow (default variant **B**; Phase 0.5 перевіряє всі 3 варіанти) + n8n Tier C gates                                                    | 3–5 днів        |
| 5                           | Council Round-Table (multi-persona, 10 ролей)                                                                                                   | 3–4 дні         |
| 6                           | Audit + Sentry/PostHog instrumentation + Layer 0/1 routing telemetry                                                                            | 1–2 дні         |
| 6.5                         | Parallel run на окремій bot-identity (calendar wait ≥7 днів)                                                                                    | ≥7 днів         |
| 7                           | Cutover (вимкнення grammy, ADR superseded, env cleanup)                                                                                         | 1–2 дні         |
| 8                           | WhatsApp channel                                                                                                                                | 1–2 дні         |
| **Загалом (engineering)**   |                                                                                                                                                 | **~26–36 днів** |
| **Загалом з parity-window** |                                                                                                                                                 | **~33–43 днів** |

**Обгрунтування наросту vs v2 (+8 днів):**

- +2-3 дні у Phase 1: 4 code-understanding tools, 4 n8n tools, 3 SEO env-stubs, reminders, refresh-helper.
- +2 дні у Phase 1: shortcut router (17 shortcuts) + canned templates.
- +1 день у Phase 1: cheap router + Haiku integration tests.
- +1–2 дні у Phase 2: з 5 до 10 personas (+ model tiers config).
- +1 день у Phase 3: morning-digest cron skill.
- +0.5 дня у Phase 0.5/PR-B: 2 нові міграції (наступні вільні номери, наприклад 054/055) переїхали сюди з Phase 4 (Locked #9).
- +0.5 дня у Phase 5: 10 персон взаємодія, тест sequencing.

---

## Ризики та мітигація

| Ризик                                                                                                | Імовірність                                                 | Мітигація                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenClaw approval flow недостатній для наших потреб                                                  | Середня                                                     | Phase 0.5 PoC фіксує варіант (native vs custom hook) до старту Phase 1; Варіант B як fallback.                                                                                                                 |
| Breaking changes у OpenClaw API                                                                      | **Середня-Висока** (141 реліз за ~6 місяців, активний beta) | Pin exact stable version у `package.json` + Railway lock; CI smoke-test plugin проти pinned SDK; renovate-only PR на апгрейди без auto-merge; інтеграційний тест-харнес з PoC переїжджає у CI.                 |
| Latency збільшується (додатковий hop через Gateway)                                                  | Низька                                                      | Gateway на Railway у тому ж проєкті, що й server (intra-VPC). Phase 6.5 фіксує p95 baseline.                                                                                                                   |
| Council orchestration складна в multi-agent                                                          | Середня                                                     | Fallback на single-agent + tool підхід; PoC можна провалідувати у Phase 0.5 (опційно).                                                                                                                         |
| Втрата edge cases з approval-store                                                                   | Середня                                                     | Phase 4 інтеграційні тести покривають всі п'ять write-tools; Phase 6.5 parity-window фіксує реальні approval-сесії.                                                                                            |
| **Витік PAT у Gateway env (Hard Rule #20)**                                                          | Середня                                                     | Pre-deploy чек у Railway (script у `docs/playbooks/rotate-openclaw-credentials.md`); smoke-test у Phase 0 ловить наявність PAT-змінних.                                                                        |
| **Parity gap (Gateway поводиться інакше за grammy)**                                                 | Середня                                                     | Golden-conversation харнес у Phase 0.5 + щоденний моніторинг у Phase 6.5; gate to Phase 7 — ≥7 днів без regressions.                                                                                           |
| Persona tool-leakage (LLM ігнорує SKILL allowlist)                                                   | Середня                                                     | Allowlist через `agents.<persona>.tools` config + `optional: true` write-tools; SKILL текст лишається hint-ом, не enforcement.                                                                                 |
| WhatsApp pairing губиться при rebuild Railway image                                                  | Низька                                                      | Persistent volume для `~/.openclaw`; backup auth-state у secret manager.                                                                                                                                       |
| Cheap router (Haiku) невірно класифікує рутину як thinking (спалює буджет)                           | Середня                                                     | Telemetry: логувати всі router рішення у `openclaw_invocations` + щотижневий огляд; fallback Layer 0 keyword catch-all; `OPENCLAW_MAX_PER_CALL_USD` cap.                                                       |
| n8n Tier A workflow упаде під час auto-trigger (без approval)                                        | Середня                                                     | `trigger_n8n_workflow` всередині 8s timeout; якщо провал — агент відповідає stale-cache + тегує `/Олексій`; allowlist enforce-ує тільки 3 workflows без user-side effect.                                      |
| Cross-persona memory leak (cofounder бачить persona-only записи, але specialist слухає cofounder DM) | Низька-Середня                                              | ACL пишеться у `recall_memory` server-side, не у плагіні (не обхідно); міграція `ai_memories.persona`+`topic` (наступний вільний номер) покриває backfill: всі існуючі записи отримують `persona='cofounder'`. |

---

## Rollback план

Завдяки тому, що grammy лишається у репо як fallback і `@OpenClaw_sergeant_bot` працює на окремому Railway service, rollback — це зміна звички (founder повертається на стару bot-identity), не code revert.

1. **Швидкий rollback (ad hoc):** founder відновлює спілкування через `@OpenClaw_sergeant_bot`. Якщо Gateway service нестабільний — suspend його у Railway dashboard. Жодних змін у `tools/console`, жодного env flip.
2. Server API не змінюється — internal endpoints працюють для обох клієнтів одночасно (Phase 6.5 саме це і робить).
3. DB таблиці не змінюються — дані compatible.
4. Якщо проблема в plugin — Gateway відключаємо у Railway (suspend service), grammy продовжує.
5. **Видалення коду grammy** — окрема ініціатива, не раніше ніж через 4 тижні стабільної роботи Gateway, окремим PR з власним rollback-планом.

---

## Гнучкість після merge: що можна змінювати без релізу плагіна

Все нижче — конфіг (репо, PR-review, 1 file change), без коду:

- **Новий n8n workflow** → 1 рядок у `ops/openclaw/n8n-allowlist.json` + tier. PR на 5 хвилин.
- **Зміна tier workflow-у (B→A, A→C)** → 1 рядок у тому ж файлі.
- **Нова persona / переіменування** → copy SKILL.md template + рядок у `agents.<slug>` config + alias. ~15 хв.
- **Новий shortcut** → 1 файл `shortcuts/<name>.ts` + регулярка + canned template. ~30 хв.
- **Зміна `model_default` або `model_for_thinking` для persona** → 1 рядок у `openclaw.json`. Зміна без релізу плагіна.
- **Cost cap / per-call limit** → Railway env var, restart container.
- **Topic enum для memory** → ADD VALUE до `ai_memories.topic` (PG text field, без міграції на enum).
- **SEO credentials (GSC/PSI/SerpAPI)** → set env vars у Railway, tools перемикаються з `not_configured` на `live` автоматично.
- **Heartbeat schedule** → `MORNING_DIGEST_CRON` env override.
- **Voice/Canvas on/off** → `openclaw.json` feature flags.
- **Новий канал** (Slack/Discord/Signal/iMessage) → канал-pairing у dashboard + persona tone-tweak у відповідних SKILL.md.

Цей плагін navmisno design-driven: код знає **як** виконати tool/route/persona, але **що саме** — read-only configuration. Зміна вимог `ops/openclaw/*` змінює поведінку без зачіпання `packages/openclaw-plugin/src/`.

---

## Артефакти PR-A v3

Цей PR не вносить runtime код. Він додає:

- `docs/planning/openclaw-migration-plan.md` (v3, поточний файл)
- `ops/openclaw/openclaw.example.json` (skeleton config: routing + 10 personas + 17 shortcuts + n8n tier mapping)
- `ops/openclaw/n8n-allowlist.json` (19 workflows + tier)
- `ops/openclaw/shortcuts/catalog.md` (17 shortcut-ів, спеці-документ)
- `ops/openclaw/skills/sergeant-cofounder/SKILL.md` (Андрій)
- `ops/openclaw/skills/sergeant-eng/SKILL.md` (Артем)
- `ops/openclaw/skills/sergeant-devops/SKILL.md` (Олексій)
- `ops/openclaw/skills/sergeant-pm/SKILL.md` (Олена)
- `ops/openclaw/skills/sergeant-growth/SKILL.md` (Марта)
- `ops/openclaw/skills/sergeant-seo/SKILL.md` (Назар)
- `ops/openclaw/skills/sergeant-content/SKILL.md` (Софія)
- `ops/openclaw/skills/sergeant-data/SKILL.md` (Ярема)
- `ops/openclaw/skills/sergeant-cs/SKILL.md` (Ольга)
- `ops/openclaw/skills/sergeant-finance/SKILL.md` (Ірина)

Усі config-файли — **examples / templates** для майбутніх PR-C1a / C1b / C1c / C1d / C2 / D. Поки що ні Gateway, ні плагін не існують, тож `ops/openclaw/*` — це довідкові артефакти для review.

---

## Post-Gateway extensions (Locked decision #18)

Після Phase 7 cutover відкривається окрема трек-ініціатива («ClawHub micro-ADR»), кожен пункт якої входить окремим micro-ADR і не блокує цей план:

1. **ClawHub publishing** — викладаємо підмножину Sergeant tools у community-реєстр (без server endpoints, тільки wrapper-плагін для інших OpenClaw users).
2. **Спільні plugins** (third-party SaaS врапери) — audit які community-plugins пропускаємо в production (схожо на dependency-allowlist policy).
3. **Multi-channel beyond WhatsApp** (Slack, Discord, Signal, iMessage) — кожен канал окремий ADR з security-review (allowlist, identity mapping, rate limits).
4. **Custom Sergeant ClawHub registry** (друга стадія) — якщо founders-customers хочуть свою версію Gateway з ліцензованими plugins.

До відповідного ADR жоден з цих пунктів у скоупі PR-A…PR-F не живе.

---

## Community plugins policy (ClawHub)

[ClawHub](https://clawhub.ai/) — community marketplace OpenClaw плагінів (52k+ tools). Наша політика:

- **NOT install:** жодних community плагінів, які пишуть/читають Sergeant-дані (Stripe, GitHub, Sentry, PostHog, n8n, etc.). Все це йде через наш `@sergeant/openclaw-plugin` → `apps/server /api/internal/openclaw/*` з `INTERNAL_API_KEY` + budget + audit. Community плагіни обходять цей boundary і порушують Hard Rule #20 + audit invariants.
- **OK to reference (research-only) під час PoC:** approval-flow patterns, n8n wrappers, Telegram channel configs. Запис у `docs/notes/spikes/openclaw-poc.md` як baseline для Phase 4 design choice.
- **OK to install після Gateway production (post-Phase 7), кожен — micro-ADR:** voice STT/TTS поверх native, Canvas теми, knowledge-base connectors (Notion/GDrive read-only), додаткові channel plugins (Slack/Discord/Signal/iMessage). Security review обов'язковий: identity-mapping → `founderUserId`, rate-limit per channel, allowlist, audit pipeline.
- **NEVER auto-install:** Renovate-only PR (без auto-merge), human approval, smoke-test на test-Gateway перед production.

Підсумок: ClawHub — це extension marketplace для **post-Gateway** опціональних надбудов, не source-of-truth для core tools.
