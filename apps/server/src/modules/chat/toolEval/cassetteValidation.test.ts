import { describe, expect, it } from "vitest";
import { buildManifest, loadCassette, type Cassette } from "./cassette.js";
import { validateCassette } from "./cassetteValidation.js";

function fixture(): Cassette {
  return {
    manifest: buildManifest("local/model", 1, "2026-10-21T00:00:00.000Z"),
    cases: [
      {
        name: "case",
        turns: [
          { blocks: [{ type: "text", text: "Немає даних" }], fedResult: null },
        ],
      },
    ],
  };
}

describe("цілісність касети до оцінювання", () => {
  it("приймає коректний запис без перетворення model output", () => {
    const value = fixture();
    const before = structuredClone(value);
    validateCassette(value, "local/model");
    expect(value).toEqual(before);
  });
  it.each([undefined, null, [], {}, { manifest: {} }].map((raw) => ({ raw })))(
    "відхиляє пошкоджений корінь $raw",
    ({ raw }) => {
      expect(() => validateCassette(raw)).toThrow();
    },
  );
  it("відхиляє касету іншої моделі", () => {
    expect(() => validateCassette(fixture(), "other/model")).toThrow(
      /model mismatch/,
    );
  });
  it("звіряє кількість кейсів із маніфестом", () => {
    const value = fixture();
    value.manifest.caseCount = 2;
    expect(() => validateCassette(value)).toThrow(/caseCount mismatch/);
  });
  it("відхиляє дублікати імен замість мовчазного Map overwrite", () => {
    const value = fixture();
    value.cases.push(structuredClone(value.cases[0]!));
    value.manifest.caseCount = 2;
    expect(() => validateCassette(value)).toThrow(/Duplicate cassette case/);
  });
  it("відхиляє порожній набір замість нульового знаменника", () => {
    const value = fixture();
    value.cases = [];
    value.manifest.caseCount = 0;
    expect(() => validateCassette(value)).toThrow();
  });
  it("порожній кейс потребує явної транспортної помилки", () => {
    const value = fixture();
    value.cases[0]!.turns = [];
    expect(() => validateCassette(value)).toThrow(/without transport error/);
    value.cases[0]!.error = "HTTP 429";
    expect(() => validateCassette(value)).not.toThrow();
  });
  it("перший хід не може містити tool_result із майбутнього", () => {
    const value = fixture();
    value.cases[0]!.turns[0]!.fedResult = "future ID";
    expect(() => validateCassette(value)).toThrow(/First cassette turn/);
  });
  it("відхиляє хибні fingerprints до порівняння промптів", () => {
    const value = fixture();
    value.manifest.toolsSha = "";
    expect(() => validateCassette(value)).toThrow();
  });
  it("не ховає погані аргументи моделі: їх має оцінити schema judge", () => {
    const value = fixture();
    value.cases[0]!.turns[0]!.blocks = [
      { type: "tool_use", name: "invented", input: "invalid" },
    ];
    expect(() => validateCassette(value)).not.toThrow();
  });
  it("приймає обидві наявні оплачені касети без перезапису", () => {
    expect(loadCassette("google/gemini-3.7-flash")).not.toBeNull();
    expect(
      loadCassette("google/gemini-3.7-flash", "injections"),
    ).not.toBeNull();
  });
});
