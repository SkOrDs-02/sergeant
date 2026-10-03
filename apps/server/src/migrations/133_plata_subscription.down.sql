-- 132 down: drop plata_subscription, recreate plata_card_token exactly as
-- migration 082 defined it. Local-only rollback (prod never runs .down.sql;
-- forward-only migrate).

DROP TABLE IF EXISTS plata_subscription;

CREATE TABLE IF NOT EXISTS plata_card_token (
  user_id                TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  wallet_id              TEXT NOT NULL,
  card_token_ciphertext  BYTEA NOT NULL,
  card_token_iv          BYTEA NOT NULL,
  card_token_tag         BYTEA NOT NULL,
  token_key_version      SMALLINT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plata_card_token IS
  'Phase 7 UA billing: зашифрований monopay card-token для рекурентних списань Plata. AES-256-GCM (дзеркалить mono_connection, m008). Видаляється при deletion юзера (CASCADE) та при скасуванні підписки. Ніколи не логувати розшифроване значення (Hard Rule #21).';
