/**
 * Shared QueryClient for @tanstack/react-query.
 *
 * Defaults tuned for a PWA that often works offline:
 *  - retry only for transient network errors (not for 4xx);
 *  - `staleTime` 60s — агресивне повторне використання кешу для вкладок,
 *    що часто ре-маунтяться (модалки, переходи між Hub і модулями);
 *  - `gcTime` 24h — горизонт, у якому persister (`queryClientPersister.ts`)
 *    встигає зробити warm-start після холодного старту PWA.
 *    `PersistQueryClientProvider` персистить лише queries, які досі
 *    живі в `QueryCache` (`gcTime` ще не сплив); якщо тримати тут 5хв,
 *    то після виходу з вкладки на ніч кеш у пам'яті вже зник, і на
 *    наступному cold-start hydrate знаходить порожній snapshot. 24h
 *    — той самий горизонт, що використовує `apps/mobile`
 *    (`QueryProvider.tsx`), щоб контракт warm-start був симетричним.
 *  - `networkMode: "offlineFirst"` для запитів — PWA повинен малювати
 *    з кешу, коли мережі немає, а не падати в помилку одразу.
 *    Для мутацій залишаємо дефолт `"online"`, щоб важкі AI-виклики
 *    швидко падали офлайн замість зависання у черзі.
 *
 * Мутації не ретраяться — серверні AI-ендпоінти дорогі, не хочемо
 * повторювати випадково.
 *
 * Query keys — див. `./queryKeys.ts`; нові запити мають брати ключі
 * звідти, а не інлайнити їх у хуці.
 */

import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "@shared/api";

interface MaybeHttpError {
  status?: number;
  response?: { status?: number };
}

export function isRetriableError(error: unknown): boolean {
  if (!error) return false;

  // Канонічний шлях: помилки з `@shared/api` — це завжди `ApiError`.
  // Ретраємо лише те, що має шанс пройти з другої спроби.
  if (isApiError(error)) {
    if (error.kind === "aborted") return false; // користувач пішов — не повторюємо
    if (error.kind === "network" || error.kind === "parse") return true;
    // kind === "http"
    return (
      error.status === 408 ||
      error.status === 429 ||
      (error.status >= 500 && error.status <= 599)
    );
  }

  // Fallback для можливих легасі-помилок, які ще не пройшли через ApiError.
  const e = error as MaybeHttpError;
  const status = e?.status ?? e?.response?.status;
  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }
  // Невідома форма (TypeError: Failed to fetch тощо) — спробуємо ще раз.
  return true;
}

/**
 * Фабрика `retry`-функції для `useQuery`, яка враховує auth-статуси.
 *
 * Конвенція для per-query retry (перекриває дефолт `createAppQueryClient`):
 *  - 401/403 не ретраяться — новий токен без втручання користувача не з'явиться;
 *  - `aborted` не ретраяться — користувач пішов;
 *  - network/parse/5xx/408/429 ретраяться до `maxAttempts` спроб.
 *
 * Замінює розсіяний по finyk-хукам інлайн:
 *   `retry: (n, e) => n < X && !(isApiError(e) && e.kind === "http" && e.isAuth)`
 *
 * @param maxAttempts — скільки спроб дозволяємо до того, як зупинитися.
 *   Дефолт `2` збігається з глобальним дефолтом `createAppQueryClient`.
 *   Для "важкого" ендпоінту, де 2 повтори = зависання UI, варто ставити `1`.
 */
export function authAwareRetry<TError = Error>(
  maxAttempts = 2,
): (failureCount: number, error: TError) => boolean {
  return (failureCount, error) => {
    if (failureCount >= maxAttempts) return false;
    if (isApiError(error) && error.isAuth) return false;
    return isRetriableError(error);
  };
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          return isRetriableError(error);
        },
        staleTime: 60_000,
        gcTime: 24 * 60 * 60 * 1_000,
        refetchOnWindowFocus: false,
        networkMode: "offlineFirst",
      },
      mutations: {
        retry: false,
      },
    },
  });
}
