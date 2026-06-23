// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockIsCapacitor = vi.hoisted(() => vi.fn(() => false));
const mockClearBearer = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockRawSignOut = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: {} })),
);
const mockGetSession = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: { session: { id: "s1" } } })),
);

const capturedConfig = vi.hoisted(() => ({
  value: null as { fetchOptions?: unknown } | null,
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: (config: { fetchOptions?: unknown }) => {
    capturedConfig.value = config;
    return new Proxy(
      {
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: mockRawSignOut,
        getSession: mockGetSession,
      },
      {
        get(target, prop) {
          if (prop in target)
            return (target as Record<string, unknown>)[prop as string];
          // Proxy-resolved plugin methods (requestPasswordReset, etc.)
          return vi.fn(() => Promise.resolve({ data: {}, error: null }));
        },
      },
    );
  },
}));

vi.mock("@shared/lib/api/apiUrl", () => ({
  apiUrl: () => "https://api.test",
}));

vi.mock("@shared/lib/api/bearerToken", () => ({
  clearBearerToken: mockClearBearer,
  getBearerToken: vi.fn(() => Promise.resolve("tok")),
  setBearerToken: vi.fn(() => Promise.resolve()),
}));

vi.mock("@sergeant/shared", () => ({
  isCapacitor: mockIsCapacitor,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockIsCapacitor.mockReturnValue(false);
});
afterEach(() => {
  vi.resetModules();
});

describe("authClient signOut wrapper", () => {
  it("delegates to raw signOut and skips bearer clear outside Capacitor", async () => {
    const { signOut } = await import("./authClient");
    await signOut();
    expect(mockRawSignOut).toHaveBeenCalled();
    expect(mockClearBearer).not.toHaveBeenCalled();
  });

  it("clears the bearer token after sign-out in Capacitor", async () => {
    mockIsCapacitor.mockReturnValue(true);
    const { signOut } = await import("./authClient");
    await signOut();
    expect(mockRawSignOut).toHaveBeenCalled();
    expect(mockClearBearer).toHaveBeenCalled();
  });
});

describe("deduplicated getSession", () => {
  it("shares one in-flight request for concurrent callers", async () => {
    const { getSession } = await import("./authClient");
    const a = getSession();
    const b = getSession();
    expect(a).toBe(b);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    await Promise.all([a, b]);
  });

  it("issues a fresh request after the previous one settles", async () => {
    const { getSession } = await import("./authClient");
    await getSession();
    await getSession();
    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });
});

describe("fetchOptions bearer provider", () => {
  type FetchOpts = {
    auth: { token: () => Promise<string | undefined> };
    onSuccess: (ctx: { response: Response }) => Promise<void>;
  };

  async function getFetchOptions(): Promise<FetchOpts> {
    await import("./authClient");
    return (capturedConfig.value as { fetchOptions: FetchOpts }).fetchOptions;
  }

  it("token() returns undefined outside Capacitor", async () => {
    mockIsCapacitor.mockReturnValue(false);
    const opts = await getFetchOptions();
    await expect(opts.auth.token()).resolves.toBeUndefined();
  });

  it("token() returns the stored bearer token in Capacitor", async () => {
    mockIsCapacitor.mockReturnValue(true);
    const opts = await getFetchOptions();
    await expect(opts.auth.token()).resolves.toBe("tok");
  });

  it("onSuccess persists set-auth-token header in Capacitor", async () => {
    mockIsCapacitor.mockReturnValue(true);
    const { setBearerToken } = await import("@shared/lib/api/bearerToken");
    const opts = await getFetchOptions();
    const response = new Response(null, {
      headers: { "set-auth-token": "new-tok" },
    });
    await opts.onSuccess({ response });
    expect(setBearerToken).toHaveBeenCalledWith("new-tok");
  });

  it("onSuccess is a no-op outside Capacitor", async () => {
    mockIsCapacitor.mockReturnValue(false);
    const { setBearerToken } = await import("@shared/lib/api/bearerToken");
    const opts = await getFetchOptions();
    const response = new Response(null, {
      headers: { "set-auth-token": "x" },
    });
    await opts.onSuccess({ response });
    expect(setBearerToken).not.toHaveBeenCalled();
  });
});

describe("re-exported auth actions", () => {
  it("exposes the expected action surface", async () => {
    const mod = await import("./authClient");
    for (const name of [
      "signIn",
      "signUp",
      "requestPasswordReset",
      "resetPassword",
      "updateUser",
      "changePassword",
      "listSessions",
      "revokeSession",
      "revokeSessions",
      "deleteUser",
      "sendVerificationEmail",
      "changeEmail",
    ]) {
      expect(mod).toHaveProperty(name);
    }
  });
});
