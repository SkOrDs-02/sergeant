import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { getApiBaseURL } from "@/api/apiUrl";

/**
 * Better Auth Expo client.
 *
 * - `baseURL` — URL API-сервера (той самий, що для web). Беремо з
 *   `EXPO_PUBLIC_API_BASE_URL`, див. `src/api/apiUrl.ts`.
 * - `expoClient` — плагін, що:
 *     • серіалізує cookie-стейт у `expo-secure-store`;
 *     • автоматично прикладає `Authorization: Bearer <token>` на
 *       наступні запити після `sign-in/email` (див. `docs/mobile/overview.md`);
 *     • підтримує redirect-и на `sergeant://` deep links.
 * - `scheme` має збігатися з `expo.scheme` у `app.json` (`sergeant`).
 */
const authClient = createAuthClient({
  baseURL: getApiBaseURL() || undefined,
  plugins: [
    expoClient({
      scheme: "sergeant",
      storagePrefix: "sergeant",
      storage: SecureStore,
    }),
  ],
});

// Публічний API мобільного Better Auth клієнта навмисно обмежений
// actions-ендпоінтами. `useSession` з `better-auth/react` НЕ
// реекспортується — замість нього у продакшн-коді використовуй
// `useUser()` з `@sergeant/api-client/react` (GET `/api/v1/me`), щоб
// mobile і web читали ту саму ідентичність. Див. `docs/mobile/overview.md` і
// `app/_layout.tsx`, де піднято `ApiClientProvider`.
export const { signIn, signUp, signOut, getSession } = authClient;
export { authClient };

/**
 * Password-reset request.
 *
 * Better Auth's `forgetPassword` action lives on the server's
 * `emailAndPassword` plugin (`apps/server/src/auth.ts`). The expo client's
 * inferred type surface doesn't expose it, so we hit `POST /api/auth/forget-password`
 * directly with the same payload shape the web client uses.
 */
export type ForgetPasswordArgs = {
  email: string;
  /** Deep link the reset email should redirect to (`sergeant://...`). */
  redirectTo?: string;
};

export type ForgetPasswordResult = {
  error: { message: string } | null;
};

export async function forgetPassword(
  args: ForgetPasswordArgs,
): Promise<ForgetPasswordResult> {
  const baseURL = getApiBaseURL();
  try {
    const res = await fetch(`${baseURL ?? ""}/api/auth/forget-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      return {
        error: { message: data?.message ?? `HTTP ${res.status}` },
      };
    }
    return { error: null };
  } catch (e) {
    return {
      error: {
        message: e instanceof Error ? e.message : "Network error",
      },
    };
  }
}
