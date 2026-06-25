import { afterEach, describe, expect, it, vi } from "vitest";

type JwtAuthorize = ReturnType<typeof vi.fn>;

interface LoadedFcmClient {
  fcmProjectId(): string | null;
  getFcmAccessToken(): Promise<string | null>;
}

interface LoadOptions {
  rawServiceAccount?: string;
  authorize?: JwtAuthorize;
}

async function loadFcmClient({
  rawServiceAccount = "",
  authorize = vi.fn(),
}: LoadOptions = {}): Promise<{
  mod: LoadedFcmClient;
  authorize: JwtAuthorize;
  jwtCtor: ReturnType<typeof vi.fn>;
  loggerWarn: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const loggerWarn = vi.fn();
  const jwtCtor = vi.fn();
  function MockJWT(this: unknown, config: unknown) {
    jwtCtor(config);
    return { authorize };
  }

  vi.doMock("../env/env.js", () => ({
    env: { FCM_SERVICE_ACCOUNT_JSON: rawServiceAccount },
  }));
  vi.doMock("../obs/logger.js", () => ({
    logger: {
      warn: loggerWarn,
    },
  }));
  vi.doMock("google-auth-library", () => ({
    JWT: MockJWT,
  }));

  const mod = (await import("./fcmClient.js")) as LoadedFcmClient;
  return { mod, authorize, jwtCtor, loggerWarn };
}

function serviceAccount(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({
      project_id: "sergeant-prod",
      client_email: "firebase-admin@example.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n",
      ...overrides,
    }),
  ).toString("base64");
}

describe("fcmClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../env/env.js");
    vi.doUnmock("../obs/logger.js");
    vi.doUnmock("google-auth-library");
  });

  it("returns null and warns once when FCM service account env is absent", async () => {
    const { mod, authorize, jwtCtor, loggerWarn } = await loadFcmClient();

    await expect(mod.getFcmAccessToken()).resolves.toBeNull();
    await expect(mod.getFcmAccessToken()).resolves.toBeNull();
    expect(mod.fcmProjectId()).toBeNull();

    expect(jwtCtor).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("no FCM_SERVICE_ACCOUNT_JSON"),
      }),
    );
  });

  it("rejects invalid JSON and service accounts with missing fields", async () => {
    const invalidJson = await loadFcmClient({
      rawServiceAccount: Buffer.from("not-json").toString("base64"),
    });
    await expect(invalidJson.mod.getFcmAccessToken()).resolves.toBeNull();
    expect(invalidJson.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("FCM_SERVICE_ACCOUNT_JSON invalid JSON"),
      }),
    );

    const missingFields = await loadFcmClient({
      rawServiceAccount: serviceAccount({ private_key: undefined }),
    });
    await expect(missingFields.mod.getFcmAccessToken()).resolves.toBeNull();
    expect(missingFields.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("FCM service account missing fields"),
        hasProjectId: true,
        hasClientEmail: true,
        hasPrivateKey: false,
      }),
    );
  });

  it("creates a JWT client, returns project id, and reuses cached access token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000Z"));
    const authorize = vi.fn().mockResolvedValue({
      access_token: "token-1",
      expiry_date: Date.now() + 120_000,
    });
    const { mod, jwtCtor } = await loadFcmClient({
      rawServiceAccount: serviceAccount(),
      authorize,
    });

    await expect(mod.getFcmAccessToken()).resolves.toBe("token-1");
    await expect(mod.getFcmAccessToken()).resolves.toBe("token-1");
    expect(mod.fcmProjectId()).toBe("sergeant-prod");

    expect(jwtCtor).toHaveBeenCalledWith({
      email: "firebase-admin@example.iam.gserviceaccount.com",
      key: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n",
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("refreshes near-expired tokens and falls back to one-hour expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000Z"));
    const authorize = vi
      .fn()
      .mockResolvedValueOnce({
        access_token: "short-token",
        expiry_date: Date.now() + 30_000,
      })
      .mockResolvedValueOnce({ access_token: "fallback-expiry-token" });
    const { mod } = await loadFcmClient({
      rawServiceAccount: serviceAccount(),
      authorize,
    });

    await expect(mod.getFcmAccessToken()).resolves.toBe("short-token");
    await expect(mod.getFcmAccessToken()).resolves.toBe(
      "fallback-expiry-token",
    );
    await expect(mod.getFcmAccessToken()).resolves.toBe(
      "fallback-expiry-token",
    );

    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it("throws when Google returns no access token", async () => {
    const { mod } = await loadFcmClient({
      rawServiceAccount: serviceAccount(),
      authorize: vi
        .fn()
        .mockResolvedValue({ expiry_date: Date.now() + 60_000 }),
    });

    await expect(mod.getFcmAccessToken()).rejects.toThrow(
      "FCM token request returned no access_token",
    );
  });
});
