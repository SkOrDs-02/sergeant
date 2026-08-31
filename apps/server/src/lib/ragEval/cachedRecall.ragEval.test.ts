/**
 * Гейт RAG-евалу: справжній pgvector-пошук на кешованих ембеддингах.
 *
 * Що тут справжнє і що кешоване. Кешовані лише вектори — платна частина.
 * Пошук справжній: той самий `createPgVectorStore`, той самий HNSW, та
 * сама косинусна відстань, ті самі `hnsw.ef_search` і `topK`, що в проді.
 * Тому падіння recall тут означає регресію retrieval-шляху, а не
 * розбіжність із реплікою.
 *
 * Два режими:
 *  - звичайний — порівняння з `baseline.json`, падіння > 0.05 валить;
 *  - `RAG_EVAL_WRITE_BASELINE=1` — записати базову лінію. Перший прогін
 *    нічого не гейтить: пороги 0.5/0.4 у `recall.ts` калібрувались під
 *    мок, і гейтити від успадкованого числа означало б гейтити навмання.
 *
 * Живий шар (`ragEvalLive.ts`) ділить із цим сьютом корпус, запити,
 * pgvector і параметри пошуку. Єдина змінна там — вектори, тому дельта
 * означає рівно одне: Voyage змінився під нами.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPgVectorStore } from "../../modules/ai-memory/vectorStore.js";
import type {
  MemoryWrite,
  VectorStore,
} from "../../modules/ai-memory/types.js";
import { env } from "../../env.js";
import { loadDefaultCorpusSet } from "./corpus.js";
import { loadDefaultGoldenSet } from "./golden.js";
import { loadEmbeddingFixture } from "./embeddingFixture.js";
import {
  aggregateMetrics,
  precisionAt1,
  recallAtK,
  reciprocalRank,
  type PerQueryMetrics,
} from "./recall.js";
import {
  ensureUser,
  startPgVector,
  stopPgVector,
  type PgVectorHandle,
} from "./testcontainer.js";

const TIMEOUT_MS = 240_000;
const USER_ID = "rag-eval-fixture-user";

/** Максимальне падіння mean recall@K від базової лінії. Та сама семантика, що в CLI. */
const MAX_REGRESSION = 0.05;
/** Абсолютна підлога — навіть якщо базова лінія колись просяде. */
const ABSOLUTE_FLOOR = 0.5;
/** Скільки запитів можуть змінити порядок видачі без падіння гейту. */
const MAX_ORDER_CHANGES = 2;

const BASELINE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "__fixtures__",
  "rag-eval",
  "baseline.json",
);

interface BaselinePerQuery {
  recall: number;
  precisionAt1: 0 | 1;
  reciprocalRank: number;
}
interface Baseline {
  comment: string;
  embeddingModel: string;
  topK: number;
  metrics: { recallAtK: number; precisionAt1: number; mrr: number };
  perQuery: Record<string, BaselinePerQuery>;
}

const corpus = loadDefaultCorpusSet();
const golden = loadDefaultGoldenSet();

let handle: PgVectorHandle = { skipReason: "not started" };
let store: VectorStore | undefined;
const perQuery: Record<string, PerQueryMetrics> = {};
const retrievedByQuery: Record<string, string[]> = {};

beforeAll(async () => {
  handle = await startPgVector("rag-eval");
  if (!handle.pool) return;

  // Перевірки маніфесту стоять ДО засіву навмисно: розбіжність
  // VOYAGE_EMBEDDING_MODEL з фікстурою інакше проявилась би як
  // «recall 0.0, RAG помер» замість помилки конфігу.
  const fixture = loadEmbeddingFixture();

  await ensureUser(handle.pool, USER_ID);
  store = createPgVectorStore(handle.pool);

  const writes: MemoryWrite[] = corpus.docs.map((doc) => {
    const embedding = fixture.docEmbeddings.get(doc.id);
    if (!embedding) throw new Error(`Немає вектора для ${doc.id}`);
    return {
      userId: USER_ID,
      source: doc.source,
      sourceRef: doc.sourceRef,
      content: doc.content,
      embedding,
      embeddingMeta: {
        provider: "voyage",
        model: fixture.model,
        version: fixture.embeddingVersion,
        dim: fixture.dim,
      },
      metadata: { role: doc.role, entity: doc.entity },
    };
  });

  // Батчами — один INSERT на 730 рядків перевищив би ліміт параметрів pg.
  for (let i = 0; i < writes.length; i += 100) {
    await store.upsert(writes.slice(i, i + 100));
  }

  for (const query of golden.queries) {
    const embedding = fixture.queryEmbeddings.get(query.id);
    if (!embedding) throw new Error(`Немає вектора для запиту ${query.id}`);
    const results = await store.query({
      userId: USER_ID,
      embedding,
      topK: golden.topK,
    });
    const retrieved = results.map((r) => `${r.source}:${r.sourceRef}`);
    retrievedByQuery[query.id] = retrieved;
    perQuery[query.id] = {
      recall: recallAtK(retrieved, query.expected_memory_ids, golden.topK),
      precisionAt1: precisionAt1(retrieved, query.expected_memory_ids),
      reciprocalRank: reciprocalRank(retrieved, query.expected_memory_ids),
    };
  }
}, TIMEOUT_MS);

afterAll(async () => {
  await stopPgVector(handle);
}, TIMEOUT_MS);

/**
 * Поза CI сьют пропускається, якщо Docker недоступний. Перевірка тут, а
 * не в `describe.skipIf`: skipIf обчислюється під час збору тестів, до
 * `beforeAll`, коли контейнер ще не пробували підняти. У CI
 * `startPgVector` кидає раніше — мовчазний пропуск там неприпустимий.
 */
function skipWithoutDocker(): boolean {
  if (handle.skipReason === null) return false;
  console.warn(`[rag-eval] пропуск: ${handle.skipReason}`);
  return true;
}

describe("rag-eval cached recall", () => {
  it("засіяно весь корпус і жоден запит не повернув порожньо", () => {
    if (skipWithoutDocker()) return;
    expect(Object.keys(perQuery)).toHaveLength(golden.queries.length);
    const empty = Object.entries(retrievedByQuery)
      .filter(([, r]) => r.length === 0)
      .map(([id]) => id);
    expect(empty).toEqual([]);
  });

  it("друкує метрики і порівнює з базовою лінією", () => {
    if (skipWithoutDocker()) return;
    const metrics = aggregateMetrics(Object.values(perQuery));
    const summary = {
      recallAtK: round(metrics.recallAtK.mean),
      precisionAt1: round(metrics.precisionAt1.mean),
      mrr: round(metrics.mrr.mean),
    };
    console.log(
      `[rag-eval] topK=${golden.topK} recall@K=${summary.recallAtK} P@1=${summary.precisionAt1} MRR=${summary.mrr}`,
    );

    if (process.env["RAG_EVAL_WRITE_BASELINE"] === "1") {
      // Режим запису: гейтимо лише осудність. Число, яке звідси
      // вийде, рев'юїть людина, і лише наступним PR воно стає гейтом.
      expect(summary.recallAtK).toBeGreaterThan(0);
      expect(summary.recallAtK).toBeLessThan(1.0);

      const baseline: Baseline = {
        comment:
          "AUTO-GENERATED базова лінія RAG-евалу. Перезаписати: RAG_EVAL_WRITE_BASELINE=1 pnpm --filter @sergeant/server test:rag-eval. Бампає людина — авторатчет при роздільності метрики 0.02 осцилював би.",
        embeddingModel: env.VOYAGE_EMBEDDING_MODEL,
        topK: golden.topK,
        metrics: summary,
        perQuery: Object.fromEntries(
          Object.entries(perQuery).map(([id, m]) => [
            id,
            {
              recall: round(m.recall),
              precisionAt1: m.precisionAt1,
              reciprocalRank: round(m.reciprocalRank),
            },
          ]),
        ),
      };
      writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
      console.log(`[rag-eval] базову лінію записано у ${BASELINE_PATH}`);
      return;
    }

    if (!existsSync(BASELINE_PATH)) {
      throw new Error(
        `Базової лінії немає (${BASELINE_PATH}). Створити: RAG_EVAL_WRITE_BASELINE=1 pnpm --filter @sergeant/server test:rag-eval`,
      );
    }
    const baseline = JSON.parse(
      readFileSync(BASELINE_PATH, "utf-8"),
    ) as Baseline;

    const delta = summary.recallAtK - baseline.metrics.recallAtK;
    console.log(
      `[rag-eval] базова лінія ${baseline.metrics.recallAtK}, дельта ${delta >= 0 ? "+" : ""}${round(delta)}`,
    );

    expect(summary.recallAtK).toBeGreaterThanOrEqual(ABSOLUTE_FLOOR);
    expect(delta).toBeGreaterThan(-MAX_REGRESSION);

    // Порядок видачі: P@1 змінився — значить перший результат інший.
    // HNSW не має сіда, тому невеликий дрейф допускається; масовий
    // означає, що зламався сам retrieval.
    const orderChanges = Object.entries(perQuery)
      .filter(
        ([id, m]) => baseline.perQuery[id]?.precisionAt1 !== m.precisionAt1,
      )
      .map(([id]) => id);
    expect(
      orderChanges.length,
      `порядок змінився: ${orderChanges.join(", ")}`,
    ).toBeLessThanOrEqual(MAX_ORDER_CHANGES);
  });

  it("два послідовні прогони дають однакову видачу", async () => {
    if (skipWithoutDocker()) return;
    if (!store) throw new Error("store не піднявся");
    const fixture = loadEmbeddingFixture();
    for (const query of golden.queries.slice(0, 10)) {
      const embedding = fixture.queryEmbeddings.get(query.id)!;
      const again = await store.query({
        userId: USER_ID,
        embedding,
        topK: golden.topK,
      });
      expect(again.map((r) => `${r.source}:${r.sourceRef}`)).toEqual(
        retrievedByQuery[query.id],
      );
    }
  });
});

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
