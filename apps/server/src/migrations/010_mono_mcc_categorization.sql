-- Monobank MCC → category auto-categorization (Roadmap C).
--
-- Додає дві колонки до `mono_transaction`:
--   * `category_slug`         — slug канонічної категорії з finyk-domain
--                               (food, transport, restaurant, ...). NULL,
--                               якщо MCC = 0 / null або не у нашій мапі —
--                               юзер сам розкладе через UI.
--   * `category_overridden`   — TRUE, якщо юзер вручну змінив категорію.
--                               Webhook handler НЕ перезаписує `category_slug`,
--                               коли цей прапор стоїть, навіть якщо Monobank
--                               пришле refund з іншим MCC.
--
-- Backfill: existing rows отримують `category_slug` через `CASE mcc ... END`
-- з тією ж мапою, що використовує сервер у `mccCategories.ts`. Запис
-- одноразовий — оновлюємо тільки де `category_overridden = FALSE` (на цьому
-- етапі це всі рядки, але умова страхує повторне виконання після
-- `down`/`up` циклу в dev).
--
-- Ідемпотентно (`IF NOT EXISTS`). Rollback — `010_mono_mcc_categorization.down.sql`.

ALTER TABLE mono_transaction
  ADD COLUMN IF NOT EXISTS category_slug TEXT,
  ADD COLUMN IF NOT EXISTS category_overridden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS mono_tx_user_category_idx
  ON mono_transaction(user_id, category_slug)
  WHERE category_slug IS NOT NULL;

UPDATE mono_transaction
SET category_slug = CASE mcc
    WHEN 5411 THEN 'food'
    WHEN 5412 THEN 'food'
    WHEN 5422 THEN 'food'
    WHEN 5441 THEN 'food'
    WHEN 5451 THEN 'food'
    WHEN 5462 THEN 'food'
    WHEN 5499 THEN 'food'
    WHEN 5812 THEN 'restaurant'
    WHEN 5813 THEN 'restaurant'
    WHEN 5814 THEN 'restaurant'
    WHEN 4111 THEN 'transport'
    WHEN 4121 THEN 'transport'
    WHEN 4131 THEN 'transport'
    WHEN 5541 THEN 'transport'
    WHEN 5542 THEN 'transport'
    WHEN 5172 THEN 'transport'
    WHEN 4899 THEN 'subscriptions'
    WHEN 5735 THEN 'subscriptions'
    WHEN 7372 THEN 'subscriptions'
    WHEN 5122 THEN 'health'
    WHEN 5912 THEN 'health'
    WHEN 8011 THEN 'health'
    WHEN 8021 THEN 'health'
    WHEN 8049 THEN 'health'
    WHEN 8099 THEN 'health'
    WHEN 5311 THEN 'shopping'
    WHEN 5331 THEN 'shopping'
    WHEN 5651 THEN 'shopping'
    WHEN 5661 THEN 'shopping'
    WHEN 5699 THEN 'shopping'
    WHEN 5732 THEN 'shopping'
    WHEN 5734 THEN 'shopping'
    WHEN 5945 THEN 'shopping'
    WHEN 7832 THEN 'entertainment'
    WHEN 7922 THEN 'entertainment'
    WHEN 7993 THEN 'entertainment'
    WHEN 7996 THEN 'entertainment'
    WHEN 7999 THEN 'entertainment'
    WHEN 5941 THEN 'sport'
    WHEN 7941 THEN 'sport'
    WHEN 7997 THEN 'sport'
    WHEN 5977 THEN 'beauty'
    WHEN 7230 THEN 'beauty'
    WHEN 7297 THEN 'beauty'
    WHEN 5993 THEN 'smoking'
    WHEN 5942 THEN 'education'
    WHEN 8220 THEN 'education'
    WHEN 8299 THEN 'education'
    WHEN 3000 THEN 'travel'
    WHEN 4411 THEN 'travel'
    WHEN 4511 THEN 'travel'
    WHEN 7011 THEN 'travel'
    WHEN 7012 THEN 'travel'
    WHEN 6012 THEN 'debt'
    WHEN 6051 THEN 'debt'
    WHEN 6099 THEN 'debt'
    WHEN 8398 THEN 'charity'
    WHEN 8399 THEN 'charity'
    ELSE NULL
  END
WHERE category_slug IS NULL
  AND category_overridden = FALSE;
