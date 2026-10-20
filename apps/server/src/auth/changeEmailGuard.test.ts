import { describe, it, expect, vi, beforeEach } from "vitest";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";

const queueMail = vi.hoisted(() => vi.fn());
vi.mock("../email/authTransactionalMail.js", () => ({
  queueAuthTransactionalEmail: queueMail,
}));

import {
  CHANGE_EMAIL_FRESH_MAX_AGE_MS,
  guardChangeEmailUserUpdate,
  notifyOldEmailAfterUserUpdate,
} from "./changeEmailGuard.js";

/**
 * Регресія `sec-06` проти СПРАВЖНЬОГО `betterAuth()` (memory-адаптер, без
 * Postgres): та сама конфігурація `user.changeEmail`, той самий плагін
 * `bearer()` і ті самі `databaseHooks.user.update`, що в `auth.ts`.
 * `guarded: false` – контрольна група без хуків: доводить, що тест ловить саме
 * дефект (там непідтверджений акаунт зі старою сесією міняє email і отримує
 * 200). Окремий блок ходить з `Authorization: Bearer` без cookie: на першій
 * версії guard жив у глобальному `hooks.before`, який Better Auth виконує
 * раніше за before-хук `bearer()`, і Bearer-запит обходив перевірку.
 */
const ORIGIN = "http://localhost:3000";
const OLD_EMAIL = "owner@example.com";
const NEW_EMAIL = "attacker@example.com";
const PASSWORD = "password-12345";

type Db = Record<string, Array<Record<string, unknown>>>;

function makeAuth(guarded: boolean) {
  const db: Db = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: "x".repeat(48),
    baseURL: ORIGIN,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true },
    emailVerification: { sendVerificationEmail: async () => {} },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: true,
        sendChangeEmailConfirmation: async () => {},
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    ...(guarded
      ? {
          databaseHooks: {
            user: {
              update: {
                before: async (
                  data: Record<string, unknown>,
                  context: Parameters<typeof guardChangeEmailUserUpdate>[1],
                ) => {
                  guardChangeEmailUserUpdate(data, context);
                },
                after: async (
                  updated: { email?: unknown } | null,
                  context: Parameters<typeof notifyOldEmailAfterUserUpdate>[1],
                ) => {
                  notifyOldEmailAfterUserUpdate(updated, context);
                },
              },
            },
          },
        }
      : {}),
    plugins: [bearer()],
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
  init: {
    jar?: Map<string, string>;
    body?: unknown;
    bearerToken?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "content-type": "application/json",
  };
  if (init.jar) {
    headers["cookie"] = [...init.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  if (init.bearerToken) {
    headers["authorization"] = `Bearer ${init.bearerToken}`;
  }
  return a.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: init.body ? "POST" : "GET",
      headers,
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
  );
}

async function signUp(a: TestAuth, email = OLD_EMAIL) {
  const up = await call(a, "/sign-up/email", {
    body: { email, password: PASSWORD, name: "U" },
  });
  expect(up.status).toBe(200);
  return readCookies(up);
}

/** Реєстрація без кук: лише `set-auth-token` (підписане значення сесії). */
async function signUpBearer(a: TestAuth, email = OLD_EMAIL) {
  const up = await call(a, "/sign-up/email", {
    body: { email, password: PASSWORD, name: "U" },
  });
  expect(up.status).toBe(200);
  const token = up.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

/** Робить єдину сесію «старою»: createdAt на годину в минулому. */
function ageSession(db: Db) {
  for (const s of db["session"]!) {
    s["createdAt"] = new Date(Date.now() - 60 * 60 * 1000);
  }
}

function emailOf(db: Db, id?: string): unknown {
  return db["user"]!.find((u) => (id ? u["id"] === id : true))?.["email"];
}

beforeEach(() => {
  queueMail.mockReset();
});

describe("sec-06: change-email непідтвердженого акаунта", () => {
  it("стара сесія: 403 SESSION_NOT_FRESH, email у БД не змінився, листа немає", async () => {
    const { auth, db } = makeAuth(true);
    const jar = await signUp(auth);
    ageSession(db);

    const res = await call(auth, "/change-email", {
      jar,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("SESSION_NOT_FRESH");
    expect(emailOf(db)).toBe(OLD_EMAIL);
    expect(queueMail).not.toHaveBeenCalled();
  });

  it("контроль без хуків: стара сесія змінює email (дефект відтворюється)", async () => {
    const { auth, db } = makeAuth(false);
    const jar = await signUp(auth);
    ageSession(db);

    const res = await call(auth, "/change-email", {
      jar,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(200);
    expect(emailOf(db)).toBe(NEW_EMAIL);
    expect(queueMail).not.toHaveBeenCalled();
  });

  it("свіжа сесія: 200, email змінено, лист-сповіщення йде на СТАРУ адресу", async () => {
    const { auth, db } = makeAuth(true);
    const jar = await signUp(auth);

    const res = await call(auth, "/change-email", {
      jar,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(200);
    expect(emailOf(db)).toBe(NEW_EMAIL);
    expect(queueMail).toHaveBeenCalledTimes(1);
    const mail = queueMail.mock.calls[0]![0] as {
      kind: string;
      to: string;
      text: string;
      html: string;
    };
    expect(mail.kind).toBe("email_change_notice");
    expect(mail.to).toBe(OLD_EMAIL);
    expect(mail.text).toContain(NEW_EMAIL);
    expect(mail.html).toContain(NEW_EMAIL);
  });

  it("поріг свіжості: сесія трохи молодша за поріг проходить, трохи старша – ні", async () => {
    const { auth, db } = makeAuth(true);
    const jar = await signUp(auth);

    const setAge = (ms: number) => {
      for (const s of db["session"]!) {
        s["createdAt"] = new Date(Date.now() - ms);
      }
    };

    setAge(CHANGE_EMAIL_FRESH_MAX_AGE_MS + 5_000);
    const stale = await call(auth, "/change-email", {
      jar,
      body: { newEmail: NEW_EMAIL },
    });
    expect(stale.status).toBe(403);

    setAge(CHANGE_EMAIL_FRESH_MAX_AGE_MS - 60_000);
    const fresh = await call(auth, "/change-email", {
      jar,
      body: { newEmail: NEW_EMAIL },
    });
    expect(fresh.status).toBe(200);
  });

  it("email уже зайнятий: 200 без зміни і БЕЗ сповіщення (не видаємо існування адреси)", async () => {
    const { auth, db } = makeAuth(true);
    await signUp(auth, NEW_EMAIL);
    const jar = await signUp(auth);
    // Друга реєстрація теж має свіжу сесію; перша належить зайнятій адресі.
    queueMail.mockReset();

    const res = await call(auth, "/change-email", {
      jar,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(200);
    expect(emailOf(db, db["user"]![1]!["id"] as string)).toBe(OLD_EMAIL);
    expect(queueMail).not.toHaveBeenCalled();
  });

  it("підтверджений акаунт: гілка не змінена – стара сесія не отримує 403, email не міняється до кліку", async () => {
    const { auth, db } = makeAuth(true);
    const jar = await signUp(auth);
    db["user"]![0]!["emailVerified"] = true;
    ageSession(db);

    const res = await call(auth, "/change-email", {
      jar,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(200);
    expect(emailOf(db)).toBe(OLD_EMAIL);
    expect(queueMail).not.toHaveBeenCalled();
  });

  it("інші шляхи хуки не чіпають (get-session зі старою сесією – 200)", async () => {
    const { auth, db } = makeAuth(true);
    const jar = await signUp(auth);
    ageSession(db);
    const res = await call(auth, "/get-session", { jar });
    expect(res.status).toBe(200);
  });
});

describe("sec-06: той самий захист для Authorization: Bearer (без cookie)", () => {
  it("стара сесія через Bearer: 403 SESSION_NOT_FRESH, email не змінився, листа немає", async () => {
    const { auth, db } = makeAuth(true);
    const bearerToken = await signUpBearer(auth);
    ageSession(db);

    const res = await call(auth, "/change-email", {
      bearerToken,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("SESSION_NOT_FRESH");
    expect(emailOf(db)).toBe(OLD_EMAIL);
    expect(queueMail).not.toHaveBeenCalled();
  });

  it("контроль без хуків: стара сесія через Bearer міняє email (дефект відтворюється)", async () => {
    const { auth, db } = makeAuth(false);
    const bearerToken = await signUpBearer(auth);
    ageSession(db);

    const res = await call(auth, "/change-email", {
      bearerToken,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(200);
    expect(emailOf(db)).toBe(NEW_EMAIL);
  });

  it("свіжа сесія через Bearer: 200, email змінено, лист іде на СТАРУ адресу", async () => {
    const { auth, db } = makeAuth(true);
    const bearerToken = await signUpBearer(auth);

    const res = await call(auth, "/change-email", {
      bearerToken,
      body: { newEmail: NEW_EMAIL },
    });

    expect(res.status).toBe(200);
    expect(emailOf(db)).toBe(NEW_EMAIL);
    expect(queueMail).toHaveBeenCalledTimes(1);
    const mail = queueMail.mock.calls[0]![0] as { kind: string; to: string };
    expect(mail.kind).toBe("email_change_notice");
    expect(mail.to).toBe(OLD_EMAIL);
  });
});
