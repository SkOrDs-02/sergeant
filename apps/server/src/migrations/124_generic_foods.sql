-- 124: generic_foods — базові продукти без штрихкоду.
--
-- ─── Навіщо окрема таблиця, а не рядки в product_catalog ─────────────
--
-- Бо третина сканів на реальній полиці штрихкодом не вирішується в
-- принципі. Вимір 2026-08-22 на 104 позиціях Novus: 35 із них мали
-- внутрішньомагазинні вагові коди (префікс 2) — огірок, кабачок,
-- нектарин, сир на вагу. Такий код генерує касовий термінал конкретної
-- мережі; `2853532000000` означає «огірок тепличний» у Novus і будь-що
-- інше в сусідньому магазині. Жоден вендор штрихкодів цього не закриє —
-- закриває тільки корпус базової їжі, який шукається НАЗВОЮ.
--
-- У `product_catalog` таким рядкам місця немає технічно: штрихкод там у
-- первинному ключі й під CHECK-ом `^[0-9]{8,14}$`. Синтетичний код був
-- би брехнею — його не існує на жодній упаковці, і він забруднив би
-- lookup сканера.
--
-- Життєвий цикл теж інший. `product_catalog` наповнюється пакетно з
-- зовнішніх джерел і росте write-through-ом зі сканів; `generic_foods` —
-- курований корпус, який редагують люди і який майже не змінюється.
-- Змішування дало б таблицю, яка не вміє жодного з двох режимів добре.
--
-- ─── Ключ: slug, а не сурогат ────────────────────────────────────────
--
-- `slug` латиницею (`cucumber`, `milk-25`) — стабільний ідентифікатор,
-- який переживає перейменування української назви. Саме він, а не
-- `name`, лягає в `nutrition_meals.food_id` при логуванні, тож
-- виправлення друкарської помилки в назві не мусить осиротити історію
-- прийомів їжі.
--
-- Латиниця навмисно: slug потрапляє в URL, ключі кешу й діагностичні
-- логи, де кирилиця перетворюється на процентні escape-послідовності і
-- перестає читатись очима.
--
-- ─── Макроси NOT NULL — на відміну від каталогу ──────────────────────
--
-- У `product_catalog` нутрієнти nullable, бо зовнішнє джерело може їх не
-- дати, і це не наша вина. Тут — навпаки: корпус курований, і позиція
-- без КБЖВ у ньому не має сенсу (її нічим залогувати). Тому NOT NULL:
-- неповний рядок має падати на INSERT-і, а не тихо потрапляти у видачу.
--
-- ─── `alcohol_g` і ворота Атвотера ───────────────────────────────────
--
-- Та сама обчислювана різниця, що в 123, і з тієї ж причини: етанол дає
-- ~7 ккал/г і не входить у білки-жири-вуглеводи. Саме на цьому корпусі
-- вада й знайшлась — рівно 6 із 390 позицій не сходились з Атвотером, і
-- всі шість виявились алкоголем (вино, пиво, горілка, віскі,
-- шампанське).
--
-- ─── Пошук ───────────────────────────────────────────────────────────
--
-- `name_norm` рахує ЗАСТОСУНОК (`buildProductSearchKey` з
-- `@sergeant/shared`), а не `lower()` — під ctype C ця функція не
-- згортає кирилицю. Повний розбір і гейт локалі — у шапці 123.
--
-- `aliases` існує тому, що людина шукає не так, як записано в каноні:
-- «помідор» проти «томат», «гриби» проти «печериці». Зберігається вже
-- нормалізованим, щоб пошук не мусив нормалізувати на льоту.

CREATE TABLE IF NOT EXISTS generic_foods (
  slug            TEXT PRIMARY KEY,

  name            TEXT NOT NULL,
  name_norm       TEXT NOT NULL,
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  category        TEXT NOT NULL,

  kcal_100g       REAL NOT NULL,
  protein_100g    REAL NOT NULL,
  fat_100g        REAL NOT NULL,
  carbs_100g      REAL NOT NULL,

  fiber_100g      REAL,
  alcohol_g       REAL,

  -- Типова порція в грамах. Не «скільки з'їдять», а з чого зручно
  -- почати редагування: 100 г для всього вагового, штучні орієнтири для
  -- того, що рахують поштучно (яйце, скибка хліба).
  default_grams   REAL NOT NULL DEFAULT 100,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  atwater_delta_kcal REAL GENERATED ALWAYS AS (
    kcal_100g::double precision
    - (4 * protein_100g::double precision
       + 9 * fat_100g::double precision
       + 4 * carbs_100g::double precision
       + 7 * COALESCE(alcohol_g, 0)::double precision)
  ) STORED,

  CONSTRAINT generic_foods_slug_check
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  CONSTRAINT generic_foods_name_check
    CHECK (length(btrim(name)) > 0),
  CONSTRAINT generic_foods_name_norm_check
    CHECK (length(btrim(name_norm)) > 0),
  CONSTRAINT generic_foods_kcal_range_check
    CHECK (kcal_100g >= 0 AND kcal_100g <= 1000),
  CONSTRAINT generic_foods_macro_range_check
    CHECK (
      protein_100g BETWEEN 0 AND 100 AND
      fat_100g     BETWEEN 0 AND 100 AND
      carbs_100g   BETWEEN 0 AND 100 AND
      (fiber_100g IS NULL OR fiber_100g BETWEEN 0 AND 100) AND
      (alcohol_g  IS NULL OR alcohol_g  BETWEEN 0 AND 100)
    ),
  CONSTRAINT generic_foods_default_grams_check
    CHECK (default_grams > 0 AND default_grams <= 10000)
);

-- Пошук назвою — той самий двоканальний матч, що в каталозі
-- (підрядок + word_similarity), тож індекс той самий за формою.
CREATE INDEX IF NOT EXISTS generic_foods_name_trgm_idx
  ON generic_foods USING GIN (name_norm gin_trgm_ops);

-- Пошук за синонімом: «помідор» має знаходити «Томат».
CREATE INDEX IF NOT EXISTS generic_foods_aliases_idx
  ON generic_foods USING GIN (aliases);

-- Групування видачі за категорією + стабільний порядок усередині.
CREATE INDEX IF NOT EXISTS generic_foods_category_idx
  ON generic_foods (category, name);

COMMENT ON TABLE generic_foods IS
  'Курований корпус базової їжі без штрихкоду — те, що ним не вирішується в принципі: овочі й фрукти на вагу, сир із прилавка, домашні страви. На реальній полиці це третина позицій (вимір 2026-08-22: 35 зі 104 мали внутрішньомагазинні вагові коди). Окремо від product_catalog: там штрихкод у PK, інший життєвий цикл і nullable-нутрієнти.';

COMMENT ON COLUMN generic_foods.slug IS
  'Стабільний латинський ідентифікатор. Саме він лягає в nutrition_meals.food_id, тож перейменування української назви не осиротить історію прийомів їжі. Латиниця — бо slug потрапляє в URL, ключі кешу й логи, де кирилиця стає нечитабельними escape-послідовностями.';

COMMENT ON COLUMN generic_foods.aliases IS
  'Нормалізовані синоніми для пошуку: людина шукає не так, як записано в каноні («помідор» проти «томат»). Зберігається вже нормалізованим тим самим buildProductSearchKey, щоб не нормалізувати на льоту в кожному запиті.';

COMMENT ON COLUMN generic_foods.atwater_delta_kcal IS
  'Ті самі ворота якості, що в product_catalog: kcal − (4·білки + 9·жири + 4·вуглеводи + 7·спирт). Тут вони страхують від друкарської помилки куратора, а не від битого зовнішнього джерела. Саме на цьому корпусі й знайшлась потреба у доданку зі спиртом — 6 із 390 позицій не сходились, і всі шість були алкоголем.';
