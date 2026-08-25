-- 123: Silpo MCP integration — Track A (Connect infra) walking skeleton.
-- Spec: docs/90-work/planning/specs/silpo-mcp-integration.md
--
-- Контекст. Сільпо (Fozzy Group) відкрили публічний MCP-сервер
-- (`https://mcp.silpo.ua/mcp`, OAuth 2.1 + PKCE + Dynamic Client
-- Registration). Цінність для Sergeant — чекові дані (item-рівень
-- супермаркетних покупок для finyk-спліту й nutrition-комори) та
-- укр-продуктовий каталог. Ця міграція кладе схему для чотирьох таблиць:
-- зберігання OAuth-токенів, снапшот чеків, позиції чеків і лінк
-- «Mono-транзакція ↔ Сільпо-чек».
--
-- Additive, single-phase: чотири нові таблиці, жодного ALTER над живими
-- даними — Hard Rule #4 two-phase DROP тут не застосовний.
--
-- ─── silpo_connection — дзеркало mono_connection, під OAuth 2.1 ───────────
--
-- На відміну від Monobank (один статичний Personal Token), Silpo MCP —
-- OAuth 2.1 authorization_code + refresh_token: потрібні ДВІ незалежні
-- AES-256-GCM трійки (access + refresh), а не одна, як у mono_connection /
-- privat_connection. Обидва токени шифруються під ОДНІЄЮ версією KeyRing-
-- ключа (`token_key_version`) — той самий ключ обслуговує весь рядок,
-- окремі версії для access/refresh не потрібні: ре-шифрування завжди йде
-- разом (lazy re-encrypt при refresh, за зразком mono/tokenStore.ts).
-- `token_key_version` — nullable за тим самим design-рішенням, що й
-- 074/091: читач, спільний із mono/privat-контуром, трактує NULL як v1
-- legacy fallback (тут це не станеться на практиці — таблиця нова — але
-- утримує один код-шлях `parseKeyRing` для всіх трьох інтеграцій).
--
-- `status` — 'connected' | 'reauth_required' (CHECK нижче). На відміну
-- від mono_connection ('pending'/'active'/...), тут лише два стани: коли
-- refresh-flow остаточно провалюється (401 на повторній спробі), рядок
-- переходить у 'reauth_required' і UI показує банер «Перепідключіть
-- Сільпо» — без видалення токенів (рішення дизайну §«Ізоляція збою»).
--
-- ─── silpo_receipts / silpo_receipt_items — снапшот чеків ─────────────────
--
-- MCP не гарантує стабільності платформи — снапшот чеків у власному PG
-- робить фічу незалежною від долі Сільпо-хакатону/API. Композитний PK
-- `(user_id, receipt_id)` — природний зовнішній ключ Сільпо, як
-- `mono_transaction.(user_id, mono_tx_id)`. `total_kop` / `price_kop` —
-- копійки як BIGINT (Hard Rule #1: coerce у TS serializer), той самий
-- підхід, що й `mono_transaction.amount`. `raw JSONB` зберігає сирий
-- MCP-payload для forward-compat при дрейфі схеми tools (рішення дизайну
-- §«Дрейф схеми tools»).
--
-- `silpo_receipt_items.id BIGSERIAL` (Hard Rule #1 — coerce у number).
-- FK `(user_id, receipt_id)` на `silpo_receipts` ON DELETE CASCADE — вайп
-- чека прибирає всі його позиції одним запитом (`POST /api/silpo/wipe`).
--
-- ─── silpo_tx_receipt_links — Mono-транзакція ↔ Сільпо-чек ─────────────────
--
-- Link-патерн ідентичний `finyk_mono_debt_links` (039_finyk_tables.sql):
-- композитний PK `(user_id, transaction_id)`, природний зовнішній ключ —
-- Mono-транзакція. На відміну від `finyk_mono_debt_links`, ця таблиця НЕ
-- частина клієнтського op-log dual-write шляху (`OP_LOG_TABLE_REGISTRY`
-- її не знає) — лінк пише виключно серверний детермінований matcher
-- (`packages/finyk-domain/receiptMatching.ts`), клієнт лише читає його
-- через REST (`GET /api/silpo/receipts/:id`), без Drizzle ORM. Це і є
-- причина, чому таблиця НЕ отримує Drizzle-модель нижче (див. звіт
-- migration-агента / `scripts/check-schema-drift.mjs` SQL_ONLY_TABLES).
-- FK `(user_id, receipt_id)` на `silpo_receipts` ON DELETE CASCADE —
-- вайп чека забирає й лінк (сам факт «розбито за чеком» — `TxSplit` у
-- `finyk_tx_splits` — лишається користувацьким і НЕ каскадиться).

-- ─── silpo_connection ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silpo_connection (
  user_id                    TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  access_token_ciphertext    BYTEA NOT NULL,
  access_token_iv            BYTEA NOT NULL,
  access_token_tag           BYTEA NOT NULL,
  refresh_token_ciphertext   BYTEA NOT NULL,
  refresh_token_iv           BYTEA NOT NULL,
  refresh_token_tag          BYTEA NOT NULL,
  token_key_version          SMALLINT,
  access_token_expires_at    TIMESTAMPTZ,
  last_sync_at               TIMESTAMPTZ,
  status                     TEXT NOT NULL DEFAULT 'connected',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT silpo_connection_status_check CHECK (
    status IN ('connected', 'reauth_required')
  )
);

-- ─── silpo_receipts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silpo_receipts (
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  receipt_id    TEXT NOT NULL,
  purchased_at  TIMESTAMPTZ NOT NULL,
  store_id      TEXT,
  channel       TEXT NOT NULL,
  payment_hint  TEXT,
  total_kop     BIGINT NOT NULL,
  raw           JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, receipt_id),
  CONSTRAINT silpo_receipts_channel_check CHECK (
    channel IN ('online', 'offline')
  )
);

-- Гарячий запит: «чеки користувача, найновіші перші» (finyk-транзакція →
-- секція «Чек», список «Чеки без транзакції»).
CREATE INDEX IF NOT EXISTS silpo_receipts_user_purchased_idx
  ON silpo_receipts (user_id, purchased_at DESC);

-- ─── silpo_receipt_items ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silpo_receipt_items (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL,
  receipt_id     TEXT NOT NULL,
  name           TEXT NOT NULL,
  qty            NUMERIC,
  unit           TEXT,
  price_kop      BIGINT NOT NULL,
  category_slug  TEXT,
  barcode        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id, receipt_id)
    REFERENCES silpo_receipts (user_id, receipt_id) ON DELETE CASCADE
);

-- Гарячий запит: «усі позиції одного чека» (розгортка чека в
-- фінансовій транзакції, підготовка пропозиції спліту / поповнення
-- комори).
CREATE INDEX IF NOT EXISTS silpo_receipt_items_user_receipt_idx
  ON silpo_receipt_items (user_id, receipt_id);

-- ─── silpo_tx_receipt_links ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silpo_tx_receipt_links (
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id  TEXT NOT NULL,
  receipt_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, transaction_id),
  FOREIGN KEY (user_id, receipt_id)
    REFERENCES silpo_receipts (user_id, receipt_id) ON DELETE CASCADE
);

-- Зворотний lookup: «чи є лінк для цього чека» (напр. приховати чек зі
-- списку «Чеки без транзакції», коли matcher вже його прив'язав).
CREATE INDEX IF NOT EXISTS silpo_tx_receipt_links_user_receipt_idx
  ON silpo_tx_receipt_links (user_id, receipt_id);

COMMENT ON TABLE silpo_connection IS
  'OAuth 2.1 token store for a user Silpo MCP connection — mirrors mono_connection, but carries TWO independent AES-256-GCM triples (access + refresh) under one shared token_key_version. status: connected | reauth_required (refresh-flow exhausted, needs user re-auth). disconnect deletes only this row; receipts/items/links survive (see POST /api/silpo/wipe for full erasure).';

COMMENT ON COLUMN silpo_connection.last_sync_at IS
  'Timestamp of the last SUCCESSFUL pull-and-sync completion (set by pullAndSyncReceipts). NULL = never synced. Persisted here rather than derived from MAX(silpo_receipts.created_at): a sync that pulls zero new receipts still refreshes it, and a wipe does not reset it.';

COMMENT ON COLUMN silpo_connection.token_key_version IS
  'KeyRing key version that encrypted BOTH token triples (access + refresh always re-encrypt together). NULL = legacy/unversioned fallback (read as v1) — kept nullable only to share the mono/privat reader code path (parseKeyRing), not because this new table ever writes unversioned rows.';

COMMENT ON TABLE silpo_receipts IS
  'Snapshot of Silpo receipts (own PG copy — MCP platform stability is not guaranteed). Composite PK (user_id, receipt_id) mirrors mono_transaction (user_id, mono_tx_id). total_kop is minor units (kopiykas) as BIGINT — coerce to number in serializers (Hard Rule #1). raw JSONB keeps the full MCP payload for forward-compat against tool schema drift.';

COMMENT ON COLUMN silpo_receipts.channel IS
  'online = silpo_get_my_online_orders, offline = silpo_get_my_offline_orders (physical store checkout).';

COMMENT ON COLUMN silpo_receipts.payment_hint IS
  'Payment method hint from the receipt (card mask / cash / Власний Рахунок), when the MCP tool exposes it — used by the deterministic matcher to exclude Власний Рахунок top-ups from mono-transaction candidates.';

COMMENT ON TABLE silpo_receipt_items IS
  'Line items of a Silpo receipt. FK (user_id, receipt_id) ON DELETE CASCADE — wiping a receipt (POST /api/silpo/wipe) removes its items in the same statement. price_kop is BIGINT minor units (Hard Rule #1 — coerce to number in serializers). category_slug is the Silpo category-tree leaf, mapped deterministically to finyk categories / FOOD_CATEGORIES by packages/finyk-domain.';

COMMENT ON TABLE silpo_tx_receipt_links IS
  'Maps a Mono transaction to the Silpo receipt the deterministic matcher (packages/finyk-domain/receiptMatching.ts) attached to it. Same link shape as finyk_mono_debt_links (composite PK on (user_id, transaction_id)), but this table is server-write-only — NOT part of the client op-log dual-write path (OP_LOG_TABLE_REGISTRY does not carry it); the client only reads it via REST. FK (user_id, receipt_id) ON DELETE CASCADE — wiping the receipt removes the link, but the resulting finyk_tx_splits the user confirmed from it are NOT cascaded (user-created data survives a Silpo wipe, per the design decision in the spec).';
