-- Відкат 151: знімає три колонки автоімпорту/позначки «вже в коморі».

ALTER TABLE silpo_connection
  DROP COLUMN IF EXISTS pantry_auto_import_since;

ALTER TABLE silpo_receipts
  DROP COLUMN IF EXISTS pantry_auto_declined_at;

ALTER TABLE silpo_receipt_items
  DROP COLUMN IF EXISTS pantry_claimed_at;
