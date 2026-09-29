-- 151: автоімпорт чеків Сільпо в комору + позначка «вже в коморі».
-- Spec: docs/work/specs/silpo-pantry-auto-import.md
--
-- Три колонки, жодного ALTER над форматом наявних. Additive, single-phase.
--
-- `silpo_receipt_items.pantry_claimed_at` - атомарне бронювання (спека
-- § «Позначка живе на сервері, з атомарним бронюванням»): клієнт бронює
-- позиції ендпоїнтом `pantry-claim` ДО запису в комору, і лише заброньовані
-- сервером пише. `auto`-режим бронює лише `pantry_claimed_at IS NULL`, тож
-- другий пристрій, що прийшов пізніше, отримує порожню відповідь.
--
-- `silpo_receipts.pantry_auto_declined_at` - «Повернути» в тості автоімпорту
-- ставить це поле (через `pantry-release` з `decline: true`), і найближчий
-- автоімпорт цей чек більше не чіпає. Ручний імпорт лишається доступним.
--
-- `silpo_connection.pantry_auto_import_since` - момент увімкнення тумблера.
-- Автоімпорт бере лише чеки з `purchased_at >= pantry_auto_import_since`:
-- старі чеки могли бути внесені руками до появи позначки, і автоімпорт
-- подвоїв би їх. Вимкнення тумблера ставить NULL.

ALTER TABLE silpo_receipt_items
  ADD COLUMN IF NOT EXISTS pantry_claimed_at TIMESTAMPTZ;

ALTER TABLE silpo_receipts
  ADD COLUMN IF NOT EXISTS pantry_auto_declined_at TIMESTAMPTZ;

ALTER TABLE silpo_connection
  ADD COLUMN IF NOT EXISTS pantry_auto_import_since TIMESTAMPTZ;

COMMENT ON COLUMN silpo_receipt_items.pantry_claimed_at IS
  'Момент, коли позицію взяли в комору (вручну чи автоматично) - атомарне бронювання перед записом у pantry.upsertItem. NULL = ще не в коморі. Аркуш «З чека» показує «вже в коморі» і за замовчуванням не ставить галочку.';

COMMENT ON COLUMN silpo_receipts.pantry_auto_declined_at IS
  'Момент, коли користувач натиснув «Повернути» в тості автоімпорту для цього чека. Не NULL - автоімпорт більше не чіпає чек (ручний імпорт лишається доступним). NULL - чек ще ніхто не відхиляв.';

COMMENT ON COLUMN silpo_connection.pantry_auto_import_since IS
  'Момент увімкнення тумблера «Додавати продукти з чеків у комору автоматично» (PUT /api/silpo/settings). Автоімпорт бере лише чеки з purchased_at >= це значення. NULL = тумблер вимкнений.';
