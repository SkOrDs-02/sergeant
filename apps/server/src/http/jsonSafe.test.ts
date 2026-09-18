import { describe, expect, it } from "vitest";

import { extractJsonFromText } from "./jsonSafe.js";

describe("extractJsonFromText", () => {
  it("parses raw JSON objects and arrays", () => {
    expect(extractJsonFromText('{"ok":true,"count":2}')).toEqual({
      ok: true,
      count: 2,
    });
    expect(extractJsonFromText('[{"id":1},{"id":2}]')).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("extracts the first balanced JSON slice from surrounding text", () => {
    expect(
      extractJsonFromText(
        'Intro {"message":"brace } in string","ok":true} outro',
      ),
    ).toEqual({
      message: "brace } in string",
      ok: true,
    });
  });

  it("prefers the earliest JSON container when both object and array exist", () => {
    expect(extractJsonFromText('prefix [1,2] then {"ignored":true}')).toEqual([
      1, 2,
    ]);
    expect(extractJsonFromText('prefix {"first":true} then [1,2]')).toEqual({
      first: true,
    });
  });

  it("repairs common LLM quote variants inside the extracted slice", () => {
    expect(extractJsonFromText("answer: {“name”:“borsch”}")).toEqual({
      name: "borsch",
    });
  });

  it("returns null for empty, non-string, unbalanced, and invalid input", () => {
    expect(extractJsonFromText("")).toBeNull();
    expect(extractJsonFromText(null)).toBeNull();
    expect(extractJsonFromText({ ok: true })).toBeNull();
    expect(extractJsonFromText("plain text")).toBeNull();
    expect(extractJsonFromText('prefix {"ok": true')).toBeNull();
    expect(extractJsonFromText("prefix {not-json} suffix")).toBeNull();
  });
});
