/**
 * Zod schema + loader для golden-set fixture (PR-20 eval harness + PR-22
 * RAG quality gate).
 *
 * Файл fixture: `apps/server/src/__fixtures__/rag-eval/golden.json`.
 *
 * PR-20 формалізує schema під PR-plan-2026-05 specs (field
 * `expected_memory_ids`). У JSON IDs тримаються як стабільні refs
 * формату `<source>:<sourceRef>` (а не raw `ai_memories.id`), бо
 * `id` (BIGSERIAL) залежить від re-seeding-у БД, а `<source>:<sourceRef>`
 * детермінований від домена. Реальний retrieval-pipeline (PR-20 live
 * mode) маппіть `MemoryQueryResult.{source, sourceRef}` у цей же
 * формат перед порівнянням з `expectedMemoryIds`.
 *
 * Caller-и:
 *   - `scripts/eval-rag-recall.mjs` (CLI).
 *   - `apps/server/src/lib/ragEval/golden.test.ts` (validation).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { ALLOWED_MEMORY_SOURCES } from "../../modules/ai-memory/types.js";

const DOMAIN_SCHEMA = z.enum(ALLOWED_MEMORY_SOURCES);

export const GoldenQuerySchema = z.object({
  /** Унікальний id (стабільний). Формат: `<domain>-NNN`. */
  id: z.string().min(1),
  /** Memory-source domain — має бути у `ALLOWED_MEMORY_SOURCES`. */
  domain: DOMAIN_SCHEMA,
  /** Natural-language query. */
  query: z.string().min(1),
  /**
   * Очікувані memory IDs у топ-K retrieval. Формат:
   * `<source>:<sourceRef>` (стабільне посилання на `ai_memories` row;
   * див. moduledoc). Порядок не важливий — recall@K і P@1 розглядають
   * членство; MRR — позицію першого hit-у у `retrieved`.
   *
   * Snake_case у JSON узгоджений з PR-plan-2026-05.md § PR-20 spec.
   */

  expected_memory_ids: z.array(z.string().min(1)).min(1),
});

export const GoldenSetSchema = z.object({
  version: z.string().min(1),
  comment: z.string().optional(),
  embeddingModel: z.string().min(1),
  embeddingVersion: z.string().min(1),
  /** Default K для recall — задається у fixture для self-documenting. */
  topK: z.number().int().positive(),
  queries: z.array(GoldenQuerySchema).min(1),
});

export type GoldenQuery = z.infer<typeof GoldenQuerySchema>;
export type GoldenSet = z.infer<typeof GoldenSetSchema>;

/**
 * Парсить JSON-buffer у `GoldenSet`. Pure — без I/O. Корисна для unit-
 * тестів і CLI з `--golden=<path>` overрайдом.
 */
export function parseGoldenSet(raw: unknown): GoldenSet {
  const parsed = GoldenSetSchema.parse(raw);
  const seenIds = new Set<string>();
  for (const q of parsed.queries) {
    if (seenIds.has(q.id)) {
      throw new Error(`Duplicate golden query id: ${q.id}`);
    }
    seenIds.add(q.id);
  }
  return parsed;
}

/**
 * Завантажує canonical fixture з диска (apps/server/src/__fixtures__/).
 * Викликається CLI у default-режимі.
 */
export function loadDefaultGoldenSet(): GoldenSet {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixturePath = resolve(
    here,
    "..",
    "..",
    "__fixtures__",
    "rag-eval",
    "golden.json",
  );
  const raw = JSON.parse(readFileSync(fixturePath, "utf-8")) as unknown;
  return parseGoldenSet(raw);
}
