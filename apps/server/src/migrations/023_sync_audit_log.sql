-- 023: sync_audit_log — per-user audit trail of /api/sync/* operations.
--
-- Stage 0 / PR #005 з `docs/planning/storage-roadmap.md`. Записує
-- кожен виклик `syncPush` / `syncPull` / `syncPushAll` / `syncPullAll`
-- разом із outcome (ok/conflict/error/too_large/invalid/empty/unauthorized),
-- розміром payload-у і часом обробки. Нагадує `sync_event` info-лог,
-- але:
--
--   * лог-лінія тримається в Loki ~30 днів і не індексована per-user, тому
--     "покажи мені історію моїх sync-операцій" зробити не можна;
--   * у логах немає стабільного `id`, до якого можна було б долучити
--     conflict-resolution metadata з UI;
--   * у логах немає server_updated_at / server_version snapshot-у на момент
--     операції, які потрібні для post-mortem розборок (як було за останні
--     7 днів, чий push приземлився останнім, чому versions розійшлися).
--
-- Рядки лежать у власній таблиці, тому що:
--   * `module_data` — це поточний стан модулів і у ній жити аудиторським
--     записам не місце (vacuum-навантаження, гарячі pages розпухають);
--   * `governance.hard_rules_violations` — лог порушень _правил_, а не
--     прикладна аудит-подія від користувача.
--
-- Завжди керуйся `created_at` для дебагу. Не покладайся на `id` — це
-- BIGSERIAL без guarantee про ordering у multi-master сценарії; ми
-- наразі single-master, але майбутнє Citus / logical replication може
-- це поламати.

CREATE TABLE IF NOT EXISTS sync_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- одне з: 'push' | 'pull' | 'push_all' | 'pull_all'. CHECK-обмеження
  -- навмисно нежорстке — додавання нового op-type у server-коді не має
  -- блокуватися БД-міграцією, але невалідне значення проб'є тест.
  op_type TEXT NOT NULL,

  -- 'finyk' / 'fizruk' / 'routine' / 'nutrition' / 'profile' для
  -- per-module операцій, або 'all' для push_all/pull_all summary-рядка,
  -- або 'unknown' коли запит відхилили схемою validate-ом до того, як
  -- ми взагалі знаємо модуль.
  module TEXT NOT NULL,

  -- одне з: 'ok' | 'empty' | 'conflict' | 'invalid' | 'too_large' |
  -- 'unauthorized' | 'error'. Дзеркалить `SyncOutcome` у `sync.ts`.
  outcome TEXT NOT NULL,

  -- Конфлікт у last-write-wins guard (server.client_updated_at >
  -- payload.client_updated_at). Дублюється з outcome='conflict', але
  -- виставляється навіть для outcome='ok' з push_all-шляху, де
  -- per-module conflict може співіснувати з overall ok.
  conflict BOOLEAN NOT NULL DEFAULT FALSE,

  -- Розмір serialized JSON payload-у у байтах. NULL для pull-сторони,
  -- де клієнт нічого не надсилає, і для invalid-rejects до того, як ми
  -- встигли заміряти.
  payload_size_bytes INTEGER,

  -- Час обробки, у мілісекундах (round-half-up з `process.hrtime.bigint`).
  -- NULL для invalid/early-rejects, де `recordSync` ще не дійшов до
  -- timing.
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user list view: "покажи мені історію моїх sync-операцій за
-- останні 30 днів". Найгарячіший запит, тому окремий індекс. DESC
-- бо ми завжди показуємо найсвіжіше зверху і приймаємо `LIMIT N`
-- (без OFFSET — фронт використовує cursor-based pagination за `id`).
CREATE INDEX IF NOT EXISTS sync_audit_log_user_created_idx
  ON sync_audit_log (user_id, created_at DESC);

-- Admin / debug view: "покажи мені останні N записів за всіма
-- юзерами". Без user_id, лише по даті. Окремий індекс, бо інакше
-- довелось би сканувати весь user_created_idx з фільтром по
-- created_at.
CREATE INDEX IF NOT EXISTS sync_audit_log_created_idx
  ON sync_audit_log (created_at DESC);

-- Outcome-cardinality: для метрик / SLI-дашбордів коли треба
-- порахувати кількість conflict/error за останній годинник без
-- сканування всієї таблиці.
CREATE INDEX IF NOT EXISTS sync_audit_log_outcome_idx
  ON sync_audit_log (outcome, created_at DESC)
  WHERE outcome IN ('conflict', 'error', 'too_large');

COMMENT ON TABLE sync_audit_log IS
  'Per-user audit trail of /api/sync/* operations (Stage 0 / PR #005).';
COMMENT ON COLUMN sync_audit_log.op_type IS
  'push | pull | push_all | pull_all (від `SyncOp` у sync.ts).';
COMMENT ON COLUMN sync_audit_log.outcome IS
  'ok | empty | conflict | invalid | too_large | unauthorized | error.';
COMMENT ON COLUMN sync_audit_log.module IS
  'finyk | fizruk | routine | nutrition | profile | all | unknown.';
