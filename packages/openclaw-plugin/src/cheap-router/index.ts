/**
 * Stage 4c — Layer 1 cheap-router barrel.
 *
 * Public surface for the plugin entry point and tests. Internal modules
 * (`types`, `classifier`, `system-prompt`) split for testability.
 */

export {
  CHEAP_ROUTER_CLASSES,
  type CheapRouterClass,
  type CheapRouterClassification,
  type CheapRouterClassifier,
} from "./types.js";

export {
  HttpCheapRouterClassifier,
  type HttpCheapRouterClassifierOptions,
  type CheapRouterLogger,
} from "./classifier.js";

export {
  loadCheapRouterSystemPrompt,
  stripHtmlComments,
  type LoadCheapRouterPromptResult,
} from "./system-prompt.js";
