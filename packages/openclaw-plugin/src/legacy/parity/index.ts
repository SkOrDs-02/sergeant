/**
 * Re-export parity surface for external consumers (tests, future
 * integration suite). Plugin entry-point itself doesn't import parity —
 * it lives in test-only space.
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
