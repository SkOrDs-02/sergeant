/**
 * Ембеддить корпус RAG-евалу і запити golden-set у фікстуру, яку далі
 * читає безмережевий гейт.
 *
 * Навіщо кешувати вектори. Платне в RAG - тільки перетворення тексту у
 * вектор. Один раз оплатили, поклали вектори у фікстуру - і далі гейт
 * ганяє справжній HNSW, справжню косинусну відстань і справжній
 * `vectorStore.query` без жодного запиту назовні. Альтернативи гірші:
 * мокати retrieval означало б міряти репліку замість прод-шляху, а
 * ганяти Voyage на кожному PR - це гроші й флейк у блокувальному гейті.
 *
 * Ганяє **прод-клієнт** `createVoyageEmbeddings`, а не власний fetch: так
 * батчинг, ретраї, circuit breaker, маскування і `input_type` збігаються
 * з тим, що робить прод. Форк цієї логіки знищив би сенс евалу.
 *
 * Вартість прогону - близько $0.0012 за прайсом voyage-3.5-lite. Тому
 * переембеджуємо все, а не лише запити: часткове переембеджування нічого
 * не економить і сліпне саме там, де тихий підмін моделі провайдером і
 * проявився б - у векторах документів.
 *
 * Usage:
 *   pnpm --filter @sergeant/server rag-eval:embed
 */

/* eslint-disable security/detect-non-literal-fs-filename --
   Шляхи фікстури приходять із `fixturePaths()`, тобто з констант репо. */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../env.js";
import { embedSequentially } from "../lib/ragEval/pacedEmbedding.js";
import { createVoyageEmbeddings } from "../modules/ai-memory/embeddings.js";
import {
  corpusTextsFingerprint,
  loadDefaultCorpusSet,
} from "../lib/ragEval/corpus.js";
import {
  goldenQueriesFingerprint,
  loadDefaultGoldenSet,
} from "../lib/ragEval/golden.js";
import {
  EMBEDDING_FIXTURE_VERSION,
  fixturePaths,
} from "../lib/ragEval/embeddingFixture.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(here, "..", "__fixtures__", "rag-eval");

interface ManifestInput {
  provider: string;
  model: string;
  version: string;
  dim: number;
  docCount: number;
  queryCount: number;
  corpusFingerprint: string;
  goldenFingerprint: string;
  embeddingsSha256: string;
}

function writeManifest(path: string, input: ManifestInput): void {
  const manifest = {
    version: EMBEDDING_FIXTURE_VERSION,
    generatedBy: "apps/server/src/scripts/ragEvalEmbed.ts",
    comment:
      "AUTO-GENERATED — не правити руками. Перегенерація додає ~3 MiB blob в історію git, тому робиться лише при зміні моделі, розмірності або текстів корпусу.",
    provider: input.provider,
    embeddingModel: input.model,
    embeddingVersion: input.version,
    dim: input.dim,
    // `embeddings.ts` жорстко шле "document" для ВСІХ викликів, включно з
    // ембеддингом пошукового запиту. Фікстура відтворює цю асиметрію, бо
    // інакше евал міряв би пайплайн, якого прод не ганяє. Якщо асиметрію
    // колись виправлять - це поле має протухнути голосно.
    inputType: "document",
    docCount: input.docCount,
    queryCount: input.queryCount,
    corpusFingerprint: input.corpusFingerprint,
    goldenFingerprint: input.goldenFingerprint,
    embeddingsSha256: input.embeddingsSha256,
  };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main(): Promise<void> {
  const corpus = loadDefaultCorpusSet();
  const golden = loadDefaultGoldenSet();
  const paths = fixturePaths(FIXTURE_DIR);

  // Відбитки беруться з текстів, тож правка метаданих корпусу (роль,
  // сутність, `variantOf`) векторів не чіпає - маніфест можна оновити без
  // повторної оплати. Скрипт відмовиться це робити, якщо тексти таки
  // змінились: тоді потрібен справжній переембеддинг.
  if (process.argv.includes("--manifest-only")) {
    const buffer = readFileSync(paths.bin);
    const existing = JSON.parse(readFileSync(paths.manifest, "utf-8")) as {
      docCount: number;
      queryCount: number;
      embeddingsSha256: string;
    };
    const binSha = createHash("sha256").update(buffer).digest("hex");
    if (binSha !== existing.embeddingsSha256) {
      throw new Error(
        ".bin не збігається зі своїм маніфестом - перезапусти повний ембеддинг",
      );
    }
    if (
      existing.docCount !== corpus.docs.length ||
      existing.queryCount !== golden.queries.length
    ) {
      throw new Error(
        "кількість документів або запитів змінилась - потрібен повний ембеддинг",
      );
    }
    writeManifest(paths.manifest, {
      provider: "voyage",
      model: env.VOYAGE_EMBEDDING_MODEL,
      version: env.AI_MEMORY_EMBEDDING_VERSION,
      dim: env.VOYAGE_EMBEDDING_DIM,
      docCount: corpus.docs.length,
      queryCount: golden.queries.length,
      corpusFingerprint: corpusTextsFingerprint(corpus),
      goldenFingerprint: goldenQueriesFingerprint(golden),
      embeddingsSha256: binSha,
    });
    console.log(`✓ ${paths.manifest} оновлено без повторного ембеддингу`);
    return;
  }

  if (!env.VOYAGE_API_KEY) {
    throw new Error(
      "VOYAGE_API_KEY не заданий. Скрипт робить платні виклики Voyage; без ключа фікстуру не побудувати.",
    );
  }

  const docTexts = corpus.docs.map((d) => d.content);
  const queryTexts = golden.queries.map((q) => q.query);
  const total = docTexts.length + queryTexts.length;

  console.log(
    `Ембеддинг ${docTexts.length} документів + ${queryTexts.length} запитів = ${total} векторів, модель ${env.VOYAGE_EMBEDDING_MODEL}, dim ${env.VOYAGE_EMBEDDING_DIM}`,
  );

  const provider = createVoyageEmbeddings();
  // `non-critical` - щоб евал ніколи не зʼїв денний бюджет продової
  // інжесції: при перевищенні soft-порога виклик відхиляється, а не
  // конкурує з живими користувачами.
  const vectors = await embedSequentially(
    provider,
    [...docTexts, ...queryTexts],
    (done, total) => console.log(`  ${done}/${total} векторів`),
  );

  if (vectors.length !== total) {
    throw new Error(
      `Voyage повернув ${vectors.length} векторів замість ${total}`,
    );
  }

  const dim = env.VOYAGE_EMBEDDING_DIM;
  const buffer = Buffer.alloc(total * dim * 4);
  let offset = 0;
  for (const vec of vectors) {
    if (vec.length !== dim) {
      throw new Error(`Вектор має dim=${vec.length}, очікували ${dim}`);
    }
    for (let i = 0; i < dim; i++) {
      buffer.writeFloatLE(vec[i]!, offset);
      offset += 4;
    }
  }
  writeFileSync(paths.bin, buffer);

  writeManifest(paths.manifest, {
    provider: provider.meta.provider,
    model: provider.meta.model,
    version: provider.meta.version,
    dim,
    docCount: docTexts.length,
    queryCount: queryTexts.length,
    corpusFingerprint: corpusTextsFingerprint(corpus),
    goldenFingerprint: goldenQueriesFingerprint(golden),
    embeddingsSha256: createHash("sha256").update(buffer).digest("hex"),
  });

  console.log(`✓ ${paths.bin} (${buffer.byteLength} B)`);
  console.log(`✓ ${paths.manifest}`);
}

await main();
