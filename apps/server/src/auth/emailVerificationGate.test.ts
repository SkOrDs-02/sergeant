import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

const { queueMail } = vi.hoisted(() => ({ queueMail: vi.fn() }));

vi.mock("../email/authTransactionalMail.js", () => ({
  queueAuthTransactionalEmail: queueMail,
}));
vi.mock("../obs/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  emailVerificationGateOptions,
  guardEmailVerifiedSignIn,
  requiresVerifiedEmail,
  resetMailThrottleForTests,
  takeMailSlot,
  MAIL_THROTTLE_MAX_KEYS,
  MAIL_THROTTLE_WINDOW_MS,
} = await import("./emailVerificationGate.js");

/**
 * sec-46 / priv-29 проти СПРАВЖНЬОГО `betterAuth()` (memory-адаптер, без
 * Postgres) з тією самою проводкою, що в `auth.ts`: фрагмент
 * `emailVerificationGateOptions` у `emailAndPassword` і
 * `guardEmailVerifiedSignIn` у `databaseHooks.session.create.before`.
 */
const ORIGIN = "http://localhost:3000";
const PASSWORD = "password-12345";
const CUTOFF = new Date("2026-11-21T00:00:00Z");

type Db = Record<string, Array<Record<string, unknown>>>;

function makeAuth(cutoff: Date | undefined) {
  const db: Db = { user: [], session: [], account: [], verification: [] };
  const verifyUrls: string[] = [];
  const gate = emailVerificationGateOptions(cutoff);
  const instance = betterAuth({
    database: memoryAdapter(db),
    secret: "x".repeat(48),
    baseURL: ORIGIN,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true, ...gate.emailAndPassword },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: gate.autoSignInAfterVerification,
      sendVerificationEmail: async ({ url }) => {
        verifyUrls.push(url);
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (data, context) => {
            await guardEmailVerifiedSignIn(data, context, cutoff);
          },
        },
      },
    },
  });
  return { instance, db, verifyUrls };
}

type TestAuth = ReturnType<typeof makeAuth>["instance"];

const post = (a: TestAuth, path: string, body: unknown) =>
  a.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const signUp = (a: TestAuth, email: string) =>
  post(a, "/sign-up/email", { email, password: PASSWORD, name: "U" });
const signIn = (a: TestAuth, email: string, password = PASSWORD) =>
  post(a, "/sign-in/email", { email, password });

const sessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith("better-auth.session_token=") && !/=;/.test(c));

/** Дата створення в минулому — так виглядає акаунт до межі. */
function backdate(db: Db, email: string) {
  const row = db["user"]?.find((u) => u["email"] === email);
  if (!row) throw new Error(`no user ${email}`);
  row["createdAt"] = new Date("2025-01-01T00:00:00Z");
}

beforeEach(() => {
  queueMail.mockClear();
  resetMailThrottleForTests();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-12-01T00:00:00Z") });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("sec-46: реєстрація без межі (поведінка до фіксу)", () => {
  it("контроль: зайнята адреса дає 422 USER_ALREADY_EXISTS, тобто розкриває акаунт", async () => {
    const { instance } = makeAuth(undefined);
    expect((await signUp(instance, "a@example.com")).status).toBe(200);
    const dup = await signUp(instance, "a@example.com");
    expect(dup.status).toBe(422);
    expect(((await dup.json()) as { code?: string }).code).toBe(
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    );
  });

  it("без межі гейт входу не діє: непідтверджений новий акаунт входить", async () => {
    const { instance } = makeAuth(undefined);
    await signUp(instance, "b@example.com");
    const res = await signIn(instance, "b@example.com");
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeTruthy();
  });
});

describe("sec-46: реєстрація з межею EMAIL_VERIFICATION_REQUIRED_FROM", () => {
  it("нова і зайнята адреса отримують однаковий 200 без сесії", async () => {
    const { instance } = makeAuth(CUTOFF);
    const fresh = await signUp(instance, "new@example.com");
    const dup = await signUp(instance, "new@example.com");
    expect(fresh.status).toBe(200);
    expect(dup.status).toBe(200);
    const freshBody = (await fresh.json()) as Record<string, unknown>;
    const dupBody = (await dup.json()) as Record<string, unknown>;
    expect(freshBody["token"]).toBeNull();
    expect(dupBody["token"]).toBeNull();
    // `image`: memory-адаптер не пише відсутнє поле, а синтетичний
    // користувач Better Auth несе `image: null`; у Postgres колонка є
    // завжди, тож і справжній рядок повертає `image: null`.
    const keys = (u: unknown) =>
      Object.keys(u as object)
        .filter((k) => k !== "image")
        .sort();
    expect(keys(dupBody["user"])).toEqual(keys(freshBody["user"]));
    expect(sessionCookie(fresh)).toBeUndefined();
    expect(sessionCookie(dup)).toBeUndefined();
  });

  it("власнику зайнятої адреси йде лист «у тебе вже є акаунт», один за вікно", async () => {
    const { instance } = makeAuth(CUTOFF);
    await signUp(instance, "owner@example.com");
    expect(queueMail).not.toHaveBeenCalled();
    await signUp(instance, "owner@example.com");
    await signUp(instance, "owner@example.com");
    await vi.waitFor(() => expect(queueMail).toHaveBeenCalledTimes(1));
    const mail = queueMail.mock.calls[0]?.[0] as Record<string, string>;
    expect(mail["kind"]).toBe("account_exists");
    expect(mail["to"]).toBe("owner@example.com");
    expect(mail["subject"]).toContain("вже є акаунт");
  });

  it("новий непідтверджений акаунт: правильний пароль дає 403 EMAIL_NOT_VERIFIED і новий лист", async () => {
    const { instance, verifyUrls } = makeAuth(CUTOFF);
    await signUp(instance, "fresh@example.com");
    const sentOnSignUp = verifyUrls.length;
    const res = await signIn(instance, "fresh@example.com");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe(
      "EMAIL_NOT_VERIFIED",
    );
    expect(sessionCookie(res)).toBeUndefined();
    expect(verifyUrls.length).toBe(sentOnSignUp + 1);
  });

  it("неправильний пароль лишається 401: 403 бачить лише власник пароля", async () => {
    const { instance } = makeAuth(CUTOFF);
    await signUp(instance, "pw@example.com");
    const res = await signIn(instance, "pw@example.com", "wrong-password-1");
    expect(res.status).toBe(401);
  });

  it("акаунт, створений до межі, входить без підтвердження, як і раніше", async () => {
    const { instance, db } = makeAuth(CUTOFF);
    await signUp(instance, "legacy@example.com");
    backdate(db, "legacy@example.com");
    const res = await signIn(instance, "legacy@example.com");
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeTruthy();
  });

  it("клік у листі підтвердження відкриває сесію, далі вхід паролем працює", async () => {
    const { instance, verifyUrls } = makeAuth(CUTOFF);
    await signUp(instance, "click@example.com");
    const url = verifyUrls.at(-1);
    expect(url).toBeTruthy();
    const verified = await instance.handler(
      new Request(url!, { headers: { origin: ORIGIN } }),
    );
    expect(sessionCookie(verified)).toBeTruthy();
    const res = await signIn(instance, "click@example.com");
    expect(res.status).toBe(200);
  });
});

describe("requiresVerifiedEmail", () => {
  it("рахує межу включно, підтверджений і старий акаунт пропускає", () => {
    expect(
      requiresVerifiedEmail(
        { emailVerified: false, createdAt: CUTOFF },
        CUTOFF,
      ),
    ).toBe(true);
    expect(
      requiresVerifiedEmail(
        { emailVerified: true, createdAt: new Date("2027-01-01") },
        CUTOFF,
      ),
    ).toBe(false);
    expect(
      requiresVerifiedEmail(
        { emailVerified: false, createdAt: "2026-11-20T23:59:59Z" },
        CUTOFF,
      ),
    ).toBe(false);
    expect(
      requiresVerifiedEmail(
        { emailVerified: false, createdAt: CUTOFF },
        undefined,
      ),
    ).toBe(false);
  });

  it("битий createdAt трактує як новий акаунт (fail-closed)", () => {
    expect(
      requiresVerifiedEmail(
        { emailVerified: false, createdAt: "nope" },
        CUTOFF,
      ),
    ).toBe(true);
  });
});

describe("takeMailSlot", () => {
  it("пускає один лист на вид і адресу за вікно, регістр адреси не важить", () => {
    const now = Date.now();
    expect(takeMailSlot("k", "A@example.com", now)).toBe(true);
    expect(takeMailSlot("k", "a@example.com", now + 1)).toBe(false);
    expect(takeMailSlot("other", "a@example.com", now + 1)).toBe(true);
    expect(
      takeMailSlot("k", "a@example.com", now + MAIL_THROTTLE_WINDOW_MS),
    ).toBe(true);
  });

  it("флуд новими адресами витісняє найстаріші слоти, а не обнуляє троттл жертви", () => {
    const now = Date.now();
    expect(takeMailSlot("k", "oldest@example.com", now)).toBe(true);
    expect(takeMailSlot("k", "victim@example.com", now + 1)).toBe(true);
    // Заповнюємо памʼять до межі свіжими адресами в межах того самого вікна.
    for (let i = 0; i < MAIL_THROTTLE_MAX_KEYS - 1; i += 1) {
      takeMailSlot("k", `flood-${i}@example.com`, now + 2);
    }
    // Витіснено лише найстаріший слот; жертва далі під троттлом.
    expect(takeMailSlot("k", "victim@example.com", now + 3)).toBe(false);
    expect(takeMailSlot("k", "oldest@example.com", now + 3)).toBe(true);
  });
});

describe("emailVerificationGateOptions", () => {
  it("без межі не міняє дефолтів Better Auth", () => {
    expect(emailVerificationGateOptions(undefined)).toEqual({
      emailAndPassword: {},
      autoSignInAfterVerification: false,
    });
  });
});
