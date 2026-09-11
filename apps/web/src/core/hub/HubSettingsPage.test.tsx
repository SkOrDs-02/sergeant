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
import { billingKeys, silpoKeys } from "@shared/lib/api/queryKeys";
import { GROUPS, HubSettingsPage, lazySectionMinH } from "./HubSettingsPage";
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
// Real `FinykSection` wraps itself in `<SettingsGroup anchorId=
// "settings-finyk">` — re-create just that wiring (not the Mono/Silpo
// hooks it pulls in) so the Silpo-return test below can assert on the
// SAME accordion primitive the real component renders (mirrors the
// `PlanSection`/`PrivacySection` mocks below for the billing/privacy
// hash-open proofs).
vi.mock("../settings/FinykSection", async () => {
  const { SettingsGroup } = await vi.importActual<
    typeof import("../settings/SettingsPrimitives")
  >("../settings/SettingsPrimitives");
  return {
    FinykSection: () => (
      <SettingsGroup title="Фінік" anchorId="settings-finyk">
        Finyk section
      </SettingsGroup>
    ),
  };
});
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
// The real `PrivacySection` needs `AppLockProvider` (`useAppLockContext`
// throws without one) plus a live `meApi.getPreferences()` response — both
// out of scope for this file's first-visible-section-open tests. Same
// pattern as the `PlanSection` mock above: re-create just the
// `SettingsGroup anchorId=…>` wiring the real component renders, so tests
// can assert on the SAME accordion primitive without pulling in the rest
// of `PrivacySection`'s dependency graph.
vi.mock("../settings/PrivacySection", async () => {
  const { SettingsGroup } = await vi.importActual<
    typeof import("../settings/SettingsPrimitives")
  >("../settings/SettingsPrimitives");
  return {
    PrivacySection: () => (
      <SettingsGroup title="Дані та приватність" anchorId="settings-privacy">
        Privacy section
      </SettingsGroup>
    ),
  };
});

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

    const home = document.getElementById("settings-dashboard");

    expect(home).toBeInTheDocument();
    // «тема» — огляд 2026-09-04: тема переїхала в цю секцію з меню «⋯», і
    // ⌘K має знаходити її за цим словом (доти пошук «тема» давав нуль).
    expect(home).toHaveAttribute(
      "data-search-keywords",
      expect.stringContaining("тема"),
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

  // Дефект №1 (адверсарне ревʼю 2026-08-08): раніше цей тест таргетив
  // `#settings-dashboard` — але «Головна» ТАКОЖ перша секція вкладки
  // «Загальні», тож Варіант A (`index === 0`-контекст) відкриває її
  // незалежно від хеша. Гейт лишався б зеленим, навіть якби `anchorId`/
  // `matchesHash` прибрали з `SettingsGroup` цілком. Ціль тепер —
  // «Підписка та план» (`anchorId="settings-plan"`, ДРУГА секція
  // «Загальних», мок вище) — жоден інший механізм її не форсить.
  //
  // Дефект №2, історія: до фіксу форсоване "перша секція вкладки
  // відкрита" розгорталось ОДНОЧАСНО з ціллю хеша. Forced-first прибрано
  // зовсім рішенням власника 2026-09-11, тож ця перевірка тепер ще й
  // пряме регресійне покриття: хеш відкриває РІВНО одну секцію.
  it("auto-expands only the Підписка та план section when navigated via #settings-plan, not the tab's first section", () => {
    // Tap on an inactive Bento card on the Hub dashboard dispatches
    // `HUB_OPEN_SETTINGS_EVENT` which navigates to
    // `/?tab=settings#settings-<id>`. Без auto-open секція просто ховалась
    // за sticky-хедером і користувач бачив «налаштування взагалі», а не
    // конкретно цільовий блок (issue 2026-05-08).
    window.history.replaceState(null, "", "/?tab=settings#settings-plan");
    const scrollContainer = document.createElement("div");
    const scrollTo = vi.fn();
    scrollContainer.scrollTo = scrollTo;

    renderWithToast(<HubSettingsPage scrollContainer={scrollContainer} />);

    const planToggle = screen.getByRole("button", {
      name: /Підписка та план/,
    });
    expect(planToggle).toHaveAttribute("aria-expanded", "true");

    // Дефект №2 proof: до фіксу тут стояло "true" — «Головна» розгортався
    // одночасно з ціллю хеша, бо `index === 0` не знав про `hashSectionId`.
    const dashboardToggle = screen.getByRole("button", { name: /Головна/ });
    expect(dashboardToggle).toHaveAttribute("aria-expanded", "false");

    const plan = document.getElementById("settings-plan");
    expect(plan).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: "smooth",
    });
    expect(plan?.scrollIntoView).not.toHaveBeenCalled();
  });

  // Рішення власника 2026-09-11: forced-first-of-tab (Варіант A, profile/
  // settings deep audit 2026-08-08, рішення власника №4) СКАСОВАНО. На
  // холодному завантаженні — без хеша, без `?billing=…`/`?silpo=…`-return
  // — жодна секція не відкривається автоматично, у тому числі перша
  // секція активної вкладки.
  it("opens no section by default on a cold load, without a hash", () => {
    renderWithBrowserToast(<HubSettingsPage />);

    const homeToggle = screen.getByRole("button", { name: /Головна/ });
    expect(homeToggle).toHaveAttribute("aria-expanded", "false");

    // «Підписка та план» — друга секція тієї ж вкладки «Загальні»
    // (`PlanSection` mock wraps the real `SettingsGroup anchorId=
    // "settings-plan"`, see the mock above) — теж лишається згорнутою.
    const planToggle = screen.getByRole("button", {
      name: /Підписка та план/,
    });
    expect(planToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("opens no section of a newly selected tab either", () => {
    renderWithBrowserToast(<HubSettingsPage />);

    expect(screen.getByRole("button", { name: /Головна/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.click(screen.getByRole("tab", { name: /Додатково/ }));

    // «Дані та приватність» (`PrivacySection` mock above wraps the real
    // `SettingsGroup anchorId="settings-privacy">`) is the first section
    // of «Додатково» and has no `anchorId` match for the current
    // (hash-less) URL — forced-first no longer exists, so it stays
    // collapsed too.
    const privacyToggle = screen.getByRole("button", {
      name: /Дані та приватність/,
    });
    expect(privacyToggle).toHaveAttribute("aria-expanded", "false");
  });

  // Дефект №3 (адверсарне ревʼю 2026-08-08), лишається чинним і після
  // зняття forced-first (рішення власника 2026-09-11):
  // `SettingsGroupDefaultOpenContext` читається лише в `useState`-
  // ініціалізаторі — перемикання вкладки РЕМАУНТИТЬ секцію (вона зникає з
  // `visible`, коли вкладка неактивна), і без памʼяті на рівні сторінки
  // явний вибір юзера («розгорнути») губився б при поверненні на вкладку.
  it("remembers an explicit expand of a section across a tab switch (дефект №3)", () => {
    renderWithBrowserToast(<HubSettingsPage />);

    // «Головна» стартує згорнутим — forced-first скасовано 2026-09-11.
    const homeToggle = screen.getByRole("button", { name: /Головна/ });
    expect(homeToggle).toHaveAttribute("aria-expanded", "false");

    // Юзер явно розгортає її.
    fireEvent.click(homeToggle);
    expect(screen.getByRole("button", { name: /Головна/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    // Перемикання на іншу вкладку розмонтовує «Головна» узагалі — вона не
    // серед секцій «Розділи».
    fireEvent.click(screen.getByRole("tab", { name: /Розділи/ }));
    expect(screen.queryByRole("button", { name: /Головна/ })).toBeNull();

    // Повернення на «Загальні»: явний вибір юзера («розгорнуто») має
    // пережити ремаунт, а не скинутись до дефолтного «згорнуто».
    fireEvent.click(screen.getByRole("tab", { name: /Загальні/ }));
    expect(screen.getByRole("button", { name: /Головна/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
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
    // deep-links use (see the Головна test above) must fire for this
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

  // Silpo MCP walking-skeleton experiment (track A) — the OAuth callback
  // returns to `/settings?silpo=connected|error&reason=…`, forwarded
  // verbatim by `route.tsx` onto `/?tab=settings&silpo=…`. Mirrors the
  // billing-return proof above: land on «Фінік», toast the outcome,
  // refetch `silpoKeys`, strip the param.
  it("reads ?silpo=connected: opens Фінік, refetches silpoKeys, confirms, strips the param", async () => {
    window.history.replaceState(null, "", "/?tab=settings&silpo=connected");
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithBrowserToast(<HubSettingsPage />, queryClient);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: silpoKeys.all,
      });
    });
    expect(await screen.findByText(/Сільпо звʼязано/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Фінік/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
    await waitFor(() => {
      expect(window.location.search).not.toContain("silpo");
    });
    expect(window.location.hash).toBe("#settings-finyk");
  });

  it("reads ?silpo=error&reason=denied: shows a human message (no raw code), retry action, strips both params", async () => {
    window.history.replaceState(
      null,
      "",
      "/?tab=settings&silpo=error&reason=denied",
    );
    const queryClient = createTestQueryClient();

    renderWithBrowserToast(<HubSettingsPage />, queryClient);

    expect(
      await screen.findByText(/Ти відмовив у доступі до Сільпо/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Не вдалося звʼязати Сільпо: denied/),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).not.toContain("silpo");
      expect(window.location.search).not.toContain("reason");
    });
    expect(window.location.hash).toBe("#settings-finyk");
  });

  it("reads ?silpo=error&reason=session_expired: shows the session-expiry message", async () => {
    window.history.replaceState(
      null,
      "",
      "/?tab=settings&silpo=error&reason=session_expired",
    );
    const queryClient = createTestQueryClient();

    renderWithBrowserToast(<HubSettingsPage />, queryClient);

    expect(
      await screen.findByText(/Сесія Sergeant завершилась/),
    ).toBeInTheDocument();
  });

  it("reads ?silpo=error&reason=<unmapped>: falls back to the generic message instead of the raw code", async () => {
    window.history.replaceState(
      null,
      "",
      "/?tab=settings&silpo=error&reason=some_new_server_code",
    );
    const queryClient = createTestQueryClient();

    renderWithBrowserToast(<HubSettingsPage />, queryClient);

    expect(
      await screen.findByText("Не вдалося звʼязати Сільпо."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/some_new_server_code/)).not.toBeInTheDocument();
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

// V-15 (аудит Профілю/Налаштувань 2026-08-08): skeleton lazy-секції
// резервував 168–280px під секцію, яка після завантаження чанку малюється
// згорнутим рядком у 72px — і список стрибав УГОРУ, коли skeleton зникав.
// Тобто той самий layout-shift, якого skeleton має уникати, лише у
// зворотний бік. Розгорнутою lazy-секція буває у двох випадках (перша
// секція активної вкладки за Варіантом A або ціль хеш-діп-лінка), і обидва
// відомі в тому ж `map`, де рендериться `<Suspense>`.
describe("lazySectionMinH — V-15", () => {
  it("резервує повну висоту лише коли секція намалюється розгорнутою", () => {
    expect(lazySectionMinH(600, true)).toBe(600);
  });

  it("резервує висоту згорнутого рядка, коли секція намалюється згорнутою", () => {
    // 72 — висота закритої `SettingsGroup` (бейдж + заголовок + `py-4`);
    // те саме число, що дефолт `minH` у `SectionSkeleton`.
    expect(lazySectionMinH(600, false)).toBe(72);
    expect(lazySectionMinH(280, false)).toBe(72);
  });
});
