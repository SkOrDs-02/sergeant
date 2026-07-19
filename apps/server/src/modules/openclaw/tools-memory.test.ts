import { describe, expect, it, vi } from "vitest";

/**
 * `recallCofounderMemory` — wrapper над `AiMemoryService.recall()` з
 * hardcoded `sources=['cofounder']` (ADR-0031 §3, strict source isolation).
 *
 * Mock-имо `getAiMemory()` через `../ai-memory/bootstrap.js` (той самий
 * escape-hatch pattern, що і `ai-memory/ragContext.test.ts`) — уникаємо
 * реального Voyage/pgvector виклику.
 */

const { recallMock } = vi.hoisted(() => {
  const recallMock = vi.fn();
  return { recallMock };
});

vi.mock("../ai-memory/bootstrap.js", () => ({
  getAiMemory: () => ({
    remember: vi.fn(),
    recall: recallMock,
    forgetUser: vi.fn(),
    forgetSource: vi.fn(),
    health: vi.fn(),
  }),
}));

import { recallCofounderMemory } from "./tools-memory.js";

describe("recallCofounderMemory", () => {
  it("hardcodes sources=['cofounder'] and forwards userId/query/topK", async () => {
    recallMock.mockResolvedValueOnce([]);
    await recallCofounderMemory("user-1", { query: "pricing plan", topK: 3 });
    expect(recallMock).toHaveBeenCalledWith({
      userId: "user-1",
      query: "pricing plan",
      topK: 3,
      sources: ["cofounder"],
    });
  });

  it("forwards an undefined topK unchanged", async () => {
    recallMock.mockResolvedValueOnce([]);
    await recallCofounderMemory("user-2", { query: "hi" });
    expect(recallMock).toHaveBeenCalledWith({
      userId: "user-2",
      query: "hi",
      topK: undefined,
      sources: ["cofounder"],
    });
  });

  it("maps result rows: bigint id, Date createdAt → ISO string, score/content/sourceRef passthrough", async () => {
    const createdAt = new Date("2026-05-01T09:30:00.000Z");
    recallMock.mockResolvedValueOnce([
      {
        id: 42,
        source: "cofounder",
        sourceRef: "invocation:7",
        content: "founder prefers direct tone",
        embeddingMeta: { model: "voyage-3", dims: 1024 },
        metadata: {},
        score: 0.87,
        createdAt,
      },
    ]);
    const out = await recallCofounderMemory("user-1", { query: "tone" });
    expect(out.memories).toHaveLength(1);
    const m = out.memories[0]!;
    expect(m.id).toBe(42);
    expect(m.content).toBe("founder prefers direct tone");
    expect(m.score).toBe(0.87);
    expect(m.sourceRef).toBe("invocation:7");
    expect(m.createdAt).toBe("2026-05-01T09:30:00.000Z");
  });

  it("returns an empty memories array when the service finds nothing", async () => {
    recallMock.mockResolvedValueOnce([]);
    const out = await recallCofounderMemory("user-1", { query: "nothing" });
    expect(out.memories).toEqual([]);
  });

  it("preserves a null sourceRef", async () => {
    recallMock.mockResolvedValueOnce([
      {
        id: 1,
        source: "cofounder",
        sourceRef: null,
        content: "note",
        embeddingMeta: { model: "voyage-3", dims: 1024 },
        metadata: {},
        score: 0.5,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);
    const out = await recallCofounderMemory("user-1", { query: "note" });
    expect(out.memories[0]?.sourceRef).toBeNull();
  });

  it("maps multiple results preserving order", async () => {
    recallMock.mockResolvedValueOnce([
      {
        id: 1,
        source: "cofounder",
        sourceRef: null,
        content: "first",
        embeddingMeta: { model: "voyage-3", dims: 1024 },
        metadata: {},
        score: 0.9,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        id: 2,
        source: "cofounder",
        sourceRef: "x",
        content: "second",
        embeddingMeta: { model: "voyage-3", dims: 1024 },
        metadata: {},
        score: 0.8,
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
      },
    ]);
    const out = await recallCofounderMemory("user-1", { query: "order" });
    expect(out.memories.map((m) => m.content)).toEqual(["first", "second"]);
  });
});
