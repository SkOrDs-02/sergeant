// ─────────────────────────────────────────────────────────────────────────
// recall_memory — wrapper над AiMemoryService з хардкодом source='cofounder'
// ─────────────────────────────────────────────────────────────────────────

import { getAiMemory } from "../ai-memory/bootstrap.js";

export interface RecallMemoryInput {
  query: string;
  topK?: number | undefined;
}

export interface RecallMemoryOutput {
  memories: Array<{
    id: number | string;
    content: string;
    score: number;
    sourceRef: string | null;
    createdAt: string;
  }>;
}

/**
 * Хардкодить `sources=['cofounder']`. Запит будь-якого іншого source-у
 * проходить через service з пустим результатом — strict isolation
 * (ADR-0031 §3).
 */
export async function recallCofounderMemory(
  founderUserId: string,
  input: RecallMemoryInput,
): Promise<RecallMemoryOutput> {
  const results = await getAiMemory().recall({
    userId: founderUserId,
    query: input.query,
    topK: input.topK,
    sources: ["cofounder"],
  });

  return {
    memories: results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      sourceRef: r.sourceRef,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
