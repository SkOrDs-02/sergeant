-- Down для 125_silpo_integration.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає `.down.sql`.
-- Дропаємо у зворотному порядку створення: спершу таблиці, що FK-ять на
-- silpo_receipts (silpo_tx_receipt_links, silpo_receipt_items), потім сам
-- silpo_receipts, і насамкінець незалежну silpo_connection.
--
-- Втрачається: збережені OAuth-токени Сільпо (користувач перепідключає
-- вручну — токен видає сам Сільпо-кабінет, не unrecoverable secret), усі
-- снапшоти чеків і позицій, усі лінки чек↔транзакція. Підтверджені
-- користувачем finyk_tx_splits і pantry-events НЕ зачіпаються — вони не
-- залежать від цих таблиць (FK тут нема, за дизайном спеки: створені
-- користувачем сутності лишаються навіть при wipe Сільпо-даних).

DROP TABLE IF EXISTS silpo_tx_receipt_links;
DROP TABLE IF EXISTS silpo_receipt_items;
DROP TABLE IF EXISTS silpo_receipts;
DROP TABLE IF EXISTS silpo_connection;
