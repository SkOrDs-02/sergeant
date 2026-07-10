// @vitest-environment jsdom
/**
 * AuthContext — additional branch coverage for translateAuthError (remaining
 * Better Auth error codes) and the catch-level paths in login / register /
 * loginWithGoogle / loginWithApple / requestPasswordReset that are exercised
 * when the authClient call *throws* (rather than returning `result.error`).
 *
 * This file deliberately sits next to AuthContext.test.tsx but does NOT import
 * it — each file sets up its own independent mocks so they can run in
 * parallel without shared state.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ─── Auth-client stub ─────────────────────────────────────────────────────────

type AuthResult = { data: unknown; error: { message?: string } | null };
const ok = (): AuthResult => ({ data: {}, error: null });

const signInEmail = vi.fn(async (_args: { email: string; password: string }) =>
  ok(),
);
const signInSocial = vi.fn(
  async (_args: { provider: string; callbackURL?: string }) => ok(),
);
const signUpEmail = vi.fn(
  async (_args: { email: string; password: string; name: string }) => ok(),
);
const signOut = vi.fn(async () => undefined as void);
const requestPasswordReset = vi.fn(
  async (_args: { email: string; redirectTo?: string }) => ok(),
);

vi.mock("./authClient.js", () => ({
  signIn: {
    email: (args: { email: string; password: string }) => signInEmail(args),
    social: (args: { provider: string; callbackURL?: string }) =>
      signInSocial(args),
  },
  signUp: {
    email: (args: { email: string; password: string; name: string }) =>
      signUpEmail(args),
  },
  signOut: () => signOut(),
  requestPasswordReset: (args: { email: string; redirectTo?: string }) =>
    requestPasswordReset(args),
}));

vi.mock("../observability/analytics", async () => {
  const real = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return { ...real, trackEvent: vi.fn() };
});

const useUserMock = vi.fn();
vi.mock("@sergeant/api-client/react", async () => {
  const real = await vi.importActual<
    typeof import("@sergeant/api-client/react")
  >("@sergeant/api-client/react");
  return { ...real, useUser: (opts?: unknown) => useUserMock(opts) };
});

import { AuthProvider, useAuth, translateAuthError } from "./AuthContext";
import { messages } from "../../shared/i18n/uk";

function setUser(data?: {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    createdAt: string | null;
  };
}) {
  useUserMock.mockReturnValue({ data, isLoading: false, error: null });
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, client };
}

beforeEach(() => {
  signInEmail.mockClear();
  signInSocial.mockClear();
  signUpEmail.mockClear();
  signOut.mockClear();
  requestPasswordReset.mockClear();
  useUserMock.mockReset();
});

// ─── translateAuthError — remaining Better Auth error codes ──────────────────

describe("translateAuthError — remaining Better Auth codes", () => {
  it("USER_NOT_FOUND → invalid-email-or-password message", () => {
    expect(translateAuthError({ code: "USER_NOT_FOUND" }, "fallback")).toBe(
      messages.auth.invalidEmailOrPassword,
    );
  });

  it("CREDENTIAL_ACCOUNT_NOT_FOUND → invalid-email-or-password message", () => {
    expect(
      translateAuthError({ code: "CREDENTIAL_ACCOUNT_NOT_FOUND" }, "fallback"),
    ).toBe(messages.auth.invalidEmailOrPassword);
  });

  it("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL → userAlreadyExists message", () => {
    expect(
      translateAuthError(
        { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
        "fallback",
      ),
    ).toMatch(/вже зареєстровано/);
  });

  it("INVALID_EMAIL → invalidEmail message", () => {
    expect(translateAuthError({ code: "INVALID_EMAIL" }, "fallback")).toBe(
      messages.auth.invalidEmail,
    );
  });

  it("INVALID_PASSWORD → invalidPassword message", () => {
    expect(translateAuthError({ code: "INVALID_PASSWORD" }, "fallback")).toBe(
      messages.auth.invalidPassword,
    );
  });

  it("PASSWORD_TOO_LONG → passwordTooLong message", () => {
    expect(translateAuthError({ code: "PASSWORD_TOO_LONG" }, "fallback")).toBe(
      messages.auth.passwordTooLong,
    );
  });

  it("PROVIDER_NOT_FOUND → providerNotFound message", () => {
    expect(translateAuthError({ code: "PROVIDER_NOT_FOUND" }, "fallback")).toBe(
      messages.auth.providerNotFound,
    );
  });

  it("FAILED_TO_CREATE_SESSION → sessionFailure message", () => {
    expect(
      translateAuthError({ code: "FAILED_TO_CREATE_SESSION" }, "fallback"),
    ).toBe(messages.auth.sessionFailure);
  });

  it("FAILED_TO_CREATE_USER → sessionFailure message", () => {
    expect(
      translateAuthError({ code: "FAILED_TO_CREATE_USER" }, "fallback"),
    ).toBe(messages.auth.sessionFailure);
  });

  it("INVALID_TOKEN → invalidToken message", () => {
    expect(translateAuthError({ code: "INVALID_TOKEN" }, "fallback")).toBe(
      messages.auth.invalidToken,
    );
  });

  it("TOKEN_EXPIRED → invalidToken message", () => {
    expect(translateAuthError({ code: "TOKEN_EXPIRED" }, "fallback")).toBe(
      messages.auth.invalidToken,
    );
  });

  it("`Invalid token` message string (no code) → invalidToken via message-level pattern", () => {
    expect(translateAuthError("Invalid token", "fallback")).toBe(
      messages.auth.invalidToken,
    );
  });

  it("password too long message string → passwordTooLong", () => {
    expect(translateAuthError("Password too long", "fallback")).toBe(
      messages.auth.passwordTooLong,
    );
  });

  it("invalid password message string → invalidPassword", () => {
    expect(translateAuthError("Invalid password", "fallback")).toBe(
      messages.auth.invalidPassword,
    );
  });

  it("unknown code falls through to translateByMessage with message field", () => {
    expect(
      translateAuthError(
        { code: "BRAND_NEW_CODE", message: "Some specific message" },
        "fallback",
      ),
    ).toBe("Some specific message");
  });

  it("non-object non-string error (e.g. number) → fallback", () => {
    // `asAuthErrorLike` returns null for non-object/non-string values;
    // translateAuthError receives null and returns fallback.
    expect(translateAuthError(42 as unknown as string, "fallback")).toBe(
      "fallback",
    );
  });
});

// ─── Catch-level branches: thrown errors (not result.error) ──────────────────

describe("AuthContext — action catch paths (thrown errors)", () => {
  it("login: thrown error sets authError via asAuthErrorLike", async () => {
    setUser(undefined);
    signInEmail.mockRejectedValueOnce(
      Object.assign(new Error("Network error"), { code: "RATE_LIMIT" }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const success = await result.current.login("a@b.c", "pw");
      expect(success).toBe(false);
    });
    expect(result.current.authError).toMatch(/Забагато спроб/);
  });

  it("register: thrown error sets authError via asAuthErrorLike", async () => {
    setUser(undefined);
    signUpEmail.mockRejectedValueOnce(
      Object.assign(new Error("Server exploded"), { status: 500 }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const success = await result.current.register("a@b.c", "pw", "A");
      expect(success).toBe(false);
    });
    expect(result.current.authError).toMatch(/Сервер тимчасово недоступний/);
  });

  it("loginWithGoogle: thrown exception sets authError", async () => {
    setUser(undefined);
    signInSocial.mockRejectedValueOnce(new Error("popup blocked"));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const success = await result.current.loginWithGoogle();
      expect(success).toBe(false);
    });
    expect(result.current.authError).toBeTruthy();
  });

  it("loginWithApple: thrown exception sets authError", async () => {
    setUser(undefined);
    signInSocial.mockRejectedValueOnce(
      Object.assign(new Error("Provider not found"), {
        code: "PROVIDER_NOT_FOUND",
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const success = await result.current.loginWithApple();
      expect(success).toBe(false);
    });
    expect(result.current.authError).toBe(messages.auth.providerNotFound);
  });

  it("requestPasswordReset: thrown exception sets authError and returns false", async () => {
    setUser(undefined);
    requestPasswordReset.mockRejectedValueOnce(new Error("Server down"));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const success = await result.current.requestPasswordReset("a@b.c");
      expect(success).toBe(false);
    });
    expect(result.current.authError).toBeTruthy();
  });

  it("requestPasswordReset: result.error sets authError and returns false", async () => {
    setUser(undefined);
    requestPasswordReset.mockResolvedValueOnce({
      data: null,
      error: { message: "Not a valid email." },
    } as unknown as Awaited<ReturnType<typeof requestPasswordReset>>);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const success = await result.current.requestPasswordReset("bad@");
      expect(success).toBe(false);
    });
    expect(result.current.authError).toBeTruthy();
  });

  it("login: result.error with status 429 → rateLimited message", async () => {
    setUser(undefined);
    signInEmail.mockResolvedValueOnce({
      data: null,
      error: { status: 429, error: "Too many requests" },
    } as unknown as Awaited<ReturnType<typeof signInEmail>>);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const success = await result.current.login("a@b.c", "pw");
      expect(success).toBe(false);
    });
    expect(result.current.authError).toMatch(/Забагато спроб/);
  });
});
