-- 042: Range-partition `module_data` by `client_updated_at` (monthly).
--
-- Stage 6 / PR #050 з `docs/planning/storage-roadmap.md`.
--
-- ─── Context ──────────────────────────────────────────────────────────────
--
-- `module_data` is the legacy whole-blob sync table. Stage 4 migrated all
-- four modules (routine, fizruk, nutrition, finyk) to per-row normalized
-- tables; however, `module_data` still holds `profile` and `coach` rows,
-- plus historical data that may not yet have been purged. As the table
-- grows, maintenance queries (vacuum, reindex) block increasingly larger
-- heap regions. Range partitioning by `client_updated_at` (monthly)
-- isolates cold data and prepares for future archival (detach + dump old
-- partitions to S3/B2 cold-storage).
--
-- ─── Strategy ─────────────────────────────────────────────────────────────
--
-- PostgreSQL cannot convert a regular table to partitioned in-place.
-- We follow a 4-step approach:
--   1. Create new partitioned table `module_data_partitioned`.
--   2. Create monthly partitions (2024-01 through 2026-12).
--   3. Copy all data from `module_data` → `module_data_partitioned`.
--   4. Rename: `module_data` → `module_data_legacy`,
--              `module_data_partitioned` → `module_data`.
--
-- This migration is idempotent: subsequent runs skip if the partitioned
-- table already exists as the active `module_data`.
--
-- ─── Partition scheme ─────────────────────────────────────────────────────
--
-- `RANGE (client_updated_at)` with monthly boundaries. Partitions are
-- named `module_data_yYYYY_mMM` (e.g. `module_data_y2026_m01`).
-- A `module_data_default` partition catches rows with NULL
-- `client_updated_at` or dates outside explicitly created ranges.
--
-- New partitions for future months should be created by a scheduled job
-- or pre-deploy script. A helper function `create_module_data_partition`
-- is provided for operational convenience.
--
-- ─── Important ────────────────────────────────────────────────────────────
--
-- The UNIQUE constraint `(user_id, module)` must include the partition
-- key `client_updated_at` for Postgres to enforce it per-partition.
-- This changes the constraint to `(user_id, module, client_updated_at)`.
-- Since `module_data` rows are keyed by `(user_id, module)` with at most
-- one active row per pair, and `client_updated_at` advances monotonically,
-- this relaxation is safe: duplicate `(user_id, module)` across partitions
-- is prevented by the application layer (cloud-sync upsert), and the
-- CHECK constraint on `module` (migration 024) carries over.

-- ─── 1. Partition the table ───────────────────────────────────────────────

DO $$
DECLARE
  v_y INT;
  v_m INT;
  v_pname TEXT;
  v_sd TIMESTAMPTZ;
  v_ed TIMESTAMPTZ;
BEGIN
  -- Skip if already partitioned (idempotent re-run).
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'module_data'
      AND n.nspname = 'public'
      AND c.relkind = 'p'
  ) THEN
    RAISE NOTICE 'module_data is already partitioned — skipping migration.';
    RETURN;
  END IF;

  -- 1a. Create the new partitioned table with identical schema.
  CREATE TABLE module_data_partitioned (
    id SERIAL,
    user_id TEXT NOT NULL,
    module TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    client_updated_at TIMESTAMPTZ DEFAULT NOW(),
    server_updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, client_updated_at),
    UNIQUE (user_id, module, client_updated_at),
    CONSTRAINT module_data_partitioned_module_check
      CHECK (module IN ('finyk', 'fizruk', 'routine', 'nutrition', 'profile', 'coach'))
  ) PARTITION BY RANGE (client_updated_at);

  -- 1b. Default partition for NULLs and out-of-range dates.
  CREATE TABLE module_data_default
    PARTITION OF module_data_partitioned DEFAULT;

  -- 1c. Monthly partitions: 2024-01 through 2026-12 (36 months).
  FOR v_y IN 2024..2026 LOOP
    FOR v_m IN 1..12 LOOP
      v_pname := format('module_data_y%s_m%s', v_y, lpad(v_m::TEXT, 2, '0'));
      v_sd := make_timestamptz(v_y, v_m, 1, 0, 0, 0, 'UTC');
      IF v_m = 12 THEN
        v_ed := make_timestamptz(v_y + 1, 1, 1, 0, 0, 0, 'UTC');
      ELSE
        v_ed := make_timestamptz(v_y, v_m + 1, 1, 0, 0, 0, 'UTC');
      END IF;
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF module_data_partitioned FOR VALUES FROM (%L) TO (%L)',
        v_pname, v_sd, v_ed
      );
    END LOOP;
  END LOOP;

  -- 1d. Copy all data from the original table.
  INSERT INTO module_data_partitioned (id, user_id, module, data, version, client_updated_at, server_updated_at)
    SELECT id, user_id, module, data, version, client_updated_at, server_updated_at
    FROM module_data;

  -- 1e. Sync the SERIAL sequence to the max existing id.
  PERFORM setval(
    pg_get_serial_sequence('module_data_partitioned', 'id'),
    COALESCE((SELECT MAX(id) FROM module_data_partitioned), 1)
  );

  -- 1f. Swap tables: rename original → legacy, new → module_data.
  ALTER TABLE module_data RENAME TO module_data_legacy;
  ALTER TABLE module_data_partitioned RENAME TO module_data;

  -- 1g. Recreate the user_id index on the partitioned table.
  CREATE INDEX IF NOT EXISTS idx_module_data_user ON module_data (user_id);

  RAISE NOTICE 'module_data successfully partitioned. Legacy data preserved in module_data_legacy.';
END
$$;

-- ─── 2. Helper function for creating future monthly partitions ────────────
--
-- Usage (run manually or from a cron job / pre-deploy script):
--   SELECT create_module_data_partition(2027, 1);  -- January 2027
--
-- The function is idempotent: re-calling for an existing partition is a no-op.

CREATE OR REPLACE FUNCTION create_module_data_partition(
  p_year INT,
  p_month INT
) RETURNS VOID AS $$
DECLARE
  v_pname TEXT;
  v_sd TIMESTAMPTZ;
  v_ed TIMESTAMPTZ;
BEGIN
  v_pname := format('module_data_y%s_m%s', p_year, lpad(p_month::TEXT, 2, '0'));
  v_sd := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');

  IF p_month = 12 THEN
    v_ed := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'UTC');
  ELSE
    v_ed := make_timestamptz(p_year, p_month + 1, 1, 0, 0, 0, 'UTC');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = v_pname
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE %I PARTITION OF module_data FOR VALUES FROM (%L) TO (%L)',
    v_pname, v_sd, v_ed
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_module_data_partition(INT, INT) IS
  'Creates a monthly partition for module_data. Idempotent. Call before each month starts (cron / pre-deploy).';
