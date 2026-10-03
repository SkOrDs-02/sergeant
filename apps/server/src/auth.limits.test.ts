import { describe, it, expect, vi } from "vitest";

/**
 * Реальна конфігурація `auth` (sec-10 / sec-16), без Postgres: `db.js` і logger
 * замоканi так само, як в `auth.test.ts` (окремий файл, бо той уже 770+ рядків).
 * Перевіряємо саме проводку в `auth.ts`, а не допоміжні функції окремо.
 */
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

describe("auth config: sec-10, /verify-password вимкнений", () => {
  it("disabledPaths містить /verify-password, handler віддає 404", async () => {
    const options = (
      auth as unknown as { options: { disabledPaths?: string[] } }
    ).options;
    expect(options.disabledPaths).toContain("/verify-password");

    // `onRequest` Better Auth відсікає disabledPaths ДО будь-якого доступу
    // до БД, тож реальний handler перевіряється без Postgres.
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/verify-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "x" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("auth config: sec-16, name обмежений у databaseHooks", () => {
  type Hook = (
    data: Record<string, unknown>,
    context: { path?: string } | null,
  ) => Promise<{ data: Record<string, unknown> }>;
  const hooks = () =>
    (
      auth as unknown as {
        options: {
          databaseHooks: {
            user: { create: { before: Hook }; update: { before: Hook } };
          };
        };
      }
    ).options.databaseHooks.user;

  it("update-user з name на 10 000 символів: 400 INVALID_NAME", async () => {
    await expect(
      hooks().update.before(
        { name: "N".repeat(10_000) },
        { path: "/update-user" },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      body: { code: "INVALID_NAME" },
    });
  });

  it("sign-up з name на 10 000 символів: 400 INVALID_NAME", async () => {
    await expect(
      hooks().create.before(
        { name: "N".repeat(10_000), email: "a@b.com" },
        { path: "/sign-up/email" },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      body: { code: "INVALID_NAME" },
    });
  });

  it("не-рядковий name в update-user: 400, а не коерсія в рядок", async () => {
    for (const bad of [12345, { a: 1 }, ["x"], true, null]) {
      await expect(
        hooks().update.before({ name: bad }, { path: "/update-user" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it("межа включна: 100 символів проходять, 101 ні", async () => {
    const ok = await hooks().update.before(
      { name: "N".repeat(100) },
      { path: "/update-user" },
    );
    expect(ok.data["name"]).toBe("N".repeat(100));
    await expect(
      hooks().update.before(
        { name: "N".repeat(101) },
        { path: "/update-user" },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("запис без name (image-only) не чіпається", async () => {
    const res = await hooks().update.before(
      { image: "https://cdn.example/a.png" },
      { path: "/update-user" },
    );
    expect(res.data).toEqual({ image: "https://cdn.example/a.png" });
  });

  it("колбек провайдера не блокується: задовге name обрізається до 100", async () => {
    const res = await hooks().create.before(
      { name: "N".repeat(500), email: "a@b.com" },
      { path: "/callback/google" },
    );
    expect(res.data["name"]).toBe("N".repeat(100));
  });
});
