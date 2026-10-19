-- Відкат 156: прибирає колонку deleted_at з чотирьох finyk-таблиць.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).
-- Tombstone-рядки після відкату стають живими (колонку, що їх відрізняла,
-- знято) — спершу фізично видаляємо їх, щоб видалене не воскресло.

-- Ідемпотентно (rule #4): повторний прогін після зняття колонки не падає,
-- бо DELETE виконується лише для таблиць, де `deleted_at` ще є.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finyk_tx_categories',
    'finyk_tx_splits',
    'finyk_mono_debt_links',
    'finyk_networth_history'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = t
        AND column_name = 'deleted_at'
    ) THEN
      EXECUTE format('DELETE FROM %I WHERE deleted_at IS NOT NULL', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE finyk_networth_history DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE finyk_mono_debt_links DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE finyk_tx_splits DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE finyk_tx_categories DROP COLUMN IF EXISTS deleted_at;
