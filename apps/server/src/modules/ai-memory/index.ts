/**
 * Public surface AI memory модуля. Caller-и (PR2 ingestion + PR3
 * retrieval) імпортують лише звідси — нікуди в `./vectorStore.ts` чи
 * `./embeddings.ts` напряму. Це робить майбутню заміну реалізації
 * (наприклад, pgvector → Turbopuffer) localized.
 */

export type { AiMemoryService, RecallInput, RememberInput } from "./service.js";
export { createAiMemoryService } from "./service.js";
export { ALLOWED_MEMORY_SOURCES } from "./types.js";
export type {
  EmbeddingMetadata,
  EmbeddingProvider,
  MemoryQueryOptions,
  MemoryQueryResult,
  MemorySource,
  MemoryWrite,
  VectorStore,
} from "./types.js";
export {
  MissingVoyageApiKeyError,
  VoyageContractError,
  VoyageHttpError,
  createVoyageEmbeddings,
} from "./embeddings.js";
export { createPgVectorStore } from "./vectorStore.js";
