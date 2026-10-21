import { describe, expect, it } from "vitest";
import { classifyRecall } from "./recall.js";

describe("RAG-гейт відхиляє хибну конфігурацію замість зеленого pass", () => {
  it.each([NaN, Infinity, -Infinity, -0.01, 1.01])(
    "відхиляє mean %s",
    (mean) => {
      expect(() => classifyRecall(mean)).toThrow();
    },
  );
  for (const key of ["warnThreshold", "killThreshold"] as const) {
    it.each([NaN, Infinity, -Infinity, -0.01, 1.01])(
      `відхиляє ${key}=%s`,
      (value) => {
        expect(() => classifyRecall(0.9, { [key]: value })).toThrow();
      },
    );
  }
  it("зберігає точні межі трьох станів", () => {
    expect(classifyRecall(0.5).status).toBe("pass");
    expect(classifyRecall(0.4).status).toBe("warn");
    expect(classifyRecall(0.399).status).toBe("kill");
  });
  it("приймає нульовий та одиничний пороги", () => {
    expect(
      classifyRecall(0, { warnThreshold: 0, killThreshold: 0 }).status,
    ).toBe("pass");
    expect(
      classifyRecall(1, { warnThreshold: 1, killThreshold: 1 }).status,
    ).toBe("pass");
  });
});
