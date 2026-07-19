import { describe, it, expect, vi } from "vitest";

const runMigrations = vi.fn();
const createSqliteAdapter = vi.fn((client: unknown) => ({
  __adapterFor: client,
}));

vi.mock("@sergeant/db-schema/migrate/runner", () => ({
  runMigrations: (...args: unknown[]) => runMigrations(...args),
}));
vi.mock("@sergeant/db-schema/migrate/sqlite", () => ({
  createSqliteAdapter: (client: unknown) => createSqliteAdapter(client),
}));

const { createClientMigrator } = await import("./clientMigrator");

describe("createClientMigrator", () => {
  it("returns a function that runs migrations with the wrapped adapter/files/tableName", async () => {
    runMigrations.mockResolvedValue(undefined);
    const files = [{ id: "001", up: "SELECT 1" }] as never;
    const migrate = createClientMigrator(files, "routine_migrations");

    const fakeClient = { exec: vi.fn() };
    await migrate(fakeClient as never);

    expect(createSqliteAdapter).toHaveBeenCalledWith(fakeClient);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    const call = runMigrations.mock.calls[0]![0];
    expect(call.files).toBe(files);
    expect(call.tableName).toBe("routine_migrations");
    expect(call.adapter).toEqual({ __adapterFor: fakeClient });
  });

  it("propagates a rejection from runMigrations", async () => {
    runMigrations.mockRejectedValueOnce(new Error("migration failed"));
    const migrate = createClientMigrator([] as never, "t");
    await expect(migrate({} as never)).rejects.toThrow("migration failed");
  });
});
