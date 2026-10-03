import { describe, it, expect } from "vitest";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer } from "better-auth/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";

import {
  hardenSessionBefore,
  stripSessionTokenAfter,
} from "./sessionHardeningHooks.js";

/**
 * Регресія `sec-02` / `sec-05` проти СПРАВЖНЬОГО `betterAuth()` (memory-адаптер,
 * без Postgres): ті самі `session.cookieCache` і хуки, що в `auth.ts`.
 * `hardened: false` — контрольна група без хуків: доводить, що тест ловить
 * саме дефект (на ній `update-user` зі старою кукою проходить 200).
 */
const ORIGIN = "http://localhost:3000";

function makeAuth(hardened: boolean) {
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
    ...(hardened
      ? {
          hooks: {
            before: createAuthMiddleware(async (ctx) => {
              await hardenSessionBefore(ctx);
            }),
            after: createAuthMiddleware(async (ctx) => {
              stripSessionTokenAfter(ctx);
            }),
          },
        }
      : {}),
    plugins: [bearer()],
  });
}

type TestAuth = ReturnType<typeof makeAuth>;

/** Мінімальна cookie-jar: name=value з усіх Set-Cookie відповіді. */
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

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

function call(
  a: TestAuth,
  path: string,
  init: { method?: string; jar?: Map<string, string>; body?: unknown } = {},
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "content-type": "application/json",
  };
  if (init.jar) headers["cookie"] = cookieHeader(init.jar);
  return a.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers,
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
  );
}

async function twoDevices(a: TestAuth) {
  const up = await call(a, "/sign-up/email", {
    body: { email: "u@example.com", password: "password-12345", name: "U" },
  });
  expect(up.status).toBe(200);
  const jar1 = readCookies(up);
  expect(jar1.has("better-auth.session_data")).toBe(true);
  const inRes = await call(a, "/sign-in/email", {
    body: { email: "u@example.com", password: "password-12345" },
  });
  expect(inRes.status).toBe(200);
  return { jar1, jar2: readCookies(inRes) };
}

describe("sec-02: update-user не продовжує відкликану сесію", () => {
  it("після revoke зі старою кукою: 401 і без нового session_data", async () => {
    const a = makeAuth(true);
    const { jar1, jar2 } = await twoDevices(a);

    // Прогрів кеша: валідна сесія проходить, кука кеша перевипускається.
    const ok = await call(a, "/update-user", {
      jar: jar1,
      body: { name: "Before" },
    });
    expect(ok.status).toBe(200);
    readCookies(ok, jar1);

    // Пристрій 2 вимикає «інші сесії» (рядок сесії 1 зникає з БД).
    const revoked = await call(a, "/revoke-other-sessions", {
      jar: jar2,
      method: "POST",
      body: {},
    });
    expect(revoked.status).toBe(200);

    const stale = await call(a, "/update-user", {
      jar: jar1,
      body: { name: "After" },
    });
    expect(stale.status).toBe(401);
    expect(
      stale.headers
        .getSetCookie()
        .some(
          (c) =>
            c.startsWith("better-auth.session_data=") &&
            !/max-age=0/i.test(c) &&
            !/^better-auth\.session_data=;/.test(c),
        ),
    ).toBe(false);

    // Живий пристрій 2 і далі працює.
    const alive = await call(a, "/update-user", {
      jar: jar2,
      body: { name: "Alive" },
    });
    expect(alive.status).toBe(200);
  });

  it("контроль без хука: той самий сценарій дає 200 (дефект відтворюється)", async () => {
    const a = makeAuth(false);
    const { jar1, jar2 } = await twoDevices(a);
    await call(a, "/revoke-other-sessions", {
      jar: jar2,
      method: "POST",
      body: {},
    });
    const stale = await call(a, "/update-user", {
      jar: jar1,
      body: { name: "After" },
    });
    expect(stale.status).toBe(200);
  });
});

describe("sec-05: session token не віддається клієнту", () => {
  it("get-session і list-sessions без поля token", async () => {
    const a = makeAuth(true);
    const { jar1 } = await twoDevices(a);

    const gs = await call(a, "/get-session", { jar: jar1 });
    expect(gs.status).toBe(200);
    const gsBody = (await gs.json()) as { session: Record<string, unknown> };
    expect(gsBody.session["id"]).toEqual(expect.any(String));
    expect("token" in gsBody.session).toBe(false);

    const ls = await call(a, "/list-sessions", { jar: jar1 });
    expect(ls.status).toBe(200);
    const lsBody = (await ls.json()) as Array<Record<string, unknown>>;
    expect(lsBody).toHaveLength(2);
    for (const s of lsBody) {
      expect(s["id"]).toEqual(expect.any(String));
      expect("token" in s).toBe(false);
    }
  });

  it("контроль без хука: token у відповідях є", async () => {
    const a = makeAuth(false);
    const { jar1 } = await twoDevices(a);
    const gs = (await (
      await call(a, "/get-session", { jar: jar1 })
    ).json()) as {
      session: Record<string, unknown>;
    };
    expect(typeof gs.session["token"]).toBe("string");
  });

  it("revoke-session за id відкликає лише власну сесію; чужий id нічого не робить", async () => {
    const a = makeAuth(true);
    const { jar1, jar2 } = await twoDevices(a);
    const list = (await (
      await call(a, "/list-sessions", { jar: jar1 })
    ).json()) as Array<{ id: string }>;
    const current = (await (
      await call(a, "/get-session", { jar: jar1 })
    ).json()) as { session: { id: string } };
    const other = list.find((s) => s.id !== current.session.id);
    expect(other).toBeDefined();

    const bogus = await call(a, "/revoke-session", {
      jar: jar1,
      body: { id: "no-such-session" },
    });
    expect(bogus.status).toBe(200);
    expect(
      (await call(a, "/list-sessions", { jar: jar1 }).then((r) =>
        r.json(),
      )) as unknown[],
    ).toHaveLength(2);

    const res = await call(a, "/revoke-session", {
      jar: jar1,
      body: { id: other?.id },
    });
    expect(res.status).toBe(200);
    const after = (await (
      await call(a, "/list-sessions", { jar: jar1 })
    ).json()) as Array<{ id: string }>;
    expect(after.map((s) => s.id)).toEqual([current.session.id]);
    // Сесія пристрою 2 справді мертва.
    const dead = await call(a, "/update-user", {
      jar: jar2,
      body: { name: "x" },
    });
    expect(dead.status).toBe(401);
  });
});
