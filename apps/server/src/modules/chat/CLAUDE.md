# AI-шар: chat (HubChat)

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-04.
> **Status:** Active

Контекст шару: `Read .agents/skills/sergeant-module-ai/SKILL.md` → канон `docs/01-product/model/hub-coach.md` (§ Журнал рішень).
Ключові інваріанти: tool def ↔ client executor ↔ action card рухаються разом; prompt cache — `promptCache.ts`/`toolSearch.ts` за ADR-0039 (deferred tool без `cache_control`).
