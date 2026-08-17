-- 121 down: receipts + receipt_items + finyk_tx_receipt_links.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Порядок DROP — від залежного до незалежного (хоч
-- CASCADE і так підчистив би дочірні таблиці через FK): спершу
-- finyk_tx_receipt_links і receipt_items, потім сам receipts.
--
-- Дані втрачаються повністю (розпізнані чеки, позиції, matcher-лінки).
-- Ці таблиці щойно створені цією ж міграцією і в проді ще нічим не
-- заповнені (код, що в них пише, — окремий PR), тож ризику втрати
-- реальних даних немає — рольбек тут лише для локальної ітерації на
-- цій самій міграції.

DROP TABLE IF EXISTS finyk_tx_receipt_links CASCADE;
DROP TABLE IF EXISTS receipt_items CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
