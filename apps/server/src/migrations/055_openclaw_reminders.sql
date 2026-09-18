-- 055: openclaw_reminders — schedule store для `set_reminder` tool (PR-B / Phase 0.5).
--
-- Контекст (план: `docs/planning/openclaw-migration-plan.md` § Phase 1
-- розкладка, Locked decision #9): нова tool `set_reminder` дозволяє
-- founder-у чи персоні запланувати майбутнє повідомлення. n8n cron-poller
-- (Tier A) прочитує `WHERE status='pending' AND due_at <= NOW()` кожну
-- хвилину і викликає `/reminders/list-due` → надсилає reminder через
-- OpenClaw messaging API → marker як `sent`.
--
-- ─── Чому окрема таблиця, а не запис у `openclaw_invocations` ──────────
--
-- Invocations — це audit log РЕАЛЬНИХ викликів. Reminders — це plan для
-- майбутніх тригерів. Семантично різні: reminder може бути cancelled
-- founder-ом до due_at; invocation — immutable. Окрема таблиця також
-- спрощує cron-poller (одинокий index `WHERE status='pending'`).
--
-- ─── Persona/topic ──────────────────────────────────────────────────────
--
-- Дзеркалить persona+topic з ai_memories (054): персона, що поставила
-- reminder, фіксується для audit. На fire-time cron-poller повертає
-- reminder через ту саму персону (тобто sergeant-cofounder фігурує у
-- self-message як sender).
--
-- ─── Status FSM ─────────────────────────────────────────────────────────
--
--   pending  → sent       (cron-poller успішно надіслав)
--   pending  → cancelled  (founder скасував через `/reminder cancel <id>`)
--   pending  → failed     (3+ невдалі спроби; manual review)
--
-- attempts++ при кожній спробі; last_attempted_at = NOW(). Якщо
-- attempts >= 3 → status='failed', reminder уходить з poll-queue.
--
-- ─── Channel ────────────────────────────────────────────────────────────
--
-- За замовч. 'telegram' (Phase 0.5/1). 'whatsapp' додасться в Phase 8
-- без міграції (CHECK constraint уже допускає).
--
-- ─── Audit / GDPR ───────────────────────────────────────────────────────
--
-- FK до user(id) ON DELETE CASCADE — при GDPR-видаленні founder-а всі
-- незаслані reminder-и зникають разом з ним. source_invocation_id
-- посилається на invocation, у якому reminder був створений; ON DELETE
-- SET NULL — reminders не видаляються разом з invocation pruning.
--
-- ─── Hard Rule #4 ───────────────────────────────────────────────────────
--
-- CREATE TABLE — нова сутність, no DROP, no rename — single-phase OK.

CREATE TABLE IF NOT EXISTS openclaw_reminders (
  id BIGSERIAL PRIMARY KEY,

  -- Founder Better Auth user id; FK з ON DELETE CASCADE — GDPR-вимога.
  founder_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Персона, що поставила reminder (cofounder / eng / etc.). Дефолт
  -- 'cofounder' для backward compat і прямих API-call-ів без persona.
  persona TEXT NOT NULL DEFAULT 'cofounder',

  -- Optional project-topic (mirror з ai_memories.topic).
  topic TEXT,

  -- Текст повідомлення, яке буде надіслано. Reminder-text буде
  -- ре-rendered cron-poller-ом у фінальний message ("⏰ Reminder: ...").
  reminder_text TEXT NOT NULL,

  -- Коли надіслати. Час фіксований у UTC; intl-timezone розрізнення
  -- ловиться у formatter (Europe/Kyiv для founder-а — Hard Rule:
  -- domain-invariants).
  due_at TIMESTAMPTZ NOT NULL,

  -- FSM. Дефолт 'pending' — щойно створений reminder автоматично у
  -- черзі.
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'sent', 'cancelled', 'failed'))
    DEFAULT 'pending',

  -- Reference на invocation, у якому reminder був створений. ON DELETE
  -- SET NULL — invocations можуть rotate-итися (audit retention 90 днів,
  -- Locked decision #11).
  source_invocation_id BIGINT REFERENCES openclaw_invocations(id) ON DELETE SET NULL,

  -- Канал доставки. CHECK дозволяє whatsapp заздалегідь — не блокує
  -- Phase 8 без додаткової міграції.
  channel TEXT NOT NULL
    CHECK (channel IN ('telegram', 'whatsapp'))
    DEFAULT 'telegram',

  -- Лічильник спроб надіслати (для retry-логіки cron-poller-а).
  attempts INT NOT NULL DEFAULT 0,

  -- Час останньої спроби (NULL якщо ще не пробували).
  last_attempted_at TIMESTAMPTZ,

  -- Час успішної доставки. NULL до status='sent'.
  sent_at TIMESTAMPTZ,

  -- Час скасування. NULL до status='cancelled'.
  cancelled_at TIMESTAMPTZ,

  -- Довільні метадані (наприклад обраний шаблон, isReply на топік).
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Stamps.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cron-poller hot path: Each minute n8n calls /reminders/list-due, which
-- runs this query. Partial index — поза status='pending' нічого не
-- скануємо; це economy на повних таблицях, де sent/cancelled домінують.
CREATE INDEX IF NOT EXISTS openclaw_reminders_due_pending_idx
  ON openclaw_reminders (due_at)
  WHERE status = 'pending';

-- Founder-scoped reminders list (UI / `/reminders` shortcut).
CREATE INDEX IF NOT EXISTS openclaw_reminders_founder_idx
  ON openclaw_reminders (founder_user_id, due_at DESC);

-- Persona-scoped audit (наприклад "що eng-persona зарезервувала на
-- наступний тиждень").
CREATE INDEX IF NOT EXISTS openclaw_reminders_persona_idx
  ON openclaw_reminders (persona, due_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE openclaw_reminders IS
  'OpenClaw reminders. n8n Tier A cron-poller polls due_at <= NOW() AND status=pending кожну хвилину. Plan: docs/planning/openclaw-migration-plan.md.';
