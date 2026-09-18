/**
 * Лоадер кешованих ембеддингів корпусу RAG-евалу.
 *
 * Фікстура - це `embeddings-v1.bin` (щільний масив float32 LE) плюс
 * маніфест із контрактом. Порядок у .bin: спершу документи в порядку
 * `corpus.json`, далі запити в порядку `golden.json`.
 *
 * AI-DANGER: усі перевірки маніфесту стоять ДО засіву бази, а не після.
 * Причина конкретна: `vectorStore.query` фільтрує рядки за
 * `embedding_model = env.VOYAGE_EMBEDDING_MODEL`. Якщо змінна розійдеться
 * з фікстурою, пошук поверне нуль рядків на кожен запит - і евал чесно
 * відрапортує «recall 0.0, RAG помер» там, де насправді розбіжність
 * конфігу. Fail-loud до засіву перетворює цю пастку на зрозумілу помилку.
 *
 * Відбитки у маніфесті свідомо зчіплюють фікстуру з її входом: правка
 * тексту документа або запиту валить завантаження, доки не перезапустять
 * `rag-eval:embed`. Це навмисно - мовчазна розбіжність тексту й вектора
 * зробила б усі числа фікцією. Відбиток береться з **текстів**, а не з
 * цілих файлів: роль, сутність і форматування на вектори не впливають, і
 * вимагати за їх правку платного переембеддингу було б безглуздо.
 */

/* eslint-disable security/detect-non-literal-fs-filename --
   Усі шляхи тут будує `fixturePaths()` із констант репозиторію; жоден не
   приходить із запиту, вводу чи мережі. */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../../env.js";
import { corpusTextsFingerprint, loadDefaultCorpusSet } from "./corpus.js";
import { goldenQueriesFingerprint, loadDefaultGoldenSet } from "./golden.js";

/** Версія формату фікстури. Змінюється разом з іменем .bin-файлу. */
export const EMBEDDING_FIXTURE_VERSION = "v1";

export interface EmbeddingFixture {
  /** Вектор кожного документа корпусу, за його `<source>:<sourceRef>` id. */
  docEmbeddings: Map<string, Float32Array>;
  /** Вектор кожного запиту golden-set, за його id. */
  queryEmbeddings: Map<string, Float32Array>;
  model: string;
  embeddingVersion: string;
  dim: number;
}

export interface FixturePaths {
  bin: string;
  manifest: string;
  corpus: string;
  golden: string;
}

/** Шляхи фікстури в одному місці - щоб генератор і лоадер не розʼїхались. */
export function fixturePaths(fixtureDir?: string): FixturePaths {
  const dir =
    fixtureDir ??
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "__fixtures__",
      "rag-eval",
    );
  return {
    bin: resolve(dir, `embeddings-${EMBEDDING_FIXTURE_VERSION}.bin`),
    manifest: resolve(
      dir,
      `embeddings-${EMBEDDING_FIXTURE_VERSION}.manifest.json`,
    ),
    corpus: resolve(dir, "corpus.json"),
    golden: resolve(dir, "golden.json"),
  };
}

function fail(message: string): never {
  throw new Error(
    `[rag-eval fixture] ${message}\nПерегенерувати: pnpm --filter @sergeant/server rag-eval:embed (потрібен VOYAGE_API_KEY).`,
  );
}

/**
 * Читає фікстуру й валідує її проти поточного env і поточних текстів.
 * Кидає з поясненням при будь-якій розбіжності.
 */
export function loadEmbeddingFixture(fixtureDir?: string): EmbeddingFixture {
  const paths = fixturePaths(fixtureDir);

  if (!existsSync(paths.bin) || !existsSync(paths.manifest)) {
    fail(`фікстури немає (${paths.bin})`);
  }

  const manifest = JSON.parse(readFileSync(paths.manifest, "utf-8")) as {
    version: string;
    embeddingModel: string;
    embeddingVersion: string;
    dim: number;
    docCount: number;
    queryCount: number;
    corpusFingerprint: string;
    goldenFingerprint: string;
    embeddingsSha256: string;
  };

  if (manifest.version !== EMBEDDING_FIXTURE_VERSION) {
    fail(
      `версія фікстури ${manifest.version} ≠ очікуваної ${EMBEDDING_FIXTURE_VERSION}`,
    );
  }
  if (manifest.embeddingModel !== env.VOYAGE_EMBEDDING_MODEL) {
    fail(
      `модель у фікстурі "${manifest.embeddingModel}" ≠ VOYAGE_EMBEDDING_MODEL "${env.VOYAGE_EMBEDDING_MODEL}". ` +
        "З таким розходженням vectorStore.query відфільтрував би всі рядки і показав би recall 0.0 замість помилки конфігу.",
    );
  }
  if (manifest.embeddingVersion !== env.AI_MEMORY_EMBEDDING_VERSION) {
    fail(
      `версія ембеддингів "${manifest.embeddingVersion}" ≠ AI_MEMORY_EMBEDDING_VERSION "${env.AI_MEMORY_EMBEDDING_VERSION}"`,
    );
  }
  if (manifest.dim !== env.VOYAGE_EMBEDDING_DIM) {
    fail(
      `розмірність ${manifest.dim} ≠ VOYAGE_EMBEDDING_DIM ${env.VOYAGE_EMBEDDING_DIM}`,
    );
  }

  const corpus = loadDefaultCorpusSet();
  const golden = loadDefaultGoldenSet();

  if (corpusTextsFingerprint(corpus) !== manifest.corpusFingerprint) {
    fail("тексти корпусу змінились після ембеддингу - вектори більше не їхні");
  }
  if (goldenQueriesFingerprint(golden) !== manifest.goldenFingerprint) {
    fail(
      "тексти запитів змінились після ембеддингу - вектори запитів застаріли",
    );
  }

  const buffer = readFileSync(paths.bin);
  const binSha = createHash("sha256").update(buffer).digest("hex");
  if (binSha !== manifest.embeddingsSha256) {
    fail("вміст .bin не збігається з sha у маніфесті - файл пошкоджений");
  }

  if (
    manifest.docCount !== corpus.docs.length ||
    manifest.queryCount !== golden.queries.length
  ) {
    fail(
      `маніфест обіцяє ${manifest.docCount} документів і ${manifest.queryCount} запитів, ` +
        `а на диску ${corpus.docs.length} і ${golden.queries.length}`,
    );
  }

  const dim = manifest.dim;
  const expectedBytes = (manifest.docCount + manifest.queryCount) * dim * 4;
  if (buffer.byteLength !== expectedBytes) {
    fail(`.bin має ${buffer.byteLength} B, очікували ${expectedBytes} B`);
  }

  const readVector = (index: number): Float32Array => {
    const vec = new Float32Array(dim);
    let offset = index * dim * 4;
    for (let i = 0; i < dim; i++) {
      vec[i] = buffer.readFloatLE(offset);
      offset += 4;
    }
    return vec;
  };

  const docEmbeddings = new Map<string, Float32Array>();
  corpus.docs.forEach((doc, i) => {
    docEmbeddings.set(doc.id, readVector(i));
  });

  const queryEmbeddings = new Map<string, Float32Array>();
  golden.queries.forEach((query, i) => {
    queryEmbeddings.set(query.id, readVector(manifest.docCount + i));
  });

  return {
    docEmbeddings,
    queryEmbeddings,
    model: manifest.embeddingModel,
    embeddingVersion: manifest.embeddingVersion,
    dim,
  };
}
