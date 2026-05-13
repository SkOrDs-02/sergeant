/**
 * PR-26 — public surface OpenClaw morning briefing template + builder.
 * HTTP route `/api/internal/openclaw/briefing/morning` і консумери,
 * що рендерять briefing, імпортують звідси. Цей модуль існує лише
 * щоб мати один shallow-entry-point — структура `briefing/`
 * (`types.ts`, `template.ts`, `builder.ts`) — implementation detail.
 */

export { buildMorningBriefing } from "./template.js";
export {
  assembleMorningBriefing,
  generateProposalsSection,
} from "./builder.js";
export type { AssembleMorningBriefingOptions } from "./builder.js";
export type {
  AlertsBriefingSection,
  AssembleMorningBriefingInput,
  MorningBriefingData,
  MorningBriefingResponse,
  PrQueueBriefingSection,
  ProposalsBriefingSection,
  SignupsBriefingSection,
  StripeBriefingSection,
  WorkflowsBriefingSection,
} from "./types.js";
