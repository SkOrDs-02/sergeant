/**
 * Один прогін кейса на кандидаті — через ТОЙ САМИЙ `getLLMProvider()` +
 * `invokeLLM()`, яким ходить прод (жодного окремого HTTP-клієнта).
 */

import { getLLMProvider, invokeLLM } from "../../src/lib/llm/provider.js";
import { estimateCost } from "./cost.js";
import { voiceViolations } from "./judges.js";
import type { Candidate, GoldenCase, Pipeline, RunResult } from "./types.js";

/** Яку env-змінну знімає `getLLMProvider()`, коли їй бракує ключа для провайдера. */
function missingKeyEnvVar(provider: Candidate["provider"]): string {
  return provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENROUTER_API_KEY";
}

/**
 * Чи резолвиться кандидат у власного провайдера прямо зараз.
 *
 * Потрібно, щоб `--skip-unavailable` міг ВІДСІЯТИ кандидата ДО прогону, а не
 * ловити виняток по кожному кейсу. Перевірка та сама, що в гейті нижче.
 */
export function candidateProviderAvailable(candidate: Candidate): boolean {
  return (
    getLLMProvider({
      provider: candidate.provider,
      disableFallback: true,
    }).name === candidate.provider
  );
}

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
  // AI-DANGER: (B44) без ключа `getLLMProvider()` МОВЧКИ повертає
  // `StubProvider` для `anthropic`/`openrouter`. Кандидат далі відпрацьовує
  // за 0 мс і $0, а звіт друкує його оголошену модель з вердиктом — «0/N»
  // читається як «модель провалила всі пастки», хоча її взагалі не
  // викликали (доказ: `z-ai/glm-5.2` — 0/18 заглушкою, 18/18 живим
  // викликом, той самий рядок таблиці). Мовчазний stub у звіті гірший за
  // впалий прогін — тому поза `--dry-run` розбіжність оголошений↔резолвлений
  // провайдер фейлить прогін гучно, з іменем змінної, якої бракує.
  if (!dryRun && provider.name !== candidate.provider) {
    throw new Error(
      `eval stand: кандидат "${candidate.label}" (\`${candidate.model}\`) оголошений як provider="${candidate.provider}", ` +
        `але getLLMProvider() резолвнув "${provider.name}" — ключ ${missingKeyEnvVar(candidate.provider)} не заданий ` +
        `(або порожній), тож виклик мовчки пішов би у StubProvider замість оголошеної моделі. ` +
        `Задай ${missingKeyEnvVar(candidate.provider)}, запусти з --dry-run, ` +
        `або з --skip-unavailable, щоб прогнати лише доступних кандидатів ` +
        `(відсіяні будуть названі у звіті — на відміну від мовчазної заглушки).`,
    );
  }
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
      // Транспортна помилка (B47) — модель не відповіла, це не вердикт
      // судді. `report.ts` виключає такі рядки зі знаменника точності.
      transportFailed: true,
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
    transportFailed: false,
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
