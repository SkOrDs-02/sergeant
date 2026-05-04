-- Inverse of `038_rename_035_rate_limit_buckets.sql`. Local-only rollback —
-- production never runs `.down.sql`. Re-creates the dangling row that the
-- forward migration deleted, so `037_rate_limit_buckets.sql` again looks
-- like the renamed twin of `035_rate_limit_buckets.sql`.
INSERT INTO schema_migrations (name) VALUES ('035_rate_limit_buckets.sql')
ON CONFLICT (name) DO NOTHING;
