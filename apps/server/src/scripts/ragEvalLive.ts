/**
 * Живий шар RAG-евалу: ті самі запити й той самий корпус, але вектори
 * беруться з Voyage просто зараз, а не з фікстури.
 *
 * Що означає дельта між цим прогоном і кешованим гейтом. Обидва ділять
 * корпус, запити, pgvector, HNSW-параметри й `topK` - єдина змінна тут
 * вектори. Тому розбіжність означає рівно одне, і це варто читати
 * буквально: **не «твій код зламався»** (це ловить PR-гейт, і він
 * безкоштовний), а «Voyage змінився під тобою» - тихий підмін моделі,
 * зміна нормалізації, дрейф ембеддингів.
 *
 * Цей прогін нічого не блокує і нічого не гасить: він алертить. Гейт,
 * який іноді червоніє сам через недетермінованість і мережу, люди
 * навчаються ігнорувати за два тижні.
 *
 * Вартість - близько $0.0012 за прогін (voyage-3.5-lite, ~60k токенів).
 * Переембеджуємо весь корпус, а не лише запити: часткове
 * переембеджування нічого не економить і сліпне саме там, де підмін
 * моделі й проявився б - у векторах документів.
 *
 * Usage:
 *   pnpm --filter @sergeant/server rag-eval:live
 *   pnpm --filter @sergeant/server rag-eval:live -- --output=report.json
 */

/* eslint-disable security/detect-non-literal-fs-filename --
   Єдиний запис - звіт у шлях, який оператор сам передав через --output. */

import { writeFileSync } from "node:fs";

import { env } from "../env.js";
import { createVoyageEmbeddings } from "../modules/ai-memory/embeddings.js";
import { createPgVectorStore } from "../modules/ai-memory/vectorStore.js";
import type { MemoryWrite } from "../modules/ai-memory/types.js";
import { loadDefaultCorpusSet } from "../lib/ragEval/corpus.js";
import { loadDefaultGoldenSet } from "../lib/ragEval/golden.js";
import {
  aggregateMetrics,
  classifyRecall,
  precisionAt1,
  recallAtK,
  reciprocalRank,
  statusToExitCode,
  type PerQueryMetrics,
} from "../lib/ragEval/recall.js";
import {
  ensureUser,
  startPgVector,
  stopPgVector,
} from "../lib/ragEval/testcontainer.js";
import { embedSequentially } from "../lib/ragEval/pacedEmbedding.js";

const USER_ID = "rag-eval-live-user";

function outputPath(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : null;
}

async function main(): Promise<void> {
  if (!env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY не заданий - живий прогін неможливий.");
  }

  const corpus = loadDefaultCorpusSet();
  const golden = loadDefaultGoldenSet();

  const handle = await startPgVector("rag-eval-live");
  if (!handle.pool) {
    throw new Error(`pgvector не піднявся: ${handle.skipReason}`);
  }

  try {
    const provider = createVoyageEmbeddings();
    const docTexts = corpus.docs.map((d) => d.content);
    const queryTexts = golden.queries.map((q) => q.query);

    console.log(
      `Живий ембеддинг ${docTexts.length + queryTexts.length} текстів, модель ${env.VOYAGE_EMBEDDING_MODEL}`,
    );
    // Послідовно, з витримкою темпу - інакше 25 паралельних батчів
    // вибивають 429 на акаунті без платіжного методу і відкривають
    // circuit breaker. Саме на цьому перший живий прогін і впав.
    const vectors = await embedSequentially(
      provider,
      [...docTexts, ...queryTexts],
      (done, total) => console.log(`  ${done}/${total} векторів`),
    );

    await ensureUser(handle.pool, USER_ID);
    const store = createPgVectorStore(handle.pool);

    const writes: MemoryWrite[] = corpus.docs.map((doc, i) => ({
      userId: USER_ID,
      source: doc.source,
      sourceRef: doc.sourceRef,
      content: doc.content,
      embedding: vectors[i]!,
      embeddingMeta: provider.meta,
      metadata: { role: doc.role, entity: doc.entity },
    }));
    for (let i = 0; i < writes.length; i += 100) {
      await store.upsert(writes.slice(i, i + 100));
    }

    const perQuery: PerQueryMetrics[] = [];
    for (const [i, query] of golden.queries.entries()) {
      const results = await store.query({
        userId: USER_ID,
        embedding: vectors[corpus.docs.length + i]!,
        topK: golden.topK,
      });
      const retrieved = results.map((r) => `${r.source}:${r.sourceRef}`);
      perQuery.push({
        recall: recallAtK(retrieved, query.expected_memory_ids, golden.topK),
        precisionAt1: precisionAt1(retrieved, query.expected_memory_ids),
        reciprocalRank: reciprocalRank(retrieved, query.expected_memory_ids),
      });
    }

    const metrics = aggregateMetrics(perQuery);
    const classification = classifyRecall(metrics.recallAtK.mean);
    const summary = {
      version: "2.0",
      ranAt: new Date().toISOString(),
      mode: "live",
      topK: golden.topK,
      embeddingModel: env.VOYAGE_EMBEDDING_MODEL,
      thresholds: {
        warn: classification.warnThreshold,
        kill: classification.killThreshold,
      },
      metrics,
      status: classification.status,
      // Зберігаємо для сумісності зі звітами CLI, але процесом НЕ виходимо
      // з цим кодом - див. нижче.
      exitCode: statusToExitCode(classification.status),
      // Свідомо НЕ шлемо `autoDisable`: живий шар алертить, а не гасить.
    };

    console.log(JSON.stringify(summary, null, 2));
    const out = outputPath();
    if (out) writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);

    // Успішний прогін завершується нулем незалежно від `warn`/`kill`:
    // деградація якості - це сигнал у звіті, а не поломка прогону.
    // Ненульовий код тут означав би рівно одне - евал не відпрацював, і
    // саме тому крок у workflow більше не ховається за `|| true`. Перший
    // живий прогін упав на 429 і лишився зеленим саме через таке
    // змішування «модель просіла» і «скрипт помер».
    if (classification.status !== "pass") {
      console.warn(
        `[rag-eval live] статус ${classification.status}: recall@${golden.topK}=${metrics.recallAtK.mean.toFixed(3)} нижче порога ${classification.warnThreshold}`,
      );
    }
  } finally {
    await stopPgVector(handle);
  }
}

await main();
