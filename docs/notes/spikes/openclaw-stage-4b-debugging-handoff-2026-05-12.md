# OpenClaw Stage 4b — Live Debugging Handoff (2026-05-12)

> **Last validated:** 2026-05-12 by Devin. **Next review:** після того, як Gateway отримає реальний redeploy з main та live smoke-test покаже або канонічну поведінку (shortcut router fires) або новий root-cause.
> **Status:** Active — **Stage 4b НЕ live у production**. Три PR-и (#2467, #2468, #2469) merged у main, але **жоден з них не задеплоєний на Gateway** (див. § 5 нижче — Railway service не watch-ить GitHub repo). Усі три live smoke-test-и 2026-05-12 (10:30, 11:30, 14:00 Kyiv) били по тому ж старому образу від `2026-05-12T10:06:43Z`.

## 0. TL;DR (для нової сесії — 30 сек)

1. **Symptom**: `/metrics`, `/runway`, UA `Дай метрики` у Telegram DM з `@KENT_OPENCLAW_GATEWAY_BOT` повертають Opus-prose ("Тобто я по факту бачу...", "Що пропоную..."), не canned Markdown template ≤2 сек. Live smoke-test 2026-05-12 14:08 Kyiv підтверджує: shortcut router НЕ короткозамикає агент. Усі команди йдуть через повний agent cycle = LLM cost ≠ $0.
2. **Real root-cause №3 (виявлено 2026-05-12 ~12:10 UTC, ще НЕ виправлене)**: **Railway service `openclaw-gateway` у проекті `openclaw-clean-gateway` НЕ підключений до GitHub.** `service.serviceInstances.source.repo === null`. Auto-deploy на push до `main` **не існує**. Усі 3 PR-и (#2467 sentinel drop, #2468 `before_dispatch` migration, #2469 `opts.name` fix) **merged у main, але НЕ задеплоєні**. Production-Gateway все ще біжить початковий образ із `2026-05-12T10:06:43Z` з `cliMessage: "Initial clean OpenClaw Gateway deploy"`.
3. **Next action**: trigger redeploy з main вручну (див. § 7 — три варіанти). Після того — повторити smoke-test. Якщо все ще fail — переходити до hypothesis-стеку у § 6.
4. **Цей doc існує тому**, що 3 ітерації fix-forward (PR #2467/2468/2469) пройшли локальний typecheck+test+lint+build, GitHub CI зелений, merge into main підтверджений, але **усі вони били ту ж саму проблему "симптом не виправлений"** через те, що production-код взагалі не оновлювався. Без redeploy будь-який наступний fix-forward буде такою ж no-op.

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

## 6. Hypothesis stack для майбутніх ітерацій

Кожна гіпотеза має preconditions (що має бути виконано перед тим, як її перевіряти), commands (як перевірити), expected outcome (що сигналізує hit / miss).

### Hypothesis A (HIGHEST PRIORITY): redeploy фіксить все

- **Precondition**: тригернути redeploy з main (див. § 7).
- **Test**: повторити smoke-test (`/metrics`, `/runway`, `Дай метрики`, `/think`).
- **Expected (hit)**: перші 3 → canned Markdown ≤2 сек, БЕЗ Opus-style prose. `/think` → повний agent cycle.
- **Expected (miss)**: смsh-test видає той самий Opus output. Тоді переходимо на B.

### Hypothesis B: hook реєструється (бо `opts.name`) але не fires (бо runtime не emit-ить `before_dispatch` для Telegram channel)

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

## 7. Як зробити redeploy

> **WARNING**: Перед redeploy переконайся, що `main` чистий і local clone оновлений. Production Gateway після redeploy миттєво отримає новий код. Зворотного шляху без revert немає.

### Варіант A (рекомендовано — швидкий fix цієї проблеми)

```bash
cd /home/ubuntu/repos/Sergeant
git checkout main && git pull
export RAILWAY_API_TOKEN="$Railway"   # account-scoped token у секретах Devin org
railway link --project openclaw-clean-gateway
railway up --service openclaw-gateway --detach
```

`railway up` пакує локальну директорію → запускає Docker build per `Dockerfile.openclaw-gateway` → деплоїть. Часу зайде ~3-5 хв. Перевірити статус:

```bash
railway deployment list --limit 3
railway logs --service openclaw-gateway | tail -50
# Шукати: sergeant.tools.registered, sergeant.hooks.registered, БЕЗ sergeant.hook.registration_failed
```

### Варіант B (довгий, permanent — підключити Railway service до GitHub)

Це permanent fix і виключає необхідність manual redeploy для майбутніх PR.

1. Railway dashboard → openclaw-clean-gateway → openclaw-gateway service → Settings → Source.
2. Connect to GitHub → Skords-01/Sergeant → branch `main`.
3. Verify deploy triggers на push to `main`.
4. Це створює першу auto-deploy, яка пейка-ну `main` HEAD.

Після цього кожен merge у main буде → нова deploy ~3-5 хв пізніше → live smoke-test.

### Варіант C (через CI, найкраще довгостроково)

GitHub Action у `.github/workflows/` що:

1. На push до `main` з changed-files у `packages/openclaw-plugin/**` або `Dockerfile.openclaw-gateway`,
2. Запускає `railway up --service openclaw-gateway --detach`,
3. Wait на deploy success,
4. Posts back to PR/commit з deploy URL.

Це канонічно правильний підхід для monorepo з кількома Railway services (server, gateway, console etc.) — кожен service має свій workflow trigger.

**Recommendation**: Варіант A зараз (швидкий), потім окремий PR — Варіант B або C для майбутнього.

## 8. PR history (цей session)

| #    | Title                                                 | Commit                   | Status                            | Real impact                                                                                                                              |
| ---- | ----------------------------------------------------- | ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2466 | docs: sync openclaw stage-tracker                     | `007285f6`               | merged                            | Лише docs. n/a runtime.                                                                                                                  |
| 2467 | drop `__ROUTED__:` sentinel                           | `bbed022e`               | merged → manual deploy `74eab839` | Sentinel був dead code (blockReason ніколи не доходив до runtime). Чисто technically-correct refactor. Це baseline-deploy.               |
| 2468 | migrate Stage 4b shortcut router to `before_dispatch` | `5cb31858`               | merged → **НЕ deployed**          | Theoretical fix root-cause #1 (deprecated hook, wrong event shape, no `block` support). Не задеплоєний, тому не верифікований у runtime. |
| 2469 | restore hook registration with mandatory `opts.name`  | `416eeba0`<br>`8458fa2a` | merged → **НЕ deployed**          | Theoretical fix root-cause #2 (loader throws `hook registration missing name`). Не задеплоєний, тому не верифікований у runtime.         |

## 9. Next steps for next session

Pre-flight (5 хв):

1. Перевірити що `main` повний:
   ```bash
   git log --oneline main -10 | grep -i "registerHook\|opts.name\|before_dispatch"
   # Маєш бачити 416eeba0 (opts.name fix), 5cb31858 (before_dispatch migration)
   ```
2. Перевірити Railway state:
   ```bash
   export RAILWAY_API_TOKEN="$Railway"
   railway link --project openclaw-clean-gateway
   railway deployment list --limit 3
   ```
   Якщо all deploys at 2026-05-12T10:06:43Z — fix-forward не deployed.

Main action (10 хв):

3. Redeploy через Варіант A з § 7. Чекати на `status: SUCCESS`.
4. Live smoke-test 5 команд: `/metrics`, `/runway`, `Дай метрики`, `/think чи варто піднімати ціну`, `/status`.
5. Railway logs:
   ```bash
   railway logs --service openclaw-gateway | grep -E "sergeant\.(tools|hooks|shortcut|hook)\."
   ```

   - `sergeant.tools.registered` — має бути 1 (startup).
   - `sergeant.hooks.registered` — має бути 1 з `ok: 5, failed: 0`.
   - `sergeant.hook.registration_failed` — **МАЄ бути 0** (якщо є — `opts.name` fix не спрацював).
   - `sergeant.shortcut.routed` (or whatever logged in shortcut-router handler) — має бути 1 на `/metrics`, 1 на `/runway`, 1 на `Дай метрики`.

Якщо all green → declare Stage 4b live, відкрити Stage 4a follow-up PR (event shape mismatch на audit-open hook — окрема fix-forward задача).

Якщо не all green → переходити на Hypothesis B/C/D/E з § 6. **НЕ робити нові PR-и без verify, що попередні deployed.**

Permanent fix (окремий PR, любий час):

6. Connect Railway → GitHub (Варіант B або C з § 7). Це закриває майбутні regression-loops де PR merged ≠ deployed.

## 10. Опаційні findings (можуть бути окремими follow-up PR-ами)

- **5 pre-existing SDK warnings** на startup: `plugin must declare contracts.tools for: <write_tool_name>` (5 разів). `contracts.tools` declarative manifest з'явився у openclaw 5.7+. Це Stage 4d follow-up — не блокує цю задачу.
- **Railway log forwarder strips structured fields from INFO**. Залишок ERROR-level loop, що ми додали у PR #2469 — добре. Канонічна порада: усі critical-path log lines (registration, dispatch decisions, audit-open) — мінімум ERROR level, з усіма context-fields як string-encoded message (не nested object) якщо хочемо їх у Railway dashboard. Перевірити чи інші важливі log-ліни (Stage 3 audit-end, write-approval) теж під ризиком silent-strip.
- **Recent Railway deploy list має `numReplicas: 1` + `restartPolicyType: ON_FAILURE`** — single-replica gateway. Якщо replica падає під час event-handling — недоступна доки restart. OK для нашого scale, але потенційно `numReplicas: 2 + cold standby` для бізнес-critical phase.

---

> **Created by**: Devin session 4d68881f8cd142098f771876383d5639 (2026-05-12 ~12:15 UTC).
> **Reason**: User's explicit request після третього smoke-test failure: "Онови документацію що ти вже зробив, в чому проблема і як виправляти. Щоб я потім у іншій сесії звернувся до документу і продовжив роботу."
