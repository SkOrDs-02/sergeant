import { describe, expect, it } from "vitest";
import { safeBackupKeyFromToken } from "./backupKey.js";

describe("safeBackupKeyFromToken", () => {
  it("keeps stable FNV-1a base36 keys for backup tokens", () => {
    expect(safeBackupKeyFromToken("abc")).toBe("7aigaz");
    expect(safeBackupKeyFromToken("token-123")).toBe("mgkkb7");
  });

  it("uses the public backup key when the token is missing", () => {
    expect(safeBackupKeyFromToken(undefined)).toBe("1krc8zk");
    expect(safeBackupKeyFromToken("")).toBe("1krc8zk");
  });

  it("matches existing header coercion for multi-value tokens", () => {
    expect(safeBackupKeyFromToken(["a", "b"])).toBe("2d6yx2");
  });
});
