-- 142_cascade_user_id_indexes.sql
--
-- Status: Active
--
-- Робить видалення акаунта здійсненним: 18 каскадних дітей `"user"` не мали
-- індексу, придатного для самого каскаду.
--
-- ЧОМУ ЦЕ НЕ ВИДНО «НА ОКО». Кожна з таблиць нижче індекс по `user_id`
-- МАЄ — але ЧАСТКОВИЙ, майже завжди у формі
-- `(user_id, deleted_at) WHERE deleted_at IS NULL`. Він обслуговує
-- читання, де soft-deleted рядки й не потрібні, і в `\d` виглядає як
-- «індекс по user_id є». Каскад же виконує внутрішній
-- `DELETE FROM <дитина> WHERE user_id = $1` БЕЗ предиката `deleted_at IS
-- NULL` — він мусить прибрати й soft-deleted рядки теж. Postgres бере
-- частковий індекс лише коли може довести, що предикат ЗАПИТУ імплікує
-- предикат ІНДЕКСУ; тут не імплікує, тож індекс непридатний.
--
-- Перевірено на живій схемі, не з голови: `EXPLAIN` для
-- `DELETE FROM finyk_assets WHERE user_id = '…'` дає Seq Scan навіть під
-- `SET enable_seqscan = off` — тобто планувальник не «обрав інший план»,
-- а не МАЄ придатного. Той самий запит із дописаним `AND deleted_at IS
-- NULL` одразу лягає в Index Scan. Різниця саме в предикаті.
--
-- НАСЛІДОК, ЯКИЙ ЦЕ ЛІКУЄ. `deleteUserData` робить один
-- `DELETE FROM "user"` в одній транзакції, і той розгортається у 74
-- каскадні гілки. Вісімнадцять із них — послідовні повні сканування, під
-- `statement_timeout`. Тобто запит на видалення акаунта (GDPR, і він же
-- шлях `DELETE /api/me`) з ростом бази стає тим повільнішим, чим більше
-- в системі ЧУЖИХ даних, і врешті впирається в таймаут — тобто людина не
-- може видалити свій акаунт через обсяг даних інших людей.
--
-- CREATE INDEX без CONCURRENTLY — свідомо: раннер
-- (`apps/server/src/db.ts::runPendingSqlMigrations`) виконує кожен файл в
-- одній транзакції, а CONCURRENTLY у транзакції заборонено. На поточних
-- обсягах беремо ACCESS EXCLUSIVE на частки секунди; коли таблиці
-- виростуть, ці індекси вже будуть на місці.
--
-- Часткові індекси НЕ чіпаємо: вони вужчі й дешевші для гарячих
-- per-user читань, де soft-deleted рядки відсікаються. Тут додається
-- другий, беззастережний — рівно під каскад.
--
-- Rollback — `142_cascade_user_id_indexes.down.sql` (local-only).

CREATE INDEX IF NOT EXISTS finyk_assets_user_cascade_idx             ON finyk_assets (user_id);
CREATE INDEX IF NOT EXISTS finyk_budgets_user_cascade_idx            ON finyk_budgets (user_id);
CREATE INDEX IF NOT EXISTS finyk_custom_categories_user_cascade_idx  ON finyk_custom_categories (user_id);
CREATE INDEX IF NOT EXISTS finyk_debts_user_cascade_idx              ON finyk_debts (user_id);
CREATE INDEX IF NOT EXISTS finyk_manual_expenses_user_cascade_idx    ON finyk_manual_expenses (user_id);
CREATE INDEX IF NOT EXISTS finyk_receivables_user_cascade_idx        ON finyk_receivables (user_id);
CREATE INDEX IF NOT EXISTS finyk_subscriptions_user_cascade_idx      ON finyk_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS finyk_tx_filters_user_cascade_idx         ON finyk_tx_filters (user_id);
CREATE INDEX IF NOT EXISTS fizruk_custom_exercises_user_cascade_idx  ON fizruk_custom_exercises (user_id);
CREATE INDEX IF NOT EXISTS fizruk_workout_templates_user_cascade_idx ON fizruk_workout_templates (user_id);
CREATE INDEX IF NOT EXISTS nutrition_recipes_user_cascade_idx        ON nutrition_recipes (user_id);
CREATE INDEX IF NOT EXISTS push_devices_user_cascade_idx             ON push_devices (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_cascade_idx       ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS routine_categories_user_cascade_idx       ON routine_categories (user_id);
CREATE INDEX IF NOT EXISTS routine_habits_user_cascade_idx           ON routine_habits (user_id);
CREATE INDEX IF NOT EXISTS routine_tags_user_cascade_idx             ON routine_tags (user_id);
CREATE INDEX IF NOT EXISTS silpo_oauth_state_user_cascade_idx        ON silpo_oauth_state (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_user_cascade_idx            ON subscriptions (user_id);

-- Окремо від каскаду: `stripeLifecycle` шукає підписку за
-- `(provider, provider_customer_id)` на КОЖЕН dunning-вебхук
-- (`payment_intent.payment_failed`, `charge.failed`), а жоден наявний
-- індекс цього не покриває — лише `UNIQUE(id)`, частковий
-- `UNIQUE(user_id) WHERE status IN (…)` і частковий
-- `UNIQUE(apple_original_transaction_id)`. Тобто seq scan + sort на
-- платіжному шляху.
CREATE INDEX IF NOT EXISTS subscriptions_provider_customer_idx
  ON subscriptions (provider, provider_customer_id);

-- Той самий клас: крон синку Сільпо щотіка робить
-- `WHERE status = 'connected' AND (last_sync_at IS NULL OR last_sync_at < …)
--  ORDER BY last_sync_at ASC NULLS FIRST LIMIT $1`, маючи з індексів лише
-- PK по `user_id` — тобто seq scan + sort на кожному тіку.
CREATE INDEX IF NOT EXISTS silpo_connection_due_idx
  ON silpo_connection (last_sync_at ASC NULLS FIRST)
  WHERE status = 'connected';

-- Під звірку «чи не було вже скасування для цього order_id», яку LiqPay-гілка
-- робить ПЕРЕД кожною активацією (захист від порядку reversed → success:
-- скасування, що прийшло раніше за оплату, раніше просто не знаходило
-- активного рядка і зникало без сліду, а наступний success видавав місяць
-- Pro). Без цього індексу кожна активація сканує таблицю вебхук-подій по
-- JSONB-виразу; зараз обсяг малий, але росте він рівно з платіжним
-- трафіком — тобто саме тоді, коли затримка найдорожча.
CREATE INDEX IF NOT EXISTS billing_webhook_events_order_id_idx
  ON billing_webhook_events ((payload->>'order_id'))
  WHERE provider = 'liqpay';
