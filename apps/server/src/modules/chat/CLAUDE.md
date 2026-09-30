# AI-шар: chat (HubChat)

> **Last touched:** 2026-09-30 by @claude. **Next review:** 2027-01-01.
> **Status:** Active

Контекст шару: `Read .agents/skills/sergeant-module-ai/SKILL.md` → канон `docs/product/modules/hub-coach.md` (§ Журнал рішень).
Ключові інваріанти: tool def ↔ client executor ↔ action card рухаються разом; prompt cache — `promptCache.ts`/`toolSearch.ts` за ADR-0039 (deferred tool без `cache_control`).
Дані про здоровʼя (GDPR Art. 9): новий tool Фізрука/Харчування додається в `HEALTH_ONLY_TOOL_NAMES` (`tools.ts`) автоматично через модульні набори; змішаний крос-модульний tool, що може повернути health, розбирає `healthGate.ts::classifyToolUse`. Новий шлях «дані → LLM» без `resolveHealthConsent` (`lib/healthConsent.ts`) — дірка (рішення 2026-09-29, `hub-coach.md` § Журнал рішень).
