-- 070 down: drop apple_iap_receipts.
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- CASCADE — bo indexes (user_verified, expires_at) живуть на цій таблиці,
-- без зовнішніх FK що залежать від цієї.

DROP TABLE IF EXISTS apple_iap_receipts CASCADE;
