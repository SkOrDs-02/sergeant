import { describe, expect, it } from "vitest";
import { safeBackupKeyFromToken } from "./backupKey.js";

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("safeBackupKeyFromToken", () => {
  it("returns a stable 32-char hex digest for a fixed (userId, token, secret)", () => {
    const a = safeBackupKeyFromToken("user_1", "abc", SECRET);
    const b = safeBackupKeyFromToken("user_1", "abc", SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uses the public bucket when the token is absent or empty", () => {
    const explicit = safeBackupKeyFromToken("user_1", "public", SECRET);
    expect(safeBackupKeyFromToken("user_1", undefined, SECRET)).toBe(explicit);
    expect(safeBackupKeyFromToken("user_1", "", SECRET)).toBe(explicit);
  });

  it("isolates backups per user — same token, different userId → different key", () => {
    const a = safeBackupKeyFromToken("user_1", "shared-token", SECRET);
    const b = safeBackupKeyFromToken("user_2", "shared-token", SECRET);
    expect(a).not.toBe(b);
  });

  it("isolates backups per token within the same user", () => {
    const a = safeBackupKeyFromToken("user_1", "token-a", SECRET);
    const b = safeBackupKeyFromToken("user_1", "token-b", SECRET);
    expect(a).not.toBe(b);
  });

  it("rotates with the server secret — different secrets → different keys", () => {
    const a = safeBackupKeyFromToken("user_1", "abc", SECRET);
    const b = safeBackupKeyFromToken(
      "user_1",
      "abc",
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    );
    expect(a).not.toBe(b);
  });

  it("matches existing header coercion for multi-value tokens", () => {
    expect(safeBackupKeyFromToken("user_1", ["a", "b"], SECRET)).toBe(
      safeBackupKeyFromToken("user_1", "a,b", SECRET),
    );
  });

  it("throws if the server secret is missing", () => {
    expect(() => safeBackupKeyFromToken("user_1", "abc", "")).toThrow(
      /missing server secret/,
    );
  });

  it("throws if the userId is missing — auth must be enforced upstream", () => {
    expect(() => safeBackupKeyFromToken("", "abc", SECRET)).toThrow(
      /missing userId/,
    );
  });
});
