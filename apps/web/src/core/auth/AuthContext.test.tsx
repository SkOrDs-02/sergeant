// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// The Better Auth actions layer is irrelevant to AuthContext's source of
// truth — we stub the whole `authClient` module so tests don't hit the
// network and we can assert which action was invoked.
type AuthResult = { data: unknown; error: { message?: string } | null };
const ok = (): AuthResult => ({ data: {}, error: null });
const signInEmail: ReturnType<
  typeof vi.fn<
    (args: { email: string; password: string }) => Promise<AuthResult>
  >
> = vi.fn(async () => ok());
const signInSocial: ReturnType<
  typeof vi.fn<
    (args: { provider: string; callbackURL?: string }) => Promise<AuthResult>
  >
> = vi.fn(async () => ok());
const signUpEmail: ReturnType<
  typeof vi.fn<
    (args: {
      email: string;
      password: string;
      name: string;
    }) => Promise<AuthResult>
  >
> = vi.fn(async () => ok());
const signOut: ReturnType<typeof vi.fn<() => Promise<void>>> = vi.fn(
  async () => undefined,
);
const requestPasswordReset: ReturnType<
  typeof vi.fn<
    (args: { email: string; redirectTo?: string }) => Promise<AuthResult>
  >
> = vi.fn(async () => ok());

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

// Capture analytics events fired by AuthContext без реальної transport.
const trackEventMock: ReturnType<
  typeof vi.fn<(name: string, payload?: Record<string, unknown>) => void>
> = vi.fn();

vi.mock("../observability/analytics", async () => {
  const real = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...real,
    trackEvent: (name: string, payload?: Record<string, unknown>) =>
      trackEventMock(name, payload),
  };
});

// Mock `useUser` from `@sergeant/api-client/react`. The AuthContext must
// drive off this hook — NOT off `better-auth/react#useSession`. The mock
// keeps `apiQueryKeys` intact so invalidation assertions can compare
// against the real query key tuple.
const useUserMock = vi.fn();

vi.mock("@sergeant/api-client/react", async () => {
  const real = await vi.importActual<
    typeof import("@sergeant/api-client/react")
  >("@sergeant/api-client/react");
  return {
    ...real,
    useUser: (opts?: unknown) => useUserMock(opts),
  };
});

import { AuthProvider, useAuth, translateAuthError } from "./AuthContext";
import { apiQueryKeys } from "@sergeant/api-client/react";

interface UseUserState {
  data?:
    | {
        user: {
          id: string;
          email: string | null;
          name: string | null;
          image: string | null;
          emailVerified: boolean;
          createdAt: string | null;
        };
      }
    | undefined;
  isLoading?: boolean;
  error?: unknown;
}

function setUser(state: UseUserState) {
  useUserMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    error: state.error ?? null,
  });
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, client, invalidateSpy };
}

const SAMPLE_USER: {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: string;
} = {
  id: "u-1",
  email: "a@b.c",
  name: "A",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
};

describe("AuthContext", () => {
  beforeEach(() => {
    signInEmail.mockClear();
    signInSocial.mockClear();
    signUpEmail.mockClear();
    signOut.mockClear();
    requestPasswordReset.mockClear();
    useUserMock.mockReset();
    trackEventMock.mockClear();
  });

  it("drives `user`/`status` off useUser() — not better-auth/useSession", () => {
    setUser({ data: { user: SAMPLE_USER } });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(useUserMock).toHaveBeenCalled();
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.status).toBe("authenticated");
    expect(result.current.isLoading).toBe(false);
  });

  it("reports `loading` while useUser() is pending", () => {
    setUser({ data: undefined, isLoading: true });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toBe("loading");
    expect(result.current.user).toBeNull();
  });

  it("reports `unauthenticated` when useUser() has no user", () => {
    setUser({ data: undefined, isLoading: false });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });

  it("invalidates apiQueryKeys.me.current() after successful login", async () => {
    setUser({ data: undefined });
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const ok = await result.current.login("a@b.c", "pw");
      expect(ok).toBe(true);
    });
    expect(signInEmail).toHaveBeenCalledWith({
      email: "a@b.c",
      password: "pw",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: apiQueryKeys.me.current(),
    });
  });

  it("surfaces login error and does NOT invalidate me on failure", async () => {
    setUser({ data: undefined });
    signInEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "Bad credentials" },
    } as unknown as Awaited<ReturnType<typeof signInEmail>>);
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const ok = await result.current.login("a@b.c", "wrong");
      expect(ok).toBe(false);
    });
    expect(result.current.authError).toBe("Bad credentials");
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: apiQueryKeys.me.current(),
    });
  });

  it("invalidates apiQueryKeys.me.current() after successful register", async () => {
    setUser({ data: undefined });
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const ok = await result.current.register("a@b.c", "pw", "A");
      expect(ok).toBe(true);
    });
    expect(signUpEmail).toHaveBeenCalledWith({
      email: "a@b.c",
      password: "pw",
      name: "A",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: apiQueryKeys.me.current(),
    });
  });

  // WF-60 growth funnel читає `signup_completed` як перехід visit → signup
  // (`ops/n8n-workflows/60-growth-funnel-snapshot.json`). Без цієї події
  // funnel'у-крок зчитується як 0; контракт фіксуємо тут, щоб майбутній
  // refactor реєстрації не зніс інструментацію мовчки.
  it("fires signup_completed analytics event after successful email register", async () => {
    setUser({ data: undefined });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const ok = await result.current.register("a@b.c", "pw", "A");
      expect(ok).toBe(true);
    });
    expect(trackEventMock).toHaveBeenCalledWith("signup_completed", {
      method: "email",
    });
  });

  it("does NOT fire signup_completed when register fails", async () => {
    setUser({ data: undefined });
    signUpEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "User already exists" },
    } as unknown as Awaited<ReturnType<typeof signUpEmail>>);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const ok = await result.current.register("a@b.c", "pw", "A");
      expect(ok).toBe(false);
    });
    expect(trackEventMock).not.toHaveBeenCalledWith(
      "signup_completed",
      expect.anything(),
    );
  });

  it("invalidates apiQueryKeys.me.current() on logout, even if signOut throws", async () => {
    setUser({ data: { user: SAMPLE_USER } });
    signOut.mockRejectedValueOnce(new Error("network down"));
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.logout();
    });
    expect(signOut).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: apiQueryKeys.me.current(),
    });
  });

  it("refresh() invalidates apiQueryKeys.me.current()", async () => {
    setUser({ data: { user: SAMPLE_USER } });
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.refresh();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: apiQueryKeys.me.current(),
    });
  });

  it("requestPasswordReset delegates to Better Auth without invalidating me", async () => {
    setUser({ data: undefined });
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const ok = await result.current.requestPasswordReset("a@b.c");
      expect(ok).toBe(true);
    });
    expect(requestPasswordReset).toHaveBeenCalled();
    // Reset doesn't change identity, so me-cache must stay untouched.
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: apiQueryKeys.me.current(),
    });
  });

  it("loginWithGoogle delegates to signIn.social with provider=google", async () => {
    setUser({ data: undefined });
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const okResult = await result.current.loginWithGoogle();
      expect(okResult).toBe(true);
    });
    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/",
    });
    // Successful social sign-in normally redirects to the provider; the
    // me-cache will be re-fetched after the OAuth callback round-trips,
    // not here. Invalidation explicitly should NOT happen on the kickoff.
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: apiQueryKeys.me.current(),
    });
  });

  it("loginWithGoogle surfaces provider errors via authError", async () => {
    setUser({ data: undefined });
    signInSocial.mockResolvedValueOnce({
      data: null,
      error: { message: "Provider not configured" },
    } as unknown as Awaited<ReturnType<typeof signInSocial>>);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await act(async () => {
      const okResult = await result.current.loginWithGoogle();
      expect(okResult).toBe(false);
    });
    expect(result.current.authError).toBe("Provider not configured");
  });

  it("useAuth() throws when used outside AuthProvider", () => {
    setUser({ data: undefined });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      /useAuth must be used within AuthProvider/,
    );
    spy.mockRestore();
  });

  it("reflects useUser() transitions across logout/login (new user profile surfaces)", async () => {
    setUser({ data: { user: { ...SAMPLE_USER, id: "u-1", name: "One" } } });
    const { Wrapper } = makeWrapper();

    function Probe() {
      const { user, status } = useAuth();
      return (
        <div data-testid="probe">
          {status}:{user?.id ?? ""}:{user?.name ?? ""}
        </div>
      );
    }

    const { getByTestId, rerender } = render(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(getByTestId("probe").textContent).toBe("authenticated:u-1:One"),
    );

    // Simulate logout: useUser() now returns no user.
    setUser({ data: undefined });
    rerender(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(getByTestId("probe").textContent).toBe("unauthenticated::"),
    );

    // Simulate a new sign-in: useUser() now returns a different user.
    setUser({
      data: { user: { ...SAMPLE_USER, id: "u-2", name: "Two" } },
    });
    rerender(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(getByTestId("probe").textContent).toBe("authenticated:u-2:Two"),
    );
  });
});

describe("translateAuthError", () => {
  it("повертає fallback для null/undefined/порожнього вхідного значення", () => {
    expect(translateAuthError(null, "Помилка входу")).toBe("Помилка входу");
    expect(translateAuthError(undefined, "Помилка входу")).toBe(
      "Помилка входу",
    );
    expect(translateAuthError("", "Помилка входу")).toBe("Помилка входу");
  });

  it("мапить Better Auth INVALID_EMAIL_OR_PASSWORD у одне повідомлення про невірні credentials", () => {
    // Регресія: до фіксу `/invalid email/i` фальш-метчив підрядок
    // `"Invalid email"` усередині `"Invalid email or password"` → юзер з
    // неправильним паролем бачив «Невірний формат email.» (хоча email був
    // OK). Тепер мапимо за `code`, тож точне повідомлення стабільне.
    expect(
      translateAuthError(
        {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
          status: 401,
        },
        "Помилка входу",
      ),
    ).toBe("Невірний email або пароль.");
  });

  it("мапить рядок `Invalid email or password` без коду через message-fallback", () => {
    // Старі/інші auth-сервери, що не передають `code`, мають коректно
    // лягати у composite-патерн `/invalid email or password/i` ДО
    // вузької гілки `/^invalid email\\b/i`.
    expect(
      translateAuthError("Invalid email or password", "Помилка входу"),
    ).toBe("Невірний email або пароль.");
  });

  it("мапить 429 (status або code=RATE_LIMIT) у людське повідомлення", () => {
    // Це root cause скріна `Помилка входу` — наш rate-limiter і
    // errorHandler не пишуть `message`, лише `error`, тож Better Auth
    // client раніше ловив `result.error.message === undefined`.
    expect(
      translateAuthError(
        { status: 429, error: "Забагато запитів." },
        "Помилка входу",
      ),
    ).toMatch(/^Забагато спроб/);
    expect(
      translateAuthError(
        { code: "RATE_LIMIT", error: "Too many requests" },
        "Помилка входу",
      ),
    ).toMatch(/^Забагато спроб/);
  });

  it("мапить 5xx у generic «Сервер тимчасово недоступний»", () => {
    expect(
      translateAuthError(
        { status: 500, error: "Server error" },
        "Помилка входу",
      ),
    ).toMatch(/^Сервер тимчасово недоступний/);
    expect(translateAuthError({ code: "INTERNAL" }, "Помилка входу")).toMatch(
      /^Сервер тимчасово недоступний/,
    );
  });

  it("читає `error`-поле, коли `message` відсутній (наш серверний contract)", () => {
    // Express errorHandler і rate-limiter історично пишуть `error`. Без
    // цієї гілки 4xx-AppError-и без коду фолбекали б у дефолтний рядок.
    expect(
      translateAuthError(
        { error: "Custom backend message", status: 400 },
        "Помилка входу",
      ),
    ).toBe("Custom backend message");
  });

  it("мапить USER_ALREADY_EXISTS у дружнє повідомлення про існуючий акаунт", () => {
    expect(
      translateAuthError(
        { code: "USER_ALREADY_EXISTS", message: "User already exists." },
        "Помилка реєстрації",
      ),
    ).toMatch(/вже зареєстровано/);
  });

  it("мапить EMAIL_NOT_VERIFIED і PASSWORD_TOO_SHORT за кодом", () => {
    expect(
      translateAuthError({ code: "EMAIL_NOT_VERIFIED" }, "Помилка входу"),
    ).toMatch(/Email ще не підтверджено/);
    expect(
      translateAuthError({ code: "PASSWORD_TOO_SHORT" }, "Помилка реєстрації"),
    ).toBe("Пароль занадто короткий.");
  });

  it("повертає невідомий `message` як є (щоб не приховувати майбутні коди)", () => {
    expect(
      translateAuthError({ message: "Some new server error" }, "Помилка входу"),
    ).toBe("Some new server error");
  });
});
