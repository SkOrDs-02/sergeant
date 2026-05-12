# OpenClaw Stage 4b — Live Debugging Handoff (2026-05-12)

> **Last validated:** 2026-05-12 by Devin (update 13:30 UTC). **Next review:** після того, як PR #2471 (`api.on` migration) пройде CI, задеплоїться на `sergeant-openclaw-gateway` через GitHub auto-deploy, і live smoke-test покаже canonical поведінку (shortcut router fires ≤2 сек з canned Markdown).
> **Status:** Active — **Stage 4b досі НЕ live у production**, але root cause переписано. Початкова гіпотеза ("Railway service не watch-ить GitHub") **виявилася неактуальною з моменту переїзду на проект `Sergeant`** (див. § 0.5 — update від 13:30 UTC). Реальна причина — usage of wrong SDK API: `api.registerHook` замість `api.on` для plugin lifecycle hooks. Усі 5 хуків (включно з Stage 4b shortcut router) реєструються у systems, які OpenClaw runtime НЕ викликає для `before_dispatch`, `agent_end`, `before_tool_call`.

## 0. TL;DR (актуальна версія — 30 сек)

1. **Symptom**: `/metrics`, `/runway`, UA `Дай метрики` у Telegram DM з `@KENT_OPENCLAW_GATEWAY_BOT` повертають Opus-prose, не canned Markdown ≤2 сек. Усі команди йдуть через повний agent cycle = LLM cost ≠ $0.
2. **Real root-cause №4 (виявлено 2026-05-12 13:15 UTC, fix in flight — PR #2471)**: Sergeant plugin реєструє 5 lifecycle hooks (`before_dispatch`, `llm_input`, `before_agent_start`, `agent_end`, `before_tool_call`) через **`api.registerHook(events, handler, opts)`**. У SDK 2026.5.7 цей метод призначений для **INTERNAL hook bus** (`type: "command" | "session" | "agent" | "gateway" | "message"`) — він пушить хуки у `registry.hooks` + `registerInternalHook()`. `hookRunner.runBeforeDispatch()` читає з **`registry.typedHooks`**, куди потрапляє лише `api.on(hookName, handler, opts?)`. Тому всі наші 5 хуків мовчки зареєстровані в "мертву" систему і ніколи не fires. Лог `sergeant.hooks.registered { ok: 5, failed: 0 }` обманює — реєстрація "успішна" з точки зору `registerHook` (бо `opts.name` валідний), але runtime ніколи їх не зачитує.
3. **Real root-cause №3 (старий, вже не актуальний)**: ~~Railway service не watch-ить GitHub~~ — застаріле. У поточному проекті `Sergeant` service `sergeant-openclaw-gateway` **підключений до GitHub** і auto-deploy працює. Останній deploy `aa0d5db3` від 10:56 UTC = merge PR #2469. Тобто всі 3 попередні fix-forward (PR #2467/2468/2469) **вже задеплоєні** — і всі вони били не ту проблему (вони фіксили `opts.name` для API, який у нашому випадку всеодно ніколи не виконується runtime-ом).
4. **Next action**: merge PR #2471 (rename `registerHook` → `api.on` + ambient `.d.ts` + `allowConversationAccess: true` для conversation hooks + tests). Після auto-deploy через `sergeant-openclaw-gateway` (3–5 хв) — live smoke-test 5 команд.
5. **Цей doc існує тому**, що 4 ітерації fix-forward (PR #2467/2468/2469 — і неpushed-діагностика від 12:10 UTC) пройшли локальний typecheck+test+lint+build, GitHub CI зелений, deploy ✓, але all hits the same "симптом не виправлений" mode. Причина: unit-тести мокали `api.registerHook` і нічого не знали про `api.on`. Real SDK contract (`api-builder.d.ts` + loader source) перевірений у § 4.5 нижче.

---

## 0.5. Update 2026-05-12 13:30 UTC — Real root cause found

**TL;DR:** Бажане API для lifecycle hooks — `api.on(hookName, handler, opts?)`, не `api.registerHook(events, handler, opts)`. Spike doc § "Hook API" (Row 1) спочатку був неправильним.

**Конкретні докази** (з `npm install openclaw@2026.5.7` у scratch-директорії):

- `node_modules/openclaw/dist/plugin-sdk/src/plugins/types.d.ts:1905`
  ```ts
  registerHook: (events: string | string[], handler: InternalHookHandler, opts?: OpenClawPluginHookOptions) => void;
  ```
  `InternalHookHandler` — це `(event: InternalHookEvent) => void` з `InternalHookEventType = "command" | "session" | "agent" | "gateway" | "message"`. Це **внутрішня шина команд** (`command:new`, `session:reset`, тощо), не plugin lifecycle.
- `node_modules/openclaw/dist/plugin-sdk/src/plugins/types.d.ts:2052`
  ```ts
  on: <K extends PluginHookName>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number; timeoutMs?: number },
  ) => void;
  ```
  Це **canonical lifecycle hook registration**. `PluginHookName` enum включає `before_dispatch`, `agent_end`, `before_tool_call` і ще 31 інший.
- `node_modules/openclaw/dist/loader-B-GXgDrk.js:3137`
  ```js
  on: (hookName, handler, opts) =>
    registerTypedHook(record, hookName, handler, opts, params.hookPolicy);
  ```
  `registerTypedHook` пушить у `registry.typedHooks`.
- `node_modules/openclaw/dist/hook-runner-global-CCAcWVdN.js:108`
  ```js
  function getHooksForName(registry, hookName) {
    return registry.typedHooks.filter((h) => h.hookName === hookName).toSorted(...);
  }
  ```
  Це звідки `runBeforeDispatch` бере handlers. Якщо хука немає у `typedHooks` — він **ніколи не fires**.
- `node_modules/openclaw/dist/loader-B-GXgDrk.js:1487`
  ```js
  const registerHook = (record, events, handler, opts, config, pluginConfig) => {
    // ...
    registry.hooks.push({...});                  // ← НЕ typedHooks
    registerInternalHook(event, wrappedHandler); // ← internal command bus
  };
  ```
  Це звідки приходить помилкове відчуття, що `registerHook` працює — він валідує `opts.name`, додає у `registry.hooks` (для metadata), і реєструє у internal bus (де є `triggerInternalHook` для `command`, `command:new` тощо).

**Чому PR #2469 не допоміг.** Він фіксив `opts.name` validation на `registerHook` — але цей method взагалі не той, який потрібно викликати. Loop у `for (... of hookRegistrations) { ... registerHook(event, handler, { name }) }` тепер не кидає exception, всі 5 хуків "OK" — але ніхто з них не доступний runtime-у для firing.

**Додаткова блокіруюча умова для `llm_input` + `agent_end`.** Це conversation hooks (`CONVERSATION_HOOK_NAMES = ["llm_input", "llm_output", "before_agent_finalize", "agent_end"]`). Loader при `registerTypedHook` блокує їх для non-bundled plugins, якщо у конфізі не виставлено `plugins.entries.sergeant.hooks.allowConversationAccess: true`. `before_dispatch`, `before_agent_start`, `before_tool_call` — поза цим списком, тож вільно реєструються.

**Fix shape (PR #2471)**:

1. `packages/openclaw-plugin/src/index.ts` — замінити цикл `for (...) registerHook(event, handler, { name })` на 5 окремих `api.on("before_dispatch", handler)` / `api.on("agent_end", handler)` / тощо. Прибрати `opts.name` (не використовується typed-hook API).
2. `packages/openclaw-plugin/src/types/openclaw-ambient.d.ts` — додати `on?: <K extends PluginHookName>(hookName, handler, opts?)` як canonical. Залишити `registerHook?` як internal-only, з warning-коментарем що `before_dispatch` etc. через нього не сприймаються.
3. `ops/openclaw/openclaw.example.json` — додати `"hooks": { "allowConversationAccess": true }` у `plugins.entries.sergeant` для розблокування `llm_input` + `agent_end`.
4. `packages/openclaw-plugin/src/index.test.ts` — мокати `api.on` (масив `{ event, handler, opts }`); видалити тести на `opts.name` для lifecycle hooks.
5. `docs/notes/spikes/openclaw-sdk-5.7-real-api.md` — переписати Row 1 (Hook API) — `api.on` canonical, `api.registerHook` лише для internal bus.
6. Цей doc — додати § 0.5 + оновити § 5 (Railway connection — вже не актуальний root cause), § 6 (мітка hypothesis A — resolved-but-not-helpful), § 8 (додати PR #2471).

**Чому це не зловили раніше**:

- Unit-тести використовували self-consistent mock з `registerHook`. Мок повертав те саме, що збирав, і тести бачили "5 hooks registered". Real SDK contract не перевірявся.
- Live smoke не давав сигналу про різницю між "hook registered" і "hook called" — обидва завершуються "shortcut не зреагував". Без `triggerInternalHook` callsite-grep ця гіпотеза не з'явилася.
- Spike doc Row 1 був написаний автором, що подивився на `registerHook` як на canonical API. `api.on` навіть не згаданий — він просто інший metod у `OpenClawPluginApi`.

---

## 1. Контекст до сесії

- **Plugin**: `packages/openclaw-plugin/src/index.ts` (Stage 1 SDK rewrite — PR [#2438](https://github.com/Skords-01/Sergeant/pull/2438), merged 2026-05-12, commit `14ee42e2`).
- **Real SDK**: `openclaw@2026.5.7` (downloaded npm package, inspected `dist/loader-B-GXgDrk.js`, `dist/plugin-sdk/src/plugins/hook-types.d.ts`, `dist/dispatch-8E8vi2HV.js`).
- **Gateway**: окремий Railway service `openclaw-gateway` у проекті `openclaw-clean-gateway`, тримає Telegram webhook через бота `@KENT_OPENCLAW_GATEWAY_BOT`. Legacy grammy bot `@OpenClaw_sergeant_bot` живе паралельно як fallback (не задіяний у цій debugging-сесії).
- **Spike doc**: [`docs/notes/spikes/openclaw-sdk-5.7-real-api.md`](./openclaw-sdk-5.7-real-api.md) — детальний contract SDK 5.7. Рядки 1, 5, 6 — найважливіше для цієї debugging-серії.
- **Migration plan**: [`docs/planning/openclaw-migration-plan.md`](../../planning/openclaw-migration-plan.md) — § Reality update 2026-05-12 пункти 11, 12, 13 — chronologically.

## 2. Що було зроблено у цій сесії (хронологічно)

| Time (UTC) | Подія                                                                                                                                 | PR / commit                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 08:30      | Початок: PR #2466 (stage-tracker docs) merged                                                                                         | [#2466](https://github.com/Skords-01/Sergeant/pull/2466) merged `007285f6`                                                      |
| 08:50      | PR #2467 (drop `__ROUTED__:` sentinel) merged                                                                                         | [#2467](https://github.com/Skords-01/Sergeant/pull/2467) merged `bbed022e`                                                      |
| 10:06      | **Manual one-shot Railway deploy** (`74eab839`, image digest `sha256:2d5c64dd…ddc8fb52df4`)                                           | meta: `cliMessage: "Initial clean OpenClaw Gateway deploy"` — built from `bbed022e` (PR #2467) baseline                         |
| 10:30      | Live smoke-test #1 (5 TG команд)                                                                                                      | **FAIL**: усі 4 shortcuts (`/metrics`, `/runway`, `/status`, UA `Дай метрики`) проходили повний agent-cycle                     |
| 10:30      | Root-cause #1 знайдений: hook на `before_agent_start` (deprecated) + `event.userMessage` undefined + return-type не підтримує `block` | див. spike doc Row 5                                                                                                            |
| 10:48      | PR #2468 (`before_dispatch` migration + Spike row 5) merged                                                                           | [#2468](https://github.com/Skords-01/Sergeant/pull/2468) merged `5cb31858`                                                      |
| 11:00      | Live smoke-test #2 (повтор)                                                                                                           | **FAIL**: ті ж симптоми. `/runway` повертає "Хм, погані новини на двох фронтах 😏"                                              |
| 11:30      | Root-cause #2 знайдений: missing `opts.name` у кожному `registerHook` виклику                                                         | див. spike doc Row 6                                                                                                            |
| 11:50      | PR #2469 (`opts.name` required + ERROR logging + spike row 6) merged                                                                  | [#2469](https://github.com/Skords-01/Sergeant/pull/2469)                                                                        |
| 12:08      | Live smoke-test #3 (повтор)                                                                                                           | **FAIL** (screenshot IMG_2379): `/metrics` повертає Markdown table з emojis + "Що пропоную..." — Opus prose, не canned template |
| 12:10      | **Root-cause #3 виявлено: Railway service НЕ підключений до GitHub. Жоден з 3 PR не задеплоєний.**                                    | див. § 5 нижче                                                                                                                  |

## 3. Що це означає для довіри до попередніх "live smoke-test" висновків

Усі три діагнози, які ми зробили з smoke-test #1, #2, #3 — **базувалися на ОДНОМУ і тому ж старому образі**. Це означає:

- **Root-cause #1 (`before_agent_start` deprecated + wrong event shape + wrong return type)** — все ще **валідний** як SDK contract issue. Real SDK `.d.ts` files підтверджують це незалежно від того, що дeplоєне. PR #2468 fix-forward — все ще правильний.
- **Root-cause #2 (`opts.name` required)** — все ще **валідний** як SDK loader contract. Loader logic у `dist/loader-B-GXgDrk.js:1490` доведена через grep. PR #2469 fix-forward — все ще правильний.
- **Симптом "agent runs anyway"** під час smoke-test #2 і #3 — **тривіальний**: production все ще біжить pre-#2467 код. Цей симптом НЕ є валідним сигналом про щось більш глибоке. **Не плутати з "fix не спрацював" — fix НЕ дойшов до production взагалі.**

## 4. Стан коду на main після цієї сесії

Усі fix-и **присутні у `main` і type-safe**:

```bash
git log --oneline main -5
# 14ee… (next-id) docs(openclaw-plugin): align PR refs to actual #2469 number
# 416eeba0 refactor(openclaw-plugin): restore hook registration with mandatory opts.name
# 5cb31858 refactor(openclaw-plugin): migrate stage 4b shortcut router to before_dispatch hook
# bbed022e refactor(openclaw-plugin): drop __ROUTED__ sentinel, surface blockReason verbatim
# 007285f6 docs(docs): sync openclaw stage-tracker — mark 3a/3b/4a/4b merged
```

Локальна верифікація:

```bash
pnpm --filter @sergeant/openclaw-plugin typecheck   # ✓
pnpm --filter @sergeant/openclaw-plugin test         # ✓ 169/169
pnpm --filter @sergeant/openclaw-plugin build        # ✓
pnpm --filter @sergeant/openclaw-plugin lint         # ✓
```

Файли, що змінились (з PR #2468 + #2469):

- `packages/openclaw-plugin/src/hooks/shortcut-router.ts` — hook повертає `{ handled: true, text }`, читає `event.content`.
- `packages/openclaw-plugin/src/index.ts` — реєстрація 5 hook-ів через explicit array з `name` field; кожен `registerHook` отримує `{ name }` як 3-й argument; додатково `logger.error("sergeant.hook.registration_failed", …)` per failure.
- `packages/openclaw-plugin/src/types/openclaw-ambient.d.ts` — `opts.name: string` mark-нутий як required.
- `packages/openclaw-plugin/src/index.test.ts` — новий тест `it("passes a unique non-empty opts.name to every registerHook call …")`.
- `docs/notes/spikes/openclaw-sdk-5.7-real-api.md` — Row 5 (`before_dispatch` contract), Row 6 (`opts.name` loader validation).
- `docs/planning/openclaw-migration-plan.md` — § Reality update пункти 11, 12, 13.

## 5. Real root-cause #3 — Railway service без GitHub auto-deploy

### Як виявлено

```bash
export RAILWAY_API_TOKEN="${Railway}"
railway list                       # → openclaw-clean-gateway
railway link --project openclaw-clean-gateway
railway status                     # → service: openclaw-gateway, deployment: 74eab839
railway deployment list            # → ОДНА deploy: 74eab839 from 2026-05-12 10:06:43 UTC
```

GraphQL queries (через `https://backboard.railway.com/graphql/v2` з `Authorization: Bearer ${Railway}`):

```graphql
query {
  service(id: "e987f413-b6f7-4910-b9a6-0c5179d57a60") {
    serviceInstances {
      edges {
        node {
          source {
            repo
            image
          }
        }
      }
    }
  }
}
```

Response:

```json
{
  "data": {
    "service": {
      "serviceInstances": {
        "edges": [
          {
            "node": {
              "source": { "repo": null, "image": null }
            }
          }
        ]
      }
    }
  }
}
```

**Обидва поля `null`** — service не watch-ить GitHub repo і не pull-ить Docker image з registry. Це означає, що **єдиний спосіб задеплоїти новий код — викликати `railway up` вручну** з локального clone (або через GitHub Action, який це робить).

### Recent deployment meta

```json
{
  "id": "74eab839-84f1-42c7-92d9-b0d00a900b81",
  "status": "SUCCESS",
  "createdAt": "2026-05-12T10:06:43.694Z",
  "meta": {
    "reason": "deploy",
    "cliMessage": "Initial clean OpenClaw Gateway deploy",
    "imageDigest": "sha256:2d5c64dd7b7692a09aa82cfc1f3bb96ab02eae3bd36277d7edb9ffdc8fb52df4",
    "configFile": "/railway.toml"
  }
}
```

Підтверджує: deploy зроблено через `railway up` CLI (звідси `cliMessage`), не через GitHub push.

### Service IDs (для майбутніх сесій)

```
Workspace: skords-01's Projects
Project: openclaw-clean-gateway
Project ID: 8841b59b-2248-4c58-aecd-15b397bb929e
Environment: production
Environment ID: f4dde0a7-734c-4834-a150-2dcd96cd85b2
Service: openclaw-gateway
Service ID: e987f413-b6f7-4910-b9a6-0c5179d57a60
Service Instance ID: 5f24a020-f02d-4518-acd2-943bb7f31a3c
URL: https://openclaw-gateway-production-f57e.up.railway.app
```

## 6. Hypothesis stack — статус після 13:30 UTC update

### Hypothesis A (старий — "redeploy фіксить все"): **MISS**

- Redeploy відбувся через GitHub auto-deploy на `sergeant-openclaw-gateway` (проект `Sergeant`). Останній deploy `aa0d5db3` від 10:56 UTC включає merge PR #2469.
- Smoke-test після redeploy — досі fail. Bot робить роздуми на Layer 0.
- **Висновок**: redeploy зроблений, проблема не у відсутньому deploy. Переходимо нижче.

### Hypothesis B (старий — "hook реєструється але не fires"): **HIT (близько до правди, але не повне пояснення)**

- Грепом по `dist/loader-B-GXgDrk.js` і `dist/hook-runner-global-*.js` знайдено два паралельні hook-реєстри:
  - `registry.hooks` + `registerInternalHook(event, wrappedHandler)` — куди пушить `api.registerHook`.
  - `registry.typedHooks` — куди пушить `api.on`, і звідки читає `hookRunner.runBeforeDispatch`.
- Hook **реально не fires**, але не тому що runtime не emit-ить event — а тому що handler сидить у іншому registry.
- Перенесене у root-cause #4 (див. § 0.5). Це і є реальний answer.

### Hypothesis C / D / E (детальний debug): **SKIP** — fix #4 пояснює всі symptoms одним рухом

### Гіпотеза, яка лишається відкритою на майбутнє

- **Audit-open hook (`before_agent_start`) — deprecated у 5.7**. Real event має `prompt` (не `userMessage`), result type не підтримує `block`. Після того, як fix #4 запрацює, `before_agent_start` буде fires, але payload може приходити порожнім / іншої форми → audit row може створюватися з `null` userMessage. Stage 4a follow-up: мігрувати на `session_start` або `agent_turn_prepare`. Цей doc не покриває цю частину.

## 6-archive. Original hypothesis stack (зачищені для історії)

<details><summary>Старі гіпотези B/C/D/E з версії 12:15 UTC. Лишаю для трасування міркувань.</summary>

### Hypothesis B (стара версія): hook реєструється (бо `opts.name`) але не fires (бо runtime не emit-ить `before_dispatch` для Telegram channel)

- **Precondition**: A miss; redeploy успішний; `[plugins] sergeant.hooks.registered` бачимо в Railway logs БЕЗ `sergeant.hook.registration_failed` ERROR-ів.
- **Test 1**: Grep `dist/dispatch-8E8vi2HV.js` (або еквівалент) у downloaded openclaw 5.7 SDK на `before_dispatch` invocation. Перевірити чи runtime робить `hookRunner.runBeforeDispatch(event)` для Telegram-channel inbound messages специфічно. Можливо event-source `inbound_claim` замість `before_dispatch` для TG.
- **Test 2**: Додати temporary `logger.info("sergeant.shortcut.handler.called", { content, channel })` НА САМОМУ ВХОДІ shortcut-router handler — якщо НЕ з'являється у logs під час `/metrics`, hook не emit-иться runtime-ом.
- **Expected (hit)**: handler-log не з'являється → переїзд на `inbound_claim` (alternative Layer 0 hook у Row 5 spike doc).
- **Expected (miss)**: handler log є, але `{ handled: true, text }` не shorts → C.

### Hypothesis C: hook fires, повертає `{ handled: true }`, але runtime ігнорує result (semantics або priority)

- **Precondition**: B miss; handler-log з'являється.
- **Test**: Grep `dist/loader-B-GXgDrk.js` + `dist/dispatch-8E8vi2HV.js` на post-hook logic: чи runtime читає `result.handled`, чи `text` обов'язково має не-undefined? Чи є priority-ordering (наш handler може повертати після того, як інший plugin вже claim-нув)? Спеціально перевірити OpenClaw built-in `/status` handler — там runtime claim-ить раніше за нашого.
- **Expected (hit)**: знаходимо специфічний return-shape contract, що ми не виконуємо.

### Hypothesis D: regex / shortcut detection не match-ить input

- **Precondition**: B miss; handler-log з'являється, але `matchResult` `undefined`/`null`.
- **Test**: Юніт-тест на shortcut-router з рівним вхідним рядком `/metrics` (UA та EN) — переконатись, що match повертає правильний `slug`. Перевірити чи `event.content` приходить з префіксом (`@bot_name /metrics`) — Telegram bots часто отримують повне `text` включно з mention.
- **Fix**: `content.trim().replace(/^@\w+\s+/, "")` перед regex-match-ом, якщо так.

### Hypothesis E: Stage 4a `composedBeforeAgentStart` (legacy) overrides Stage 4b

- **Precondition**: B miss; `[plugins] sergeant.hooks.registered` показує 4 hooks замість 5 (composed instead of separate).
- **Test**: Перевірити `packages/openclaw-plugin/src/index.ts` на наявність `composedBeforeAgentStart` або інших wrap-ів. PR #2468 мав видалити цей wrap, але якщо є залишок — він заглушує shortcut router.
- **Fix**: Видалити composition; кожен hook реєструється окремо. Перевірити, що `before_dispatch` І `before_agent_start` обидва присутні у hook list.

</details>

## 7. Як зробити redeploy (актуальна версія після 13:30 UTC)

> **Update 2026-05-12 13:30 UTC**: `sergeant-openclaw-gateway` у проекті `Sergeant` **вже auto-deploy-ить з GitHub на push до `main`**. Manual `railway up` потрібен тільки якщо auto-deploy не спрацював (build fail, тощо). Останній auto-deploy `aa0d5db3` від 10:56 UTC = merge `52580d06` (PR #2469).

### Стандартний шлях (auto-deploy)

```bash
# merge PR у main
# Railway автоматично queue-ить deploy через 1-2 хв
# Build займає ~3-5 хв. Перевірити статус:
export RAILWAY_API_TOKEN="$rl"
railway link --project Sergeant --service sergeant-openclaw-gateway --environment production
railway status
railway logs --service sergeant-openclaw-gateway | tail -50
# Шукати: sergeant.tools.registered, sergeant.hooks.registered, БЕЗ sergeant.hook.registration_failed
```

### Manual fallback (якщо auto-deploy fail)

```bash
cd /home/ubuntu/repos/Sergeant
git checkout main && git pull
export RAILWAY_API_TOKEN="$rl"
railway link --project Sergeant --service sergeant-openclaw-gateway --environment production
railway up --service sergeant-openclaw-gateway --detach
```

### Historical (зачищене)

<details><summary>Початкові варіанти A/B/C з 12:15 UTC update — для трасування рішень.</summary>

#### Варіант A (історично — швидкий fix)

```bash
railway link --project openclaw-clean-gateway
railway up --service openclaw-gateway --detach
```

#### Варіант B (історично — підключити до GitHub)

Це вже зроблено для `sergeant-openclaw-gateway` у проекті `Sergeant`.

#### Варіант C (історично — GitHub Action)

Не потрібно, бо B зроблено.

</details>

## 8. PR history (цей session — оновлено 13:30 UTC)

| #    | Title                                                                              | Commit                   | Status                                | Real impact                                                                                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------- | ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2466 | docs: sync openclaw stage-tracker                                                  | `007285f6`               | merged                                | Лише docs. n/a runtime.                                                                                                                                                                                                           |
| 2467 | drop `__ROUTED__:` sentinel                                                        | `bbed022e`               | merged → deployed                     | Sentinel був dead code. Чисто refactor.                                                                                                                                                                                           |
| 2468 | migrate Stage 4b shortcut router to `before_dispatch`                              | `5cb31858`               | merged → deployed `aa0d5db3` 10:56UTC | Theoretical fix root-cause #1 (deprecated hook). Не дав ефекту, бо real root cause — №4 (`api.on` vs `api.registerHook`), яка існує незалежно від обраного event.                                                                 |
| 2469 | restore hook registration with mandatory `opts.name`                               | `416eeba0`<br>`8458fa2a` | merged → deployed `aa0d5db3` 10:56UTC | Theoretical fix root-cause #2 (`hook registration missing name`). Не дав ефекту, бо `registerHook` — це не той method, який runtime читає для lifecycle hooks. Без помилки, але без firing-у.                                     |
| 2470 | docs: handoff after Stage 4b debug                                                 | `624a5efe`               | merged                                | Документ із попереднім root cause #3 (Railway не watch-ить GitHub). Цей doc — наступна версія. **Hypothesis A з #2470 — MISS** (auto-deploy на `sergeant-openclaw-gateway` працює, redeploy сам по собі не фіксить).              |
| 2471 | refactor(openclaw-plugin): migrate lifecycle hooks from `registerHook` to `api.on` | _pending_                | _in flight_                           | **Reality root-cause #4 fix.** Replaces `for (...) registerHook(event, handler, { name })` з 5 явними `api.on(event, handler)`. + `allowConversationAccess: true` для conversation hooks. + Spike doc Row 1 переписаний. + tests. |

## 9. Next steps for next session (актуально після 13:30 UTC)

Pre-flight (3 хв):

1. Перевірити PR #2471 status — merge у main має включати:
   - `packages/openclaw-plugin/src/index.ts` — `api.on(...)` calls замість `registerHook(..., { name })`.
   - `packages/openclaw-plugin/src/types/openclaw-ambient.d.ts` — `on?:` додано як canonical.
   - `ops/openclaw/openclaw.example.json` — `plugins.entries.sergeant.hooks.allowConversationAccess: true`.
   - `packages/openclaw-plugin/src/index.test.ts` — мок `api.on`.
2. Перевірити Railway auto-deploy:
   ```bash
   export RAILWAY_API_TOKEN="$rl"
   railway link --project Sergeant --service sergeant-openclaw-gateway --environment production
   railway status
   railway deployment list --limit 3
   ```
   Очікувано: новий deploy після merge PR #2471 з commit hash, що включає `api.on` fix.

Main action (10 хв):

3. Чекати на `status: SUCCESS` нового deploy.
4. Live smoke-test 5 команд у DM з `@KENT_OPENCLAW_GATEWAY_BOT`:
   - `/metrics` — очікувано canned Markdown table з PostHog/Stripe/Sentry даними ≤2 сек.
   - `/runway` — те ж.
   - `Дай метрики` (UA) — те ж.
   - `/think чи варто піднімати ціну` — повний agent cycle (Opus prose, ≥15 сек).
   - `/status` — очікувано канонічний Openclaw status response (через native command, не наш plugin).
5. Railway logs:

   ```bash
   railway logs --service sergeant-openclaw-gateway | grep -E "sergeant\.(tools|hooks|shortcut|hook)\."
   ```

   - `sergeant.tools.registered` — має бути 1 (startup).
   - `sergeant.hooks.registered` — має бути 1 з `ok: 5, failed: 0`.
   - `sergeant.hook.registration_failed` — **МАЄ бути 0**.
   - `openclaw.shortcut.routed` — має бути 1 на кожен з `/metrics`, `/runway`, `Дай метрики`.

Якщо all green → declare Stage 4b live, відкрити Stage 4a follow-up PR (audit-open `before_agent_start` event shape mismatch — окрема задача).

Якщо не all green → grep `registry.typedHooks` у logs ще раз, перевірити, чи loader не block-нув conversation hooks через `allowConversationAccess` flag. Перевірити, що `api.on` дійсно exists на runtime API (з `api-builder.d.ts` має бути).

## 10. Опаційні findings (можуть бути окремими follow-up PR-ами)

- **5 pre-existing SDK warnings** на startup: `plugin must declare contracts.tools for: <write_tool_name>` (5 разів). `contracts.tools` declarative manifest з'явився у openclaw 5.7+. Це Stage 4d follow-up — не блокує цю задачу.
- **Railway log forwarder strips structured fields from INFO**. Залишок ERROR-level loop, що ми додали у PR #2469 — добре. Канонічна порада: усі critical-path log lines (registration, dispatch decisions, audit-open) — мінімум ERROR level, з усіма context-fields як string-encoded message (не nested object) якщо хочемо їх у Railway dashboard. Перевірити чи інші важливі log-ліни (Stage 3 audit-end, write-approval) теж під ризиком silent-strip.
- **Recent Railway deploy list має `numReplicas: 1` + `restartPolicyType: ON_FAILURE`** — single-replica gateway. Якщо replica падає під час event-handling — недоступна доки restart. OK для нашого scale, але потенційно `numReplicas: 2 + cold standby` для бізнес-critical phase.

---

> **Created by**: Devin session 4d68881f8cd142098f771876383d5639 (2026-05-12 ~12:15 UTC).
> **Reason**: User's explicit request після третього smoke-test failure: "Онови документацію що ти вже зробив, в чому проблема і як виправляти. Щоб я потім у іншій сесії звернувся до документу і продовжив роботу."
