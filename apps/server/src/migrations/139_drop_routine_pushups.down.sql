-- 139 down: повернути порожню `routine_pushups` тієї ж форми, що в 050
-- (+ CHECK на формат day key з 110), щоб down-ланцюжок 110 → 050 мав на що
-- спиратись. Дані не відновлюються: єдина жива копія історії — це вже
-- `fizruk_workouts` (див. 140), і саме її down 140 розкладає назад у
-- `fizruk_pushups`.

CREATE TABLE IF NOT EXISTS routine_pushups (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date_key    TEXT NOT NULL,
  reps        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date_key)
);

-- Guard, як у 049/059/077: `ADD CONSTRAINT` не має `IF NOT EXISTS`, тож
-- без нього другий прогін цього down падав на «already exists» —
-- rollback-sanity › «every down.sql is idempotent» ловив саме це.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'routine_pushups_date_key_format_check'
  ) THEN
    ALTER TABLE routine_pushups
      ADD CONSTRAINT routine_pushups_date_key_format_check
      CHECK (date_key ~ '^\d{4}-\d{2}-\d{2}$');
  END IF;
END $$;
