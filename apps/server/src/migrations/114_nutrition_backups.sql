-- 114: `nutrition_backups` — серверне сховище зашифрованих бекапів
-- nutrition замість ефемерної файлової системи контейнера.
--
-- Pre-beta schema-debt аудит 2026-08-04. `apps/server/src/modules/
-- nutrition/backup-upload.ts` пише `.data/nutrition-backup-<key>.json`
-- на локальний диск контейнера (`process.cwd()/.data`) — Coolify
-- redeploy/restart перестворює контейнер з чистою ФС, тож кожен бекап
-- переживає рівно до наступного деплою. Це PG-заміна того самого
-- write-through сховища; перенесення коду (замінити `fs.writeFile` на
-- `INSERT ... ON CONFLICT DO UPDATE`) — Stage 2.
--
-- Схема ключа. `key = safeBackupKeyFromToken(userId, xTokenHeader, secret)`
-- (`lib/backupKey.ts`) — HMAC(userId, token), тож той самий юзер із РІЗНИМ
-- `x-token` (різні пристрої/ротовані локальні ключі шифрування) отримує
-- РІЗНИЙ key і, відповідно, окремий файл/рядок. PK тому композитний
-- `(user_id, key)`, а не просто `user_id` — один юзер може легітимно мати
-- кілька бекап-слотів одночасно.
--
-- `payload` — JSONB, а не BYTEA: поточний `BackupUploadSchema.blob` це вже
-- JSON-об'єкт (шифрування — client-side, всередині значень), і `raw.length
-- > 2_500_000` guard у коді відповідає розміру, з яким JSONB/TOAST
-- комфортно працює.
--
-- FK ON DELETE CASCADE на "user"(id): бекап — похідні дані користувача,
-- видалення акаунта прибирає й їх (узгоджено з ADR-0016 стандартним
-- cascade-набором, не потребує ручного purge як ai_usage_daily).

CREATE TABLE IF NOT EXISTS nutrition_backups (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- Живі бекапи одного юзера (rare-write, rare-read — restore-шлях);
-- покриває і сам PK-lookup, і майбутній «список моїх бекапів».
CREATE INDEX IF NOT EXISTS nutrition_backups_user_idx
  ON nutrition_backups (user_id, updated_at DESC);

COMMENT ON TABLE nutrition_backups IS
  'Server-side write-through store for encrypted nutrition backups, replacing the ephemeral container filesystem write in backup-upload.ts. Wiring (switch the handler from fs.writeFile to an upsert) is Stage 2 — this migration is schema-only.';

COMMENT ON COLUMN nutrition_backups.key IS
  'HMAC(userId, x-token header, server secret) from lib/backupKey.ts — deterministic per (user, token) pair, NOT per user alone. Same user with a different token (device/rotated key) gets a different key and a separate row.';
