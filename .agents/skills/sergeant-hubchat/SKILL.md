---
name: sergeant-hubchat
description: Use when creating, modifying, reviewing, or debugging Sergeant HubChat tool definitions, client executors, action cards, prompt-cache-sensitive tool metadata, or chat-side effects across apps/server and apps/web.
---

# Sergeant HubChat

HubChat tools are defined on the server and executed on the client. A correct change spans tool definition, executor, and any visible action card or risk labeling.

## Required Coordination

For a new or changed tool, check all relevant pieces in one pass:

- `apps/server/src/modules/chat/toolDefs/*.ts`
- `apps/server/src/modules/chat/tools.ts`
- `apps/web/src/core/lib/hubChatActions.ts`
- `apps/web/src/core/lib/hubChatActionCards.ts`
- quick actions or risky-tool labeling when user-visible behavior changed

## Hard Rules

- The server does not perform chat tool side effects in `chat.ts`.
- Client executors should use existing storage wrappers or typed API clients, not ad-hoc storage.
- Tool results returned to the model should stay concise and deterministic.
- Changing tool definitions can invalidate prompt-cache candidates; batch wording churn where possible.

## Verify

- Test the executor path and at least one error path.
- Use the documented curl or local UI flow for end-to-end tool invocation.
- Check whether the tool should be marked risky or rendered with an action card.

## Useful Docs

- [docs/playbooks/add-hubchat-tool.md](../../../docs/playbooks/add-hubchat-tool.md)
- [docs/playbooks/debug-chat-tool.md](../../../docs/playbooks/debug-chat-tool.md)
- [docs/playbooks/enable-prompt-caching.md](../../../docs/playbooks/enable-prompt-caching.md)
