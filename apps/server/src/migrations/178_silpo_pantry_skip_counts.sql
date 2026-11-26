-- 178: памʼять про продукти, які людина зазвичай не додає в комору з чеків Сільпо.
--
-- Спека: docs/work/specs/silpo-pantry-confirm.md, § Рішення дизайну,
-- «Навчання "зазвичай не додаєш"». Рішення власника 2026-11-26: продукт, з
-- якого людина тричі поспіль зняла галочку в аркуші чека, далі пропонується
-- без галочки на всіх її пристроях.
--
-- Рядок на продукт: `product_key` - родова назва, якою аркуш згортає позицію
-- в комору (клієнт рахує її з назви з чека). `consecutive_skips` росте на 1
-- за кожне ручне зняття галочки, додавання продукту видаляє рядок (лічильник
-- знову 0). Читає і пише лише сервер (`/api/silpo/pantry-skips`).
--
-- Additive, single-phase (Hard Rule #4): нова порожня таблиця, старий код її
-- не читає. Окремого індексу немає: PK `(user_id, product_key)` покриває і
-- вибірку всіх рядків людини, і точковий upsert. Повторний прогін no-op.

CREATE TABLE IF NOT EXISTS silpo_pantry_skip_counts (
  user_id           TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  product_key       TEXT NOT NULL
    CONSTRAINT silpo_pantry_skip_counts_key_check CHECK (char_length(product_key) BETWEEN 1 AND 200),
  consecutive_skips INT NOT NULL DEFAULT 0
    CONSTRAINT silpo_pantry_skip_counts_skips_check CHECK (consecutive_skips >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_key)
);

COMMENT ON TABLE silpo_pantry_skip_counts IS
  'Скільки разів поспіль людина зняла галочку з продукту в аркуші чека Сільпо. Від 3 продукт пропонується без галочки («зазвичай не додаєш»). Спека silpo-pantry-confirm.md.';
