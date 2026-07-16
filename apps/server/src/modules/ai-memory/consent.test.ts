/** Status: Active. */

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { hasAiMemoryConsent } from "./consent.js";

function dbWithRows(rows: Array<{ ai_memory: boolean | null }>): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe("hasAiMemoryConsent", () => {
  it("keeps default=true when preferences do not exist yet", async () => {
    await expect(hasAiMemoryConsent(dbWithRows([]), "u1")).resolves.toBe(true);
  });

  it("allows only an explicitly enabled persisted preference", async () => {
    await expect(
      hasAiMemoryConsent(dbWithRows([{ ai_memory: true }]), "u1"),
    ).resolves.toBe(true);
    await expect(
      hasAiMemoryConsent(dbWithRows([{ ai_memory: false }]), "u1"),
    ).resolves.toBe(false);
    await expect(
      hasAiMemoryConsent(dbWithRows([{ ai_memory: null }]), "u1"),
    ).resolves.toBe(false);
  });
});
