-- Monobank webhook integration: DB schema for server-side token storage,
-- webhook delivery, and transaction persistence.
-- Plan: docs/monobank-webhook-migration.md (Track A)

CREATE TABLE mono_connection (
  user_id              TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  token_ciphertext     BYTEA NOT NULL,
  token_iv             BYTEA NOT NULL,
  token_tag            BYTEA NOT NULL,
  token_fingerprint    TEXT NOT NULL,
  webhook_secret       TEXT NOT NULL UNIQUE,
  webhook_registered_at TIMESTAMPTZ,
  last_event_at        TIMESTAMPTZ,
  last_backfill_at     TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mono_account (
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mono_account_id  TEXT NOT NULL,
  send_id          TEXT,
  type             TEXT,
  currency_code    INT NOT NULL,
  cashback_type    TEXT,
  masked_pan       TEXT[],
  iban             TEXT,
  balance          BIGINT,
  credit_limit     BIGINT,
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mono_account_id)
);

CREATE TABLE mono_transaction (
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mono_account_id  TEXT NOT NULL,
  mono_tx_id       TEXT NOT NULL,
  time             TIMESTAMPTZ NOT NULL,
  amount           BIGINT NOT NULL,
  operation_amount BIGINT NOT NULL,
  currency_code    INT NOT NULL,
  mcc              INT,
  original_mcc     INT,
  hold             BOOLEAN,
  description      TEXT,
  comment          TEXT,
  cashback_amount  BIGINT,
  commission_rate  BIGINT,
  balance          BIGINT,
  receipt_id       TEXT,
  invoice_id       TEXT,
  counter_edrpou   TEXT,
  counter_iban     TEXT,
  counter_name     TEXT,
  raw              JSONB NOT NULL,
  source           TEXT NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mono_tx_id),
  FOREIGN KEY (user_id, mono_account_id) REFERENCES mono_account(user_id, mono_account_id) ON DELETE CASCADE
);

CREATE INDEX mono_tx_user_time_idx ON mono_transaction(user_id, time DESC);
CREATE INDEX mono_tx_user_account_time_idx ON mono_transaction(user_id, mono_account_id, time DESC);
