# Інфра-модуль Sync

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-23.
> **Status:** Active

Контекст: `Read .agents/skills/sergeant-module-sync/SKILL.md` (журнал рішень — у самому скілі).
Ключові інваріанти: конфлікти — per-row LWW у `applySync`; день-ключ особистих сутностей — device-local (ADR-0078); ядро дуалрайту — `packages/dualwrite-core/` (ADR-0073).
