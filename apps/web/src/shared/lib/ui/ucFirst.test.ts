import { describe, expect, it } from "vitest";

import { ucFirst } from "./ucFirst";

describe("ucFirst (TXT-7, аудит 2026-09)", () => {
  it("підіймає лише першу літеру, скорочення «р.» лишається малим", () => {
    expect(ucFirst("вересень 2026 р.")).toBe("Вересень 2026 р.");
  });

  it("кирилиця з апострофом і порожній рядок", () => {
    expect(ucFirst("їжа")).toBe("Їжа");
    expect(ucFirst("")).toBe("");
    expect(ucFirst("Вже велика")).toBe("Вже велика");
  });
});
