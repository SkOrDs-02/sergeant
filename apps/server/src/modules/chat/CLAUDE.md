# AI-шар: chat (HubChat)

> **Last touched:** 2026-09-17 by @claude. **Next review:** 2026-12-19.
> **Status:** Active

Контекст шару: `Read .agents/skills/sergeant-module-ai/SKILL.md` → канон `docs/product/modules/hub-coach.md` (§ Журнал рішень).
Ключові інваріанти: tool def ↔ client executor ↔ action card рухаються разом; prompt cache — `promptCache.ts`/`toolSearch.ts` за ADR-0039 (deferred tool без `cache_control`).
