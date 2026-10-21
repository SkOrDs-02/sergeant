import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mailQueue, ftuxQueue, reverseTrial, loggerMock } = vi.hoisted(() => ({
  mailQueue: vi.fn(),
  ftuxQueue: vi.fn(),
  reverseTrial: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));

vi.mock("./db.js", () => {
  const pool = { query: vi.fn(), connect: vi.fn(), on: vi.fn() };
  return { default: pool, pool, query: pool.query, ensureSchema: vi.fn() };
});
vi.mock("./obs/logger.js", () => ({ logger: loggerMock }));
vi.mock("./email/authTransactionalMail.js", () => ({
  queueAuthTransactionalEmail: mailQueue,
}));
vi.mock("./email/ftuxDripMail.js", () => ({
  queueFtuxDripForNewUser: ftuxQueue,
}));
vi.mock("./modules/billing/reverseTrial.js", () => ({
  grantReverseTrial: reverseTrial,
}));

const { auth } = await import("./auth.js");

type AuthCallbacks = {
  options: {
    user: {
      changeEmail: {
        sendChangeEmailConfirmation: (input: {
          user: { email: string };
          newEmail: string;
          url: string;
        }) => Promise<void>;
      };
    };
    emailAndPassword: {
      sendResetPassword: (input: {
        user: { email: string };
        url: string;
      }) => Promise<void>;
    };
    emailVerification: {
      sendVerificationEmail: (input: {
        user: { email: string };
        url: string;
      }) => Promise<void>;
    };
    databaseHooks: {
      user: { create: { after: (user: unknown) => Promise<void> } };
    };
  };
};

const options = (auth as unknown as AuthCallbacks).options;

beforeEach(() => {
  vi.clearAllMocks();
  reverseTrial.mockResolvedValue(undefined);
});

describe("auth email callbacks", () => {
  it("sends change-email confirmation to the existing address", async () => {
    await options.user.changeEmail.sendChangeEmailConfirmation({
      user: { email: "old@example.com" },
      newEmail: "new@example.com",
      url: "https://api.example.com/confirm?token=abc",
    });

    expect(mailQueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: "email_change_confirmation",
        to: "old@example.com",
      }),
    );
  });

  it("queues password reset and verification for the account owner", async () => {
    const user = { email: "owner@example.com" };
    await options.emailAndPassword.sendResetPassword({
      user,
      url: "https://api.example.com/reset-password?token=abc",
    });
    await options.emailVerification.sendVerificationEmail({
      user,
      url: "https://api.example.com/verify-email?token=abc",
    });

    expect(mailQueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: "password_reset", to: user.email }),
    );
    expect(mailQueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: "email_verification", to: user.email }),
    );
  });
});

describe("auth user creation callback", () => {
  it("starts reverse trial and FTUX drip for a newly created user", async () => {
    await options.databaseHooks.user.create.after({
      id: "new-user",
      email: "new@example.com",
    });

    expect(reverseTrial).toHaveBeenCalledWith(expect.anything(), "new-user");
    expect(ftuxQueue).toHaveBeenCalledExactlyOnceWith({
      userId: "new-user",
      email: "new@example.com",
    });
  });

  it("ignores incomplete user records", async () => {
    await options.databaseHooks.user.create.after(null);
    await options.databaseHooks.user.create.after({ id: "new-user" });
    await options.databaseHooks.user.create.after({ email: "new@example.com" });

    expect(reverseTrial).not.toHaveBeenCalled();
    expect(ftuxQueue).not.toHaveBeenCalled();
  });

  it("logs a privacy-safe FTUX enqueue failure without failing sign-up", async () => {
    ftuxQueue.mockImplementationOnce(() => {
      throw new Error("queue unavailable");
    });

    await expect(
      options.databaseHooks.user.create.after({
        id: "new-user",
        email: "Private@Example.com",
      }),
    ).resolves.toBeUndefined();
    const [fields] = loggerMock.error.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(fields).toMatchObject({
      event: "auth.user.ftux_drip.enqueue_error",
      email_hash: createHash("sha256")
        .update("private@example.com")
        .digest("hex")
        .slice(0, 12),
      err: "queue unavailable",
    });
    expect(JSON.stringify(fields)).not.toContain("Private@Example.com");
  });
});
