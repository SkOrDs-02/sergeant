-- 124 down: generic_foods.
--
-- Локальний rollback (Hard Rule #4) — прод `.down.sql` не запускає.
--
-- Дані відтворювані повністю: корпус живе в коді
-- (`packages/shared/src/data/genericFoods.ts`) і засівається ідемпотентно,
-- тож втрата таблиці означає лише повторний посів, а не втрату знання.
-- Нічого користувацького тут немає за визначенням.
--
-- `pg_trgm` не чіпаємо: його створює міграція 123 і ним користується
-- product_catalog.

DROP TABLE IF EXISTS generic_foods CASCADE;
