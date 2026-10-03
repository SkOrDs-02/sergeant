-- Down для 108_finyk_networth_history_double.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Звужує назад до REAL (float4); за наявності рядків зі
-- значеннями поза точністю float4 це lossy (очікувано для рollback
-- вузького типу — той самий компроміс, що й в оригінальній REAL-колонці
-- до цієї міграції).

ALTER TABLE finyk_networth_history
  ALTER COLUMN networth TYPE REAL USING networth::real;
