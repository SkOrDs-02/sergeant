-- 127: користувацьке відхилення хибної пари «Mono-транзакція ↔ Сільпо-чек».
-- Spec: docs/90-work/planning/specs/silpo-mcp-integration.md § Аудит перед
-- вмиканням (2026-08-24).
--
-- Проблема. `matchAndLink` (`modules/silpo/receipts.ts`) звʼязує чек із
-- транзакцією детерміновано — за збігом суми в межах ±1 доба. Збіг суми з
-- ЧУЖОЮ покупкою в тому вікні дає хибний лінк, і до цієї міграції
-- користувач не мав жодного точкового способу його зняти: єдиним виходом
-- був `POST /api/silpo/wipe`, тобто знесення ВСІХ чеків заради однієї
-- помилки.
--
-- Чому окрема таблиця, а не прапорець у `silpo_tx_receipt_links`. У тієї
-- PK — `(user_id, transaction_id)`, тож рядок-надгробок тримав би
-- транзакцію зайнятою і matcher не зміг би привʼязати до неї ПРАВИЛЬНИЙ
-- чек. Розлінк має звільнити транзакцію і водночас запамʼятати рівно одну
-- відкинуту ПАРУ — звідси PK на всіх трьох колонках: та сама транзакція
-- лишається доступною для іншого чека, а той самий чек — для іншої
-- транзакції.
--
-- Без цієї памʼяті фіча була б косметичною: `loadUnresolvedReceipts`
-- вважає чек без лінка нерозвʼязаним, тож найближчий sync (ручний або
-- крон WF-11) прогнав би той самий детермінований матч і відновив щойно
-- знятий лінк.
--
-- Additive, single-phase: одна нова таблиця, жодного ALTER над живими
-- даними — two-phase DROP (Hard Rule #4) тут не застосовний.
--
-- Обидва FK — ON DELETE CASCADE, дзеркалячи `silpo_tx_receipt_links`:
-- вайп чека (`POST /api/silpo/wipe`) забирає і його відхилення, бо після
-- зникнення самого чека памʼятати про відкинуту пару нема сенсу.

CREATE TABLE IF NOT EXISTS silpo_tx_receipt_link_rejections (
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id  TEXT NOT NULL,
  receipt_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, transaction_id, receipt_id),
  FOREIGN KEY (user_id, receipt_id)
    REFERENCES silpo_receipts (user_id, receipt_id) ON DELETE CASCADE
);

-- Matcher фільтрує кандидатів за `(user_id, receipt_id)` — саме в цьому
-- порядку, тож PK-префікс `(user_id, transaction_id, …)` йому не годиться.
CREATE INDEX IF NOT EXISTS silpo_tx_receipt_link_rejections_user_receipt_idx
  ON silpo_tx_receipt_link_rejections (user_id, receipt_id);

COMMENT ON TABLE silpo_tx_receipt_link_rejections IS
  'User-rejected (transaction, receipt) pairs from the deterministic Silpo matcher. Written by DELETE /api/silpo/receipts/link/:transactionId, read by matchAndLink as a negative filter so a re-sync never restores a link the user just removed. PK covers all three columns on purpose: rejecting one pair must leave BOTH the transaction free for a different receipt and the receipt free for a different transaction. Server-write-only, like silpo_tx_receipt_links — not part of the client op-log dual-write path.';
