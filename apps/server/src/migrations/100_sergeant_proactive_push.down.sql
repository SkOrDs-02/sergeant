-- Down для 100_sergeant_proactive_push.sql
--
-- Усі три зміни адитивні, тож відкат безпечний. Прохід підштовхувань без
-- `last_seen_at` не має за чим відрізнити відсутнього юзера від присутнього
-- і не шле нічого — деградація у тишу, не у спам.
--
-- Слід надісланих пушів лежить у `push_reminder_log` (міграція 099) і тут
-- НЕ чіпається: та таблиця обслуговує ще й нагадування трьох модулів.

ALTER TABLE user_preferences DROP COLUMN IF EXISTS sergeant_nudges;

DROP TABLE IF EXISTS sergeant_nudge_cache;

DROP INDEX IF EXISTS idx_user_last_seen_at;

ALTER TABLE "user" DROP COLUMN IF EXISTS last_seen_at;
