-- Migration: nutrition_goal_periods
-- Created: 2026-07-25
--
-- 087: Append-only журнал цілей КБЖВ. Хвиля 1, СТАДІЯ 1 задачі
-- W1-KBJU-APPEND (`docs/90-work/planning/product-knowledge-backlog.md`).
--
-- Контекст
-- --------
-- Ціль КБЖВ сьогодні — чотири скалярні поля в одному МУТАБЕЛЬНОМУ JSONB-блобі
-- (`nutrition_prefs.prefs_json` -> `dailyTargetKcal` / `dailyTargetProtein_g` /
-- `dailyTargetFat_g` / `dailyTargetCarbs_g` + `waterGoalMl`). Один рядок на
-- юзера, PK = `user_id`; запис іде per-row LWW-UPDATE-ом
-- (`applyNutritionPrefs`, `apps/server/src/modules/sync/nutrition/applySync.ts`),
-- який ЗАТИРАЄ попереднє значення без сліду.
--
-- Наслідок (audit E-1, `docs/90-work/audits/product-knowledge-nutrition.md`):
-- усі ретроспективні читачі (тижневий дайджест, coach-снапшот, тижневий
-- графік, рекомендації, stories, mobile-дзеркала) беруть ПОТОЧНУ ціль і
-- прикладають її до МИНУЛИХ днів. Користувач, що місяць їв на 2400 і сів на
-- сушку з 1800, бачить весь минулий місяць червоним — історія переписалась
-- заднім числом.
--
-- Ця таблиця — append-only журнал НАМІРУ користувача: кожна зміна цілі додає
-- СХОДИНКУ з датою, з якої вона діє, а не переписує попередню.
--
-- Межа стадії 1
-- -------------
-- На цій стадії журнал ПИШЕТЬСЯ (дзеркально до `prefs-upsert`, ПАРАЛЕЛЬНО, а
-- не замість), але НЕ ЧИТАЄТЬСЯ ніким. `nutrition_prefs.dailyTarget*`
-- лишається ЄДИНИМ джерелом цілі для всього UI на web і mobile. Жоден екран
-- не змінює поведінку; якщо журнал зламається — продукт не помітить. Це і є
-- критерій приймання стадії 1. Cutover 9 ретроспективних консюмерів — стадія
-- 3, і вона гейтиться відповіддю founder-а (openQuestion у беклозі).
--
-- Свідомі рішення схеми
-- ---------------------
-- 1. `id` — TEXT, а НЕ UUID. Причина та сама, що в сусідній
--    `nutrition_pantry_events` (086), плюс власна: писар — КЛІЄНТ, і його id
--    мусить бути ДЕТЕРМІНОВАНИМ, щоб повторна доставка того самого push-а
--    впала в `ON CONFLICT DO NOTHING`, а не лягла другим періодом з тими
--    самими числами. `crypto.randomUUID()` дав би дубль на кожному ретраї —
--    тобто саме ту брехню в історії, яку задача лікує. Формат клієнтського
--    id: `gp::<effective_from>::<kcal>:<p>:<f>:<c>:<water>::<deviceId>`
--    (`apps/web/src/modules/nutrition/lib/sqliteWriter/adapter.goalPeriods.ts`);
--    backfill-рядок має форму `backfill::<user_id>`.
--    НЕ «наводь симетрію» з `nutrition_pantries.id UUID` — саме та симетрія і
--    є відкритий баг 22P02 (`docs/90-work/tech-debt/backend.md`).
-- 2. `effective_from` — TEXT 'YYYY-MM-DD' у Kyiv-локальному дні, точно як
--    `nutrition_water_log.date_key`, а не DATE і не timestamptz. Доменний
--    інваріант: день у Sergeant — Kyiv-локальний календарний день
--    (`docs/02-engineering/architecture/domain-invariants.md`). CHECK на
--    форму — щоб клієнт з іншою доктриною не заслав ISO-instant.
-- 3. `origin` — закритий enum з ОБОВ'ЯЗКОВИМ 'backfill'. Це не декорація:
--    backfill-рядок каже «ми НЕ ЗНАЄМО, що було насправді, ми припустили
--    сьогоднішнє». Без цього прапорця міграція навічно зафіксувала б рівно ту
--    брехню, яку задача лікує, — і стадія 3 не змогла б відрізнити
--    реконструкцію від факту.
-- 4. Цілі NULLABLE. `dailyTargetKcal = null` — валідний дефолт
--    (`packages/nutrition-domain/src/nutritionPrefs.ts`), і резолвер має
--    повернути «цілі немає», а не 0: нуль означав би «весь день у мінусі».
-- 5. `deleted_at` є, попри append-only. Це РЕТРАКЦІЯ помилково записаного
--    періоду (тіло рядка не переписується — резолвер просто перестає його
--    бачити), а не редагування історії. `op='update'` apply-шлях відхиляє з
--    `append_only_violation`; `op='delete'` ставить лише tombstone.
--
-- Hard Rule #4: forward-міграція чисто ADDITIVE — жодного ALTER/DROP над
-- існуючими таблицями, зокрема над `nutrition_prefs`. `.down.sql` написано,
-- але прод на нього не покладається (forward-only `db:migrate`).
--
-- Канон: docs/01-product/model/nutrition.md §4 / §12
-- Аудит: docs/90-work/audits/product-knowledge-nutrition.md § E-1 / H2

CREATE TABLE IF NOT EXISTS nutrition_goal_periods (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  effective_from  TEXT NOT NULL
                  CHECK (effective_from ~ '^\d{4}-\d{2}-\d{2}$'),
  kcal            INTEGER,
  protein_g       REAL,
  fat_g           REAL,
  carbs_g         REAL,
  water_ml        INTEGER,
  origin          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (origin IN ('manual', 'preset', 'tdee', 'backfill')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- Гарячий запит резолвера (`resolveEffectiveGoal`): «останній період
-- користувача з effective_from <= dateKey». `created_at DESC` — не прикраса,
-- а рівно той tie-break, який резолвер застосовує, коли в один день лягло
-- кілька періодів (юзер поправив ціль двічі за вечір). Префіксне сканування
-- (user_id) лишається доступним для sync-pull.
CREATE INDEX IF NOT EXISTS nutrition_goal_periods_user_effective_idx
  ON nutrition_goal_periods (user_id, effective_from DESC, created_at DESC);

-- Живі (не ретраговані) періоди користувача — форма, яку читає sync-pull.
CREATE INDEX IF NOT EXISTS nutrition_goal_periods_user_active_idx
  ON nutrition_goal_periods (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- BACKFILL — рівно один рядок на юзера, у якого ціль ВЖЕ задана.
-- ---------------------------------------------------------------------------
--
-- Історії цілей за минулі дні НЕ ІСНУЄ НІДЕ — ні в prefs, ні в op-log, ні в
-- бекапах: попередні значення затерті LWW-UPDATE-ом. Тому цей блок —
-- РЕКОНСТРУКЦІЯ, а не відновлення, і рядок чесно позначений
-- `origin='backfill'`.
--
-- Ідемпотентність. Coolify виконує міграції як `pre_deployment_command`
-- (ADR-0074) і може РЕТРАЇТИ крок. Захист подвійний:
--   * `WHERE NOT EXISTS (… WHERE g.user_id = …)` — юзер, у якого вже є хоч
--     один період (з backfill-у чи вже з клієнта), другого не отримує;
--   * `ON CONFLICT (id) DO NOTHING` на детермінованому `backfill::<user_id>`.
--
-- Предикат «має ціль» — ЛИШЕ чотири `dailyTarget*`. `waterGoalMl` свідомо НЕ
-- рахується ціллю: у нього дефолт 2000 для КОЖНОГО юзера
-- (`defaultNutritionPrefs()`), тож у предикаті він видав би backfill-рядок
-- геть усім, зокрема тим, хто цілі ніколи не ставив. Саме значення
-- `waterGoalMl` при цьому переноситься — воно частина знімка.
--
-- `effective_from` = найраніший день, за який у юзера взагалі є їжа
-- (Kyiv-локальний), fallback — день створення `nutrition_prefs`. Тобто
-- реконструйована ціль накриває всю ВІДОМУ історію юзера; альтернатива («з
-- сьогодні») лишила б увесь минулий період без цілі і зробила б майбутній
-- cutover видимим регресом рівно там, де ми нічого не знаємо.
--
-- Guarded cast: `prefs_json` — відкритий блоб, у якому історично міг лежати
-- рядок або сміття. Регексп-guard дає NULL замість `22P02` на всій міграції.
WITH raw AS (
  SELECT
    p.user_id                               AS user_id,
    p.created_at                            AS prefs_created_at,
    p.prefs_json ->> 'dailyTargetKcal'      AS kcal_txt,
    p.prefs_json ->> 'dailyTargetProtein_g' AS protein_txt,
    p.prefs_json ->> 'dailyTargetFat_g'     AS fat_txt,
    p.prefs_json ->> 'dailyTargetCarbs_g'   AS carbs_txt,
    p.prefs_json ->> 'waterGoalMl'          AS water_txt
  FROM nutrition_prefs p
),
parsed AS (
  SELECT
    user_id,
    prefs_created_at,
    CASE WHEN kcal_txt    ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN kcal_txt::double precision    END AS kcal,
    CASE WHEN protein_txt ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN protein_txt::double precision END AS protein_g,
    CASE WHEN fat_txt     ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN fat_txt::double precision     END AS fat_g,
    CASE WHEN carbs_txt   ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN carbs_txt::double precision   END AS carbs_g,
    CASE WHEN water_txt   ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN water_txt::double precision   END AS water_ml
  FROM raw
)
INSERT INTO nutrition_goal_periods
  (id, user_id, effective_from, kcal, protein_g, fat_g, carbs_g, water_ml,
   origin, created_at, updated_at)
SELECT
  'backfill::' || s.user_id,
  s.user_id,
  COALESCE(
    (SELECT to_char(MIN(m.eaten_at AT TIME ZONE 'Europe/Kyiv'), 'YYYY-MM-DD')
       FROM nutrition_meals m
      WHERE m.user_id = s.user_id
        AND m.deleted_at IS NULL),
    to_char(s.prefs_created_at AT TIME ZONE 'Europe/Kyiv', 'YYYY-MM-DD')
  ),
  ROUND(s.kcal)::INTEGER,
  s.protein_g::REAL,
  s.fat_g::REAL,
  s.carbs_g::REAL,
  ROUND(s.water_ml)::INTEGER,
  'backfill',
  s.prefs_created_at,
  s.prefs_created_at
FROM parsed s
WHERE (
        (s.kcal      IS NOT NULL AND s.kcal      > 0)
     OR (s.protein_g IS NOT NULL AND s.protein_g > 0)
     OR (s.fat_g     IS NOT NULL AND s.fat_g     > 0)
     OR (s.carbs_g   IS NOT NULL AND s.carbs_g   > 0)
      )
  AND NOT EXISTS (
        SELECT 1 FROM nutrition_goal_periods g WHERE g.user_id = s.user_id
      )
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE nutrition_goal_periods IS
  'Append-only ledger of KBJU goal steps. A row says "from this Kyiv-local day onward the user intended these targets". WRITTEN but NOT READ as of stage 1 (W1-KBJU-APPEND): nutrition_prefs.prefs_json dailyTarget* stays the single source of truth for every screen on web and mobile. Never UPDATE a row here - the sync apply-path rejects op=update with reason append_only_violation; op=delete only sets deleted_at (retraction of a mis-recorded period). id is TEXT (not UUID) on purpose: the client mints a DETERMINISTIC id so a re-delivered push is a no-op instead of a duplicate period. Canon: docs/01-product/model/nutrition.md section 4 and section 12. Audit: docs/90-work/audits/product-knowledge-nutrition.md section E-1.';

COMMENT ON COLUMN nutrition_goal_periods.effective_from IS
  'Kyiv-local day key YYYY-MM-DD from which this goal applies, same shape as nutrition_water_log.date_key. The resolver picks the latest period with effective_from <= the day being rendered.';

COMMENT ON COLUMN nutrition_goal_periods.origin IS
  'How the row came to be: manual | preset | tdee | backfill. backfill means RECONSTRUCTED by migration 087 - we do not know what the goal actually was on those days, we assumed the current one. Stage 3 consumers must be able to tell a reconstruction from a fact.';

COMMENT ON COLUMN nutrition_goal_periods.kcal IS
  'Daily kcal target, NULLABLE. NULL means "no goal set" and must resolve to "no percentage shown", never to 0 - zero would paint every past day as a blown budget.';

COMMENT ON COLUMN nutrition_goal_periods.deleted_at IS
  'Retraction tombstone for a mis-recorded period. The resolver skips tombstoned rows; the row body is never rewritten.';
