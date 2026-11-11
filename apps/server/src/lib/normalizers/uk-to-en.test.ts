import { describe, expect, it } from "vitest";
import { translateFirstToken } from "./uk-to-en.js";

describe("translateFirstToken", () => {
  it("не повертає члени прототипу обʼєкта", () => {
    expect(translateFirstToken("constructor")).toBeNull();
    expect(translateFirstToken("__proto__")).toBeNull();
    expect(translateFirstToken("груша")).toBe("pear");
  });
});
