import { describe, expect, it } from "vitest";
import {
  expandLinkedKeys,
  findLinkedKey,
  linkKeyAliases,
  manualLinkKey,
  rawManualId,
} from "./debtLinkKeys.js";

describe("debtLinkKeys (data-24)", () => {
  it("manualLinkKey / rawManualId ідемпотентні", () => {
    expect(manualLinkKey("X")).toBe("manual_X");
    expect(manualLinkKey("manual_X")).toBe("manual_X");
    expect(rawManualId("manual_X")).toBe("X");
    expect(rawManualId("bank1")).toBe("bank1");
  });

  it("linkKeyAliases віддає передану форму першою", () => {
    expect(linkKeyAliases("X")).toEqual(["X", "manual_X"]);
    expect(linkKeyAliases("manual_X")).toEqual(["manual_X", "X"]);
  });

  it("findLinkedKey знаходить будь-яку з форм і віддає наявну", () => {
    expect(findLinkedKey(["X"], "manual_X")).toBe("X");
    expect(findLinkedKey(["manual_X"], "X")).toBe("manual_X");
    expect(findLinkedKey(["X", "manual_X"], "manual_X")).toBe("manual_X");
    expect(findLinkedKey(["other"], "X")).toBeUndefined();
    expect(findLinkedKey(undefined, "X")).toBeUndefined();
  });

  it("expandLinkedKeys додає аліаси кожного id", () => {
    expect([...expandLinkedKeys(["X", "manual_Y"])].sort()).toEqual([
      "X",
      "Y",
      "manual_X",
      "manual_Y",
    ]);
  });
});
