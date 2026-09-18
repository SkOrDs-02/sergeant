-- Idempotent rollback for `032_query_plan_documentation.sql`.
-- Re-runnable: `COMMENT ON … IS NULL` повертає коментар у NULL без помилки,
-- навіть якщо обʼєкта вже нема (виняток лише на саму відсутність обʼєкта,
-- але всі чотири — це базові схема-обʼєкти з 002/003/005, тож вони існують).

COMMENT ON COLUMN ai_usage_daily.request_count IS NULL;
COMMENT ON INDEX idx_ai_usage_daily_day IS NULL;
COMMENT ON INDEX idx_push_subs_user_active IS NULL;
COMMENT ON CONSTRAINT push_subscriptions_user_id_fkey ON push_subscriptions IS NULL;
COMMENT ON TABLE module_data IS NULL;
