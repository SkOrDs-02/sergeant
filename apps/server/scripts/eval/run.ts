/**
 * Один прогін кейса на кандидаті — через ТОЙ САМИЙ `getLLMProvider()` +
 * `invokeLLM()`, яким ходить прод (жодного окремого HTTP-клієнта).
 */

import { getLLMProvider, invokeLLM } from "../../src/lib/llm/provider.js";
import { estimateCost } from "./cost.js";
import { voiceViolations } from "./judges.js";
import type { Candidate, GoldenCase, Pipeline, RunResult } from "./types.js";

export async function runOne(
  pipeline: Pipeline,
  goldenCase: GoldenCase,
  candidate: Candidate,
  dryRun: boolean,
): Promise<RunResult> {
  const provider = getLLMProvider({
    provider: dryRun ? "stub" : candidate.provider,
    stubResponse: { text: "stub" },
    // Стенд порівнює КОНКРЕТНІ моделі. Fallback-ланцюг тихо підмінив би
    // кандидата іншим провайдером і зробив би рядок таблиці брехнею.
    disableFallback: true,
  });
  const system = goldenCase.system ?? pipeline.system;
  const t0 = Date.now();
  const result = await invokeLLM(provider, {
    model: candidate.model,
    ...(system === undefined ? {} : { system }),
    messages: [{ role: "user", content: goldenCase.user }],
    maxTokens: pipeline.maxTokens,
    endpoint: `internal/model-eval/${pipeline.key}`,
    timeoutMs: 60_000,
  });
  const latencyMs = Date.now() - t0;

  const base = {
    pipeline: pipeline.key,
    caseName: goldenCase.name,
    trap: goldenCase.trap,
    candidate,
    latencyMs,
  };

  if (!result.ok) {
    return {
      ...base,
      ok: false,
      passedJudge: false,
      judgeReason: null,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      costUsd: null,
      text: "",
      voiceFails: null,
      error: `${result.code ?? "error"}: ${result.error}`,
    };
  }

  const inputTokens = result.usage?.inputTokens ?? null;
  const outputTokens = result.usage?.outputTokens ?? null;
  const verdict = (goldenCase.judge ?? pipeline.judge)(result.text);
  return {
    ...base,
    ok: true,
    passedJudge: verdict === true,
    judgeReason: typeof verdict === "string" ? verdict : null,
    inputTokens,
    outputTokens,
    cacheReadTokens: result.usage?.cacheReadInputTokens ?? null,
    costUsd: estimateCost(candidate.model, inputTokens, outputTokens),
    text: result.text,
    voiceFails: pipeline.checkVoice ? voiceViolations(result.text) : null,
  };
}
