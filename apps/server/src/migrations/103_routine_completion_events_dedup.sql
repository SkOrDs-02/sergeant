-- Migration: routine_completion_events_dedup
-- Created: 2026-08-04
--
-- Cleanup для беклог-пастки #1 (W1-ROUTINE-APPEND, `docs/90-work/planning/
-- product-knowledge-backlog.md`): `buildCompletionEventId` (packages/
-- routine-domain/src/completionEvents.ts, до цього PR) вбудовував
-- `occurred_at` у сам `id`. Write-path (`adapter.completionEvents.ts`, web
-- і mobile) подає `occurredAt = clientTs` — таймстемп МОМЕНТУ ЗАПИСУ, а не
-- моменту реальної дії користувача, бо `RoutineState.completions` не несе
-- таймстемп на відмітку. Наслідок: кожен холодний старт (`saveRoutineState`
-- дифить порожній `prev` проти завантаженого `next`) перечитував кожну
-- наявну відмітку як свіжий `add` і штампував НОВИЙ `id` — той самий факт
-- «звичка X у день Y відмічена на пристрої Z» накопичувався в журналі як
-- N рядків, N = кількість холодних стартів.
--
-- Цей PR прибрав `occurred_at` із ключа (`buildCompletionEventId` тепер:
-- `habit_id | date_key | state | device_id`), тож НОВІ записи більше не
-- дублюються. Але рядки, які прод уже накопичив ДО фіксу, лишаються під
-- старими `id` — новий код їх не бачить (інший рядок PK) і не чіпає.
-- Ця міграція одноразово прибирає той накопичений дубляж.
--
-- Що робить (усередині DO-блоку, ідемпотентно):
--   1. Групує рядки за НОВИМ природним ключем — `(habit_id, date_key,
--      state, COALESCE(device_id, '-'))` — і в кожній групі лишає рядок з
--      НАЙРАНІШИМ `occurred_at` (tie-break — менший `id`), видаляючи решту.
--      Найраніший `occurred_at` = момент першого реального холодного
--      старту, найближчий до справжньої дії користувача.
--   2. Перезаписує `id` рядка, що вижив, на формат нового ключа. Без
--      цього кроку рядок лишився б зі СТАРИМ `id`, і перший-ліпший
--      наступний холодний старт (уже на пофіксованому клієнті) створив би
--      ЩЕ ОДИН рядок для того самого факту — новий `id` не збігся б зі
--      старим PK. Крок 2 виконується ПІСЛЯ дедуплікації, тому кожна група
--      на момент UPDATE містить рівно один рядок — конфлікту унікальності
--      бути не може.
--
-- Ідемпотентність: другий прогін бачить, що кожна група вже містить один
-- рядок з уже-новим `id` → DELETE і UPDATE обидва зачіпають 0 рядків.
--
-- Типовий обсяг на прод-БД: беклог-аудит оцінює дублікати в межах
-- «кількість холодних стартів на активного юзера відколи 085 задеплоєно» —
-- для типового юзера це одноцифрове число зайвих рядків на кожну реально
-- відмічену звичку-день; повний масштаб треба виміряти запитом нижче
-- ПЕРЕД прогоном у проді (див. PR-нотатку):
--
--   SELECT COUNT(*) - COUNT(DISTINCT (habit_id, date_key, state,
--          COALESCE(device_id, '-')))
--   FROM routine_completion_events;
--
-- Це число рядків, які ця міграція видалить. Скрипт НЕ запускався проти
-- жодної бази як частина цього PR (беклог-пастка #1 задача 4 — «підготувати,
-- не виконувати»).
--
-- NO_ROLLBACK: DELETE у кроці 1 незворотно втрачає рядки-дублікати —
-- відновити їх нема звідки, вони й були зайвими копіями того самого факту.
-- (due: 2026-08-18)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'routine_completion_events'
  ) THEN

    -- Крок 1: лишити по одному рядку на новий природний ключ, найраніший
    -- `occurred_at` виграє (tie-break — менший `id`, детерміновано).
    DELETE FROM routine_completion_events e
    USING (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY habit_id, date_key, state, COALESCE(device_id, '-')
          ORDER BY occurred_at ASC, id ASC
        ) AS rn
      FROM routine_completion_events
    ) ranked
    WHERE e.id = ranked.id
      AND ranked.rn > 1;

    -- Крок 2: перезаписати `id` рядка, що вижив, у формат нового ключа,
    -- щоб майбутні холодні старти колізували через PK, а не плодили ще
    -- один дублікат зі старим-форматним сусідом.
    UPDATE routine_completion_events
    SET id = habit_id || '|' || date_key || '|' || state
             || '|' || COALESCE(device_id, '-')
    WHERE id <> habit_id || '|' || date_key || '|' || state
                 || '|' || COALESCE(device_id, '-');

  END IF;
END $$;
