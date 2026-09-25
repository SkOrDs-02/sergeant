/**
 * Кандидати фонових шляхів (classify, digest, mono, nutrition) з тих самих
 * env, що читає прод: `LLM_*_PROVIDER` вирішує шлюз, `OPENROUTER_*_MODEL` і
 * `*_MODEL` дають id.
 *
 * AI-CONTEXT: до 2026-09-25 перший кандидат тут був жорстко «anthropic» з
 * підписом «current default», хоча `LLM_*_PROVIDER` за замовчуванням
 * `openrouter`. Стенд міряв як «прод» фолбек-модель, якою прод ходить лише
 * при відмові шлюзу. Перший кандидат лишається базою порівняння у звіті.
 */

import { env } from "../../src/env/env.js";
import type { LLMProviderName } from "../../src/lib/llm/provider.js";
import type { Candidate } from "./types.js";

export function prodRoutedCandidates(
  provider: LLMProviderName,
  openrouterModel: string,
  anthropicModel: string,
): Candidate[] {
  // Той самий порядок, що в `getLLMProvider`: per-path → OPENROUTER_MODEL → id виклику.
  const viaGateway = openrouterModel || env.OPENROUTER_MODEL || anthropicModel;
  if (provider === "openrouter") {
    return [
      {
        provider: "openrouter",
        model: viaGateway,
        label: "current default (OpenRouter)",
      },
      {
        provider: "anthropic",
        model: anthropicModel,
        label: "fallback (Anthropic direct)",
      },
    ];
  }
  return [
    {
      provider: "anthropic",
      model: anthropicModel,
      label: "current default (Anthropic)",
    },
    { provider: "openrouter", model: viaGateway, label: "OpenRouter gateway" },
  ];
}
