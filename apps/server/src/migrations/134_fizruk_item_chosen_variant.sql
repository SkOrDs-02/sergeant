-- Migration: fizruk_item_chosen_variant
-- Created: 2026-09-02
--
-- WHY. Чек готовності перед тренуванням дає людині ДВА варіанти підходу
-- замість одного числа: плановий і другий - полегшений при поганому стані
-- або посилений при доброму. Спека
-- docs/90-work/planning/specs/fizruk-readiness-check.md фіксує рішення
-- founder-а: застосунок не вирішує за людину, але ЗАПАМʼЯТОВУЄ вибір.
--
-- Без цієї колонки історія бреше рівно в той бік, якого фіча має уникати:
-- полегшене заняття виглядало б так, ніби план і був таким. Тоді «три
-- полегшення поспіль» - сигнал, на якому тримається мітигація ризику
-- «машина для відмазок», - не було б з чого порахувати.
--
-- ФОРМА. Текст, nullable, без backfill-у. NULL означає «вибору не було», а
-- не «обрано планове», і ця різниця робоча: лічильник полегшень читає NULL
-- як planned і стрічку ОБРИВАЄ, тобто історія до появи готовності не може
-- випадково додати сигнал, якого людина не давала.
--
-- CHECK замість enum-типу: домен малий і стабільний, а окремий тип у
-- Postgres дорожче міняти, ніж обмеження. Additive-only, тож двофазність
-- (Hard Rule #4) тут не потрібна - нічого не дропаємо.

ALTER TABLE fizruk_workout_items
  ADD COLUMN IF NOT EXISTS chosen_variant TEXT;

ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT IF EXISTS fizruk_workout_items_chosen_variant_check;

ALTER TABLE fizruk_workout_items
  ADD CONSTRAINT fizruk_workout_items_chosen_variant_check
  CHECK (chosen_variant IS NULL
         OR chosen_variant IN ('planned', 'easier', 'harder'));
