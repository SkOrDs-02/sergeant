// @vitest-environment jsdom
/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * Integration tests for FinykApp — over-mocking refactor.
 *
 * The previous version of this file stubbed all 7 Finyk hooks plus every
 * child component to a `data-testid` div and asserted "mounts without
 * crashing" / testid-presence. None of that exercised the real contract
 * between `FinykApp` and its children, or the real Monobank data flow.
 *
 * This version renders the REAL component tree — real `useMonobank`
 * (`useMonobankWebhook`), real `useStorage`, real `NoBankBanner`, real
 * `FinykLoginScreen`, real lazy-loaded pages (`Overview`/`Transactions`/
 * `Budgets`/`Analytics`/`Assets`), real `ModuleBottomNav`, real
 * `AuthProvider`/`ApiClientProvider`/`ToastProvider` — wired to a real
 * `MemoryRouter` and a *real* MSW transport for `/api/v1/me` and every
 * `/api/v1/mono/*` endpoint `useMonobankWebhook` calls.
 *
 * Only one hook is mocked: `useFinykSqliteReadBoot` boots a real
 * sqlite-wasm worker (heavy browser API, out of scope for a shell test —
 * covered by its own dedicated unit tests). Because the test stays
 * unauthenticated (`/api/v1/me` → 401, the normal anonymous-visitor
 * response), `useFinykMonoMirrorBoot` and the SQLite-mirror `useEffect`s
 * inside `useMonobankWebhook` never fire either (both gate on a real
 * user id) — no further sqlite mocking needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { apiClient } from "@shared/api";
import { ToastProvider } from "@shared/hooks/useToast";
import { AuthProvider } from "../../core/auth/AuthContext";
import { server } from "../../test/msw/server";

// ── Heavy browser API (sqlite-wasm worker) — see file docstring ────────────
vi.mock("./hooks/useFinykSqliteReadBoot", () => ({
  useFinykSqliteReadBoot: vi.fn(),
}));

import FinykApp from "./FinykApp";

const FINYK_FIRST_SEEN_KEY = "sergeant.onboarding.module_first_seen.finyk.v1";

function markFinykFirstRunSeen() {
  window.localStorage.setItem(FINYK_FIRST_SEEN_KEY, "1");
}

function meUnauthenticatedHandler() {
  return http.get("*/api/v1/me", () =>
    HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function disconnectedSyncStateHandler() {
  return http.get("*/api/v1/mono/sync-state", () =>
    HttpResponse.json({
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    }),
  );
}

/** Default handlers every test needs — `useMonobank` always fires the
 * sync-state query and `AuthProvider` always fires `/me`, regardless of
 * scenario. Per-test overrides go through `server.use(...)`. */
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  markFinykFirstRunSeen();
  server.use(meUnauthenticatedHandler(), disconnectedSyncStateHandler());
});

function renderApp(
  props: React.ComponentProps<typeof FinykApp> = {},
  initialEntries: string[] = ["/finyk"],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>
            <ToastProvider>
              <FinykApp {...props} />
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

function bottomNav() {
  return screen.getByRole("navigation", { name: "Розділи Фініка" });
}

function navButton(label: string) {
  return within(bottomNav()).getByRole("button", { name: label });
}

describe("FinykApp — shell + default page (real component tree)", () => {
  it("renders the module chrome, the real Overview page, and the no-bank banner for a disconnected visitor", async () => {
    renderApp();

    // Chrome: header module title (also present in a module-switcher chip,
    // hence `getAllByText`) plus the finance subtitle.
    expect(screen.getAllByText("Фінік").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "Фінік" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Фінанси")).toBeInTheDocument();

    // Real bottom nav landmark.
    expect(bottomNav()).toBeInTheDocument();

    // Real `NoBankBanner` (not connected, not manual-only yet).
    expect(
      screen.getByRole("button", { name: "Підключити Monobank" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Без банку продовжити" }),
    ).toBeInTheDocument();

    // Real `Overview` page (sr-only page heading, not a stubbed testid).
    expect(
      await screen.findByRole("heading", { name: "Огляд" }),
    ).toBeInTheDocument();

    // Healthy idle state: no sync pill without a connected provider.
    expect(
      screen.queryByLabelText(/Стан синхронізації:/),
    ).not.toBeInTheDocument();
  });

  it("accepts optional props without crashing", async () => {
    renderApp({
      onBackToHub: vi.fn(),
      onOpenSettings: vi.fn(),
      pwaAction: null,
      onPwaActionConsumed: vi.fn(),
    });
    expect(bottomNav()).toBeInTheDocument();
  });
});

describe("FinykApp — real page routing via the bottom nav", () => {
  it("navigates to the real Budgets page on tab click", async () => {
    renderApp();
    await userEvent.click(navButton("Планування"));
    expect(
      await screen.findByRole("heading", { name: "Бюджети" }),
    ).toBeInTheDocument();
  });

  it("navigates to the real Transactions page (real empty-state copy) on tab click", async () => {
    renderApp();
    await userEvent.click(navButton("Операції"));
    // No mono/manual data at all → real `ModuleEmptyState` for finyk.
    expect(
      await screen.findByText("Куди йдуть твої гроші?"),
    ).toBeInTheDocument();
  });

  it("navigates to the real Analytics page on tab click", async () => {
    renderApp();
    await userEvent.click(navButton("Аналітика"));
    expect(
      await screen.findByRole("heading", { name: "Аналітика" }),
    ).toBeInTheDocument();
  });

  it("navigates to the real Assets page on tab click", async () => {
    renderApp();
    await userEvent.click(navButton("Активи"));
    expect(
      await screen.findByRole("heading", { name: "Активи" }),
    ).toBeInTheDocument();
  });
});

describe("FinykApp — connect / manual-only flows (real NoBankBanner + FinykLoginScreen)", () => {
  it("opens the real login overlay when NoBankBanner's Connect is clicked", async () => {
    renderApp();
    expect(
      screen.queryByRole("dialog", { name: "Підключення Monobank" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Підключити Monobank" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Підключення Monobank",
    });
    // Real `FinykLoginScreen` inside the overlay.
    expect(
      within(dialog).getByPlaceholderText("Вставте токен Mono API"),
    ).toBeInTheDocument();
  });

  it("hides the NoBankBanner after Continue-without-bank is clicked (real LS write)", async () => {
    renderApp();
    expect(
      screen.getByRole("button", { name: "Підключити Monobank" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Без банку продовжити" }),
    );

    expect(
      screen.queryByRole("button", { name: "Підключити Monobank" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem("finyk_manual_only_v1")).toBe("1");
  });
});

describe("FinykApp — connected Monobank state over real MSW transport", () => {
  it("shows a real sync pill with an explicit label while a Mono sync is pending, and hides the no-bank banner", async () => {
    server.use(
      http.get("*/api/v1/mono/sync-state", () =>
        HttpResponse.json({
          status: "pending",
          webhookActive: false,
          lastEventAt: null,
          lastBackfillAt: null,
          accountsCount: 1,
        }),
      ),
      http.get("*/api/v1/mono/accounts", () =>
        HttpResponse.json([
          {
            userId: "local-anon",
            monoAccountId: "acc-1",
            sendId: null,
            type: "black",
            currencyCode: 980,
            cashbackType: null,
            maskedPan: ["*1234"],
            iban: null,
            balance: 10000,
            creditLimit: 0,
            lastSeenAt: "2026-08-01T00:00:00.000Z",
          },
        ]),
      ),
      http.get("*/api/v1/mono/jars", () => HttpResponse.json([])),
      http.get("*/api/v1/mono/transactions", () =>
        HttpResponse.json({ data: [], nextCursor: null }),
      ),
    );

    renderApp();

    const syncPill = await screen.findByLabelText(
      "Стан синхронізації: оновлення",
    );
    expect(syncPill).toHaveTextContent("оновлення");

    expect(
      screen.queryByRole("button", { name: "Підключити Monobank" }),
    ).not.toBeInTheDocument();
  });
});

describe("FinykApp — regression: malformed /api/v1/mono/accounts payload (deep-route-viewport FINYK_ASSETS crash)", () => {
  it("degrades to an empty accounts list instead of crashing the Assets module when the API hands back a non-array payload", async () => {
    // Repro for the mobile deep-route-viewport smoke crash: a blanket API
    // mock/proxy (or any misbehaving intermediary) that responds `{ ok: true }`
    // to every GET — including `/mono/accounts`, which the client contract
    // types as `MonoAccountDto[]` — used to blow up
    // `useMonobankWebhook`'s `(webhookAccounts ?? []).filter(...)` useMemo:
    // `?? []` only guards `null`/`undefined`, not a truthy non-array object,
    // so `.filter` threw `TypeError: ... .filter is not a function`
    // synchronously during render and tripped the `SectionErrorBoundary`
    // around the Assets page ("Не вдалось показати «Активи»").
    server.use(
      http.get("*/api/v1/mono/sync-state", () =>
        HttpResponse.json({
          status: "active",
          webhookActive: true,
          lastEventAt: "2026-08-01T00:00:00.000Z",
          lastBackfillAt: null,
          accountsCount: 1,
        }),
      ),
      http.get("*/api/v1/mono/accounts", () => HttpResponse.json({ ok: true })),
      http.get("*/api/v1/mono/jars", () => HttpResponse.json({ ok: true })),
      http.get("*/api/v1/mono/transactions", () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    renderApp({}, ["/finyk/assets"]);

    // Real Assets page rendered (not the SectionErrorBoundary fallback).
    expect(
      await screen.findByRole("heading", { name: "Активи" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Не вдалось показати «Активи»"),
    ).not.toBeInTheDocument();

    // Empty state visible: the malformed accounts payload degrades to `[]`,
    // so net-worth totals render the real zero state instead of throwing
    // (both the net-worth card and the "Активи" section bar summary show it).
    //
    // Нуль рендериться БЕЗ плюса, і це навмисно: `splitMoneyParts` ставить
    // знак лише при `> 0`, бо нуль — не прибуток. Доти тут стояло
    // `+0 ₴` від ручного `balance >= 0 ? "+" : ""` — того самого саморобу,
    // який `Money` й замінює. Матчер — по `textContent`, бо сума розкладена
    // на тири; пробіл перед ₴ — \u202f, звичайний не знайде нічого.
    const zeros = Array.from(document.querySelectorAll("span")).filter((el) =>
      /^0\u202f₴$/.test(el.textContent ?? ""),
    );
    expect(zeros.length).toBeGreaterThan(0);
  });
});

describe("FinykApp — a rejected Mono token surfaces the real authError banner", () => {
  it("shows and dismisses the dismissible auth-error banner after a 401 MONO_TOKEN_INVALID over MSW", async () => {
    server.use(
      http.post("*/api/v1/mono/connect", () =>
        HttpResponse.json(
          { code: "MONO_TOKEN_INVALID", error: "Invalid token" },
          { status: 401 },
        ),
      ),
    );

    renderApp();

    await userEvent.click(
      screen.getByRole("button", { name: "Підключити Monobank" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Підключення Monobank",
    });
    await userEvent.type(
      within(dialog).getByPlaceholderText("Вставте токен Mono API"),
      "bad-token",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Підключити Monobank" }),
    );

    // `role="alert"` uniquely identifies the module-level `AuthErrorBanner`
    // — `FinykLoginScreen` also renders the same copy inline (non-alert),
    // so scope the text assertions to the banner itself.
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Токен потребує оновлення"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(
        "Mono відхилив токен. Перевір, чи скопіював правильний.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Закрити"));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
