/**
 * Stage 5b PR-4 — `/okr [<topic>]` strategic mode definition.
 *
 * Final piece of the Stage 5b catalogue (`/plan` PR-1, `/analyze` PR-2,
 * docs split PR-3, this PR-4). Unlike `/plan` and `/analyze`, `/okr`
 * accepts a bare invocation: `/okr` on its own opens an OKR-review
 * session and the agent reads the primer for instructions. An optional
 * topic (e.g. `/okr Q3 progress`) is preserved and forwarded to the
 * agent as the prompt — same shape as the other modes, just with
 * `topicRequired: false`.
 *
 * The primer is byte-for-byte equal to the legacy console primer at
 * `tools/openclaw/src/agents/strategic-modes.ts` (the `okr` arm of
 * `STRATEGIC_MODE_PRIMERS`). A drift-gate test in `index.test.ts`
 * reconstructs the legacy literal and compares.
 */

import type { StrategicModeDefinition } from "./types.js";

export const OKR_PRIMER =
  "STRATEGIC_MODE: okr. Founder викликав `/okr` для огляду активних OKR. " +
  "Phase 3 skeleton — поки `docs/strategy/<okr>.md` каталог не " +
  "scaffolded, працюй з тим що є:\n" +
  "  1) ACTIVE OKRs — спробуй прочитати з `docs/strategy/` через " +
  "`read_strategy_docs`. Якщо порожньо — recall_memory(`okr quarterly " +
  "objectives`) для cofounder-memory snapshot-у.\n" +
  "  2) PROGRESS PER KR — для кожного KR з виявленого списку оціни " +
  "поточний стан проти target. Числа — з `query_app_db` (revenue, signups, " +
  "active users, retention) або з Stripe/PostHog metric-tools.\n" +
  "  3) BOTTLENECKS — назви 1–2 KR, що відстають, і конкретно чому. " +
  'Уникай мяких формулювань ("можливо повільніше ніж очікувалось") — ' +
  "числа і delta vs target.\n" +
  "  4) NEXT ACTIONS — 1 action per bottleneck KR, з owner-ом і " +
  "deadline-ом. Якщо потрібен новий OKR draft — запропонуй структуру і " +
  "founder сам зафіксує.\n" +
  "Якщо `docs/strategy/` повністю порожній і memory не повертає OKR-data — " +
  'явно скажи "OKR ще не scaffolded" і запропонуй framework на kick-off.';

/**
 * Anchor: `^/okr` + word-boundary so `/okrs`, `/okrun` etc. never match.
 * Topic capture is OPTIONAL — `/okr` (no payload) is a valid match and
 * returns `topic: ""`; the host hook still activates the mode and the
 * agent reads the primer to drive the review. Case-insensitive so
 * `/OKR` works on mobile keyboards that auto-capitalise.
 */
export const OKR_PATTERN = /^\/okr\b\s*(?<topic>\S[\s\S]*?)?\s*$/i;

export const okrMode: StrategicModeDefinition = {
  slug: "okr",
  trigger: "strategic_okr",
  primer: OKR_PRIMER,
  pattern: OKR_PATTERN,
  topicRequired: false,
};
