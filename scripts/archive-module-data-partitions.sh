#!/usr/bin/env bash
# archive-module-data-partitions.sh — Detach and dump old monthly partitions
# of `module_data` for cold-storage archival.
#
# Stage 6 / PR #050 з docs/planning/storage-roadmap.md.
#
# Usage:
#   PGURL='postgresql://...' ./scripts/archive-module-data-partitions.sh [retention_months]
#
# Defaults: retention = 3 months. Partitions older than NOW() - retention
# are detached from `module_data`, dumped to a custom-format file, then
# dropped. The dump files should be uploaded to S3/B2 cold-storage
# (see docs/runbooks/database-backup-restore.md).
#
# Prerequisites:
#   - pg_dump / psql available on PATH.
#   - PGURL env-var pointing to a Postgres instance with the partitioned
#     `module_data` table (migration 042).
#
# Safety:
#   - Only detaches partitions whose upper bound is strictly before the
#     retention cutoff. Default partition is never touched.
#   - Dry-run mode: ARCHIVE_DRY_RUN=1 prints what would happen without
#     any DDL.

set -euo pipefail

RETENTION_MONTHS="${1:-3}"
ARCHIVE_DIR="${ARCHIVE_DIR:-./module_data_archives}"
DRY_RUN="${ARCHIVE_DRY_RUN:-0}"

if [ -z "${PGURL:-}" ]; then
  echo "Error: PGURL environment variable is required." >&2
  exit 1
fi

mkdir -p "$ARCHIVE_DIR"

# Calculate cutoff date (first day of the month N months ago).
CUTOFF=$(date -u -d "-${RETENTION_MONTHS} months" +%Y-%m-01)
echo "Retention: ${RETENTION_MONTHS} months. Cutoff: ${CUTOFF}"
echo "Archive dir: ${ARCHIVE_DIR}"
echo "Dry run: ${DRY_RUN}"
echo ""

# List candidate partitions: named module_data_yYYYY_mMM whose upper
# bound (pg_catalog.pg_range_partition_bound) is before cutoff.
PARTITIONS=$(psql "$PGURL" -t -A -c "
  SELECT c.relname
  FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
  JOIN pg_class parent ON parent.oid = i.inhparent
  WHERE parent.relname = 'module_data'
    AND c.relname LIKE 'module_data_y%'
    AND c.relname != 'module_data_default'
  ORDER BY c.relname;
")

if [ -z "$PARTITIONS" ]; then
  echo "No monthly partitions found. Is module_data partitioned (migration 042)?"
  exit 0
fi

ARCHIVED=0

for PART in $PARTITIONS; do
  # Extract year and month from partition name: module_data_yYYYY_mMM
  P_YEAR=$(echo "$PART" | sed -n 's/module_data_y\([0-9]\{4\}\)_m.*/\1/p')
  P_MONTH=$(echo "$PART" | sed -n 's/module_data_y[0-9]\{4\}_m\([0-9]\{2\}\)/\1/p')

  if [ -z "$P_YEAR" ] || [ -z "$P_MONTH" ]; then
    echo "  SKIP $PART — cannot parse year/month from name."
    continue
  fi

  # Upper bound = first day of next month.
  if [ "$P_MONTH" = "12" ]; then
    UPPER_YEAR=$((P_YEAR + 1))
    UPPER_MONTH="01"
  else
    UPPER_YEAR=$P_YEAR
    UPPER_MONTH=$(printf '%02d' $((10#$P_MONTH + 1)))
  fi
  UPPER_BOUND="${UPPER_YEAR}-${UPPER_MONTH}-01"

  # Compare: archive only if upper bound <= cutoff.
  if [[ "$UPPER_BOUND" > "$CUTOFF" ]]; then
    continue
  fi

  DUMP_FILE="${ARCHIVE_DIR}/${PART}.dump"
  echo "  ARCHIVE $PART (upper bound ${UPPER_BOUND} <= cutoff ${CUTOFF})"

  if [ "$DRY_RUN" = "1" ]; then
    echo "    [dry-run] Would detach, dump to ${DUMP_FILE}, and drop."
    ARCHIVED=$((ARCHIVED + 1))
    continue
  fi

  # 1. Dump the partition data before detaching.
  pg_dump --format=custom --no-owner --no-privileges \
    --table="$PART" --file="$DUMP_FILE" "$PGURL"
  echo "    Dumped to ${DUMP_FILE} ($(du -h "$DUMP_FILE" | cut -f1))"

  # 2. Detach partition from parent.
  psql "$PGURL" -c "ALTER TABLE module_data DETACH PARTITION ${PART};"
  echo "    Detached from module_data."

  # 3. Drop the standalone table.
  psql "$PGURL" -c "DROP TABLE ${PART};"
  echo "    Dropped."

  ARCHIVED=$((ARCHIVED + 1))
done

echo ""
echo "Done. Archived ${ARCHIVED} partition(s)."

if [ "$ARCHIVED" -gt 0 ] && [ "$DRY_RUN" != "1" ]; then
  echo ""
  echo "Next steps:"
  echo "  1. Upload dumps from ${ARCHIVE_DIR}/ to S3/B2 cold-storage."
  echo "  2. Verify upload integrity (checksum)."
  echo "  3. Delete local dump files."
fi
