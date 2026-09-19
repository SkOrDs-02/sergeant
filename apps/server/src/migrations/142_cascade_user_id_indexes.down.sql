-- Відкат 142: зняти беззастережні індекси по user_id.
--
-- Status: Active
--
-- Local-only (Rule #4: прод `down.sql` не виконує). Двофазність не потрібна —
-- зникають лише індекси, жодна колонка з даними не чіпається. Часткові
-- індекси, що існували до 142, лишаються на місці.

DROP INDEX IF EXISTS finyk_assets_user_cascade_idx;
DROP INDEX IF EXISTS finyk_budgets_user_cascade_idx;
DROP INDEX IF EXISTS finyk_custom_categories_user_cascade_idx;
DROP INDEX IF EXISTS finyk_debts_user_cascade_idx;
DROP INDEX IF EXISTS finyk_manual_expenses_user_cascade_idx;
DROP INDEX IF EXISTS finyk_receivables_user_cascade_idx;
DROP INDEX IF EXISTS finyk_subscriptions_user_cascade_idx;
DROP INDEX IF EXISTS finyk_tx_filters_user_cascade_idx;
DROP INDEX IF EXISTS fizruk_custom_exercises_user_cascade_idx;
DROP INDEX IF EXISTS fizruk_workout_templates_user_cascade_idx;
DROP INDEX IF EXISTS nutrition_recipes_user_cascade_idx;
DROP INDEX IF EXISTS push_devices_user_cascade_idx;
DROP INDEX IF EXISTS push_subscriptions_user_cascade_idx;
DROP INDEX IF EXISTS routine_categories_user_cascade_idx;
DROP INDEX IF EXISTS routine_habits_user_cascade_idx;
DROP INDEX IF EXISTS routine_tags_user_cascade_idx;
DROP INDEX IF EXISTS silpo_oauth_state_user_cascade_idx;
DROP INDEX IF EXISTS subscriptions_user_cascade_idx;
DROP INDEX IF EXISTS subscriptions_provider_customer_idx;
DROP INDEX IF EXISTS silpo_connection_due_idx;
DROP INDEX IF EXISTS billing_webhook_events_order_id_idx;
