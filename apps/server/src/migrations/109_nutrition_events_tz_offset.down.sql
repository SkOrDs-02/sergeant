-- Down для 109_nutrition_events_tz_offset.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Знімає обидві нові колонки і повертає COMMENT на
-- `effective_from` до тексту з 087 (Kyiv-local formulation), щоб
-- rollback-sanity drill побачив ідентичний schema fingerprint.

COMMENT ON COLUMN nutrition_goal_periods.effective_from IS
  'Kyiv-local day key YYYY-MM-DD from which this goal applies, same shape as nutrition_water_log.date_key. The resolver picks the latest period with effective_from <= the day being rendered.';

ALTER TABLE nutrition_goal_periods
  DROP COLUMN IF EXISTS tz_offset_min;

ALTER TABLE nutrition_pantry_events
  DROP COLUMN IF EXISTS tz_offset_min;
