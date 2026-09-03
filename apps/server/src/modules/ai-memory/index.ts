/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Перевести існуючих caller-ів (`routes/ai-memory.ts`,
 *           `modules/digest/weekly-digest.ts`, `modules/chat/chat.ts`,
 *           `modules/ai-memory/{recallRoute,ragContext}.ts`,
 *           `index.ts`) на цей barrel замість deep imports у
 *           `./{service,types,embeddings,vectorStore,ingestQueue,bootstrap}.js`.
 *           Як тільки консумери зʼявляться — зняти цей маркер. Див. AGENTS.md → Hard Rule #10.
 *           `modules/ai-memory/ingestRoute.ts` і `modules/mono/webhook.ts`
 *           більше не producer-и — прибрані ініціативою 0024 (PR-1,
 *           2026-09-03).
 *
 * Public surface AI memory модуля. Caller-и (PR2 ingestion + PR3
 * retrieval) мають імпортувати лише звідси — нікуди в `./vectorStore.ts` чи
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
