/**
 * Stage 6a — parity-харнес public API.
 *
 * Re-export-ить fixture catalog + runner для consumer-ів (тестів, future
 * `apps/server` smoke-suite, manual parallel-run scripts). Плагін
 * entry-point (`src/index.ts`) парит-фікстури НЕ імпортує — це test-only
 * surface, але runtime-and-test-shared.
 *
 * @scaffolded
 * @nextStep Wire `apps/server` parallel-run smoke-suite OR manual scripts
 *   to import from this barrel (currently only `parity.test.ts` consumes
 *   `./golden-conversations.js` deep-paths). Tracked in dead-code roast
 *   2026-05-13.
 */

export {
  GOLDEN_CONVERSATIONS,
  SHORTCUT_GOLDEN_CONVERSATIONS,
  STRATEGIC_MODE_GOLDEN_CONVERSATIONS,
  COUNCIL_GOLDEN_CONVERSATIONS,
  getGoldenConversation,
  type GoldenConversation,
  type ShortcutFixture,
  type StrategicModeFixture,
  type CouncilFixture,
  type LegacyAgent,
  type ParityLayer,
} from "./golden-conversations.js";

export {
  createStubToolExecutor,
  routeMessage,
  type ParityRouteResult,
  type RouteMessageOptions,
} from "./runner.js";
