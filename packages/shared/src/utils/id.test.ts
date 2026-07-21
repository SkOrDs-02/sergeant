import { afterEach, describe, expect, it, vi } from "vitest";

import { generatePrefixedId } from "./id";

describe("generatePrefixedId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the shared prefix, timestamp, and eight-character random suffix format", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.stubGlobal("crypto", {
      randomUUID: () => "abcdef12-3456-7890-abcd-ef1234567890",
    });

    expect(generatePrefixedId("expense")).toBe(
      "expense_1700000000000_abcdef12",
    );
  });
});
