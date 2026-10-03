-- Відкат 146: прибрати додані колонки заміру тіла.
--
-- Дані в них при відкаті втрачаються — це не обхідний шлях, а суть
-- відкату additive-міграції. Перед прогоном на проді зніми дамп
-- fizruk_measurements.
ALTER TABLE fizruk_measurements
  DROP COLUMN IF EXISTS body_fat_pct,
  DROP COLUMN IF EXISTS neck_cm,
  DROP COLUMN IF EXISTS bicep_l_cm,
  DROP COLUMN IF EXISTS bicep_r_cm,
  DROP COLUMN IF EXISTS forearm_l_cm,
  DROP COLUMN IF EXISTS forearm_r_cm,
  DROP COLUMN IF EXISTS thigh_l_cm,
  DROP COLUMN IF EXISTS thigh_r_cm,
  DROP COLUMN IF EXISTS calf_l_cm,
  DROP COLUMN IF EXISTS calf_r_cm;
