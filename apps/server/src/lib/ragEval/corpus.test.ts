/**
 * Інваріанти корпусу RAG-евалу.
 *
 * Тест безмережевий і без Docker - він стереже саме придатність корпусу,
 * а не якість пошуку. Головне, що він доводить: у корпусі є текст за
 * кожним `expected_memory_ids` із golden-set, і в кожного золотого
 * документа є конкуренти. Без другого recall@4 нічого не міряє: проти
 * випадкових відволікачів з інших доменів він тривіально дорівнює 1.0.
 */

import { describe, it, expect } from "vitest";
import { loadDefaultCorpusSet, parseCorpusSet } from "./corpus.js";
import { loadDefaultGoldenSet } from "./golden.js";
import { ALLOWED_MEMORY_SOURCES } from "../../modules/ai-memory/types.js";

const NEAR_MISS_PER_GOLDEN = 3;

const corpus = loadDefaultCorpusSet();
const golden = loadDefaultGoldenSet();
const byId = new Map(corpus.docs.map((d) => [d.id, d]));

const expectedRefs = [
  ...new Set(golden.queries.flatMap((q) => q.expected_memory_ids)),
];

describe("rag-eval corpus", () => {
  it("парситься схемою і має унікальні id", () => {
    expect(byId.size).toBe(corpus.docs.length);
    expect(corpus.docs.length).toBeGreaterThan(0);
  });

  it("id кожного документа збігається з `source:sourceRef`", () => {
    for (const doc of corpus.docs) {
      expect(doc.id).toBe(`${doc.source}:${doc.sourceRef}`);
    }
  });

  it("кожен source входить у ALLOWED_MEMORY_SOURCES", () => {
    for (const doc of corpus.docs) {
      expect(ALLOWED_MEMORY_SOURCES).toContain(doc.source);
    }
  });

  it("усі expected_memory_ids із golden-set резолвляться в корпусі", () => {
    const missing = expectedRefs.filter((ref) => !byId.has(ref));
    expect(missing).toEqual([]);
  });

  it("кожен очікуваний документ має роль golden", () => {
    for (const ref of expectedRefs) {
      expect(byId.get(ref)?.role).toBe("golden");
    }
  });

  it("на кожен золотий документ є ≥3 власних near-miss", () => {
    // Рахувати по `entity` тут недостатньо: одну сутність ділять кілька
    // золотих документів (три транзакції «кава, тиждень 17»), тож
    // видалення трьох конкурентів одного з них проходило непоміченим -
    // саме так ця перевірка й провалила свою першу перевірку на укус.
    const nearMissByGolden = new Map<string, number>();
    for (const doc of corpus.docs) {
      if (doc.role !== "near_miss" || !doc.variantOf) continue;
      nearMissByGolden.set(
        doc.variantOf,
        (nearMissByGolden.get(doc.variantOf) ?? 0) + 1,
      );
    }

    const starved = expectedRefs.filter(
      (ref) => (nearMissByGolden.get(ref) ?? 0) < NEAR_MISS_PER_GOLDEN,
    );
    expect(starved).toEqual([]);
  });

  it("кожен near-miss посилається на наявний золотий документ", () => {
    for (const doc of corpus.docs) {
      if (doc.role !== "near_miss") continue;
      expect(doc.variantOf, `${doc.id} без variantOf`).toBeDefined();
      expect(byId.get(doc.variantOf!)?.role).toBe("golden");
    }
  });

  it("жоден золотий документ не є єдиним носієм своєї сутності", () => {
    const perEntity = new Map<string, number>();
    for (const doc of corpus.docs) {
      perEntity.set(doc.entity, (perEntity.get(doc.entity) ?? 0) + 1);
    }
    for (const ref of expectedRefs) {
      const entity = byId.get(ref)!.entity;
      expect(perEntity.get(entity)!).toBeGreaterThan(1);
    }
  });

  it("near-miss відрізняється текстом від свого золотого документа", () => {
    const goldenContentByEntity = new Map<string, Set<string>>();
    for (const doc of corpus.docs) {
      if (doc.role !== "golden") continue;
      const bucket = goldenContentByEntity.get(doc.entity) ?? new Set<string>();
      bucket.add(doc.content);
      goldenContentByEntity.set(doc.entity, bucket);
    }
    for (const doc of corpus.docs) {
      if (doc.role !== "near_miss") continue;
      expect(goldenContentByEntity.get(doc.entity)?.has(doc.content)).not.toBe(
        true,
      );
    }
  });

  it("parseCorpusSet валить розбіжність id і source:sourceRef", () => {
    expect(() =>
      parseCorpusSet({
        version: "1",
        generatedBy: "test",
        docs: [
          {
            id: "finyk:a",
            source: "finyk",
            sourceRef: "b",
            content: "x",
            role: "golden",
            entity: "e",
          },
        ],
      }),
    ).toThrow(/does not match/);
  });

  it("parseCorpusSet валить дублікат id", () => {
    const doc = {
      id: "finyk:a",
      source: "finyk",
      sourceRef: "a",
      content: "x",
      role: "golden" as const,
      entity: "e",
    };
    expect(() =>
      parseCorpusSet({ version: "1", generatedBy: "test", docs: [doc, doc] }),
    ).toThrow(/Duplicate/);
  });
});
