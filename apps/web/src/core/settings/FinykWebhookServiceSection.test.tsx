// @vitest-environment jsdom
/**
 * L-15: помилка перевірки стану Monobank (мережа/5xx на
 * `GET /api/mono/sync-state`) раніше рендерилась ідентично до чесного
 * "ще не підключав Monobank" — обидва стани зводились до
 * `webhookConnected === false`, і UI показував форму вводу токена з
 * проханням підключитись. Юзер із живим підключенням, чий запит просто
 * не доїхав, бачив те саме, що новачок, який ніколи не підключався —
 * і намагався повторно "підключити" вже підключений акаунт.
 *
 * Тест пінить: query-error → окремий "не вдалося перевірити" блок з
 * retry, а НЕ форма вводу токена; чесний `status: "disconnected"` →
 * форма вводу токена лишається на місці.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { MonoSyncState } from "@shared/api";
import { finykKeys } from "@shared/lib/api/queryKeys";

const syncStateMock = vi.fn<() => Promise<MonoSyncState>>();

vi.mock("@shared/api", () => ({
  monoWebhookApi: {
    syncState: () => syncStateMock(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    backfill: vi.fn(),
    backfillProgress: vi.fn().mockResolvedValue({
      status: "idle",
      accountsProcessed: 0,
      accountsTotal: 0,
      startedAt: null,
      finishedAt: null,
    }),
  },
  isApiError: () => false,
}));

vi.mock("../billing", () => ({
  usePlan: () => ({ isPro: true, plan: "pro", isLoading: false }),
  PaywallModal: () => null,
}));

import { FinykWebhookServiceSection } from "./FinykWebhookServiceSection";

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = render(<FinykWebhookServiceSection inView />, { wrapper });
  // `SettingsSubGroup` (Варіант A, profile/settings deep audit 2026-08-08
  // §0.1) is no longer an accordion — it renders its content directly, so
  // there is nothing to expand before querying by role here.
  return { ...result, queryClient };
}

describe("FinykWebhookServiceSection — L-15 network-error vs disconnected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a distinct check-failed state (not the connect-token form) when syncState errors", async () => {
    syncStateMock.mockRejectedValue(new Error("network down"));
    renderSection();

    expect(
      await screen.findByText(/Не вдалося перевірити стан підключення/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Спробувати ще раз/i }),
    ).toBeInTheDocument();
    // The misleading "enter your Monobank token" form must not render.
    expect(
      screen.queryByPlaceholderText("Токен Monobank API"),
    ).not.toBeInTheDocument();
  });

  it("still shows the connect-token form for a genuine disconnected status (no error)", async () => {
    syncStateMock.mockResolvedValue({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });
    const { queryClient } = renderSection();

    // Wait for the query to actually SETTLE, not just for the connect
    // form's placeholder to appear once — that placeholder is ALSO what
    // renders on the very first, pre-settle frame (before `data`/`error`
    // exist), so a bare `findByPlaceholderText` right after mount can
    // pass on that transient frame alone without proving anything about
    // the settled state.
    await waitFor(() =>
      expect(queryClient.getQueryState(finykKeys.monoSyncState)?.status).toBe(
        "success",
      ),
    );

    expect(
      screen.getByPlaceholderText("Токен Monobank API"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Не вдалося перевірити стан підключення/i),
    ).not.toBeInTheDocument();
  });

  // F2 (review): `syncStateQuery.isError` alone doesn't distinguish a
  // transient failure from a PERMANENT one (e.g. 404 when the server has
  // `MONO_WEBHOOK_ENABLED=false`, or 401/403). For those, "Спробувати ще
  // раз" can never succeed, and blaming the network is a false diagnosis
  // — so the connect-token form must stay reachable instead of being
  // hidden forever behind the (retriable-only) check-failed banner.
  it("F2: falls back to the connect-token form (not the check-failed banner) for a non-retriable error, e.g. 404 when Monobank webhooks are server-side disabled", async () => {
    syncStateMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    const { queryClient } = renderSection();

    // Same trap as the test above, mirrored: the connect form is also
    // the pre-settle first render, so we must wait for the query to have
    // actually reached "error" before trusting the DOM — otherwise this
    // test would pass identically with or without the F2 fix, since it'd
    // just be catching the transient frame that exists before ANY
    // response (success or error) has arrived.
    await waitFor(() =>
      expect(queryClient.getQueryState(finykKeys.monoSyncState)?.status).toBe(
        "error",
      ),
    );

    expect(
      screen.getByPlaceholderText("Токен Monobank API"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Не вдалося перевірити стан підключення/i),
    ).not.toBeInTheDocument();
  });

  // F7 (review): the sibling "Оновити дані" button shows a busy state
  // (`disabled` + "Оновлення…") while its request is in flight. The retry
  // button here had the same gap — on a slow network a tap looked dead.
  //
  // Setup note: TanStack Query resets `error`/`status` to `pending` the
  // instant a fetch STARTS for a query that has never had data
  // (`query.js` `fetchState`: `data === undefined` → `error: null,
  // status: "pending"`). That means retrying immediately after the very
  // first-ever failure would flash straight past the check-failed branch
  // into the connect-token form before this test could observe the busy
  // button at all. So we first land on a genuine (successful)
  // "disconnected" response — giving the query real `data` — and THEN
  // fail a background refetch (`queryClient.refetchQueries`, the same
  // mechanism any automatic refetch would use). With `data` already
  // defined, a subsequent retry's `error` stays set while it's in
  // flight, exactly like the review's real-world L-15 scenario (a
  // previously-known account whose check merely blips).
  it("F7: retry button shows a busy state while re-checking, mirroring the sibling refresh button", async () => {
    syncStateMock.mockResolvedValueOnce({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });
    const { queryClient } = renderSection();
    await screen.findByPlaceholderText("Токен Monobank API");

    syncStateMock.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: finykKeys.monoSyncState });
    });

    const retryButton = await screen.findByRole("button", {
      name: /Спробувати ще раз/i,
    });

    let resolveRetry!: (value: MonoSyncState) => void;
    syncStateMock.mockReturnValue(
      new Promise<MonoSyncState>((resolve) => {
        resolveRetry = resolve;
      }),
    );
    fireEvent.click(retryButton);

    const busyButton = await screen.findByRole("button", {
      name: /Перевіряю/i,
    });
    expect(busyButton).toBeDisabled();

    resolveRetry({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Перевіряю/i }),
      ).not.toBeInTheDocument(),
    );
  });
});

/**
 * Перевірка живості токена (міграція 120).
 *
 * Спіймано на беті 2026-08-10: тестер відкликав токен у застосунку
 * Monobank, а Налаштування далі малювали «Webhook активний · 5 рахунків».
 * `sync-state` був суто читачем бази, а база про відкликання не знає —
 * Monobank нам про це не повідомляє, вебхук просто замовкає.
 *
 * Тепер сервер, побачивши підозріле підключення (вебхук зареєстрований,
 * подій нема), питає Monobank і на явну відмову ставить `invalid`.
 * Пінимо саме те, що робить фікс видимим для людини: `invalid` — це НЕ
 * «підключено», і разом із поясненням має приїхати форма нового токена.
 * Без форми попередження було б глухим кутом: воно повідомляє про
 * проблему й не дає жодного способу її полагодити.
 */
describe("FinykWebhookServiceSection — відкликаний токен (status: invalid)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const INVALID_STATE: MonoSyncState = {
    status: "invalid",
    webhookActive: false,
    lastEventAt: null,
    lastBackfillAt: null,
    accountsCount: 5,
  };

  it("пояснює втрату звʼязку і одразу дає поле для нового токена", async () => {
    syncStateMock.mockResolvedValue(INVALID_STATE);
    renderSection();

    expect(
      await screen.findByText(/Monobank втратив звʼязок/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Токен Monobank API"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Підключити новий токен/i }),
    ).toBeInTheDocument();
  });

  it("не видає мертве підключення за живе", async () => {
    syncStateMock.mockResolvedValue(INVALID_STATE);
    const { queryClient } = renderSection();

    await waitFor(() =>
      expect(queryClient.getQueryState(finykKeys.monoSyncState)?.status).toBe(
        "success",
      ),
    );

    // Головна брехня, яку лікує фікс: зелений блок «Webhook активний» над
    // даними, що застигли назавжди. `accountsCount: 5` у відповіді
    // навмисно — саме він робив картинку переконливою.
    expect(screen.queryByText(/Webhook активний/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/5 рахунків/i)).not.toBeInTheDocument();
    // І це не «збій перевірки» — сервер відповів успішно, просто банк
    // сказав «ні». Банер про мережу тут був би хибним діагнозом.
    expect(
      screen.queryByText(/Не вдалося перевірити стан підключення/i),
    ).not.toBeInTheDocument();
  });

  it("лишає вихід через «Відʼєднати» для тих, хто не хоче перепідключатись", async () => {
    syncStateMock.mockResolvedValue(INVALID_STATE);
    renderSection();

    expect(
      await screen.findByRole("button", { name: /Відʼєднати/i }),
    ).toBeInTheDocument();
  });
});
