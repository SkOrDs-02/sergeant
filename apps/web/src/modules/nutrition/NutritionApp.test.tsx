// @vitest-environment jsdom
/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * Integration tests for NutritionApp — over-mocking refactor.
 *
 * NutritionApp orchestrates ~15 hooks and its real page/component tree.
 * Almost all of them are ordinary React state + `@shared/lib/storage`
 * (localStorage-backed, jsdom-safe) or in-process pub-sub — no reason to
 * stub them individually. We render the REAL component tree (real page
 * components, real bottom nav, real routing via `MemoryRouter`, real
 * `QueryClientProvider`/`ToastProvider`) and assert on rendered DOM text
 * and real user interactions (bottom-nav clicks change the visible page).
 *
 * The only two hooks mocked are the SQLite dual-write / read-path boot
 * hooks (`useNutritionDualWriteBoot`, `useNutritionSqliteReadBoot`) —
 * both open a real sqlite-wasm handle (worker + IndexedDB persistence),
 * which is out of scope for this shell-level test and covered by their
 * own dedicated unit tests (`useNutritionDualWriteBoot.test.tsx`,
 * `useNutritionSqliteReadBoot.test.tsx`). Mocking them also means the
 * component tree never resolves a real `userId` via `useAuth()`, so no
 * `AuthProvider` is needed either.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@shared/hooks/useToast";

// ─── Heavy browser API (sqlite-wasm + worker) — see file docstring ────────
vi.mock("./hooks/useNutritionDualWriteBoot", () => ({
  useNutritionDualWriteBoot: vi.fn(),
}));
vi.mock("./hooks/useNutritionSqliteReadBoot", () => ({
  useNutritionSqliteReadBoot: vi.fn(),
}));

import NutritionApp from "./NutritionApp";

function renderApp(
  props: React.ComponentProps<typeof NutritionApp> = {},
  initialEntries: string[] = ["/nutrition"],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ToastProvider>
          <NutritionApp {...props} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function bottomNav() {
  return screen.getByRole("navigation", { name: "Розділи Їжі" });
}

function navButton(label: string) {
  return within(bottomNav()).getByRole("button", { name: label });
}

// Real first-run flag `useModuleFirstRun("nutrition")` reads
// (`core/onboarding/useModuleFirstRun.ts`). On a genuinely first visit the
// module auto-routes to Menu→Plan (see the dedicated first-run test below);
// most routing tests here care about deliberate navigation instead, so they
// seed this flag as already-seen.
const NUTRITION_FIRST_SEEN_KEY =
  "sergeant.onboarding.module_first_seen.nutrition.v1";

function markNutritionFirstRunSeen() {
  window.localStorage.setItem(NUTRITION_FIRST_SEEN_KEY, "1");
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("NutritionApp — shell + routing (real component tree)", () => {
  it("renders the shell chrome and the start page by default (returning user)", () => {
    markNutritionFirstRunSeen();
    renderApp();
    // Real header title + bottom nav (not mock testids).
    expect(bottomNav()).toBeInTheDocument();
    // Start page renders the photo-analysis entry card. Підпис має бути
    // РІВНО один — у `<summary>`. До 2026-08-13 той самий заголовок
    // дублювався всередині `PhotoAnalyzeCard`, і тест це терпів
    // (`toBeGreaterThan(0)`), тоді як smoke падав на strict-mode.
    expect(screen.getAllByText("Аналіз фото страви")).toHaveLength(1);
  });

  it("a genuinely first Nutrition visit auto-routes to Меню → План на день with the first-run hint", async () => {
    // No seeded seen-flag — exercises the real `useNutritionFirstRun` jump.
    renderApp();
    expect(
      await screen.findByRole("tab", { name: "План на день" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("first-run-hint-banner")).toBeInTheDocument();
  });

  it("clicking the 'Журнал' bottom-nav tab navigates to the real log page", async () => {
    markNutritionFirstRunSeen();
    renderApp();
    await userEvent.click(navButton("Журнал"));
    // Real NutritionLogPage renders its own <h1> — sr-only but queryable.
    expect(
      await screen.findByRole("heading", { name: "Журнал" }),
    ).toBeInTheDocument();
  });

  it("clicking the 'Комора' bottom-nav tab navigates to the real pantry page", async () => {
    markNutritionFirstRunSeen();
    renderApp();
    await userEvent.click(navButton("Комора"));
    expect(
      await screen.findByRole("heading", { name: "Комора" }),
    ).toBeInTheDocument();
  });

  it("clicking the 'Меню' bottom-nav tab navigates to the real menu page (SubTabs)", async () => {
    markNutritionFirstRunSeen();
    renderApp();
    await userEvent.click(navButton("Меню"));
    expect(
      await screen.findByRole("tab", { name: "План на день" }),
    ).toBeInTheDocument();
  });

  it("starting on /nutrition/log deep-links straight to the log page", async () => {
    markNutritionFirstRunSeen();
    renderApp({}, ["/nutrition/log"]);
    expect(
      await screen.findByRole("heading", { name: "Журнал" }),
    ).toBeInTheDocument();
  });

  it("accepts optional props without crashing", () => {
    markNutritionFirstRunSeen();
    renderApp({
      onBackToHub: vi.fn(),
      onOpenSettings: vi.fn(),
      pwaAction: null,
      onPwaActionConsumed: vi.fn(),
    });
    expect(bottomNav()).toBeInTheDocument();
  });
});

describe("NutritionApp — real network error surfaces the err banner", () => {
  it("a failed day-plan request (MSW 500 fallback) renders the dismissible error banner", async () => {
    // No `server.use(...)` override — the default MSW handler
    // (`test/msw/handlers.ts`) 500s every unhandled `/api/v1/*` call, so
    // `nutritionApi.dayPlan()` really goes over the mocked transport and
    // really rejects. `useNutritionRemoteActions.fetchDayPlan` catches it
    // and calls the real `setErr(...)`, which NutritionApp renders as the
    // `role="alert"` banner with a close button — this exercises the real
    // busy → error wiring instead of asserting on a stubbed setter.
    markNutritionFirstRunSeen();
    renderApp();
    await userEvent.click(navButton("Меню"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Згенерувати денний план" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Закрити повідомлення про помилку" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
