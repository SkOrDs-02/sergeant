-- 066 down: drop openclaw_mute_state.
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- Drop CASCADE — no FK references this table; mute state is volatile
-- by design (NULL `muted_until` ≡ unmuted), so losing rows is
-- acceptable (founder simply re-issues `/mute <duration>`).

DROP TABLE IF EXISTS openclaw_mute_state CASCADE;
