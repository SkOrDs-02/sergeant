/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { GROUPS, HubSettingsPage } from "./HubSettingsPage";
import { SETTINGS_SECTIONS_CATALOG } from "./settingsSectionsCatalog";

// `DashboardSection` and `PWASection` consume `useToast`, which throws
// outside a `ToastProvider`. The other sections are mocked above; these
// two render in-tree because the test exercises their anchor wiring.
// `HubSettingsPage` uses `useNavigate`/`useLocation` for `?group=…`
// mirroring, so wrap in `MemoryRouter` seeded with `window.location` so
// the test still exercises the `readSettingsGroupParam()` mount path.
// `QueryClientProvider` is required since L-2 (2026-08-08): the billing-
// return reader calls `useQueryClient()` unconditionally.
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithToast(ui: ReactNode, queryClient = createTestQueryClient()) {
  const initial = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <ToastProvider>
          {ui}
          <ToastContainer />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Real `BrowserRouter` (not `MemoryRouter`) — required whenever a test
// needs `navigate()` to actually mutate `window.location` (MemoryRouter's
// history is purely in-memory and never touches the real URL).
function renderWithBrowserToast(
  ui: ReactNode,
  queryClient = createTestQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          {ui}
          <ToastContainer />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

vi.mock("../settings/AIDigestSection", () => ({
  AIDigestSection: () => <section>AI digest section</section>,
}));
vi.mock("../settings/CapabilitiesSection", () => ({
  CapabilitiesSection: () => <section>Capabilities section</section>,
}));
vi.mock("../settings/ExperimentalSection", () => ({
  ExperimentalSection: () => <section>Experimental section</section>,
}));
vi.mock("../settings/FinykSection", () => ({
  FinykSection: () => <section>Finyk section</section>,
}));
vi.mock("../settings/FizrukSection", () => ({
  FizrukSection: () => <section>Fizruk section</section>,
}));
vi.mock("../settings/NotificationsSection", () => ({
  NotificationsSection: () => <section>Notifications section</section>,
}));
vi.mock("../settings/NutritionSection", () => ({
  NutritionSection: () => <section>Nutrition section</section>,
}));
// Audit finding #8 (2026-08-08): a plain `<section>Plan section</section>`
// mock made the "L-12 proof" billing-return test below provably unable to
// fail on a `SettingsGroup` auto-open regression — there was no
// `SettingsGroup` anywhere in the mocked tree to assert `aria-expanded`
// on. The real `PlanSection` wraps itself in
// `<SettingsGroup anchorId="settings-plan">`; re-create just that wiring
// (not the `usePlan()`/billing-API-backed body) so the test can assert on
// the SAME accordion primitive the real component renders.
vi.mock("../settings/PlanSection", async () => {
  const { SettingsGroup } = await vi.importActual<
    typeof import("../settings/SettingsPrimitives")
  >("../settings/SettingsPrimitives");
  return {
    PlanSection: () => (
      <SettingsGroup title="Підписка та план" anchorId="settings-plan">
        Plan section
      </SettingsGroup>
    ),
  };
});
vi.mock("../settings/RoutineSection", () => ({
  RoutineSection: () => <section>Routine section</section>,
}));

describe("HubSettingsPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders stable anchors and search keywords for settings sections", () => {
    renderWithBrowserToast(<HubSettingsPage />);

    const capabilities = document.getElementById("settings-capabilities");

    expect(capabilities).toBeInTheDocument();
    // «онбординг» is the merged Можливості section's stable findability
    // marker: the standalone «Загальні» section was folded into it on
    // 2026-08-03, and its onboarding keywords have to survive the merge so
    // an existing search for «онбординг» still lands somewhere.
    expect(capabilities).toHaveAttribute(
      "data-search-keywords",
      expect.stringContaining("онбординг"),
    );
  });

  it("reveals and scrolls to a hash-linked settings section", async () => {
    window.history.replaceState(null, "", "/?tab=settings#settings-finyk");
    const scrollContainer = document.createElement("div");
    const scrollTo = vi.fn();
    scrollContainer.scrollTo = scrollTo;

    renderWithBrowserToast(
      <HubSettingsPage scrollContainer={scrollContainer} />,
    );

    const finyk = document.getElementById("settings-finyk");

    // `FinykSection` is React.lazy() per Initiative 0017 Sprint 1.1
    // PR-1.2 — the Suspense fallback (`SectionSkeleton`) is on screen
    // first; the mock resolves on the next microtask. `findByText`
    // waits for that swap instead of asserting against the skeleton.
    expect(await screen.findByText("Finyk section")).toBeInTheDocument();
    expect(finyk).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: "smooth",
    });
    expect(finyk?.scrollIntoView).not.toHaveBeenCalled();
  });

  it("mirrors the inner group tab to ?group= so reload keeps the user on Розділи", async () => {
    window.history.replaceState(null, "", "/?tab=settings&group=modules");

    renderWithToast(<HubSettingsPage />);

    // The «Розділи» tab renders module-scoped sections only. They are
    // React.lazy() now (PR-1.2), so we await the Suspense resolution
    // before asserting the content swap.
    expect(await screen.findByText("Routine section")).toBeInTheDocument();
    expect(await screen.findByText("Finyk section")).toBeInTheDocument();
    expect(screen.queryByText("Capabilities section")).not.toBeInTheDocument();
  });

  it("keeps ?tab=settings when switching inner groups", async () => {
    window.history.replaceState(null, "", "/?tab=settings");

    renderWithBrowserToast(<HubSettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: /Розділи/ }));

    expect(window.location.search).toContain("tab=settings");
    expect(window.location.search).toContain("group=modules");
    // `RoutineSection` is React.lazy() — await Suspense resolution.
    expect(await screen.findByText("Routine section")).toBeInTheDocument();
  });

  it("auto-expands the Дашборд section when navigated via #settings-dashboard", () => {
    // Tap on an inactive Bento card on the Hub dashboard dispatches
    // `HUB_OPEN_SETTINGS_EVENT` which navigates to
    // `/?tab=settings#settings-dashboard`. Без auto-open секція просто
    // ховалась за sticky-хедером і користувач бачив «налаштування взагалі»,
    // а не конкретно тогл-лист модулів дашборда (issue 2026-05-08).
    window.history.replaceState(null, "", "/?tab=settings#settings-dashboard");
    const scrollContainer = document.createElement("div");
    const scrollTo = vi.fn();
    scrollContainer.scrollTo = scrollTo;

    renderWithToast(<HubSettingsPage scrollContainer={scrollContainer} />);

    const dashboardToggle = screen.getByRole("button", { name: /Дашборд/ });
    expect(dashboardToggle).toHaveAttribute("aria-expanded", "true");

    const dashboard = document.getElementById("settings-dashboard");
    expect(dashboard).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: "smooth",
    });
    expect(dashboard?.scrollIntoView).not.toHaveBeenCalled();
  });

  // V-1 (audit 2026-08-08): the group Tabs had `role="tablist"`/`role="tab"`
  // and working roving tabindex, but `aria-controls` was always `null` —
  // there was no matching `role="tabpanel"` anywhere on the page.
  it("wires the group Tabs to a matching tabpanel (V-1)", () => {
    window.history.replaceState(null, "", "/?tab=settings");
    renderWithBrowserToast(<HubSettingsPage />);

    const panel = screen.getByRole("tabpanel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Загальні"),
    );

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-controls", panel.id);
    }
  });

  // V-16 (audit 2026-08-08): `{query && visible.length > 0 && (...)}` hid
  // the input's own clear button exactly when a search had zero results —
  // the one moment a clear affordance matters most. Regression guard: the
  // button stays mounted purely off `query`, independent of result count.
  it("keeps the input's own clear button mounted at zero search results (V-16), with a distinct accessible name (audit finding #12)", () => {
    renderWithBrowserToast(<HubSettingsPage />);
    const input = screen.getByPlaceholderText("Пошук налаштувань…");
    fireEvent.change(input, { target: { value: "zzz-does-not-exist-zzz" } });

    expect(screen.getByText(/Нічого не знайдено/)).toBeInTheDocument();
    // Two clear affordances co-exist at zero results: the input's own
    // (persistent while `query` is non-empty) and the empty-state CTA.
    // Before the V-16 fix there was only one (the CTA). Audit finding #12
    // (2026-08-08): they briefly shared the exact same accessible name
    // ("Очистити пошук" ×2) — indistinguishable to a screen reader. They
    // must be reachable by role AND by two DIFFERENT names.
    expect(
      screen.getByRole("button", { name: "Очистити поле пошуку" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Очистити пошук" }),
    ).toBeInTheDocument();
  });

  // Audit finding #12 (2026-08-08): the clear <Button> used to live INSIDE
  // the <label> wrapping the search input. The accname "embedded control"
  // rule folds a descendant control's own accessible name into the
  // <label>'s (and therefore the <input>'s) computed name — so the field's
  // accessible name became "Пошук по налаштуваннях Очистити пошук"
  // whenever `query` was non-empty. `getByPlaceholderText` (used
  // elsewhere in this file) doesn't see this; asserting on the `searchbox`
  // role's accessible name does.
  it("does not leak the clear button's accessible name into the search field's own name (audit finding #12)", () => {
    renderWithBrowserToast(<HubSettingsPage />);
    const input = screen.getByPlaceholderText("Пошук налаштувань…");
    fireEvent.change(input, { target: { value: "zzz" } });

    expect(
      screen.getByRole("searchbox", { name: "Пошук по налаштуваннях" }),
    ).toBe(input);
  });

  // L-2 / L-12 (audit 2026-08-08): Stripe/LiqPay/Plata return the user to
  // `/settings?billing=portal-return|manage` — before this reader, that
  // param was read nowhere in the web app (`grep -rn 'billing='` had zero
  // hits outside comments), so the user landed on a cold, fully-collapsed
  // Settings page with no confirmation a plan change took effect.
  it("reads ?billing=portal-return: opens Plan, refetches billing status, confirms, strips the param", async () => {
    window.history.replaceState(
      null,
      "",
      "/?tab=settings&billing=portal-return",
    );
    // Audit finding #3b (2026-08-08): captured as a DELTA, not an absolute
    // value — `window.history` is a single shared jsdom object across every
    // test in this file (each real `BrowserRouter` navigation elsewhere
    // accumulates entries), so only a before/after comparison within this
    // test is meaningful.
    const historyLengthBeforeEffect = window.history.length;
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    // L-12 proof: the SAME scroll mechanism `#settings-<id>` hash
    // deep-links use (see the Дашборд test above) must fire for this
    // query-origin signal too — that IS the "unify auto-open for hash and
    // query" ask. `hashSectionId` only drives the scroll effect when a
    // `scrollContainer` is supplied.
    const scrollContainer = document.createElement("div");
    const scrollTo = vi.fn();
    scrollContainer.scrollTo = scrollTo;

    renderWithBrowserToast(
      <HubSettingsPage scrollContainer={scrollContainer} />,
      queryClient,
    );

    // Hard Rule #2 — refetch must go through the `billingKeys` factory.
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: billingKeys.status,
      });
    });
    // Audit finding #4 (2026-08-08): the old copy ("Статус підписки
    // оновлено.") claimed a CHANGE happened, which is false for a portal
    // close that changed nothing. "Перевірено" only claims what actually
    // happened — the plan was re-synced with the server.
    expect(
      await screen.findByText("Статус підписки перевірено."),
    ).toBeInTheDocument();
    // L-12 proof (audit finding #8, 2026-08-08): the accordion itself —
    // not just the scroll effect — must auto-expand. `PlanSection` is
    // mocked as a real `SettingsGroup anchorId="settings-plan"` (see the
    // mock above) specifically so this assertion can fail on a
    // `SettingsGroup`/hash-announce regression.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Підписка та план/ }),
      ).toHaveAttribute("aria-expanded", "true");
    });
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: "smooth",
      });
    });
    await waitFor(() => {
      expect(window.location.search).not.toContain("billing");
    });
    expect(window.location.hash).toBe("#settings-plan");
    // Audit finding #3b (2026-08-08): the old `location.hash = …`
    // assignment PUSHED a history entry that the subsequent
    // `navigate(…, { replace: true })` only replaced, leaving the
    // `?billing=portal-return` URL one Back-tap away (dead click,
    // `?billing=` resurrected in the address bar). A single
    // `navigate(…, { replace: true })` doing both jobs must not grow
    // history at all.
    expect(window.history.length).toBe(historyLengthBeforeEffect);
  });

  it("reads ?billing=manage the same way as ?billing=portal-return (LiqPay/Plata no-portal return)", async () => {
    window.history.replaceState(null, "", "/?tab=settings&billing=manage");
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithBrowserToast(<HubSettingsPage />, queryClient);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: billingKeys.status,
      });
    });
    await waitFor(() => {
      expect(window.location.search).not.toContain("billing");
    });
    expect(window.location.hash).toBe("#settings-plan");
  });

  // Audit finding #13 (2026-08-08): `SETTINGS_GROUP_PANEL_ID` used to be a
  // hardcoded module constant shared by every mounted instance — two on
  // screen at once would collide on `id`, making the tabs' `aria-controls`
  // ambiguous. `useId()` scopes the id to each component instance.
  it("generates a unique group-panel id per mounted instance (audit finding #13)", () => {
    renderWithBrowserToast(
      <>
        <HubSettingsPage />
        <HubSettingsPage />
      </>,
    );
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(2);
    expect(panels[0]?.id).toBeTruthy();
    expect(panels[1]?.id).toBeTruthy();
    expect(panels[0]?.id).not.toBe(panels[1]?.id);
  });
});

// Audit finding #7 (2026-08-08): the three id-set tests that used to live
// in `search/searchSettings.test.ts` checked `SETTINGS_INDEX ↔
// SETTINGS_SECTIONS_CATALOG` parity — but `SETTINGS_INDEX` is now a
// straight `.map()` over the catalog, so that parity can never break by
// construction (`Array.prototype.map` preserves `id`); the tests were
// pinning a tautology. The REAL, still-breakable parity the audit named —
// catalog ↔ `GROUPS` (every catalog entry must be reachable from a tab,
// not just via search) — had NO test coverage at all. `GROUPS` is exported
// from `HubSettingsPage.tsx` for exactly this.
describe("GROUPS ↔ SETTINGS_SECTIONS_CATALOG parity", () => {
  it("every catalog section belongs to exactly one GROUPS tab", () => {
    const catalogIds = SETTINGS_SECTIONS_CATALOG.map((s) => s.id);
    for (const id of catalogIds) {
      const owners = GROUPS.filter((g) =>
        (g.sections as readonly string[]).includes(id),
      );
      expect(owners).toHaveLength(1);
    }
  });

  it("every GROUPS section id exists in the real-sections catalog", () => {
    const catalogIds = new Set(SETTINGS_SECTIONS_CATALOG.map((s) => s.id));
    for (const group of GROUPS) {
      for (const id of group.sections) {
        expect(catalogIds.has(id)).toBe(true);
      }
    }
  });
});
