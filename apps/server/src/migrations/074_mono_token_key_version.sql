-- 074: mono_connection.token_key_version — KeyRing version байт для Mono
-- OAuth-токенів (H4 Phase 2).
--
-- Контекст: H4 Phase 1 (PR #1679) привів Better Auth OAuth-токени під
-- багатоверсійний KeyRing (`apps/server/src/lib/keyRing.ts`), щоб ключі
-- шифрування можна було ротувати без offline outage. Better Auth зберігає
-- ciphertext як один TEXT-стовпець із префіксом `enc:v2:k<N>:...`, тож версія
-- ключа зашита прямо в рядок.
--
-- Mono зберігає ciphertext як ТРИ окремі BYTEA-стовпці
-- (`token_ciphertext` / `token_iv` / `token_tag`) — там нема місця для
-- inline version-байта без зміни формату всіх трьох. Тому версію ключа
-- тримаємо в окремому стовпці `token_key_version`.
--
-- Дизайн (чисто additive, single-phase — безпечно для таблиці з живими
-- токенами):
--   * `token_key_version SMALLINT NULL` — версія KeyRing-ключа, яким
--     зашифрований рядок.
--       - NULL  → legacy unversioned ciphertext, записаний ДО цього PR.
--                 Читається під version 1 (legacy single-key fallback у
--                 `parseKeyRing`: `MONO_TOKEN_ENC_KEY` → `{version:1}`).
--       - 1..N  → versioned ciphertext, зашифрований ключем версії N із
--                 `MONO_TOKEN_ENC_KEYS`.
--     Nullable навмисно — backfill НЕ потрібен: жоден існуючий рядок не
--     чіпаємо, app-шар трактує NULL як v1. Lazy re-encrypt на наступному
--     успішному read-і перепише legacy-рядок під `current` версію та
--     проставить `token_key_version`.
--
-- Hard Rule #4: additive + nullable → zero destructive step на таблиці з
-- живими bank-токенами. `.down.sql` чисто реверсує (DROP COLUMN).

ALTER TABLE mono_connection
  ADD COLUMN IF NOT EXISTS token_key_version SMALLINT;

COMMENT ON COLUMN mono_connection.token_key_version IS
  'H4 Phase 2: KeyRing key version that encrypted token_ciphertext/iv/tag. NULL = legacy unversioned ciphertext (read as v1). 1..N = MONO_TOKEN_ENC_KEYS version. Written on connect/re-encrypt under ring.current.version.';
