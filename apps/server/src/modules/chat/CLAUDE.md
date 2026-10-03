# AI-шар: chat (HubChat)

> **Last touched:** 2026-10-03 by @claude (numberVerify). **Next review:** 2027-01-01.
> **Status:** Active

Контекст шару: `Read .agents/skills/sergeant-module-ai/SKILL.md` → канон `docs/product/modules/hub-coach.md` (§ Журнал рішень).
Ключові інваріанти: tool def ↔ client executor ↔ action card рухаються разом; prompt cache — `promptCache.ts`/`toolSearch.ts` за ADR-0039 (deferred tool без `cache_control`).
Верифікація чисел у відповідях ([ADR-0097](../../../../../docs/governance/adr/0097-link-evidence-standard.md)): `numberVerify/` — чиста бібліотека (без I/O й env) + `shadow.ts` (єдине місце, що знає про `CHAT_NUMBER_VERIFY`, метрики й лог); `chat.ts`/`chatStream.ts` роблять до нього один тонкий виклик. У shadow відповідь не змінюється ні на байт; переписувати текст після звірки можна лише в PR3 серії. У метриках і логах — жодних чисел і тексту відповіді (Hard Rule #21).
Дані про здоровʼя (GDPR Art. 9): новий tool Фізрука/Харчування додається в `HEALTH_ONLY_TOOL_NAMES` (`tools.ts`) автоматично через модульні набори; змішаний крос-модульний tool, що може повернути health, розбирає `healthGate.ts::classifyToolUse`. Новий шлях «дані → LLM» без `resolveHealthConsent` (`lib/healthConsent.ts`) — дірка (рішення 2026-09-29, `hub-coach.md` § Журнал рішень).
