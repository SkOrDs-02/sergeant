-- Rollback for migration 039_finyk_tables.sql.
--
-- Local-only rollback — production never runs `down.sql` (rule #4 in
-- AGENTS.md). Order: child indexes / per-tx mappings / per-row tables
-- first, then the singleton (`finyk_prefs` last in case future
-- migrations add FKs from per-row data into prefs). Each statement is
-- `IF EXISTS`-guarded so the file stays idempotent (rule #4
-- re-application invariant — the `035-nutrition-tables` round-trip
-- harness asserts this).

DROP INDEX IF EXISTS finyk_hidden_accounts_user_active_idx;
DROP INDEX IF EXISTS finyk_hidden_transactions_user_active_idx;
DROP INDEX IF EXISTS finyk_budgets_user_active_idx;
DROP INDEX IF EXISTS finyk_subscriptions_user_active_idx;
DROP INDEX IF EXISTS finyk_assets_user_active_idx;
DROP INDEX IF EXISTS finyk_debts_user_active_idx;
DROP INDEX IF EXISTS finyk_receivables_user_active_idx;
DROP INDEX IF EXISTS finyk_tx_categories_user_idx;
DROP INDEX IF EXISTS finyk_tx_splits_user_idx;
DROP INDEX IF EXISTS finyk_mono_debt_links_user_idx;
DROP INDEX IF EXISTS finyk_networth_history_user_month_idx;
DROP INDEX IF EXISTS finyk_custom_categories_user_active_idx;
DROP INDEX IF EXISTS finyk_manual_expenses_user_active_idx;
DROP INDEX IF EXISTS finyk_tx_filters_user_active_idx;

DROP TABLE IF EXISTS finyk_hidden_accounts;
DROP TABLE IF EXISTS finyk_hidden_transactions;
DROP TABLE IF EXISTS finyk_budgets;
DROP TABLE IF EXISTS finyk_subscriptions;
DROP TABLE IF EXISTS finyk_assets;
DROP TABLE IF EXISTS finyk_debts;
DROP TABLE IF EXISTS finyk_receivables;
DROP TABLE IF EXISTS finyk_tx_categories;
DROP TABLE IF EXISTS finyk_tx_splits;
DROP TABLE IF EXISTS finyk_mono_debt_links;
DROP TABLE IF EXISTS finyk_networth_history;
DROP TABLE IF EXISTS finyk_custom_categories;
DROP TABLE IF EXISTS finyk_manual_expenses;
DROP TABLE IF EXISTS finyk_tx_filters;
DROP TABLE IF EXISTS finyk_prefs;
