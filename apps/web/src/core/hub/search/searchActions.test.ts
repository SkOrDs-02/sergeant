import { describe, expect, it } from "vitest";
import { searchActions, searchAiHandoff } from "./searchActions";

describe("searchActions", () => {
  it("returns all four quick-add actions for an empty query", () => {
    const hits = searchActions([]);
    expect(hits).toHaveLength(4);
    expect(hits.every((h) => h.module === "actions")).toBe(true);
    expect(hits[0]?.target).toMatchObject({
      kind: "action",
      moduleId: "finyk",
    });
  });

  it("scores actions against Ukrainian aliases", () => {
    const hits = searchActions(["кав"]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.module).toBe("actions");
    expect(hits[0]?.title).toMatch(/витрат/i);
  });

  it("strips keyword noise from subtitles after scoring", () => {
    const hits = searchActions(["трен"]);
    const fizruk = hits.find(
      (h) => h.id.includes("fizruk") || h.title.includes("трен"),
    );
    expect(fizruk?.subtitle).not.toMatch(/workout train start gym/);
  });
});

describe("searchAiHandoff", () => {
  it("returns no hit for a single-character query", () => {
    expect(searchAiHandoff("a")).toEqual([]);
  });

  it("emits a prefilled chat handoff for a 2+ char query", () => {
    const hits = searchAiHandoff("  бюджет  ");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: "ai_handoff",
      module: "ai",
      target: { kind: "ai-handoff", query: "бюджет" },
    });
  });
});
