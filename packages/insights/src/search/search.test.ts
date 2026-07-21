import { describe, it, expect, vi } from "vitest";
import { normalize, tokenize, scoreMatch, scoreAndSort } from "./index.js";

describe("normalize", () => {
  it("lowercases та прибирає діакритику", () => {
    expect(normalize("Cafè")).toBe("cafe");
    expect(normalize("БОРЩ")).toBe("борщ");
  });

  it("уніфікує апострофи", () => {
    expect(normalize("м'ясо")).toBe(normalize("мʼясо"));
    expect(normalize("м`ясо")).toBe(normalize("м'ясо"));
  });

  it("повертає пустий рядок на falsy input", () => {
    expect(normalize("")).toBe("");
  });

  it("falls back to lowercase when Unicode normalization throws", () => {
    const normalizeSpy = vi
      .spyOn(String.prototype, "normalize")
      .mockImplementation(() => {
        throw new Error("normalize unavailable");
      });

    try {
      expect(normalize("CAFÉ")).toBe("café");
    } finally {
      normalizeSpy.mockRestore();
    }
  });
});

describe("tokenize", () => {
  it("розбиває по пробілах і відкидає пусті", () => {
    expect(tokenize("  Хліб  сир  ")).toEqual(["хліб", "сир"]);
  });

  it("порожній запит → []", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("scoreMatch", () => {
  it("0 на пустих tokens", () => {
    expect(scoreMatch({ title: "будь-що" }, [])).toBe(0);
  });

  it("-1 якщо бодай один токен не знайдено (AND-матчинг)", () => {
    expect(
      scoreMatch({ title: "хліб пшеничний", subtitle: "" }, ["хліб", "сир"]),
    ).toBe(-1);
  });

  it("title-prefix бʼє title-substring", () => {
    const prefix = scoreMatch({ title: "хліб пшеничний" }, ["хліб"]);
    const substring = scoreMatch({ title: "булка хліб" }, ["хліб"]);
    expect(prefix).toBeGreaterThan(substring);
  });

  it("title match бʼє subtitle match", () => {
    const titleHit = scoreMatch({ title: "хліб", subtitle: "інше" }, ["хліб"]);
    const subtitleHit = scoreMatch({ title: "інше", subtitle: "хліб" }, [
      "хліб",
    ]);
    expect(titleHit).toBeGreaterThan(subtitleHit);
  });
});

describe("scoreAndSort", () => {
  it("повертає перші `limit` items, якщо порожній запит", () => {
    const items = [{ title: "a" }, { title: "b" }, { title: "c" }];
    expect(scoreAndSort(items, "", 2)).toEqual([
      { title: "a" },
      { title: "b" },
    ]);
  });

  it("сортує за score DESC з стабільним порядком для рівних", () => {
    const items = [
      { title: "хліб пшеничний", subtitle: "" }, // prefix match
      { title: "булка хліб", subtitle: "" }, // substring
      { title: "борщ", subtitle: "гарний" }, // no match
    ];
    const res = scoreAndSort(items, "хліб", 10);
    expect(res.map((i) => i.title)).toEqual(["хліб пшеничний", "булка хліб"]);
  });

  it("застосовує limit", () => {
    const items = [
      { title: "хліб 1" },
      { title: "хліб 2" },
      { title: "хліб 3" },
    ];
    const res = scoreAndSort(items, "хліб", 2);
    expect(res).toHaveLength(2);
  });
});
