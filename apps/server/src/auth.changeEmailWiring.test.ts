import { describe, it, expect, vi } from "vitest";

/**
 * Проводка `sec-06` в РЕАЛЬНОМУ `auth` (а не в тестовому `betterAuth()`, як у
 * `auth/changeEmailGuard.test.ts`): `hooks.before` / `hooks.after` з
 * `auth.ts` мусять викликати обидва охоронці. Без цього піна можна випадково
 * прибрати виклик з `auth.ts`, і юніт-тести самого модуля лишаться зеленими,
 * хоча в проді дірка повернулась.
 */
const { guardMock, notifyMock } = vi.hoisted(() => ({
  guardMock: vi.fn(async (_ctx: unknown) => {}),
  notifyMock: vi.fn(async (_ctx: unknown) => {}),
}));

vi.mock("./auth/changeEmailGuard.js", () => ({
  guardChangeEmailBefore: guardMock,
  notifyOldEmailAfter: notifyMock,
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

type Hook = (input: unknown) => Promise<unknown>;
const hooks = (
  auth as unknown as {
    options: { hooks?: { before?: Hook; after?: Hook } };
  }
).options.hooks;

describe("sec-06: auth.ts підключає охоронця change-email", () => {
  it("hooks.before викликає guardChangeEmailBefore", async () => {
    guardMock.mockClear();
    const ctx = { path: "/change-email", body: { newEmail: "n@example.com" } };
    await hooks!.before!(ctx);
    expect(guardMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/change-email" }),
    );
  });

  it("hooks.after викликає notifyOldEmailAfter", async () => {
    notifyMock.mockClear();
    const ctx = { path: "/change-email", context: {}, headers: new Headers() };
    await hooks!.after!(ctx);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/change-email" }),
    );
  });
});
