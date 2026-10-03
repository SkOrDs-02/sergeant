import { describe, it, expect } from "vitest";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";

import { guardUserName } from "./sanitizeUserName.js";

/**
 * Регресія `sec-16` проти СПРАВЖНЬОГО `betterAuth()` (memory-адаптер, без
 * Postgres): ті самі `session.cookieCache` і `databaseHooks`-проводка, що в
 * `auth.ts`. Доводить три речі, яких не бачать юніт-тести функції:
 *   1. `context.path` у хуках справді `/sign-up/email` і `/update-user`;
 *   2. `APIError` з хука доходить клієнту як HTTP 400 (а не 500);
 *   3. сесійна кука після відмови не роздувається.
 * `guarded: false` — контрольна група: на ній 20-КБ імʼя проходить, а
 * `session_data` стає сумарно > 16 КБ (ліміт заголовка Node).
 */
const ORIGIN = "http://localhost:3000";

function makeAuth(guarded: boolean) {
  const db = {
    user: [],
    session: [],
    account: [],
    verification: [],
  } as Record<string, unknown[]>;
  return betterAuth({
    database: memoryAdapter(db),
    secret: "x".repeat(48),
    baseURL: ORIGIN,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    ...(guarded
      ? {
          databaseHooks: {
            user: {
              create: {
                before: async (data, context) => ({
                  data: guardUserName(data, context, "create"),
                }),
              },
              update: {
                before: async (data, context) => ({
                  data: guardUserName(data, context, "update"),
                }),
              },
            },
          },
        }
      : {}),
    plugins: [bearer()],
  });
}

type TestAuth = ReturnType<typeof makeAuth>;

function readCookies(res: Response, jar: Map<string, string> = new Map()) {
  for (const line of res.headers.getSetCookie()) {
    const [pair = ""] = line.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (/max-age=0/i.test(line) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
  return jar;
}

const cookieHeader = (jar: Map<string, string>) =>
  [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

function call(
  a: TestAuth,
  path: string,
  init: { jar?: Map<string, string>; body: unknown },
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "content-type": "application/json",
  };
  if (init.jar) headers["cookie"] = cookieHeader(init.jar);
  return a.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(init.body),
    }),
  );
}

const signUp = (a: TestAuth, name: unknown, email = "u@example.com") =>
  call(a, "/sign-up/email", {
    body: { email, password: "password-12345", name },
  });

describe("sec-16: name у справжньому Better Auth", () => {
  it("контроль: без гварда 20-КБ імʼя роздуває куку понад 16 КБ", async () => {
    const a = makeAuth(false);
    const up = await signUp(a, "U");
    const jar = readCookies(up);
    const res = await call(a, "/update-user", {
      jar,
      body: { name: "N".repeat(20_480) },
    });
    expect(res.status).toBe(200);
    readCookies(res, jar);
    expect(cookieHeader(jar).length).toBeGreaterThan(16 * 1024);
  });

  it("sign-up з name на 10 000 символів: 400 INVALID_NAME, куки немає", async () => {
    const a = makeAuth(true);
    const res = await signUp(a, "N".repeat(10_000));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code?: string }).code).toBe("INVALID_NAME");
    expect(cookieHeader(readCookies(res))).toBe("");
  });

  it("update-user з name на 10 000 символів: 400, імʼя і кука не змінились", async () => {
    const a = makeAuth(true);
    const jar = readCookies(await signUp(a, "Ok"));
    const before = cookieHeader(jar);

    const res = await call(a, "/update-user", {
      jar,
      body: { name: "N".repeat(10_000) },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code?: string }).code).toBe("INVALID_NAME");
    readCookies(res, jar);
    // Відмова не перевипустила роздуту куку: заголовок далеко під 16 КБ.
    expect(cookieHeader(jar).length).toBeLessThan(2 * 1024);
    expect(cookieHeader(jar)).toBe(before);

    // Імʼя в БД не змінилось: get-session віддає старе.
    const gs = await a.handler(
      new Request(`${ORIGIN}/api/auth/get-session`, {
        headers: { origin: ORIGIN, cookie: cookieHeader(jar) },
      }),
    );
    const body = (await gs.json()) as { user: { name: string } };
    expect(body.user.name).toBe("Ok");
  });

  it.each([[12345], [{ a: 1 }], [["x", "y"]], [true], [null]])(
    "не-рядковий name %j в update-user: 400",
    async (bad) => {
      const a = makeAuth(true);
      const jar = readCookies(await signUp(a, "Ok"));
      const res = await call(a, "/update-user", {
        jar,
        body: { name: bad },
      });
      expect(res.status).toBe(400);
    },
  );

  it("нормальне імʼя (100 символів) оновлюється як і раніше", async () => {
    const a = makeAuth(true);
    const jar = readCookies(await signUp(a, "Ok"));
    const res = await call(a, "/update-user", {
      jar,
      body: { name: "Я".repeat(100) },
    });
    expect(res.status).toBe(200);
  });
});
