import { describe, expect, it } from "vitest";
import { isHealthMemoryRow } from "./healthRows.js";

describe("isHealthMemoryRow", () => {
  it("профіль: лише категорія health", () => {
    expect(
      isHealthMemoryRow({
        source: "profile",
        metadata: { category: "health" },
      }),
    ).toBe(true);
    expect(
      isHealthMemoryRow({ source: "profile", metadata: { category: "other" } }),
    ).toBe(false);
    expect(isHealthMemoryRow({ source: "profile" })).toBe(false);
  });

  it("дайджест: health, коли в звіті була секція Фізрука чи Харчування", () => {
    expect(
      isHealthMemoryRow({
        source: "digest",
        metadata: { sections: { fizruk: true } },
      }),
    ).toBe(true);
    expect(
      isHealthMemoryRow({
        source: "digest",
        metadata: { sections: { nutrition: true } },
      }),
    ).toBe(true);
    expect(
      isHealthMemoryRow({
        source: "digest",
        metadata: {
          sections: { finyk: true, fizruk: false, nutrition: false },
        },
      }),
    ).toBe(false);
    expect(isHealthMemoryRow({ source: "digest", metadata: null })).toBe(false);
  });

  it("legacy-джерела fizruk / nutrition — health за визначенням", () => {
    expect(isHealthMemoryRow({ source: "fizruk" })).toBe(true);
    expect(isHealthMemoryRow({ source: "nutrition" })).toBe(true);
  });

  it("решта джерел — ні", () => {
    expect(isHealthMemoryRow({ source: "chat" })).toBe(false);
    expect(isHealthMemoryRow({ source: "journal" })).toBe(false);
  });
});
