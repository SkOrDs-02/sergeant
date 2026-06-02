import { describe, it, expect } from "vitest";
import { getAccountVisual } from "./accountVisual";

describe("getAccountVisual", () => {
  it("returns eAid visual for eAid type", () => {
    const v = getAccountVisual({ type: "eAid" });
    expect(v.iconName).toBe("hand-coins");
    expect(v.name).toBe("Єпідтримка");
  });

  it("returns credit-card visual for black credit card (creditLimit > 0)", () => {
    const v = getAccountVisual({ type: "black", creditLimit: 50000 });
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Кредитна картка");
  });

  it("returns generic credit visual for non-black type with creditLimit > 0", () => {
    const v = getAccountVisual({ type: "white", creditLimit: 10000 });
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Кредит");
  });

  it("returns black debit card visual", () => {
    const v = getAccountVisual({ type: "black" });
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Чорна картка");
  });

  it("returns white card visual", () => {
    const v = getAccountVisual({ type: "white" });
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Біла картка");
  });

  it("returns platinum card visual", () => {
    const v = getAccountVisual({ type: "platinum" });
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Платинова");
  });

  it("returns iron card visual", () => {
    const v = getAccountVisual({ type: "iron" });
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Залізна");
  });

  it("returns fop visual", () => {
    const v = getAccountVisual({ type: "fop" });
    expect(v.iconName).toBe("archive");
    expect(v.name).toBe("ФОП");
  });

  it("returns neutral fallback for unknown type", () => {
    const v = getAccountVisual({ type: "unknown" });
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Картка");
  });

  it("returns neutral fallback when type is undefined", () => {
    const v = getAccountVisual({});
    expect(v.iconName).toBe("credit-card");
    expect(v.name).toBe("Картка");
  });

  it("treats creditLimit of 0 as non-credit", () => {
    const v = getAccountVisual({ type: "black", creditLimit: 0 });
    expect(v.name).toBe("Чорна картка");
  });
});
