-- 130: `sources` для `nutrition_pantry_items` — картка продукту комори.
--
-- WHY. Комора зберігала назву рівно так, як її надрукували в чеку, тож
-- перша покупка задавала імʼя позиції назавжди: «Молоко Яготинське 2.6%
-- 900г» і «Молоко Галичина 1%» лягали двома рядками, бо жодна назва не є
-- підмножиною іншої. Спека
-- `docs/90-work/planning/specs/pantry-generic-names.md` згортає назву до
-- родової («Молоко»), а повні назви покупок разом із кількостями
-- переїжджають сюди — інакше жирність, сорт і бренд зникали б разом із
-- брендом, а «Молоко 2.6%» і «Молоко 1%» відрізняються калорійністю вдвічі.
--
-- ФОРМА. JSON-масив обʼєктів `{name, qty, unit, addedAt}`, серіалізований у
-- TEXT — той самий підхід, що вже несуть `nutrition_prefs.prefs_json` і
-- `nutrition_recipes.data_json`. Окрема таблиця варіантів тут була б
-- дорожчою за задачу: список читається й пишеться ЗАВЖДИ цілим разом зі
-- своєю позицією, ніколи не запитується окремо і обмежений десятьма
-- записами на позицію.
--
-- ІНВАРІАНТ (тримає застосунок, не БД). Сума `qty` варіантів дорівнює
-- `qty` позиції, і всі вони в одній базовій одиниці (`г` / `мл` / `шт`).
-- CHECK-констрейнта тут немає свідомо: перевірка вимагала б розбору JSON у
-- Postgres на кожному записі, а порушення однаково ловиться тестами домену
-- (`packages/nutrition-domain/src/pantrySources.test.ts`) до того, як рядок
-- доїде до сервера.
--
-- Additive-only (Hard Rule #4): nullable TEXT без DEFAULT. NULL означає
-- «варіантів немає» — позиція введена руками або створена до цієї міграції,
-- а не «порожній список». Старі клієнти колонки не знають і працюють як
-- раніше; наявні позиції комори не мігруються і не згортаються заднім
-- числом (рішення founder-а №5 у спеці).

ALTER TABLE nutrition_pantry_items
  ADD COLUMN IF NOT EXISTS sources TEXT;

COMMENT ON COLUMN nutrition_pantry_items.sources IS
  'JSON array of purchase variants merged into this item: [{"name","qty","unit","addedAt"}]. qty/unit are always in the base unit of their dimension (г / мл / шт) and their sum equals the item qty in that same base unit. NULL means no variants (hand-entered item, or created before migration 130) - not an empty list. Capped at 10 entries by the client. See docs/90-work/planning/specs/pantry-generic-names.md.';
