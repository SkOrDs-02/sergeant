-- Відкат 147: прибрати вотермарк-колонку `sync_op_log.tx_id`.
--
-- Перед відкатом поверни код pull-а без предиката
-- SYNC_OP_LOG_COMMITTED_WATERMARK_SQL, інакше запит упаде на відсутній
-- колонці. Без вотермарку повертається баг, який ця міграція закривала.
-- DROP COLUMN прибирає і дефолт; окремий ALTER ... DROP DEFAULT без
-- IF EXISTS падав на повторному прогоні (rollback-sanity).
ALTER TABLE sync_op_log
  DROP COLUMN IF EXISTS tx_id;
