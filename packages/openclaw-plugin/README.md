# `@sergeant/openclaw-plugin`

> **Last validated:** 2026-05-10 by Devin (Phase 0.5 PoC). **Status:** Scaffolded (PoC).

Тонкий TypeScript-плагін, що реєструє Sergeant tools у OpenClaw Gateway runtime
(зовнішній продукт — `https://openclaw.ai`) через HTTP-проксі до
`apps/server /api/internal/openclaw/*`.

## Що в цьому пакеті (PR-B / Phase 0.5)

PoC scope із `docs/planning/openclaw-migration-plan.md` § Phase 0.5:

- 1 read tool — `recall_memory` (HTTP → `/api/internal/openclaw/recall`).
- 1 write tool — `create_github_issue` (gated; обкатує усі три approval
  варіанти A / B / C).
- 1 hook `llm_input` — pre-call budget gate через `/api/internal/openclaw/budget`.
- 1 hook `agent_turn_end` — invocation finalize + cost rollup
  (`/api/internal/openclaw/invocations/finalize`).
- Parity-харнес — 3 golden conversations, прогнані на старому
  `tools/console` (grammy bot) і новому plugin; асерт shape-parity.

Не входить (винесено у PR-C / PR-D):

- Решта 12 read-only tools + 4 code/n8n/SEO/reminders tools.
- Layer 0 shortcut router + Layer 1 cheap router.
- 10 personas / skills / allowlist / strategic modes.
- Approval flow для всіх write-tools (Phase 4).

## Як налаштовано

```ts
import { definePluginEntry } from "./sdk-types.js";
import { createOpenClawPlugin } from "./index.js";

export default definePluginEntry((api, raw) => createOpenClawPlugin(api, raw));
```

`raw` — JSON-рядок з `openclaw.json` § `plugin.config`. Парситься Zod-схемою
у `src/config.ts`. Інтегруючий тест моделює виклик через
`createOpenClawPlugin(stubApi, configJson)` і дивиться на `api.registerTool`
calls.

## SDK type stubs (важливо)

`src/sdk-types.ts` — це **локальні type-stubs** OpenClaw plugin SDK (`api.registerTool`,
`api.registerHook`, hook payload shape). PR-B PoC не залежить від реального
`@openclaw/plugin-sdk` пакета — він буде додано як npm-залежність у Phase 1
(PR-C). Наша задача в PR-B — підтвердити, що Sergeant tools лягають на цю
форму без deformations.

Коли `@openclaw/plugin-sdk` стане доступним, swap відбувається у одному місці:

```ts
// src/sdk-types.ts (стане ре-експортом):
export {
  definePluginEntry,
  type PluginApi,
  type ToolDefinition,
  type HookDefinition,
} from "@openclaw/plugin-sdk";
```

Решта коду навіть не помічає.

## Pivot в Phase 1

Phase 1 (PR-C) розширює пакет: 13 read-only tools, 4 code-understanding tools,
4 n8n delegation tools, 3 SEO env-stub tools, `set_reminder` (потребує
міграцію `055`), `refresh_business_snapshot` meta-tool, shortcut-router,
cheap-router, 10 SKILL.md. Всі — поверх scaffold, який цей пакет встановлює.
