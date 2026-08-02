-- Migration: fizruk_injuries
-- Created: 2026-08-01
--
-- Модель «не можна» (ADR-0083): користувач позначає травмовану зону, і recovery
-- перестає рекомендувати вправи, що її навантажують. До цієї міграції поняття
-- травми в домені не існувало взагалі — `computeRecoveryBy` знижував статус за
-- втомою й давністю, тож щойно травмований м'яз, який формально «відпочив»,
-- потрапляв назад у поради (аудит fizruk, напруга 3).
--
-- `site` ширший за 18 м'язових груп atlas і включає суглоби та відділи хребта
-- (knee, elbow, shoulder, wrist, hip, ankle, achilles, spine-lumbar,
-- spine-cervical). Причина — аудит E-4: м'язова модель фізично не може назвати
-- те, що болить у лифтера, і звітує «травму враховано», лишаючи вправу в
-- порадах. Це найгірший вид провалу safety-фічі — хибне відчуття захисту.
--
-- Без CHECK на `site`: словник живе в
-- packages/fizruk-domain/src/data/injurySites.ts і буде розширюватись (зони —
-- додавати дешево). CHECK у БД зробив би кожне розширення міграцією, а
-- нерозпізнаний site клієнт і так відкидає (`isInjurySiteId` усередині
-- `activeInjurySites`), тож невідоме значення деградує в «не блокує», а не в
-- помилку.

CREATE TABLE fizruk_injuries (
  -- TEXT, а НЕ uuid. Клієнт генерує id з доменним префіксом (`inj_<uuid>`),
  -- як і решта fizruk-сутностей. Оголошення колонки як `uuid` дало б 22P02 на
  -- кожному push і `apply_failed`, що осідає в клієнтському sync_op_outbox і
  -- нікуди не спливає — рівно той баг, який міграції 094/095 щойно прибрали в
  -- routine і nutrition. Не повторюємо.
  id            TEXT PRIMARY KEY,
  -- Better Auth user id — непрозорий рядок, не uuid.
  user_id       TEXT NOT NULL,
  -- Ключ зі спільного keyspace InjurySiteId (м'яз atlas або суглоб/відділ).
  site          TEXT NOT NULL,
  -- Коли почалось. Ставить клієнт; сервер не перевизначає, бо позначку могли
  -- завести заднім числом.
  started_at    TIMESTAMPTZ NOT NULL,
  -- NULL = позначка активна. Зняття — ЛИШЕ ручна дія користувача: канон
  -- fizruk §5 каже «до зняття позначки», тож авто-експірації немає. Відомий
  -- наслідок (ADR-0083 § Наслідки): забуту позначку ніщо не ревізитує, і зона
  -- мовчки випадає з порад назавжди.
  cleared_at    TIMESTAMPTZ,
  -- Вільний текст користувача про травму. NOT NULL DEFAULT '' — дзеркалить
  -- `notes` у fizruk_wellbeing, щоб клієнтський діф не мусив розрізняти
  -- «порожньо» і «немає».
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Soft-delete для LWW-синку, як у решти fizruk-таблиць.
  deleted_at    TIMESTAMPTZ
);

-- Гаряча вибірка одна: «всі активні позначки цього користувача» — її робить
-- кожен рендер списку вправ, тож індекс частковий і покриває обидві умови.
CREATE INDEX fizruk_injuries_user_active_idx
  ON fizruk_injuries (user_id, site)
  WHERE deleted_at IS NULL AND cleared_at IS NULL;

-- Історія позначок по зоні (екран «що болить» + майбутній ревізит забутих).
CREATE INDEX fizruk_injuries_user_started_at_idx
  ON fizruk_injuries (user_id, started_at DESC)
  WHERE deleted_at IS NULL;
