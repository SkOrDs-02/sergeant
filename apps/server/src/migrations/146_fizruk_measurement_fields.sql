-- 146: решта полів заміру тіла у `fizruk_measurements`.
--
-- Контекст: таблиця несла вісім числових колонок — рівно ті, що доменний
-- реєстр `MEASUREMENT_FIELDS` (packages/fizruk-domain) навмисно звузив до
-- «високосигнальних» для мобільного порту. Веб-форма при цьому лишилась
-- ширшою: `MEASURE_FIELDS` у apps/web/src/modules/fizruk/hooks/useMeasurements.ts
-- збирає чотирнадцять полів. Шість із них (жир, шия, передпліччя, стегно,
-- литка) плюс розділені ліва/права біцепси не мали куди писатись, тож
-- користувач їх вводив, а після перезавантаження вони зникали: читання
-- Фізрука йде з SQLite-дзеркала цієї таблиці. Знайдено 2026-09-22 під час
-- фіксу бекапу Фізрука.
--
-- Additive-зміна: лише ADD COLUMN, двофазний DROP (Hard Rule #4) не
-- потрібен. `bicep_cm` СВІДОМО лишається — це поле доменного й мобільного
-- реєстру; веб пише і його (зведене значення), і нову пару L/R, тож старі
-- читачі не ламаються.
--
-- REAL, а не INTEGER: заміри дробові (81.4 кг, 18.5 % жиру). Та сама
-- причина, що в AI-DANGER-коментарі `upsertMeasurement`
-- (apps/web/src/modules/fizruk/lib/sqliteWriter/adapter.ts) — округлення
-- давало б різні значення на пристрої та на сервері й фліпало LWW.
ALTER TABLE fizruk_measurements
  ADD COLUMN IF NOT EXISTS body_fat_pct REAL,
  ADD COLUMN IF NOT EXISTS neck_cm      REAL,
  ADD COLUMN IF NOT EXISTS bicep_l_cm   REAL,
  ADD COLUMN IF NOT EXISTS bicep_r_cm   REAL,
  ADD COLUMN IF NOT EXISTS forearm_l_cm REAL,
  ADD COLUMN IF NOT EXISTS forearm_r_cm REAL,
  ADD COLUMN IF NOT EXISTS thigh_l_cm   REAL,
  ADD COLUMN IF NOT EXISTS thigh_r_cm   REAL,
  ADD COLUMN IF NOT EXISTS calf_l_cm    REAL,
  ADD COLUMN IF NOT EXISTS calf_r_cm    REAL;

COMMENT ON COLUMN fizruk_measurements.bicep_cm IS
  'Зведений обхват біцепса — поле доменного/мобільного реєстру MEASUREMENT_FIELDS. Веб пише його разом із парою bicep_l_cm/bicep_r_cm.';
