-- Відкат 138: прибрати сліди останнього провалу синку Сільпо.
--
-- Дані тут похідні (їх наново напише перший же невдалий синк), тож
-- двофазність не потрібна: колонки читає лише serializer sync-state.

ALTER TABLE silpo_connection
  DROP COLUMN IF EXISTS last_error_code,
  DROP COLUMN IF EXISTS last_failed_at;
