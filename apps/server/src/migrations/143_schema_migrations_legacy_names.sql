-- 143_schema_migrations_legacy_names.sql
--
-- Прибирає з леджера `schema_migrations` три рядки під СТАРИМИ іменами, що
-- лишились у проді після переїзду репозиторію.
--
-- ЩО ВИЯВЛЕНО (Sentry, подія 2026-09-17T07:10:05Z, реліз sergeant@cd98594):
--   applied = 144, shipped = 143, pending = [141, 142]
--   unknown = [047_tg_topic_archive.sql,
--              096_fizruk_injuries.sql,
--              097_finyk_fizruk_pk_text.sql]
--
-- Арифметика замикається: matched = shipped - pending = 141, а 141 + 3 unknown
-- = 144 applied. Тобто всі три ТЕПЕРІШНІ імена (`048_tg_topic_archive.sql`,
-- `096_finyk_fizruk_pk_text.sql`, `097_fizruk_injuries.sql`) у леджері ВЖЕ Є —
-- отже той самий DDL зареєстровано двічі, під двома іменами. Пронесло лише
-- тому, що ці міграції ідемпотентні; на неідемпотентній парі другий прогін
-- поклав би деплой.
--
-- ЧОМУ ЦЕ ТРЕБА ЛІКУВАТИ, А НЕ ІГНОРУВАТИ. `lib/schemaDrift.ts` існує заради
-- одного сигналу: непорожній `unknown`/`pending` = схема образу розійшлась зі
-- схемою бази. Поки три легасі-рядки сидять у леджері вічно, `unknown` НІКОЛИ
-- не буває порожнім, тобто сигнал константний — а константний сигнал не несе
-- інформації. Через це ж не можна ввімкнути `MIGRATION_DRIFT_BLOCKS_READINESS`:
-- гейт відкидав би кожен деплой. Це рівно стан «червоний завжди = вимкнений»,
-- яким у цьому репо вже двічі обґрунтовано ратчети бандл-бюджетів.
--
-- БЕЗПЕКА. Рядок ВИДАЛЯЄТЬСЯ лише тоді, коли його теперішній відповідник уже в
-- леджері; інакше ПЕРЕЙМЕНОВУЄТЬСЯ зі збереженням `applied_at`. Тобто факт
-- «цей DDL виконано» не втрачається за жодного стану бази, і раннер ніколи не
-- спробує виконати той самий DDL удруге. На свіжій базі легасі-імен немає —
-- обидві гілки no-op.

-- ЧОМУ ВСЕ ТІЛО В `DO`-БЛОЦІ ПІД `to_regclass`. `schema_migrations` — таблиця
-- РАННЕРА (`db.ts::ensureSchema`), а не міграцій: жоден `.sql` її не створює.
-- Більшість тестових гарнесів (`test/createIntegrationApp.ts::runMigrations`,
-- `transcribe-usd-cap.e2e.test.ts`) прогонять `.sql`-файли напряму по свіжій
-- базі й леджера не заводять взагалі. Ця міграція — перша, що на нього
-- посилається, тож без guard-а вона валить КОЖЕН такий гарнес із 42P01
-- (спіймано CI на PR #101, відтворено локально).
--
-- Guard, а не `IF EXISTS`-варіант: сама відсутність леджера тут не помилка, а
-- законний стан («цю базу веде не раннер»), і в ньому правильна дія — нічого
-- не робити.
DO $migration_143$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE NOTICE '143: schema_migrations немає — базу веде не раннер, пропускаю';
    RETURN;
  END IF;

  -- 1. Дублікати: теперішнє ім'я вже зареєстроване, легасі-рядок зайвий.
  DELETE FROM schema_migrations AS legacy
   WHERE legacy.name IN (
           '047_tg_topic_archive.sql',
           '096_fizruk_injuries.sql',
           '097_finyk_fizruk_pk_text.sql'
         )
     AND EXISTS (
           SELECT 1
             FROM schema_migrations AS present
            WHERE present.name = CASE legacy.name
                    WHEN '047_tg_topic_archive.sql'     THEN '048_tg_topic_archive.sql'
                    WHEN '096_fizruk_injuries.sql'      THEN '097_fizruk_injuries.sql'
                    WHEN '097_finyk_fizruk_pk_text.sql' THEN '096_finyk_fizruk_pk_text.sql'
                  END
         );

  -- 2. Одинаки: теперішнього імені в леджері немає — переносимо запис на нього.
  UPDATE schema_migrations AS legacy
     SET name = CASE legacy.name
                  WHEN '047_tg_topic_archive.sql'     THEN '048_tg_topic_archive.sql'
                  WHEN '096_fizruk_injuries.sql'      THEN '097_fizruk_injuries.sql'
                  WHEN '097_finyk_fizruk_pk_text.sql' THEN '096_finyk_fizruk_pk_text.sql'
                END
   WHERE legacy.name IN (
           '047_tg_topic_archive.sql',
           '096_fizruk_injuries.sql',
           '097_finyk_fizruk_pk_text.sql'
         );
END
$migration_143$;
