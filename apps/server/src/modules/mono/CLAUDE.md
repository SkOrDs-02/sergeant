# Інтеграція Monobank (mono)

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-17.
> **Status:** Active

Це НЕ AI-шар і НЕ коуч (коуч живе в `apps/server/src/modules/chat/coach.ts`). Тут: webhook Monobank, enrichment-воркери категоризації транзакцій, jars, Privat.
Контекст: `Read .agents/skills/sergeant-module-integrations/SKILL.md`; фінансовий домен — `sergeant-module-finyk`.
Ключові інваріанти: воркери гейтяться ключем провайдера з `LLM_READONLY_PROVIDER` (`providerUpstreamReady("readonly")`), не Anthropic-ключем; токени банку — тільки шифровані (`MONO_TOKEN_ENC_KEY`), у логи не течуть (Hard Rule #21).
