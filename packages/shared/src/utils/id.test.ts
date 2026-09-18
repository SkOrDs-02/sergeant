import { afterEach, describe, expect, it, vi } from "vitest";

import { generatePrefixedId } from "./id";

describe("generatePrefixedId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the shared prefix and native UUID", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "abcdef12-3456-7890-abcd-ef1234567890",
    });

    expect(generatePrefixedId("expense")).toBe(
      "expense_abcdef12-3456-7890-abcd-ef1234567890",
    );
  });
});
