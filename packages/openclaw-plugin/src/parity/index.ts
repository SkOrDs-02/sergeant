/**
 * Stage 6a — parity-харнес public API.
 *
 * Re-export-ить fixture catalog + runner для consumer-ів (тестів, future
 * `apps/server` smoke-suite, manual parallel-run scripts). Плагін
 * entry-point (`src/index.ts`) парит-фікстури НЕ імпортує — це test-only
 * surface, але runtime-and-test-shared.
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
