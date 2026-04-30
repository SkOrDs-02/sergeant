---
name: sergeant-hubchat-tool
description: "How to add, modify, or debug HubChat AI assistant tools in the Sergeant project. Use when the task involves creating a new tool-call for the Anthropic-powered chat assistant, editing tool definitions, client executors, or action cards."
---

# HubChat Tool Development

HubChat is Sergeant's Anthropic-powered chat assistant. Tools are defined on the server, executed on the client. Adding or changing a tool always requires coordinated edits across three files.

## Architecture

```
User → HubChat (web) → POST /api/chat → Server → Anthropic Messages API
                                                         ↓
                                         tool_use{name, input} streamed back
                                                         ↓
Client executor (hubChatActions.ts) runs the tool locally
                                                         ↓
tool_result sent back to model → final response rendered
```

The server is a thin pass-through. It does NOT run tool side effects — no DB writes in `chat.ts`. Side effects go through regular HTTP endpoints called by the client executor.

## Three Coordinated Edits (mandatory)

Every new tool needs all three in the same PR:

### 1. Tool Definition (server)

File: `apps/server/src/modules/chat/toolDefs/<domain>.ts`

```ts
export const myNewTool: Anthropic.Tool = {
  name: "my_new_tool",
  description: "Опис що робить цей tool — одне речення для Anthropic.",
  input_schema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "…" },
    },
    required: ["param1"],
  },
};
```

Then register it in `apps/server/src/modules/chat/tools.ts` → `TOOLS` array.

### 2. Client Executor

File: `apps/web/src/core/lib/hubChatActions.ts`

```ts
case "my_new_tool": {
  const { param1 } = input as { param1: string };
  // Use localStorage via ls/lsSet (never raw localStorage.setItem!)
  // Or call api-client endpoints
  const result = await apiClient.myDomain.doSomething(param1);
  return `Виконано: ${result.summary}`;
}
```

Rules:
- Return a `string` for `tool_result` — this is what Anthropic sees.
- Use `ls`/`lsSet`/`safeReadLS`/`safeWriteLS` for localStorage (Hard Rule, anti-pattern #6).
- For API calls, use `@sergeant/api-client` typed endpoints.

### 3. Action Card (if user-visible)

File: `apps/web/src/core/lib/hubChatActionCards.ts`

Map the tool result to a visual card. If the tool is destructive, add it to `RISKY_TOOLS` for the "Критична дія" badge.

Optional: `hubChatQuickActions.ts` for quick-action buttons.

## max_tokens Budget

| Request | max_tokens | Why |
|---------|-----------|-----|
| First user message | 1500 | Tool call + short reply |
| Tool-result continuation | 2500 | Final answer with markdown tables |

Do not lower these without testing worst-case responses. If `stop_reason: "max_tokens"`, the model may truncate mid-JSON and the user sees "Невідома дія".

## Prompt Cache Implications

`SYSTEM_PREFIX` in `toolDefs/systemPrompt.ts` is a prompt-cache candidate. Changing tool definitions invalidates the cache for all active users — batch tool changes, don't ship one-off wording tweaks.

## Testing Without UI

```bash
curl -sS -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: $(cat .devin-session-cookie)" \
  -d '{"messages":[{"role":"user","content":"<prompt>"}]}'
```

Inspect `tool_use` blocks in the JSON response to verify the tool is invoked.

## Playbook

Full step-by-step: `docs/playbooks/add-hubchat-tool.md`

## Checklist

- [ ] Tool definition in `toolDefs/<domain>.ts` + registered in `tools.ts`
- [ ] Client executor case in `hubChatActions.ts`
- [ ] Action card mapping (if user-visible)
- [ ] `RISKY_TOOLS` entry (if destructive)
- [ ] No raw `localStorage.setItem` — use `ls`/`lsSet` wrappers
- [ ] Tested via curl or web UI
- [ ] max_tokens budget verified for worst-case response
