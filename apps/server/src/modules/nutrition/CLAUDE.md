# Модуль Nutrition (server)

> **Last touched:** 2026-08-31 by @Skords-01. **Next review:** 2026-12-02.
> **Status:** Active

Продуктовий контекст: `Read .agents/skills/sergeant-module-nutrition/SKILL.md` → канон `docs/01-product/model/nutrition.md` (§ Журнал рішень).
Ключові інваріанти: `bigint` → `Number()` (Hard Rule #1); комора — append-only ledger, залишок derived (ADR-0077); день-ключ логу їжі — device-local (ADR-0078).
