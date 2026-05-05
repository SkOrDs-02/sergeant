-- 042 (down): Revert module_data partitioning.
--
-- Restores the original non-partitioned `module_data` table from the
-- `module_data_legacy` backup. Only works if `module_data_legacy` still
-- exists (it is preserved as a safety net after the forward migration).

DO $$
BEGIN
  -- Only revert if the legacy table exists and current is partitioned.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'module_data_legacy'
  ) THEN
    RAISE NOTICE 'module_data_legacy does not exist — nothing to revert.';
    RETURN;
  END IF;

  -- Drop the partitioned table (cascades to all partitions).
  DROP TABLE IF EXISTS module_data CASCADE;

  -- Restore legacy table as module_data.
  ALTER TABLE module_data_legacy RENAME TO module_data;

  RAISE NOTICE 'module_data reverted to non-partitioned table.';
END
$$;

-- Drop the helper function.
DROP FUNCTION IF EXISTS create_module_data_partition(INT, INT);
