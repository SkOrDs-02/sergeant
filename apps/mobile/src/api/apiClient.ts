import { createApiClient, type ApiClient } from "@sergeant/api-client";
import * as SecureStore from "expo-secure-store";

import { getApiBaseURL } from "@/api/apiUrl";

/**
 * Мобільний `ApiClient` — один інстанс на весь додаток. Підключається в
 * `app/_layout.tsx` через `<ApiClientProvider client={apiClient}>`, щоб
 * `useApiClient()`/хуки з `@sergeant/api-client/react` (`useUser`,
 * `usePushRegister`, ...) працювали у всіх екранах.
 *
 * Auth-токен береться зі сховища, куди його записує
 * `@better-auth/expo/client` (див. `src/auth/authClient.ts`): після
 * `signIn.email`/`signUp.email` Better Auth зберігає cookie-JSON у
 * `expo-secure-store` під ключем `sergeant_cookie` (формат
 * `{ "better-auth.session_token": { value, expires, ... }, ... }`).
 *
 * Для наших REST-ендпоінтів (`/api/v1/*`) сервер приймає той самий
 * signed session-токен як `Authorization: Bearer <value>` (див.
 * `better-auth` `bearer()` плагін у `apps/server/src/auth.ts`). Тож
 * `getToken` читає `better-auth.session_token.value` з SecureStore і
 * повертає його як bearer.
 */
const COOKIE_STORAGE_KEY = "sergeant_cookie";
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

type StoredCookieEntry = { value?: string };

function extractSessionToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, StoredCookieEntry>;
    for (const name of SESSION_COOKIE_NAMES) {
      const entry = parsed[name];
      if (entry?.value) return entry.value;
    }
    return null;
  } catch {
    return null;
  }
}

async function readBearerToken(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(COOKIE_STORAGE_KEY);
    return extractSessionToken(raw);
  } catch {
    return null;
  }
}

export const apiClient: ApiClient = createApiClient({
  baseUrl: getApiBaseURL(),
  getToken: readBearerToken,
});

export { readBearerToken, extractSessionToken };
