-- 066: openclaw_mute_state — founder DM "do not disturb" пауза для bot-pings.
--
-- Контекст: продовжує OpenClaw slash-cluster (`/ritual` #2704,
-- `/openclaw status` #2709). Founder іноді хоче тихий час (sleep,
-- deep-work) — slash `/mute <duration>` дозволяє швидко вимкнути
-- outbound DM-нотифікації без env-var changes і без рестартів. Скоупом
-- — pause-button для bot pings, не для slash-replies (`/ritual` чи
-- `/openclaw` — user-initiated, завжди відповідають).
--
-- Lifecycle:
--   * `INSERT … ON CONFLICT (founder_user_id) DO UPDATE` — кожен
--     `/mute <duration>` оновлює row inline; один row на founder-а
--     (UNIQUE-key на `founder_user_id`).
--   * `UPDATE … SET muted_until = NULL` — `/mute off` (cleared, але
--     row залишається для аудиту `set_at` history).
--   * `SELECT … WHERE founder_user_id = $1 AND muted_until > NOW()`
--     — runtime guard для outbound-channels (alerts shipper, briefing
--     endpoint). Append-only — rows ніколи не DELETE-яться програмно.
--
-- Дизайн:
--   * `founder_user_id TEXT PRIMARY KEY` — Better Auth opaque ID,
--     дзеркалить `OPENCLAW_FOUNDER_USER_ID`. Один-row-per-founder
--     гарантує idempotency на `/mute` retry.
--   * `muted_until TIMESTAMPTZ NULL` — UTC. NULL ≡ «not muted».
--     `> NOW()` — мутед; `<= NOW()` — expired (treat as not-muted у
--     guard, не DELETE-аємо щоб лишити audit-trail).
--   * `set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — коли founder
--     виставив поточний mute (bumpається на кожен `/mute <dur>`).
--   * `reason TEXT NULL` — optional free-text label («sleep», «deep
--     work»). Резерв для майбутньої телеметрії; на старті не
--     використовується UI-ом, але dump-може індексуватися.
--   * `metadata JSONB DEFAULT '{}'` — за замовчуванням порожній.
--     Резерв для майбутніх полів (наприклад, `critical_override_count`,
--     `last_breadcrumb_at`) без міграції.
--
-- Critical-override semantics:
--   * Guard `isFounderMuted(founderUserId)` повертає `{muted: boolean,
--     mutedUntil: ISOString | null}`. Caller (alerts shipper) сам
--     перевіряє severity — `P0` (critical) bypass-ить mute, рендерить
--     прапор `[mute-override-critical]` у Sentry breadcrumb.
--   * Non-P0 (P1/P2/P3, briefing, /ritual auto-cron) silently skip-аються
--     з breadcrumb `[openclaw-muted-skip]`.

CREATE TABLE IF NOT EXISTS openclaw_mute_state (
  founder_user_id  TEXT PRIMARY KEY,
  muted_until      TIMESTAMPTZ,
  set_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason           TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Primary read pattern: "is founder muted right now?" — point-query
-- по PK. Окремий index не потрібен. Index по `muted_until` корисний
-- для майбутнього cleanup-cron-у (DELETE WHERE muted_until < NOW() -
-- INTERVAL '30 days'), але поки rows append-only — skip-аємо.
