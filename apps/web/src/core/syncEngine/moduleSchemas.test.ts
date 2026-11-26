import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { ensureModuleSchemas } from "./moduleSchemas";

const makeClient = (): SqliteMigrationClient =>
  ({ exec: vi.fn(), run: vi.fn(), all: vi.fn() }) as never;

describe("ensureModuleSchemas", () => {
  it("мігрує партицію один раз, скільки б тіків не прийшло", async () => {
    const client = makeClient();
    const migrate = vi.fn(async () => undefined);
    await Promise.all([
      ensureModuleSchemas(client, migrate),
      ensureModuleSchemas(client, migrate),
    ]);
    await ensureModuleSchemas(client, migrate);
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it("нова партиція (інший клієнт) мігрується окремо", async () => {
    const migrate = vi.fn(async () => undefined);
    await ensureModuleSchemas(makeClient(), migrate);
    await ensureModuleSchemas(makeClient(), migrate);
    expect(migrate).toHaveBeenCalledTimes(2);
  });

  it("збій не запамʼятовується: наступний тік пробує знову", async () => {
    const client = makeClient();
    const migrate = vi
      .fn<(c: SqliteMigrationClient) => Promise<void>>()
      .mockRejectedValueOnce(new Error("SQLITE_BUSY"))
      .mockResolvedValueOnce(undefined);
    await expect(ensureModuleSchemas(client, migrate)).rejects.toThrow(
      "SQLITE_BUSY",
    );
    await expect(ensureModuleSchemas(client, migrate)).resolves.toBeUndefined();
    expect(migrate).toHaveBeenCalledTimes(2);
  });
});
