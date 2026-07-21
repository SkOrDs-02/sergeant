// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FINYK_MANUAL_ONLY_KEY, enableFinykManualOnly } from "./demoData";
import * as finykStorage from "./finykStorage";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("enableFinykManualOnly", () => {
  it("stores the manual-only flag under the domain storage key", () => {
    enableFinykManualOnly();

    expect(localStorage.getItem(FINYK_MANUAL_ONLY_KEY)).toBe("1");
  });

  it("swallows storage write failures", () => {
    vi.spyOn(finykStorage, "writeRaw").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => enableFinykManualOnly()).not.toThrow();
  });
});
