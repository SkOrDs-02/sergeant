/**
 * Лоадер кешованої фікстури ембеддингів.
 *
 * Файл майже цілком складається з перевірок, і кожна з них стереже той
 * самий клас аварії, описаний у його шапці: розбіжність між фікстурою і
 * поточним конфігом дає НЕ помилку, а тихий «recall 0.0». `vectorStore.query`
 * фільтрує рядки за `embedding_model`, тож чужа модель просто не знайде
 * нічого, і евал відрапортує смерть RAG там, де розійшовся env.
 *
 * Тому тест перевіряє не «щасливий шлях і досить», а що КОЖЕН запобіжник
 * справді спрацьовує. Мовчазний запобіжник тут гірший за його відсутність:
 * він створює враження перевіреного.
 *
 * `VOYAGE_EMBEDDING_DIM` підмінюється на 4, тож синтетичний .bin важить
 * 12 КБ замість 3 МБ. Розмірність тут довільна — модуль її не інтерпретує,
 * лише звіряє з маніфестом і ріже буфер.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Розмірність фікстури в тестах. */
const DIM = 4;
const MODEL = "voyage-3.5-lite";
const EMB_VERSION = "1";

type FixtureModule = typeof import("./embeddingFixture.js");

let mod: FixtureModule;
let docCount: number;
let queryCount: number;
let corpusFingerprint: string;
let goldenFingerprint: string;
let dir: string;

interface ManifestOverrides {
  version?: string;
  embeddingModel?: string;
  embeddingVersion?: string;
  dim?: number;
  docCount?: number;
  queryCount?: number;
  corpusFingerprint?: string;
  goldenFingerprint?: string;
  embeddingsSha256?: string;
}

/**
 * Кладе в теку узгоджену пару .bin + маніфест. `overrides` псує рівно одне
 * поле — так кожен тест б'є в один запобіжник, а не в кілька відразу.
 *
 * `vectorCount` дозволяє написати буфер іншої довжини, ніж обіцяє маніфест:
 * це єдиний спосіб дійти до перевірки байтів, бо sha рахується вже по
 * фактично записаному буферу.
 */
function writeFixture(
  overrides: ManifestOverrides = {},
  vectorCount = docCount + queryCount,
): void {
  const buffer = Buffer.alloc(vectorCount * DIM * 4);
  for (let i = 0; i < vectorCount; i++) {
    // Перший float кожного вектора несе його індекс — так порядок читається
    // з асертів без розшифровки.
    buffer.writeFloatLE(i, i * DIM * 4);
  }
  writeFileSync(join(dir, "embeddings-v1.bin"), buffer);

  const manifest = {
    version: "v1",
    embeddingModel: MODEL,
    embeddingVersion: EMB_VERSION,
    dim: DIM,
    docCount,
    queryCount,
    corpusFingerprint,
    goldenFingerprint,
    embeddingsSha256: createHash("sha256").update(buffer).digest("hex"),
    ...overrides,
  };
  writeFileSync(
    join(dir, "embeddings-v1.manifest.json"),
    JSON.stringify(manifest),
  );
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VOYAGE_EMBEDDING_DIM", String(DIM));
  vi.stubEnv("VOYAGE_EMBEDDING_MODEL", MODEL);
  vi.stubEnv("AI_MEMORY_EMBEDDING_VERSION", EMB_VERSION);

  mod = await import("./embeddingFixture.js");
  const corpus = await import("./corpus.js");
  const golden = await import("./golden.js");

  const corpusSet = corpus.loadDefaultCorpusSet();
  const goldenSet = golden.loadDefaultGoldenSet();
  docCount = corpusSet.docs.length;
  queryCount = goldenSet.queries.length;
  corpusFingerprint = corpus.corpusTextsFingerprint(corpusSet);
  goldenFingerprint = golden.goldenQueriesFingerprint(goldenSet);

  dir = mkdtempSync(join(tmpdir(), "rag-eval-fixture-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("fixturePaths", () => {
  it("складає всі чотири шляхи від переданої теки", () => {
    const paths = mod.fixturePaths("/десь/тут");
    expect(paths.bin).toBe("/десь/тут/embeddings-v1.bin");
    expect(paths.manifest).toBe("/десь/тут/embeddings-v1.manifest.json");
    expect(paths.corpus).toBe("/десь/тут/corpus.json");
    expect(paths.golden).toBe("/десь/тут/golden.json");
  });

  it("без аргументу веде у __fixtures__/rag-eval репозиторію", () => {
    // Генератор і лоадер мусять дивитись в одне місце — розʼїзд тут дав би
    // «фікстури немає» на рівному місці.
    expect(mod.fixturePaths().bin).toContain("__fixtures__/rag-eval");
  });

  it("імʼя .bin несе версію формату", () => {
    expect(mod.fixturePaths("/x").bin).toContain(mod.EMBEDDING_FIXTURE_VERSION);
  });
});

describe("loadEmbeddingFixture — щасливий шлях", () => {
  it("віддає вектор на кожен документ і кожен запит", () => {
    writeFixture();
    const fixture = mod.loadEmbeddingFixture(dir);

    expect(fixture.docEmbeddings.size).toBe(docCount);
    expect(fixture.queryEmbeddings.size).toBe(queryCount);
    expect(fixture.model).toBe(MODEL);
    expect(fixture.embeddingVersion).toBe(EMB_VERSION);
    expect(fixture.dim).toBe(DIM);
  });

  it("читає .bin у контрактному порядку: спершу документи, далі запити", () => {
    writeFixture();
    const fixture = mod.loadEmbeddingFixture(dir);

    // Порядок у .bin — це і є весь контракт формату: жодних id усередині
    // файлу немає, зсув рахується з позиції в corpus.json / golden.json.
    const firstDoc = [...fixture.docEmbeddings.values()][0];
    const firstQuery = [...fixture.queryEmbeddings.values()][0];
    expect(firstDoc?.[0]).toBe(0);
    expect(firstQuery?.[0]).toBe(docCount);
    expect(firstDoc).toHaveLength(DIM);
  });
});

describe("loadEmbeddingFixture — запобіжники", () => {
  it("немає файлів — каже, чого саме бракує, і як перегенерувати", () => {
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/фікстури немає/);
    // Повідомлення мусить нести команду: людина читає його раз на півроку.
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/rag-eval:embed/);
  });

  it("чужа версія формату", () => {
    writeFixture({ version: "v0" });
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/версія фікстури v0/);
  });

  it("чужа модель — з поясненням, чому це не «recall 0.0»", () => {
    writeFixture({ embeddingModel: "voyage-3-large" });
    // Саме той випадок, заради якого перевірки стоять ДО засіву бази.
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(
      /voyage-3-large.*VOYAGE_EMBEDDING_MODEL/s,
    );
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/recall 0\.0/);
  });

  it("чужа версія ембеддингів", () => {
    writeFixture({ embeddingVersion: "2" });
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(
      /версія ембеддингів "2"/,
    );
  });

  it("чужа розмірність", () => {
    writeFixture({ dim: DIM + 1 });
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/розмірність 5/);
  });

  it("тексти корпусу змінились після ембеддингу", () => {
    writeFixture({ corpusFingerprint: "0".repeat(64) });
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(
      /тексти корпусу змінились/,
    );
  });

  it("тексти запитів змінились після ембеддингу", () => {
    writeFixture({ goldenFingerprint: "0".repeat(64) });
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(
      /тексти запитів змінились/,
    );
  });

  it("вміст .bin розійшовся з sha у маніфесті", () => {
    writeFixture({ embeddingsSha256: "0".repeat(64) });
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/файл пошкоджений/);
  });

  it("маніфест обіцяє не ту кількість документів", () => {
    writeFixture({ docCount: docCount - 1 });
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/маніфест обіцяє/);
  });

  it("байтів у .bin менше, ніж обіцяє контракт", () => {
    // Маніфест узгоджений, sha правильна для КОРОТШОГО буфера — інакше
    // впала б попередня перевірка і ця лишилась би недосяжною.
    writeFixture({}, docCount + queryCount - 1);
    expect(() => mod.loadEmbeddingFixture(dir)).toThrow(/\.bin має \d+ B/);
  });
});
