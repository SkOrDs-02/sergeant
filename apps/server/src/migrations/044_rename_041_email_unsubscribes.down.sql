-- Inverse of `044_rename_041_email_unsubscribes.sql`. Local-only rollback —
-- production never runs `.down.sql`. Re-creates the dangling row that the
-- forward migration deleted, so `043_email_unsubscribes.sql` again looks
-- like the renamed twin of `041_email_unsubscribes.sql`.
INSERT INTO schema_migrations (name) VALUES ('041_email_unsubscribes.sql')
ON CONFLICT (name) DO NOTHING;
