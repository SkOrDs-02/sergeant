import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { GoogleProfile } from "better-auth/social-providers";

vi.mock("../email/authTransactionalMail.js", () => ({
  queueAuthTransactionalEmail: vi.fn(),
}));
vi.mock("../obs/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { accountLinkingOptions } = await import("./emailVerificationGate.js");

/**
 * sec-46 (ревʼю PR): pre-account-takeover через неявне привʼязування OAuth
 * проти СПРАВЖНЬОГО `betterAuth()` (memory-адаптер) з тим самим
 * `account.accountLinking`, що в `auth.ts`.
 *
 * Зловмисник реєструє email+пароль на адресу жертви (адреса непідтверджена),
 * потім жертва входить Google на ту саму адресу. Google-провайдер тут
 * справжній, підмінено лише перевірку id-токена й профіль, щоб не ходити в
 * мережу; шлях `/sign-in/social` з `idToken` той самий, що в мобільному
 * клієнті, і веде в ту саму `handleOAuthUserInfo`, що й веб-колбек.
 */
const ORIGIN = "http://localhost:3000";
const VICTIM = "victim@example.com";
const ATTACKER_PASSWORD = "attacker-pass-123";

type Db = Record<string, Array<Record<string, unknown>>>;
type AccountLinking = { requireLocalEmailVerified?: boolean };

function makeAuth(accountLinking: AccountLinking) {
  const db: Db = { user: [], session: [], account: [], verification: [] };
  const instance = betterAuth({
    database: memoryAdapter(db),
    secret: "x".repeat(48),
    baseURL: ORIGIN,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true },
    account: { accountLinking },
    socialProviders: {
      google: {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        verifyIdToken: async () => true,
        getUserInfo: async () => ({
          user: {
            email: VICTIM,
            name: "Victim",
            emailVerified: true,
          },
          // Лише поля, які читає Better Auth; решта `GoogleProfile` не потрібна.
          data: {
            sub: "google-sub-1",
            email: VICTIM,
            email_verified: true,
          } as unknown as GoogleProfile,
        }),
      },
    },
  });
  return { instance, db };
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

const victimRow = (db: Db) => db["user"]?.find((u) => u["email"] === VICTIM);
const googleAccounts = (db: Db) =>
  (db["account"] ?? []).filter((a) => a["providerId"] === "google");

async function attackerSignsUpThenVictimUsesGoogle(a: TestAuth) {
  const signUp = await post(a, "/sign-up/email", {
    email: VICTIM,
    password: ATTACKER_PASSWORD,
    name: "Attacker",
  });
  expect(signUp.status).toBe(200);
  return post(a, "/sign-in/social", {
    provider: "google",
    idToken: { token: "opaque-test-token" },
  });
}

describe("sec-46: неявне привʼязування OAuth до непідтвердженого акаунта", () => {
  it("контроль: з requireLocalEmailVerified=false Google привʼязується, адреса стає підтвердженою і пароль зловмисника працює", async () => {
    const { instance, db } = makeAuth({ requireLocalEmailVerified: false });
    const social = await attackerSignsUpThenVictimUsesGoogle(instance);
    expect(social.status).toBe(200);
    expect(googleAccounts(db)).toHaveLength(1);
    expect(victimRow(db)?.["emailVerified"]).toBe(true);
    // Саме це і є захоплення: email-гейти тепер пускають пароль зловмисника.
    const attacker = await post(instance, "/sign-in/email", {
      email: VICTIM,
      password: ATTACKER_PASSWORD,
    });
    expect(attacker.status).toBe(200);
  });

  it("конфіг auth.ts: Google НЕ привʼязується, emailVerified лишається false", async () => {
    expect(accountLinkingOptions.requireLocalEmailVerified).toBe(true);
    const { instance, db } = makeAuth(accountLinkingOptions);
    const social = await attackerSignsUpThenVictimUsesGoogle(instance);
    expect(social.status).not.toBe(200);
    expect(googleAccounts(db)).toHaveLength(0);
    expect(victimRow(db)?.["emailVerified"]).toBe(false);
    expect(db["user"]).toHaveLength(1);
  });

  it("підтверджений локальний акаунт і далі привʼязує Google (легітимний шлях не зламано)", async () => {
    const { instance, db } = makeAuth(accountLinkingOptions);
    await post(instance, "/sign-up/email", {
      email: VICTIM,
      password: ATTACKER_PASSWORD,
      name: "Owner",
    });
    const row = victimRow(db);
    if (!row) throw new Error("no user");
    row["emailVerified"] = true;
    const social = await post(instance, "/sign-in/social", {
      provider: "google",
      idToken: { token: "opaque-test-token" },
    });
    expect(social.status).toBe(200);
    expect(googleAccounts(db)).toHaveLength(1);
  });
});
