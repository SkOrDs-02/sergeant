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

  // priv-06: перелік із @sergeant/shared, а не лише `health`.
  it.each(["health", "allergy", "diet", "training"])(
    "профіль: категорія %s — health",
    (category) => {
      expect(
        isHealthMemoryRow({ source: "profile", metadata: { category } }),
      ).toBe(true);
    },
  );

  it.each(["preference", "other", "goal"])(
    "профіль: нейтральна категорія %s — не health",
    (category) => {
      expect(
        isHealthMemoryRow({
          source: "profile",
          metadata: { category },
          content: "накопичити на відпустку",
        }),
      ).toBe(false);
    },
  );

  it("профіль: ціль про вагу — health, ціль без ваги — ні", () => {
    const row = (content: string) => ({
      source: "profile",
      metadata: { category: "goal" },
      content,
    });
    expect(isHealthMemoryRow(row("схуднути до 70 кг"))).toBe(true);
    expect(isHealthMemoryRow(row("Lose weight before summer"))).toBe(true);
    expect(isHealthMemoryRow(row("накопичити на відпустку"))).toBe(false);
    // Без тексту ціль нейтральна (категорія сама по собі не health).
    expect(
      isHealthMemoryRow({ source: "profile", metadata: { category: "goal" } }),
    ).toBe(false);
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
