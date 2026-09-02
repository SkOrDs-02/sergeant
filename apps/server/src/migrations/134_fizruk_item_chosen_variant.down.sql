-- Down migration: fizruk_item_chosen_variant
--
-- Знімає обмеження й колонку. Вибір варіанта втрачається назавжди: дзеркала
-- в нього немає, а відновити його з ваги підходу неможливо - полегшений
-- варіант і свідомо взята менша вага виглядають у даних однаково. Це
-- очікувана ціна відкоту, а не недогляд.

ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT IF EXISTS fizruk_workout_items_chosen_variant_check;

ALTER TABLE fizruk_workout_items
  DROP COLUMN IF EXISTS chosen_variant;
