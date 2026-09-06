# ADR-0005: AI provider boundary and model selection

- **Status:** Accepted
- **Date:** 2026-04-27
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0039](./0039-anthropic-prompt-cache-policy.md), [ADR-0087](./0087-model-tiering-measured.md), [`apps/server/src/lib/llm/provider.ts`](../../../apps/server/src/lib/llm/provider.ts), [`apps/server/src/env/`](../../../apps/server/src/env/)

## Context

The original decision established Anthropic as the first production LLM
transport. Since then, model choice and transport have become separate
concerns. Some paths need Anthropic Messages features directly; other paths
can use the provider factory and an explicitly configured alternative. Keeping
the old single-model description here makes the record contradict the code.

## Decision

1. Model and provider selection are configuration, not a hard-coded global
   architectural invariant. The canonical configuration is the typed server
   environment under `apps/server/src/env/`.
2. `getLLMProvider()` is the shared factory for provider-based paths. It
   supports `stub`, `openrouter`, and `anthropic`; OpenRouter model selection
   may be overridden per path and falls back to `OPENROUTER_MODEL`.
3. Fallback is opt-in through `LLM_FALLBACK_ENABLED` and is observable. A
   missing production key must not silently be interpreted as a successful
   model evaluation.
4. Chat paths that require Anthropic-specific streaming/tool/cache behavior
   may use the direct transport. Provider-factory paths must keep their
   provider and model defaults in the typed env/config layer.
5. Current model defaults, quality evidence, and economic tiering belong to
   ADR-0087. Prompt-cache mechanics belong to ADR-0039. This ADR does not
   duplicate either table.

## Rejected options

- One model hard-coded in every feature: rejected because it caused drift and
  made controlled evaluation impossible.
- One universal provider for every path: rejected because streaming, tools,
  vision, and batch paths have different transport requirements.
- Silent fallback to a stub: rejected for production and evaluation; stubs are
  only an explicit development/test provider.

## Consequences

Provider/model changes are reviewed as configuration and evaluation changes,
not as broad source rewrites. New call sites must choose the factory or direct
transport deliberately, document why, and emit provider/model telemetry.
