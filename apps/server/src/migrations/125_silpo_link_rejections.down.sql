-- Down для 125_silpo_link_rejections.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає `.down.sql`.
-- Втрачається памʼять про відхилені пари «транзакція ↔ чек»: найближчий
-- sync знову звʼяже те, що користувач руками розлінкував. Самі чеки,
-- лінки й підтверджені спліти — в інших таблицях і не зачіпаються.

DROP TABLE IF EXISTS silpo_tx_receipt_link_rejections;
