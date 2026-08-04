-- 107: Phase 2 DROP — знімає `mono_connection.webhook_secret` (plaintext).
--
-- Phase 1 (`017_mono_webhook_secret_hash.sql`) додав
-- `webhook_secret_hash` і переключив webhook-lookup на hash-запит саме
-- тому, що lookup по plaintext-у (`WHERE webhook_secret = $1`) — timing
-- side-channel (B-tree probe коротко-циклиться на першому байті
-- розбіжності), а сама колонка зберігала секрет у чистому вигляді. Коментар
-- 017 обіцяв Phase 2 DROP у наступній міграції («018_*») — цього так і не
-- сталось; колонка й досі пишеться (`connection.ts` upsert,
-- `rotateSecret.ts` ротація), просто вже ніким НЕ ЧИТАЄТЬСЯ для
-- webhook-lookup (той шлях іде через `webhook_secret_hash` з 017).
--
-- Чому безпечно зараз. pre-beta вікно: прод-БД не містить користувачів і
-- буде wipe-нута перед бетою (founder підтвердив), а нове старе-коду, що
-- читає `webhook_secret` під час деплою, після цього дропу вже не буде —
-- Stage 2 (server) переписує `connection.ts`/`rotateSecret.ts` в тому ж
-- вікні, щоб перестати писати колонку, якої більше нема.
--
-- TWO-PHASE-DROP: introduced 2026-05-18 as deprecation; safe to drop after 2026-06-02
--
-- DROP COLUMN автоматично знімає й `UNIQUE`-констрейнт на цій колонці
-- (з міграції 008) — окремого DROP CONSTRAINT не потрібно.

ALTER TABLE mono_connection
  DROP COLUMN IF EXISTS webhook_secret;
