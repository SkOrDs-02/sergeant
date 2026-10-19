-- 156: soft-delete tombstone-и для finyk_tx_categories, finyk_tx_splits,
-- finyk_mono_debt_links, finyk_networth_history (аудит 2026-10-01, data-15,
-- частина Б; рішення власника: повний перехід на soft-delete, як у
-- finyk_budgets; ADR-0073 § Рішення).
--
-- Контекст. Ці чотири таблиці були «hard-delete»: видалення стирало рядок,
-- і запізнілий upsert зі старого пристрою (insert@T1 після delete@T2)
-- воскрешав його через INSERT ... ON CONFLICT. Tombstone (`deleted_at` +
-- `updated_at`) робить LWW чесним: застарілий запис за tombstone-ом
-- відхиляється як lww_conflict, новіший воскрешає рядок (deleted_at = NULL).
--
-- Суто адитивна й forward-only: nullable колонка без DEFAULT, існуючі рядки
-- лишаються живими (deleted_at IS NULL). Старий код колонки не знає й не
-- читає, тож порядок «фронт раніше за бекенд» (AGENTS.md § Deployment)
-- нікого не ламає. `.down.sql` — лише для локального відкату.

ALTER TABLE finyk_tx_categories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finyk_tx_splits
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finyk_mono_debt_links
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finyk_networth_history
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
