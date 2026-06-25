import { beforeEach, describe, expect, it, vi } from "vitest";

const { useApiClientMock, useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useApiClientMock: vi.fn(),
  useMutationMock: vi.fn((opts: unknown) => opts),
  useQueryMock: vi.fn((opts: unknown) => opts),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock("./context", () => ({
  useApiClient: useApiClientMock,
}));

import {
  useBarcodeLookup,
  useChatMutation,
  useCoachInsightMutation,
  useCoachMemory,
  useFoodSearch,
  usePrivatBalanceFinal,
  usePushRegister,
  usePushTest,
  usePushUnregister,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
  useUser,
  useVapidPublicKey,
  useWeeklyDigestMutation,
} from "./hooks";

interface QuerySnapshot {
  queryKey?: readonly unknown[];
  queryFn?: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  enabled?: boolean;
  staleTime?: number;
}

interface MutationSnapshot {
  mutationKey?: readonly unknown[];
  mutationFn: (payload: unknown) => Promise<unknown>;
  retry?: boolean;
}

function lastQuery(): QuerySnapshot {
  return useQueryMock.mock.results.at(-1)?.value as QuerySnapshot;
}

function lastMutation(): MutationSnapshot {
  return useMutationMock.mock.results.at(-1)?.value as MutationSnapshot;
}

function createApiMock() {
  return {
    barcode: { lookup: vi.fn().mockResolvedValue({ product: null }) },
    chat: { send: vi.fn().mockResolvedValue({ message: "ok" }) },
    coach: {
      getMemory: vi.fn().mockResolvedValue({ memory: [] }),
      postInsight: vi.fn().mockResolvedValue({ insight: "focus" }),
    },
    foodSearch: { search: vi.fn().mockResolvedValue({ items: [] }) },
    me: { get: vi.fn().mockResolvedValue({ user: null }) },
    privat: { balanceFinal: vi.fn().mockResolvedValue({ balances: [] }) },
    push: {
      getVapidPublic: vi.fn().mockResolvedValue({ publicKey: "vapid" }),
      register: vi.fn().mockResolvedValue({ ok: true }),
      subscribe: vi.fn().mockResolvedValue({ ok: true }),
      test: vi.fn().mockResolvedValue({ ok: true }),
      unregister: vi.fn().mockResolvedValue({ ok: true }),
      unsubscribe: vi.fn().mockResolvedValue({ ok: true }),
    },
    weeklyDigest: { generate: vi.fn().mockResolvedValue({ ok: true }) },
  };
}

describe("api-client react hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApiClientMock.mockReturnValue(createApiMock());
  });

  it("builds query hooks with stable keys and client calls", async () => {
    const signal = new AbortController().signal;

    useUser({ staleTime: 1000 });
    const user = lastQuery();
    expect(user.queryKey).toEqual(["me", "current"]);
    expect(user.staleTime).toBe(1000);
    await user.queryFn?.({ signal });
    expect(useApiClientMock.mock.results[0]?.value.me.get).toHaveBeenCalledWith(
      { signal },
    );

    useCoachMemory();
    const coach = lastQuery();
    expect(coach.queryKey).toEqual(["coach", "memory"]);
    await coach.queryFn?.({ signal });

    useVapidPublicKey();
    const vapid = lastQuery();
    expect(vapid.queryKey).toEqual(["push", "vapid-public"]);
    await vapid.queryFn?.({ signal });

    useFoodSearch("a");
    const food = lastQuery();
    expect(food.enabled).toBe(false);
    await food.queryFn?.({ signal });

    useFoodSearch("apple", { enabled: false });
    expect(lastQuery().enabled).toBe(false);

    useBarcodeLookup("");
    const barcode = lastQuery();
    expect(barcode.enabled).toBe(false);
    await barcode.queryFn?.({ signal });

    usePrivatBalanceFinal(null);
    const privatDisabled = lastQuery();
    expect(privatDisabled.enabled).toBe(false);
    expect(privatDisabled.queryKey).toEqual(["privat", "balance-final", ""]);

    const creds = { merchantId: "mid", merchantToken: "token" };
    usePrivatBalanceFinal(creds);
    const privat = lastQuery();
    expect(privat.enabled).toBe(true);
    await privat.queryFn?.({ signal });
    expect(
      useApiClientMock.mock.results.at(-1)?.value.privat.balanceFinal,
    ).toHaveBeenCalledWith(creds, { signal });
  });

  it("builds mutation hooks with client-backed mutation functions", async () => {
    useCoachInsightMutation();
    await lastMutation().mutationFn({ text: "focus" });

    useChatMutation({ retry: false });
    const chat = lastMutation();
    expect(chat.retry).toBe(false);
    await chat.mutationFn({ message: "hi" });

    useSubscribePushMutation();
    await lastMutation().mutationFn({ endpoint: "https://push.example" });

    useUnsubscribePushMutation();
    await lastMutation().mutationFn("https://push.example");

    usePushRegister();
    const register = lastMutation();
    expect(register.mutationKey).toEqual(["push", "register"]);
    await register.mutationFn({ platform: "web", endpoint: "endpoint" });

    usePushTest();
    const pushTest = lastMutation();
    expect(pushTest.mutationKey).toEqual(["push", "test"]);
    await pushTest.mutationFn({ title: "hello" });

    usePushUnregister();
    const unregister = lastMutation();
    expect(unregister.mutationKey).toEqual(["push", "unregister"]);
    await unregister.mutationFn({ platform: "web", endpoint: "endpoint" });

    useWeeklyDigestMutation();
    await lastMutation().mutationFn({ userId: "user-1" });

    const lastApi = useApiClientMock.mock.results.at(-1)?.value;
    expect(lastApi.weeklyDigest.generate).toHaveBeenCalledWith({
      userId: "user-1",
    });
    expect(useMutationMock).toHaveBeenCalledTimes(8);
  });
});
