/**
 * E2E mock-auth layer — Better Auth + `/api/v1/me` без живого бекенда.
 *
 * Активується лише коли `process.env.EXPO_PUBLIC_E2E_REAL_AUTH === "1"`.
 * У production-збірках Metro інлайнить значення на bundle-time, тож
 * увесь цей модуль перетворюється на dead-code (виклик з
 * `installE2EAuthMock` стає `return false`) і не потрапляє в release
 * binary. Див. `docs/mobile/react-native-migration.md` §13 Q8.
 *
 * Що мокаємо:
 *   - `POST /api/auth/sign-in/email` — приймає email/password, що
 *     збігаються з `EXPO_PUBLIC_E2E_USER_EMAIL` / `_PASSWORD`, і
 *     повертає синтетичну Better Auth сесію + bearer-токен.
 *   - `POST /api/auth/sign-out` — інвалидує синтетичну сесію.
 *   - `GET  /api/v1/me` — повертає синтетичного користувача, поки
 *     синтетична сесія активна; інакше — 401.
 *
 * Чому fetch-interceptor, а не shim навколо `signIn`/`useUser`:
 *   - `@better-auth/expo/client` пише `set-cookie` у SecureStore сам;
 *     щоб механізм read-bearer (див. `apps/mobile/src/api/apiClient.ts`)
 *     лишився під тестом, ми повертаємо ту саму форму `set-auth-token` +
 *     `set-cookie` headers, що й живий сервер.
 *   - `useUser()` з `@sergeant/api-client/react` ходить через єдиний
 *     `fetch`-driven HttpClient — підмінивши `globalThis.fetch`, ми
 *     одночасно вирішуємо обидва сценарії (Better Auth + REST).
 *
 * Семантика "сесія активна": prop on Better Auth's SecureStore прапор.
 * `apiClient.readBearerToken()` буде читати реальний SecureStore →
 * ми повертаємо синтетичний токен у відповіді sign-in, Better Auth
 * client сам збереже його у store. Sign-out викликає `signOut.delete`
 * на сервері → ми відповідаємо 200 і Better Auth client сам почистить
 * SecureStore. Тому ми НЕ дублюємо стан тут — `fetch` для `/me` просто
 * перевіряє bearer header у запиті.
 */

const DEFAULT_E2E_EMAIL = "e2e-detox@sergeant.test";
const DEFAULT_E2E_PASSWORD = "detox-pass-2026";
const SYNTHETIC_USER_ID = "e2e-user-id-detox";
const SYNTHETIC_TOKEN = "e2e-bearer-token-detox";

export function isE2EMockAuthEnabled(): boolean {
  return process.env.EXPO_PUBLIC_E2E_REAL_AUTH === "1";
}

export function getE2EMockEmail(): string {
  return process.env.EXPO_PUBLIC_E2E_USER_EMAIL?.trim() || DEFAULT_E2E_EMAIL;
}

export function getE2EMockPassword(): string {
  return (
    process.env.EXPO_PUBLIC_E2E_USER_PASSWORD?.trim() || DEFAULT_E2E_PASSWORD
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function syntheticUser(): {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: string;
} {
  return {
    id: SYNTHETIC_USER_ID,
    email: getE2EMockEmail(),
    name: "Detox E2E",
    image: null,
    emailVerified: true,
    createdAt: nowIso(),
  };
}

function syntheticSession(): {
  id: string;
  userId: string;
  expiresAt: string;
  token: string;
} {
  return {
    id: "e2e-session-detox",
    userId: SYNTHETIC_USER_ID,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    token: SYNTHETIC_TOKEN,
  };
}

function urlPath(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    try {
      return new URL(input).pathname;
    } catch {
      return input.startsWith("/") ? input : `/${input}`;
    }
  }
  if (input instanceof URL) {
    return input.pathname;
  }
  // Request
  try {
    return new URL(input.url).pathname;
  } catch {
    return input.url;
  }
}

function requestMethod(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

async function readBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<unknown> {
  const raw =
    init?.body ??
    (input instanceof Request ? await input.clone().text() : null);
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

function authHeader(
  init: RequestInit | undefined,
  input: RequestInfo | URL,
): string | null {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  return headers.get("authorization");
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers ?? {});
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

function signInSuccessResponse(): Response {
  const user = syntheticUser();
  const session = syntheticSession();
  const headers = new Headers({ "content-type": "application/json" });
  // Better Auth Expo client reads the bearer token from `set-auth-token`
  // and the cookie payload from `set-auth-jwt` / `set-cookie`. We emit
  // all three so future Better Auth versions that rotate the mechanism
  // keep working in the mock.
  headers.set("set-auth-token", session.token);
  headers.set(
    "set-cookie",
    `better-auth.session_token=${encodeURIComponent(
      JSON.stringify({ value: session.token, expires: session.expiresAt }),
    )}; Path=/; HttpOnly`,
  );
  return new Response(
    JSON.stringify({
      redirect: false,
      token: session.token,
      user,
      session,
    }),
    { status: 200, headers },
  );
}

let installed = false;
let originalFetch: typeof globalThis.fetch | null = null;

/**
 * Install the mock fetch interceptor. Safe to call multiple times —
 * subsequent calls are no-ops. Returns `true` if the interceptor is
 * actually active (flag set + first install), `false` otherwise.
 *
 * The shape mirrors Better Auth's actual server response so the rest of
 * the mobile pipeline (`@better-auth/expo/client`, `useUser`, the
 * `apps/mobile/src/api/apiClient.ts` bearer extractor) keeps reading
 * its inputs from the same places.
 */
export function installE2EAuthMock(): boolean {
  if (!isE2EMockAuthEnabled()) return false;
  if (installed) return true;
  originalFetch = globalThis.fetch.bind(globalThis);
  installed = true;

  const real = originalFetch;
  const expectedEmail = getE2EMockEmail();
  const expectedPassword = getE2EMockPassword();

  const patched: typeof globalThis.fetch = async (input, init) => {
    const method = requestMethod(input, init);
    const path = urlPath(input);

    // POST /api/auth/sign-in/email
    if (method === "POST" && path.endsWith("/api/auth/sign-in/email")) {
      const body = (await readBody(input, init)) as {
        email?: string;
        password?: string;
      } | null;
      if (
        body?.email === expectedEmail &&
        body?.password === expectedPassword
      ) {
        return signInSuccessResponse();
      }
      return jsonResponse(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }

    // POST /api/auth/sign-out
    if (method === "POST" && path.endsWith("/api/auth/sign-out")) {
      const headers = new Headers({ "content-type": "application/json" });
      // Force the Better Auth client to clear the cookie store.
      headers.append(
        "set-cookie",
        "better-auth.session_token=; Path=/; Max-Age=0",
      );
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers,
      });
    }

    // GET /api/v1/me (or /api/me when version disabled).
    if (
      method === "GET" &&
      (path.endsWith("/api/v1/me") || path.endsWith("/api/me"))
    ) {
      const bearer = authHeader(init, input);
      if (bearer && bearer.includes(SYNTHETIC_TOKEN)) {
        return jsonResponse({ user: syntheticUser() });
      }
      return jsonResponse({ message: "Unauthorized" }, { status: 401 });
    }

    return real(input, init);
  };

  globalThis.fetch = patched;
  return true;
}

/**
 * Test-only — restores the original fetch. Currently unused at runtime
 * (the mock lives for the whole app session), exported so unit tests
 * can install and reset between cases.
 */
export function __resetE2EAuthMockForTests(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
  originalFetch = null;
  installed = false;
}
