import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

const logged = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("../obs/logger.js", () => ({ logger: logged }));

import {
  REVOKE_SESSION_PUSH_SQL,
  getRequestSessionId,
  revokePushSubscriptionsForSession,
  setRequestSessionId,
} from "./pushSessionBinding.js";

/**
 * priv-04 (серверна частина). Дві половини: (1) SQL і поведінка
 * `revokePushSubscriptionsForSession` на фейковому пулі; (2) регресія проти
 * СПРАВЖНЬОГО `betterAuth()` на memory-адаптері, що `session.delete.after`
 * справді спрацьовує на кожному шляху завершення сесії (sign-out,
 * revoke-session, revoke-sessions, revoke-other-sessions) і віддає id
 * саме завершеної сесії. Поведінку SQL на справжньому Postgres тримає
 * `modules/push/push.integration.test.ts`.
 */

function fakePool(rowCount = 1) {
  return { query: vi.fn(async () => ({ rowCount })) };
}

beforeEach(() => {
  logged.info.mockClear();
  logged.warn.mockClear();
});

describe("revokePushSubscriptionsForSession", () => {
  it("soft-delete-ить лише активні підписки цієї сесії", async () => {
    const pool = fakePool(2);
    await revokePushSubscriptionsForSession(pool, "sess-1");
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(REVOKE_SESSION_PUSH_SQL, [
      "sess-1",
    ]);
    expect(REVOKE_SESSION_PUSH_SQL).toMatch(/SET deleted_at = NOW\(\)/);
    expect(REVOKE_SESSION_PUSH_SQL).toMatch(
      /WHERE session_id = \$1 AND deleted_at IS NULL/,
    );
    // Фільтра за user_id немає і не має бути: id сесії унікальний сам по собі.
    expect(REVOKE_SESSION_PUSH_SQL).not.toMatch(/user_id/);
  });

  it("без id сесії нічого не робить (жодного UPDATE по session_id IS NULL)", async () => {
    const pool = fakePool();
    await revokePushSubscriptionsForSession(pool, null);
    await revokePushSubscriptionsForSession(pool, undefined);
    await revokePushSubscriptionsForSession(pool, "");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("збій БД не кидає і не логує id сесії (Hard Rule #21)", async () => {
    const pool = {
      query: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    };
    await expect(
      revokePushSubscriptionsForSession(pool, "sess-secret"),
    ).resolves.toBeUndefined();
    expect(logged.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.warn.mock.calls)).not.toContain("sess-secret");
  });

  it("успішний лог несе лише кількість, без id сесії", async () => {
    await revokePushSubscriptionsForSession(fakePool(3), "sess-secret");
    expect(logged.info).toHaveBeenCalledWith({
      msg: "push_session_revoked",
      revoked: 3,
    });
  });
});

describe("request session id", () => {
  it("set → get повертає id; порожнє значення не ставиться", () => {
    const req = {} as Request;
    expect(getRequestSessionId(req)).toBeNull();
    setRequestSessionId(req, undefined);
    setRequestSessionId(req, "");
    expect(getRequestSessionId(req)).toBeNull();
    setRequestSessionId(req, "sess-9");
    expect(getRequestSessionId(req)).toBe("sess-9");
  });
});

// ─── Better Auth: delete.after на кожному шляху завершення сесії ───────────

const ORIGIN = "http://localhost:3000";

function makeAuth(onDelete: (id: string) => void) {
  const db = {
    user: [],
    session: [],
    account: [],
    verification: [],
  } as Record<string, unknown[]>;
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: "x".repeat(48),
    baseURL: ORIGIN,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true, maxAge: 60 * 5 } },
    databaseHooks: {
      session: {
        // Та сама форма, що в auth.ts: хук отримує видалений рядок сесії.
        delete: { after: async (session) => onDelete(session.id) },
      },
    },
  });
  return { auth, db };
}

type TestAuth = ReturnType<typeof makeAuth>["auth"];

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

function call(
  a: TestAuth,
  path: string,
  init: { jar?: Map<string, string> | undefined; body?: unknown } = {},
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "content-type": "application/json",
  };
  if (init.jar) {
    headers["cookie"] = [...init.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  return a.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: init.body !== undefined ? "POST" : "GET",
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }),
  );
}

/** Три сесії одного користувача: id і cookie-jar кожної. */
async function threeSessions(a: TestAuth, db: Record<string, unknown[]>) {
  const up = await call(a, "/sign-up/email", {
    body: { email: "u@example.com", password: "password-12345", name: "U" },
  });
  expect(up.status).toBe(200);
  const jars = [readCookies(up)];
  for (let i = 0; i < 2; i++) {
    const r = await call(a, "/sign-in/email", {
      body: { email: "u@example.com", password: "password-12345" },
    });
    expect(r.status).toBe(200);
    jars.push(readCookies(r));
  }
  const ids = (db["session"] as { id: string }[]).map((s) => s.id);
  expect(ids).toHaveLength(3);
  return { jars, ids };
}

describe("Better Auth session.delete.after (priv-04)", () => {
  // `getSessionUser` (auth.ts) бере id з `getSession().session.id`, і на
  // гарячому шляху ця сесія приходить із cookieCache, а не з БД. Якби кеш
  // не ніс `id`, register писав би NULL і хук не мав би чого знімати.
  it("getSession із cookieCache віддає id сесії", async () => {
    const { auth, db } = makeAuth(() => {});
    const { jars, ids } = await threeSessions(auth, db);
    const headers = new Headers({
      cookie: [...jars[2]!].map(([k, v]) => `${k}=${v}`).join("; "),
    });
    expect(jars[2]!.has("better-auth.session_data")).toBe(true);
    const s = await auth.api.getSession({ headers });
    expect(s?.session.id).toBe(ids[2]);
  });

  it("sign-out → хук з id саме цієї сесії", async () => {
    const deleted: string[] = [];
    const { auth, db } = makeAuth((id) => deleted.push(id));
    const { jars, ids } = await threeSessions(auth, db);

    const out = await call(auth, "/sign-out", { jar: jars[1], body: {} });
    expect(out.status).toBe(200);
    expect(deleted).toEqual([ids[1]]);
  });

  it("revoke-session (інший пристрій) → хук з id відкликаної сесії", async () => {
    const deleted: string[] = [];
    const { auth, db } = makeAuth((id) => deleted.push(id));
    const { jars, ids } = await threeSessions(auth, db);
    const token = (db["session"] as { id: string; token: string }[]).find(
      (s) => s.id === ids[2],
    )!.token;

    const r = await call(auth, "/revoke-session", {
      jar: jars[0],
      body: { token },
    });
    expect(r.status).toBe(200);
    expect(deleted).toEqual([ids[2]]);
  });

  it("revoke-other-sessions → хук для кожної іншої, поточна лишається", async () => {
    const deleted: string[] = [];
    const { auth, db } = makeAuth((id) => deleted.push(id));
    const { jars, ids } = await threeSessions(auth, db);

    const r = await call(auth, "/revoke-other-sessions", {
      jar: jars[0],
      body: {},
    });
    expect(r.status).toBe(200);
    expect([...deleted].sort()).toEqual([ids[1], ids[2]].sort());
  });

  it("revoke-sessions (усі) → хук для кожної сесії", async () => {
    const deleted: string[] = [];
    const { auth, db } = makeAuth((id) => deleted.push(id));
    const { jars, ids } = await threeSessions(auth, db);

    const r = await call(auth, "/revoke-sessions", { jar: jars[0], body: {} });
    expect(r.status).toBe(200);
    expect([...deleted].sort()).toEqual([...ids].sort());
  });
});
