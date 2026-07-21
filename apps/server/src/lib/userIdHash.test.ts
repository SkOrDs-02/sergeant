import { describe, expect, it } from "vitest";

import {
  hashUserId,
  isUserIdHash,
  USER_ID_HASH_HEX_LENGTH,
} from "./userIdHash.js";

describe("userIdHash", () => {
  it("recognizes fixed-length lowercase hex hash tokens", () => {
    expect(isUserIdHash("0123456789abcdef")).toBe(true);
    expect(isUserIdHash("0123456789abcde")).toBe(false);
    expect(isUserIdHash("0123456789abcdeg")).toBe(false);
    expect(isUserIdHash("0123456789ABCDEF")).toBe(false);
  });

  it("returns null for absent user ids", () => {
    expect(hashUserId(null)).toBeNull();
    expect(hashUserId(undefined)).toBeNull();
    expect(hashUserId("")).toBeNull();
  });

  it("hashes user ids to deterministic 16-character tokens", () => {
    const lower = hashUserId("User-ABC-123");
    const upper = hashUserId("USER-ABC-123");

    expect(lower).toBe(upper);
    expect(lower).toHaveLength(USER_ID_HASH_HEX_LENGTH);
    expect(lower).toMatch(/^[0-9a-f]{16}$/);
    expect(lower).not.toBe("user-abc-123");
  });

  it("is idempotent for values that are already hash tokens", () => {
    expect(hashUserId("0123456789abcdef")).toBe("0123456789abcdef");
  });
});
