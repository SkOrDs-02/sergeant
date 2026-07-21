import { describe, expect, it } from "vitest";

import { maskPii, maskPiiObject } from "./pii-mask.js";

describe("maskPii", () => {
  it("masks common identifiers in plain text", () => {
    const masked = maskPii(
      "Email test.user+tag@example.com, phone +380501112233, IBAN UA123456789012345678901234567, card 4141-1111-1111-1111, tax 1234567890",
    );

    expect(masked).toContain("[email]");
    expect(masked).toContain("[phone]");
    expect(masked).toContain("[iban]");
    expect(masked).toContain("[card]");
    expect(masked).toContain("[taxid]");
    expect(masked).not.toContain("test.user+tag@example.com");
    expect(masked).not.toContain("+380501112233");
  });

  it("is safe to apply repeatedly", () => {
    const once = maskPii("buyer@example.com paid with 4141 1111 1111 1111");

    expect(maskPii(once)).toBe(once);
  });
});

describe("maskPiiObject", () => {
  it("masks shallow and nested string leaves without mutating the input", () => {
    const input = {
      note: "call 0501112233",
      nested: {
        email: "person@example.com",
      },
      list: ["person@example.com"],
      count: 2,
      nil: null,
    };

    const masked = maskPiiObject(input);

    expect(masked).toEqual({
      note: "call [phone]",
      nested: {
        email: "[email]",
      },
      list: ["person@example.com"],
      count: 2,
      nil: null,
    });
    expect(input.nested.email).toBe("person@example.com");
  });
});
