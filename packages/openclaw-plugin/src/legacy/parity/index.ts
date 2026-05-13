/**
 * Re-export parity surface for external consumers (tests, future
 * integration suite). Plugin entry-point itself doesn't import parity —
 * it lives in test-only space.
 *
 * @scaffolded
 * @nextStep Wire future integration suite to import from this barrel
 *   (currently legacy parity tests use deep-paths). Tracked in dead-code
 *   roast 2026-05-13.
 */

export {
  GOLDEN_CONVERSATIONS,
  getGoldenConversation,
  type GoldenConversation,
  type ExpectedToolCall,
} from "./golden-conversations.js";
export {
  compareParity,
  runGrammyConversation,
  runPluginConversation,
  type ParityRunResult,
  type ParityComparison,
  type GrammyToolHandler,
} from "./parity-runner.js";
