import { describe, expect, it } from "vitest";
import { ALLOWED_MEMORY_SOURCES } from "../../modules/ai-memory/types.js";
import { loadDefaultGoldenSet, parseGoldenSet } from "./golden.js";

describe("loadDefaultGoldenSet (canonical fixture)", () => {
  const set = loadDefaultGoldenSet();

  it("містить ≥50 queries — задовольняє вимогу PR-20/22", () => {
    expect(set.queries.length).toBeGreaterThanOrEqual(50);
  });

  it("topK = 4 — узгоджено з env.AI_MEMORY_RAG_TOP_K", () => {
    expect(set.topK).toBe(4);
  });

  it("embeddingModel/version узгоджені з production defaults", () => {
    // Узгоджено з env.VOYAGE_EMBEDDING_MODEL / AI_MEMORY_EMBEDDING_VERSION.
    expect(set.embeddingModel).toBe("voyage-3.5-lite");
    expect(set.embeddingVersion).toBe("1");
  });

  it("кожна query має non-empty expected (інакше recall undefined)", () => {
    for (const q of set.queries) {
      expect(q.expected.length).toBeGreaterThan(0);
    }
  });

  it("кожна query має валідний domain з ALLOWED_MEMORY_SOURCES", () => {
    for (const q of set.queries) {
      expect(ALLOWED_MEMORY_SOURCES).toContain(q.domain);
    }
  });

  it("id-и унікальні", () => {
    const ids = new Set(set.queries.map((q) => q.id));
    expect(ids.size).toBe(set.queries.length);
  });

  it("expected refs мають префікс <source>: (для майбутньої wiring у real retrieval)", () => {
    for (const q of set.queries) {
      for (const ref of q.expected) {
        expect(ref).toMatch(/^[a-z]+:[\w-]+/);
      }
    }
  });
});

describe("parseGoldenSet (validator)", () => {
  it("кидає на duplicate id", () => {
    const malformed = {
      version: "1.0",
      embeddingModel: "voyage-3.5-lite",
      embeddingVersion: "1",
      topK: 4,
      queries: [
        { id: "dup-1", domain: "chat", query: "q1", expected: ["chat:a"] },
        { id: "dup-1", domain: "chat", query: "q2", expected: ["chat:b"] },
      ],
    };
    expect(() => parseGoldenSet(malformed)).toThrow(/Duplicate.*dup-1/);
  });

  it("кидає на empty expected", () => {
    const malformed = {
      version: "1.0",
      embeddingModel: "voyage-3.5-lite",
      embeddingVersion: "1",
      topK: 4,
      queries: [{ id: "q1", domain: "chat", query: "q", expected: [] }],
    };
    expect(() => parseGoldenSet(malformed)).toThrow();
  });

  it("кидає на unknown domain", () => {
    const malformed = {
      version: "1.0",
      embeddingModel: "voyage-3.5-lite",
      embeddingVersion: "1",
      topK: 4,
      queries: [
        {
          id: "q1",
          domain: "unknown-domain",
          query: "q",
          expected: ["chat:a"],
        },
      ],
    };
    expect(() => parseGoldenSet(malformed)).toThrow();
  });
});
