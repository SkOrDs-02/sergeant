-- 047 down: drop tg_topic_archive.
--
-- Local-only rollback. Production never runs `down.sql` (Railway one-way
-- migrate). Drop CASCADE because the partial unique index + topic index
-- are owned by this table and there are no external FKs.

DROP TABLE IF EXISTS tg_topic_archive CASCADE;
