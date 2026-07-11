-- 082 down: drop plata_card_token.
--
-- Local-only rollback (прод — forward-only Railway migrate). CASCADE не
-- потрібен — жодна таблиця не має FK на plata_card_token.

DROP TABLE IF EXISTS plata_card_token;
