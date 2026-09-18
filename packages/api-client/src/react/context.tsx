import { createContext, useContext, type ReactNode } from "react";
import type { ApiClient } from "../createApiClient";

const ApiClientContext = createContext<ApiClient | null>(null);

export interface ApiClientProviderProps {
  client: ApiClient;
  children: ReactNode;
}

/**
 * Провайдер для DI-інʼєкції `ApiClient`. У веб-додатку інстансуйте один
 * клієнт на старті (`createApiClient({ baseUrl: apiUrl("") })`) і
 * загорніть дерево `<ApiClientProvider client={client}>`. RN-додаток
 * робить те саме, але з іншим `baseUrl` та `getToken`, що читає токен
 * зі сховища пристрою.
 */
export function ApiClientProvider({
  client,
  children,
}: ApiClientProviderProps) {
  return (
    <ApiClientContext.Provider value={client}>
      {children}
    </ApiClientContext.Provider>
  );
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error(
      "useApiClient must be used inside <ApiClientProvider>. " +
        "Create an ApiClient with createApiClient() and wrap the tree.",
    );
  }
  return client;
}
