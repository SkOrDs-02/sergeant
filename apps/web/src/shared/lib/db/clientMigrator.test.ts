import { describe, it, expect, vi, beforeEach } from "vitest";

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
  beforeEach(() => {
    runMigrations.mockReset();
    createSqliteAdapter.mockClear();
  });

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

  // ── Гонка журналу міграцій (браузерний QA 2026-08-24, F-13/F-18, Z-01) ──
  //
  // Boot-хуки одного модуля стартують з різних ефектів одного кадру і кличуть
  // раннер паралельно; журнал `<tableName>` тоді ще порожній для обох, і
  // другий INSERT падає на `SQLITE_CONSTRAINT_UNIQUE`. Той, хто програв
  // гонку, тихо не догрівав свій кеш — сторінка малювала нулі до релоуду.

  it("серіалізує паралельні виклики — другий стартує після першого", async () => {
    let active = 0;
    let maxActive = 0;
    runMigrations.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });

    const migrate = createClientMigrator([] as never, "__test_migrations");
    await Promise.all([
      migrate({} as never),
      migrate({} as never),
      migrate({} as never),
    ]);

    expect(runMigrations).toHaveBeenCalledTimes(3);
    // Саме це число і було дефектом: паралельні проходи бачили один
    // порожній журнал.
    expect(maxActive).toBe(1);
  });

  it("провал одного виклику не блокує наступний", async () => {
    runMigrations
      .mockRejectedValueOnce(new Error("SQLITE_CONSTRAINT_UNIQUE"))
      .mockResolvedValueOnce(undefined);

    const migrate = createClientMigrator([] as never, "__test_migrations");
    const first = migrate({} as never);
    const second = migrate({} as never);

    await expect(first).rejects.toThrow("SQLITE_CONSTRAINT_UNIQUE");
    await expect(second).resolves.toBeUndefined();
  });

  it("кожен модуль має власну чергу — таблиця не спільна", async () => {
    runMigrations.mockResolvedValue(undefined);
    const a = createClientMigrator([] as never, "__a_migrations");
    const b = createClientMigrator([] as never, "__b_migrations");

    await Promise.all([a({} as never), b({} as never)]);

    const tables = runMigrations.mock.calls.map(
      (c) => (c[0] as { tableName: string }).tableName,
    );
    expect(new Set(tables)).toEqual(
      new Set(["__a_migrations", "__b_migrations"]),
    );
  });
});
