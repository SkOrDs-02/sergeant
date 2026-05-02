/**
 * Lazy singleton-bootstrap для AI memory підсистеми. Через `getAiMemory()`
 * фабрика створюється лише при першому виклику — щоб import цього модуля
 * не зачіпав Voyage / pgvector у тестах, які цей сабсистему не торкаються.
 *
 * У foundation-PR (цей) `getAiMemory()` ніким не викликається ще — буде
 * викликатись з PR2 (BullMQ-job ingestion-у) і PR3 (chat retrieval).
 * Експорт у цьому файлі — щоб не довелося чіпати DI у наступних PR-ах.
 */

import pool from "../../db.js";
import { createVoyageEmbeddings } from "./embeddings.js";
import { createPgVectorStore } from "./vectorStore.js";
import { createAiMemoryService, type AiMemoryService } from "./service.js";

let cached: AiMemoryService | undefined;

/**
 * Повертає shared AiMemoryService instance. Lazy — створює при першому
 * виклику.
 *
 * Якщо `AI_MEMORY_ENABLED=false`, service все одно створюється, але
 * `remember()` / `recall()` no-op-нуть (див. `service.ts`). Це
 * навмисно: не хочемо щоб caller-и (PR2 jobs / PR3 chat) перевіряли
 * прапор перед викликом — service сам себе вимикає.
 */
export function getAiMemory(): AiMemoryService {
  if (!cached) {
    cached = createAiMemoryService({
      embeddings: createVoyageEmbeddings(),
      vectorStore: createPgVectorStore(pool),
    });
  }
  return cached;
}

/**
 * Тестовий escape-hatch: реsetapt singleton, щоб тести могли передати
 * mock-овий service. У production не використовувати.
 */
export function __resetAiMemoryForTest(service?: AiMemoryService): void {
  cached = service;
}
