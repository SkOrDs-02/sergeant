import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import type { MeResponse } from "../endpoints/me";
import type { CoachInsightPayload } from "../endpoints/coach";
import type { ChatRequestPayload, ChatResponse } from "../endpoints/chat";
import type {
  PushRegisterRequest,
  PushRegisterResponse,
  PushTestRequest,
  PushTestResponse,
  PushUnregisterRequest,
  PushUnregisterResponse,
} from "../endpoints/push";
import type { BarcodeLookupResponse } from "../endpoints/barcode";
import type { FoodSearchResponse } from "../endpoints/foodSearch";
import type {
  PrivatBalanceFinalResponse,
  PrivatCredentials,
} from "../endpoints/privat";
import type {
  ModulePushPayload,
  PullAllResult,
  PushAllResult,
} from "../endpoints/sync";
import type {
  WeeklyDigestPayload,
  WeeklyDigestResponse,
} from "../endpoints/weeklyDigest";

import { useApiClient } from "./context";
import { apiMutationKeys, apiQueryKeys } from "./queryKeys";

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, Error, TData>,
  "queryKey" | "queryFn"
>;
type MutationOpts<TData, TVars> = UseMutationOptions<TData, Error, TVars>;

// ── Me (current user) ────────────────────────────────────────────────────

/**
 * `GET /api/me` — поточний користувач. Відповідь прогоняється через
 * `MeResponseSchema` у `createMeEndpoints`, тому дані, що приходять сюди,
 * вже провалідовані. Використовуйте для hub-шапки, drawer-профілю і
 * будь-якої logged-in поверхні, що не полагається лише на better-auth
 * cookie-сесію (щоб на мобілці той самий хук працював через bearer-токен).
 */
export function useUser(opts?: QueryOpts<MeResponse>) {
  const api = useApiClient();
  return useQuery({
    queryKey: apiQueryKeys.me.current(),
    queryFn: ({ signal }) => api.me.get({ signal }),
    ...opts,
  });
}

// ── Coach ────────────────────────────────────────────────────────────────

export function useCoachMemory(opts?: QueryOpts<{ memory?: unknown }>) {
  const api = useApiClient();
  return useQuery({
    queryKey: apiQueryKeys.coach.memory(),
    queryFn: () => api.coach.getMemory(),
    ...opts,
  });
}

export function useCoachInsightMutation(
  opts?: MutationOpts<{ insight?: string | null }, CoachInsightPayload>,
) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (payload: CoachInsightPayload) =>
      api.coach.postInsight(payload),
    ...opts,
  });
}

// ── Chat ─────────────────────────────────────────────────────────────────

export function useChatMutation(
  opts?: MutationOpts<ChatResponse, ChatRequestPayload>,
) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (payload: ChatRequestPayload) => api.chat.send(payload),
    ...opts,
  });
}

// ── Push ─────────────────────────────────────────────────────────────────

export function useVapidPublicKey(opts?: QueryOpts<{ publicKey: string }>) {
  const api = useApiClient();
  return useQuery({
    queryKey: apiQueryKeys.push.vapidPublic(),
    queryFn: () => api.push.getVapidPublic(),
    ...opts,
  });
}

export function useSubscribePushMutation(
  opts?: MutationOpts<unknown, PushSubscriptionJSON>,
) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (sub: PushSubscriptionJSON) => api.push.subscribe(sub),
    ...opts,
  });
}

export function useUnsubscribePushMutation(
  opts?: MutationOpts<unknown, string>,
) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (endpoint: string) => api.push.unsubscribe(endpoint),
    ...opts,
  });
}

/**
 * `POST /api/push/register` — уніфікована реєстрація push-пристрою
 * (web / iOS / Android). Викликається з PWA service-worker flow
 * (web-payload з `keys`) і з мобільного клієнта (native-payload без `keys`).
 *
 * Ключ мутації `apiMutationKeys.push.register()` — використовуй з
 * `useIsMutating` / `queryClient.cancelMutations`, коли треба знати стан
 * активної реєстрації (наприклад, блокувати повторний тап).
 */
export function usePushRegister(
  opts?: MutationOpts<PushRegisterResponse, PushRegisterRequest>,
) {
  const api = useApiClient();
  return useMutation({
    mutationKey: apiMutationKeys.push.register(),
    mutationFn: (payload: PushRegisterRequest) => api.push.register(payload),
    ...opts,
  });
}

/**
 * `POST /api/v1/push/test` — dev-hook для ручки «пульнути тестовий пуш».
 * Міміка `usePushRegister`: той самий стиль mutationKey + фіксована
 * сигнатура payload. Сервер rate-limit-ить per-user 1 req / 5 s, тож
 * useMutation-and-forget — достатньо.
 */
export function usePushTest(
  opts?: MutationOpts<PushTestResponse, PushTestRequest>,
) {
  const api = useApiClient();
  return useMutation({
    mutationKey: apiMutationKeys.push.test(),
    mutationFn: (payload: PushTestRequest) => api.push.test(payload),
    ...opts,
  });
}

/**
 * `POST /api/push/unregister` — уніфікований анрег push-пристрою.
 *
 * Симетричний до `usePushRegister`. Web-клієнт шле
 * `{ platform: "web", endpoint }`, native — `{ platform, token }`.
 * Ключ мутації `apiMutationKeys.push.unregister()`.
 */
export function usePushUnregister(
  opts?: MutationOpts<PushUnregisterResponse, PushUnregisterRequest>,
) {
  const api = useApiClient();
  return useMutation({
    mutationKey: apiMutationKeys.push.unregister(),
    mutationFn: (payload: PushUnregisterRequest) =>
      api.push.unregister(payload),
    ...opts,
  });
}

// ── Food search / Barcode ────────────────────────────────────────────────

export function useFoodSearch(
  query: string,
  opts?: QueryOpts<FoodSearchResponse>,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: apiQueryKeys.foodSearch.query(query),
    queryFn: ({ signal }) => api.foodSearch.search(query, { signal }),
    enabled: !!query && query.length >= 2,
    ...opts,
  });
}

export function useBarcodeLookup(
  barcode: string,
  opts?: QueryOpts<BarcodeLookupResponse>,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: apiQueryKeys.barcode.lookup(barcode),
    queryFn: () => api.barcode.lookup(barcode),
    enabled: !!barcode,
    ...opts,
  });
}

// ── Privat ──────────────────────────────────────────────────────────────
// Mono lives entirely in the webhook flow now (apps/server/src/modules/mono);
// the legacy `useMonoClientInfo` / `useMonoStatement` hooks were removed when
// the polling proxy was deleted in roadmap A.

export function usePrivatBalanceFinal(
  creds: PrivatCredentials | null,
  opts?: QueryOpts<PrivatBalanceFinalResponse>,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: apiQueryKeys.privat.balanceFinal(creds?.merchantId ?? ""),
    queryFn: ({ signal }) => api.privat.balanceFinal(creds!, { signal }),
    enabled: !!creds?.merchantId && !!creds?.merchantToken,
    ...opts,
  });
}

// ── Sync ─────────────────────────────────────────────────────────────────

export function useSyncPushAllMutation(
  opts?: MutationOpts<PushAllResult, Record<string, ModulePushPayload>>,
) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (modules) => api.sync.pushAll(modules),
    ...opts,
  });
}

export function useSyncPullAllMutation(
  opts?: MutationOpts<PullAllResult, void>,
) {
  const api = useApiClient();
  return useMutation({
    mutationFn: () => api.sync.pullAll(),
    ...opts,
  });
}

// ── Weekly Digest ────────────────────────────────────────────────────────

export function useWeeklyDigestMutation(
  opts?: MutationOpts<WeeklyDigestResponse, WeeklyDigestPayload>,
) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (payload) => api.weeklyDigest.generate(payload),
    ...opts,
  });
}
