-- 039: finyk_* normalized target tables — Stage 4 / PR #035 of
-- `docs/planning/storage-roadmap.md`.
--
-- Context. Finyk state is the largest cross-platform LS/MMKV blob set
-- left in the app: 16 user-edited keys (`finyk_hidden`, `finyk_budgets`,
-- `finyk_subs`, `finyk_assets`, `finyk_debts`, `finyk_recv`,
-- `finyk_hidden_txs`, `finyk_monthly_plan`, `finyk_tx_cats`,
-- `finyk_tx_splits`, `finyk_mono_debt_linked`, `finyk_networth_history`,
-- `finyk_custom_cats_v1`, `finyk_manual_expenses_v1`,
-- `finyk_tx_filters_v1`, `finyk_show_balance_v1`) plus the three Mono
-- caches (`finyk_tx_cache`, `finyk_info_cache`, `finyk_tx_cache_last_good`,
-- handled separately in PR #038). Whole-blob LWW push/pull through
-- `module_data.finyk` has the same scalability issues the routine
-- (PRs #023–#026), fizruk (PRs #027–#030), and nutrition (PRs #031–#034)
-- shed before us:
--
--   * no per-row sync (multi-device collisions on a single blob
--     overwrite the opponent's fresh edits — particularly painful for
--     `finyk_tx_cats` where every web tx click races mobile),
--   * payload growth scales with feature count, not user activity
--     (subscriptions+budgets+assets+debts+manual-expenses pile up
--     unbounded),
--   * per-tx data (`finyk_tx_cats`, `finyk_tx_splits`,
--     `finyk_mono_debt_linked`) re-pushes the entire map on every edit.
--
-- This migration adds **tables only** — the server does not read from
-- them yet (Stage 5 read cut-over is PR #037). Writes happen through
-- the v2 sync apply path (`OP_LOG_TABLE_REGISTRY` in `syncV2.ts`); the
-- companion server-side apply functions land in this same PR so
-- inbound dual-write traffic from PR #036 can already round-trip
-- before Stage 5 lights up.
--
-- Mirrors the structure of migration 035_nutrition_tables.sql (PR #031
-- of the same roadmap) — same FK-on-user / soft-delete-tombstone /
-- per-user-active-index pattern, same TIMESTAMPTZ defaults, same
-- `_lite`-suffixed indexes on the SQLite parallel schema. Five table
-- shapes are reused across the 15 tables:
--
--   1. **per-row + JSONB blob** (budgets, subscriptions, assets,
--      debts, receivables, custom_categories, manual_expenses,
--      tx_filters): `id UUID PK`, `user_id`, `data_json JSONB`,
--      `created_at`/`updated_at`/`deleted_at`. Open-ended user-edited
--      shapes that the UI reads as a whole — not worth column
--      splitting.
--   2. **composite-PK tombstone** (hidden_accounts,
--      hidden_transactions): `(user_id, ext_id) PRIMARY KEY` with
--      `updated_at`/`deleted_at` — natural key is the external Mono
--      account/transaction id; no surrogate `id`. Soft-delete
--      preserves LWW so an "unhide" on device A doesn't lose to a
--      stale "hide" replay from device B.
--   3. **per-tx mapping** (tx_categories, tx_splits,
--      mono_debt_links): `(user_id, transaction_id) PRIMARY KEY`
--      with `updated_at`. The natural key is the Mono transaction id
--      — there is at most one mapping per (user, tx). `tx_categories`
--      is a single TEXT column (`category_id`); the other two carry
--      JSONB (split arrays / debt id arrays). No `deleted_at` —
--      "no mapping" is the same as the mapping not existing, so the
--      sync apply path treats `delete` as `DELETE FROM` (idempotent).
--   4. **time-series** (networth_history): `(user_id, month)
--      PRIMARY KEY` with monthly snapshots. `month` is a TEXT
--      `YYYY-MM` to mirror the LS shape exactly — no
--      string-to-date coercion at the API boundary, makes the LWW
--      key trivially comparable.
--   5. **per-user singleton prefs** (prefs): `user_id PRIMARY KEY`,
--      JSONB blob for the open-ended shape, plus split-out
--      `show_balance BOOLEAN` and `monthly_plan_json JSONB` columns
--      so multi-device LWW on those individual sub-fields doesn't
--      have to merge the open-ended JSONB.
--
-- Forward-only: `pnpm db:migrate` does not add DROPs here, so rule #4
-- (two-phase DROP) does not apply. `.down.sql` is for local rollback only.

-- finyk_hidden_accounts — set of Mono account ids the user has hidden
-- from list/dashboard views. Composite PK on `(user_id, account_id)`
-- so the natural external id (Mono's account ID, opaque TEXT) is the
-- key — no surrogate UUID needed. Soft-delete with `deleted_at` so an
-- "unhide" race correctly LWW-resolves against a stale "hide" from
-- another device.
CREATE TABLE IF NOT EXISTS finyk_hidden_accounts (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, account_id)
);

CREATE INDEX IF NOT EXISTS finyk_hidden_accounts_user_active_idx
  ON finyk_hidden_accounts (user_id)
  WHERE deleted_at IS NULL;

-- finyk_hidden_transactions — set of Mono transaction ids the user
-- has hidden. Same shape as finyk_hidden_accounts but keyed on
-- `transaction_id`.
CREATE TABLE IF NOT EXISTS finyk_hidden_transactions (
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_hidden_transactions_user_active_idx
  ON finyk_hidden_transactions (user_id)
  WHERE deleted_at IS NULL;

-- finyk_budgets — per-row budget entries (limit/goal). `data_json`
-- carries the open-ended `Budget` shape (categoryId, type,
-- targetAmount, period, etc.) — UI reads the whole row at once so
-- column-splitting buys nothing.
CREATE TABLE IF NOT EXISTS finyk_budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_budgets_user_active_idx
  ON finyk_budgets (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_subscriptions — recurring-payment definitions. `data_json`
-- holds the `Subscription` shape (name, emoji, billingDay, currency,
-- linkedTxId, …).
CREATE TABLE IF NOT EXISTS finyk_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_subscriptions_user_active_idx
  ON finyk_subscriptions (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_assets — manually tracked assets (cash, real estate, vehicles,
-- linked-tx-augmented balances). `data_json` is the full `ManualAsset`
-- shape (amount, name, currency, linkedTxIds, emoji, …).
CREATE TABLE IF NOT EXISTS finyk_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_assets_user_active_idx
  ON finyk_assets (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_debts — manually tracked debts the user owes. `data_json` is
-- the full `Debt` shape from `@sergeant/finyk-domain/domain/debtEngine`
-- (amount, currency, counterparty, dueDate, schedule, payments, …).
CREATE TABLE IF NOT EXISTS finyk_debts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_debts_user_active_idx
  ON finyk_debts (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_receivables — money owed TO the user. Same shape as
-- finyk_debts but the direction is reversed at the domain layer.
CREATE TABLE IF NOT EXISTS finyk_receivables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_receivables_user_active_idx
  ON finyk_receivables (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_tx_categories — per-transaction category override. The LS
-- shape is `Record<txId, categoryId>` with `undefined` values meaning
-- "fall back to MCC default". Composite PK `(user_id, transaction_id)`;
-- no `deleted_at` because the absence of a mapping is itself the
-- "no override" state — sync `delete` ops just `DELETE FROM`.
CREATE TABLE IF NOT EXISTS finyk_tx_categories (
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  category_id    TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_tx_categories_user_idx
  ON finyk_tx_categories (user_id);

-- finyk_tx_splits — per-transaction split definitions (multi-category
-- breakdown of a single Mono transaction). LS shape is
-- `Record<txId, TxSplit[]>`. Composite PK `(user_id, transaction_id)`;
-- the array of splits goes into `splits_json` JSONB.
CREATE TABLE IF NOT EXISTS finyk_tx_splits (
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  splits_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_tx_splits_user_idx
  ON finyk_tx_splits (user_id);

-- finyk_mono_debt_links — which manual debts a Mono transaction is
-- linked to. LS shape is `Record<txId, debtId[]>`. Composite PK,
-- `debt_ids_json` is the array of `finyk_debts.id` strings.
CREATE TABLE IF NOT EXISTS finyk_mono_debt_links (
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  debt_ids_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_mono_debt_links_user_idx
  ON finyk_mono_debt_links (user_id);

-- finyk_networth_history — monthly net-worth snapshots. LS shape is
-- `NetworthEntry[]` with `{ month: 'YYYY-MM', networth: number }`.
-- `month` stays TEXT (not DATE) so LWW comparisons / API round-trips
-- match the LS shape byte-for-byte. `snapshot_json` reserves space
-- for richer per-month payloads (per-asset breakdowns, FX rate at
-- snapshot time) without a follow-up migration.
CREATE TABLE IF NOT EXISTS finyk_networth_history (
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  month          TEXT NOT NULL,
  networth       REAL NOT NULL DEFAULT 0,
  snapshot_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);

CREATE INDEX IF NOT EXISTS finyk_networth_history_user_month_idx
  ON finyk_networth_history (user_id, month DESC);

-- finyk_custom_categories — user-defined transaction categories
-- (`finyk_custom_cats_v1`). Per-row with `id` UUID PK; `data_json`
-- holds the `CustomCategory` shape (label, color, icon, parentId).
CREATE TABLE IF NOT EXISTS finyk_custom_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_custom_categories_user_active_idx
  ON finyk_custom_categories (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_manual_expenses — user-entered cash expenses outside Mono
-- (`finyk_manual_expenses_v1`). Per-row `ManualExpense` shape (date,
-- description, amount, category) inside `data_json`.
CREATE TABLE IF NOT EXISTS finyk_manual_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_manual_expenses_user_active_idx
  ON finyk_manual_expenses (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_tx_filters — saved transaction filter presets
-- (`finyk_tx_filters_v1`). Open-ended filter shape (date range, accounts,
-- categories, search) lives in `data_json`.
CREATE TABLE IF NOT EXISTS finyk_tx_filters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS finyk_tx_filters_user_active_idx
  ON finyk_tx_filters (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- finyk_prefs — per-user singleton row of finyk-side preferences.
-- `monthly_plan_json` carries `MonthlyPlan` (income/expense/savings —
-- all stored as TEXT/number-strings to match the LS shape verbatim).
-- `show_balance` is split out of the open-ended `prefs_json` so
-- multi-device LWW on the balance-visibility toggle doesn't have to
-- merge the JSONB blob. `user_id` is the primary key — exactly one
-- row per user.
CREATE TABLE IF NOT EXISTS finyk_prefs (
  user_id            TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  prefs_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  monthly_plan_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  show_balance       BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE finyk_hidden_accounts IS
  'Per-user set of Mono account ids hidden from the UI. Soft-delete on (user_id, account_id) for LWW unhide-vs-hide races.';
COMMENT ON TABLE finyk_hidden_transactions IS
  'Per-user set of Mono transaction ids hidden from the UI. Same shape as finyk_hidden_accounts but on transaction_id.';
COMMENT ON TABLE finyk_budgets IS
  'Per-row budget entries (limit/goal). data_json holds the open-ended Budget shape; UI reads whole-row.';
COMMENT ON TABLE finyk_subscriptions IS
  'Per-row recurring-payment definitions (name, emoji, billingDay, currency, linkedTxId).';
COMMENT ON TABLE finyk_assets IS
  'Per-row manually tracked assets (cash, real estate, vehicles). data_json is the ManualAsset shape.';
COMMENT ON TABLE finyk_debts IS
  'Per-row manually tracked debts the user owes. data_json is the Debt shape (debtEngine).';
COMMENT ON TABLE finyk_receivables IS
  'Money owed TO the user. Same shape as finyk_debts; direction reversed at the domain layer.';
COMMENT ON TABLE finyk_tx_categories IS
  'Per-transaction category override. Composite PK (user_id, transaction_id); delete = DELETE FROM (no soft-delete).';
COMMENT ON TABLE finyk_tx_splits IS
  'Per-transaction split definitions. splits_json holds the TxSplit[] array.';
COMMENT ON TABLE finyk_mono_debt_links IS
  'Maps Mono transactions to manual debts. debt_ids_json is the array of finyk_debts.id strings.';
COMMENT ON TABLE finyk_networth_history IS
  'Monthly net-worth snapshots. month is TEXT YYYY-MM to match the LS NetworthEntry shape verbatim.';
COMMENT ON COLUMN finyk_networth_history.month IS
  'YYYY-MM string. TEXT (not DATE) so LWW + API round-trips match LS byte-for-byte.';
COMMENT ON TABLE finyk_custom_categories IS
  'User-defined transaction categories (label/color/icon/parentId).';
COMMENT ON TABLE finyk_manual_expenses IS
  'User-entered cash expenses outside Mono (date/description/amount/category).';
COMMENT ON TABLE finyk_tx_filters IS
  'Saved transaction filter presets — date range, accounts, categories, search query.';
COMMENT ON TABLE finyk_prefs IS
  'Per-user singleton row of finyk preferences. show_balance + monthly_plan split out so multi-device LWW does not merge the JSONB.';
COMMENT ON COLUMN finyk_prefs.show_balance IS
  'Hoisted out of prefs_json so balance-visibility toggle has its own LWW lane.';
COMMENT ON COLUMN finyk_prefs.monthly_plan_json IS
  'MonthlyPlan blob (income/expense/savings as the original LS string-or-number shape).';
