-- Down migration: routine_streaks_phantom_docs
--
-- Ідемпотентний rollback для `084_routine_streaks_phantom_docs.sql`.
-- Повертає COMMENT ON TABLE до тексту з `026_routine_tables.sql` і знімає
-- коментарі стовпців (до 084 їх не було). Форму таблиці ні up, ні down не
-- змінюють. Production ніколи не запускає `.down.sql` — local-rollback only
-- (див. db.ts → runPendingSqlMigrations).

COMMENT ON TABLE routine_streaks IS
  'Per-user aggregated streak metrics (Stage 2 / PR #020). One row per user.';

COMMENT ON COLUMN routine_streaks.current_streak IS NULL;

COMMENT ON COLUMN routine_streaks.longest_streak IS NULL;
