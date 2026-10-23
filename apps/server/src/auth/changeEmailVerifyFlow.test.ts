import { describe, it, expect, vi, beforeEach } from "vitest";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";

const queueMail = vi.hoisted(() => vi.fn());
vi.mock("../email/authTransactionalMail.js", () => ({
  queueAuthTransactionalEmail: queueMail,
}));

import { notifyOldEmailAfterVerifyEmailChange } from "./changeEmailGuard.js";

/**
 * sec-06, рішення власника 2026-10-23: `updateEmailWithoutVerification: false`.
 * Проти СПРАВЖНЬОГО `betterAuth()` (memory-адаптер) з тією ж конфігурацією
 * `changeEmail`, що в `auth.ts`:
 *   - непідтверджений акаунт: `/change-email` НЕ міняє адресу, лише шле
 *     верифікацію на нову; зміна стається після кліку (`/verify-email`);
 *   - після кліку на СТАРУ адресу йде сповіщення
 *     (`notifyOldEmailAfterVerifyEmailChange`).
 * Контроль `updateEmailWithoutVerification: true` показує дефект: адреса
 * переписується одразу, без жодного листа на нову скриньку.
 */
const ORIGIN = "http://localhost:3000";
const OLD_EMAIL = "owner@example.com";
const NEW_EMAIL = "attacker@example.com";

type Db = Record<string, Array<Record<string, unknown>>>;

function makeAuth(updateEmailWithoutVerification: boolean) {
  const db: Db = { user: [], session: [], account: [], verification: [] };
  const sent: Array<{ to: string; url: string }> = [];
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: "x".repeat(48),
    baseURL: ORIGIN,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        sent.push({ to: user.email, url });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification,
        sendChangeEmailConfirmation: async () => {},
      },
    },
    databaseHooks: {
      user: {
        update: {
          after: async (updated, context) => {
            notifyOldEmailAfterVerifyEmailChange(updated, context);
          },
        },
      },
    },
    plugins: [bearer()],
  });
  return { auth, db, sent };
}

type TestAuth = ReturnType<typeof makeAuth>["auth"];

function cookiesOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

function post(a: TestAuth, path: string, body: unknown, cookie?: string) {
  return a.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function signUp(a: TestAuth): Promise<string> {
  const up = await post(a, "/sign-up/email", {
    email: OLD_EMAIL,
    password: "password-12345",
    name: "U",
  });
  expect(up.status).toBe(200);
  return cookiesOf(up);
}

beforeEach(() => {
  queueMail.mockReset();
});

describe("sec-06: change-email без updateEmailWithoutVerification", () => {
  it("непідтверджений: адреса НЕ змінюється до кліку, верифікація йде на нову", async () => {
    const { auth, db, sent } = makeAuth(false);
    const cookie = await signUp(auth);
    sent.length = 0;

    const res = await post(
      auth,
      "/change-email",
      { newEmail: NEW_EMAIL },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(db["user"]![0]!["email"]).toBe(OLD_EMAIL);
    expect(sent.map((m) => m.to)).toEqual([NEW_EMAIL]);
    expect(queueMail).not.toHaveBeenCalled();
  });

  it("клік у листі: адреса змінюється, підтверджена, сповіщення на СТАРУ", async () => {
    const { auth, db, sent } = makeAuth(false);
    const cookie = await signUp(auth);
    sent.length = 0;
    await post(auth, "/change-email", { newEmail: NEW_EMAIL }, cookie);
    const link = new URL(sent[0]!.url);

    const click = await auth.handler(
      new Request(`${ORIGIN}${link.pathname}${link.search}`, {
        method: "GET",
        headers: { origin: ORIGIN },
      }),
    );
    expect([200, 302]).toContain(click.status);
    expect(db["user"]![0]!["email"]).toBe(NEW_EMAIL);
    expect(db["user"]![0]!["emailVerified"]).toBe(true);
    expect(queueMail).toHaveBeenCalledTimes(1);
    expect(queueMail.mock.calls[0]![0]).toMatchObject({
      kind: "email_change_notice",
      to: OLD_EMAIL,
    });
  });

  it("контроль (true): адреса переписується одразу — дефект відтворюється", async () => {
    const { auth, db } = makeAuth(true);
    const cookie = await signUp(auth);
    const res = await post(
      auth,
      "/change-email",
      { newEmail: NEW_EMAIL },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(db["user"]![0]!["email"]).toBe(NEW_EMAIL);
  });

  it("зайве поле password у тілі Better Auth не ламає (z.object відкидає)", async () => {
    const { auth, sent } = makeAuth(false);
    const cookie = await signUp(auth);
    sent.length = 0;
    const res = await post(
      auth,
      "/change-email",
      { newEmail: NEW_EMAIL, password: "password-12345" },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
  });
});
