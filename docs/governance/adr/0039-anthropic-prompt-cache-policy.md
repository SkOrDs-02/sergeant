# ADR-0039: Prompt-cache breakpoint policy

- **Status:** Accepted
- **Date:** 2026-05-04
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0005](./0005-anthropic-model-selection-and-prompt-caching.md), [ADR-0015](./0015-observability-stack.md), [`apps/server/src/modules/chat/promptCache.ts`](../../../apps/server/src/modules/chat/promptCache.ts), [`apps/server/src/lib/anthropic.ts`](../../../apps/server/src/lib/anthropic.ts)

## Context

The chat request contains a stable system prefix, optional server-owned preset
instructions, user context, tools, and conversation messages. Caching mutable
user data or treating a cache breakpoint as a model-selection rule creates
cross-request invalidation and safety risks.

## Decision

The chat transport uses Anthropic ephemeral cache controls at the stable
boundaries implemented by `promptCache.ts`:

1. `SYSTEM_PREFIX` is cached as the stable system prefix.
2. The tool payload receives a breakpoint on the last cacheable tool. The
   implementation scans from the end because deferred/non-cacheable tools may
   be present.
3. The latest cacheable message receives a breakpoint when the caller opts
   into message caching.
4. Preset instructions and wrapped user context remain after the stable prefix;
   user-provided context is never promoted into the stable prefix.
5. `SYSTEM_PROMPT_VERSION` is telemetry/cache-era metadata. A semantic change
   to the stable system contract bumps it in the same change.
6. Cache read/write usage and cost are recorded through the existing AI
   observability path. Cache behavior must be fail-open for request execution.

## Rejected options

- Cache the entire system block: rejected because per-user context would
  invalidate a shared stable prefix.
- Cache every message: rejected because new user messages make the prefix
  unstable and add write cost.
- Duplicate cache policy in model-tiering ADRs: rejected; provider/model
  selection is governed by ADR-0005 and ADR-0087.

## Consequences

Changes to `promptCache.ts`, system-prefix content, tool ordering, or message
eligibility require cache-hit/cost tests and telemetry review. The exact number
of breakpoints is an implementation detail of the current helper and must not
be copied into another ADR without revalidating the code.
