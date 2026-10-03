-- 124: durable pending-state store for the Silpo OAuth 2.1 + PKCE round-trip.
-- Spec: docs/90-work/planning/specs/silpo-mcp-integration.md
--
-- Проблема. `GET /api/silpo/connect` генерує PKCE-пару і віддає браузеру
-- редірект на авторизацію Сільпо; `code_verifier` має дожити до повернення
-- на `/api/silpo/callback` — це хвилини реального часу з людиною в циклі.
-- Досі мапа `state → {userId, codeVerifier, redirectUri}` жила В ПАМʼЯТІ
-- процесу (`modules/silpo/oauth.ts`). Наслідок: будь-який рестарт чи
-- редеплой у це вікно (а деплой — звичайна подія, не аварія) стирав стан, і
-- користувач, повернувшись від Сільпо, отримував `invalid_state` без жодної
-- підказки, що робити. Другий наслідок — жорсткий блокер на масштабування:
-- при >1 репліці за не-sticky балансувальником `connect` і `callback`
-- сідали б на різні процеси, тож флоу ламався б і без рестартів.
--
-- Additive, single-phase: одна нова таблиця, жодного ALTER над живими
-- даними — two-phase DROP (Hard Rule #4) тут не застосовний.
--
-- Чому PG, а не підписана кука. Кука не дає одноразовості: `state` мусить
-- згорати рівно один раз (захист від replay callback-у), а це властивість
-- сховища, не транспорту. `DELETE ... RETURNING` нижче робить lookup і
-- згорання ОДНИМ атомарним запитом, тож два одночасні callback-и з тим
-- самим `state` не можуть обидва пройти.
--
-- Чому `code_verifier` лежить відкритим текстом, на відміну від токенів у
-- silpo_connection. Це НЕ облікові дані до Сільпо: сам по собі verifier
-- нічого не відмикає — він доводить володіння вже виданим одноразовим
-- `code`, який приходить на наш redirect_uri по TLS. Живе ≤ 10 хвилин
-- (TTL нижче), згорає при першому ж використанні. Шифрувати його
-- KeyRing-ом означало б завести четверту ключову залежність заради секрету,
-- який без перехопленого в ту саму хвилину `code` марний.
--
-- Прибирання. TTL-фільтр стоїть у самому `DELETE ... RETURNING` (протухлий
-- рядок ніколи не «спрацює», навіть якщо ще фізично лежить), а самі рядки
-- підмітає той же шлях `connect` — окремого cron-джоба свідомо не заводимо
-- заради таблиці, що в піку тримає одиниці рядків.

CREATE TABLE IF NOT EXISTS silpo_oauth_state (
  state         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  redirect_uri  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Підмітання протухлих рядків іде по вікну часу, не по користувачу.
CREATE INDEX IF NOT EXISTS silpo_oauth_state_created_at_idx
  ON silpo_oauth_state (created_at);

COMMENT ON TABLE silpo_oauth_state IS
  'Short-lived pending-state store for the Silpo OAuth 2.1 + PKCE authorization round-trip: state nonce -> {user_id, code_verifier, redirect_uri}. Rows live at most PENDING_STATE_TTL_MS (10 min) and are consumed exactly once via DELETE ... RETURNING (replay protection). Durable rather than in-process so a restart/redeploy mid-authorization does not strand the user on invalid_state, and so the API can run more than one replica. code_verifier is stored in plaintext by design: it proves possession of an authorization code delivered to our own redirect_uri over TLS, is useless on its own, and expires in minutes.';
