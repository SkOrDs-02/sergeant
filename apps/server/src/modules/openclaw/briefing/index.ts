/**
 * PR-26 — public surface OpenClaw morning briefing template + builder.
 * HTTP route `/api/internal/openclaw/briefing/morning` і консумери,
 * що рендерять briefing, імпортують звідси. Цей модуль існує лише
 * щоб мати один shallow-entry-point — структура `briefing/`
 * (`types.ts`, `template.ts`, `builder.ts`) — implementation detail.
 */

export { buildMorningBriefing } from "./template.js";
export { assembleMorningBriefing } from "./builder.js";
export type {
  AlertsBriefingSection,
  AssembleMorningBriefingInput,
  MorningBriefingData,
  MorningBriefingResponse,
  PrQueueBriefingSection,
  SignupsBriefingSection,
  StripeBriefingSection,
  WorkflowsBriefingSection,
} from "./types.js";
