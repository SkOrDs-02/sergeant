import { describe, it, expect, vi } from "vitest";

/**
 * Проводка `sec-06` в РЕАЛЬНОМУ `auth` (а не в тестовому `betterAuth()`, як у
 * `auth/changeEmailGuard.test.ts`): `databaseHooks.user.update.before` /
 * `.after` з `auth.ts` мусять викликати обидва охоронці (не глобальний
 * `hooks.before`: він виконується раніше за `bearer()` і не бачить сесії
 * Bearer-запиту). Без цього піна можна випадково
 * прибрати виклик з `auth.ts`, і юніт-тести самого модуля лишаться зеленими,
 * хоча в проді дірка повернулась.
 */
const { guardMock, notifyMock } = vi.hoisted(() => ({
  guardMock: vi.fn((_data: unknown, _ctx: unknown) => {}),
  notifyMock: vi.fn((_updated: unknown, _ctx: unknown) => {}),
}));

vi.mock("./auth/changeEmailGuard.js", () => ({
  guardChangeEmailUserUpdate: guardMock,
  notifyOldEmailAfterUserUpdate: notifyMock,
}));

vi.mock("./db.js", () => {
  const pool = {
    query: vi.fn(),
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return { default: pool, pool, query: pool.query, ensureSchema: vi.fn() };
});

vi.mock("./obs/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));

const { auth } = await import("./auth.js");

type DbHooks = {
  before: (data: unknown, ctx: unknown) => Promise<unknown>;
  after: (updated: unknown, ctx: unknown) => Promise<unknown>;
};
const userUpdate = (
  auth as unknown as {
    options: { databaseHooks: { user: { update: DbHooks } } };
  }
).options.databaseHooks.user.update;

describe("sec-06: auth.ts підключає охоронця change-email", () => {
  it("databaseHooks.user.update.before викликає guardChangeEmailUserUpdate", async () => {
    guardMock.mockClear();
    const data = { email: "n@example.com" };
    const ctx = { path: "/change-email" };
    await userUpdate.before(data, ctx);
    expect(guardMock).toHaveBeenCalledWith(data, ctx);
  });

  it("databaseHooks.user.update.after викликає notifyOldEmailAfterUserUpdate", async () => {
    notifyMock.mockClear();
    const updated = { email: "n@example.com" };
    const ctx = { path: "/change-email" };
    await userUpdate.after(updated, ctx);
    expect(notifyMock).toHaveBeenCalledWith(updated, ctx);
  });
});
