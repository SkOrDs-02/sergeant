// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_MODULE_LABELS,
  FIRST_REAL_ENTRY_KEY,
  HIDE_INACTIVE_MODULES_KEY,
  MODULE_CHECKLISTS,
  STORAGE_KEYS,
  VIBE_PICKS_KEY,
  type Rec,
} from "@sergeant/shared";
import { getModulePrimaryAction } from "@shared/lib/modules/moduleQuickActions";
import { ToastProvider } from "@shared/hooks/useToast";
import { MODULE_CONFIGS } from "./dashboard/moduleConfigs";

type TestRec = Rec & { actionHash?: string };

// `formatMoney` (single source of truth in `@sergeant/shared`) renders
// hryvnia amounts as `"<number> ₴"` (e.g. `"1 250 ₴"`) using a regular
// space before the symbol. testing-library normalises NBSP/space to a
// single space, so plain spaces are fine in the expectation strings.
const EXPECTED_FINYK_MAIN = "1 250 \u20b4";
const EXPECTED_FINYK_SUB =
  "\u0417\u0430\u043b\u0438\u0448\u043e\u043a: 7 300 \u20b4";
const EXPECTED_ROUTINE_SUB =
  "\u0421\u0435\u0440\u0456\u044f: 5 \u0434\u043d\u0456\u0432";
const INACTIVE_TOGGLE_NEEDLE =
  "\u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u0456";

const mocks = vi.hoisted(() => ({
  dashboardFocus: {
    focus: null as TestRec | null,
    rest: [] as TestRec[],
    dismiss: vi.fn(),
  },
  digestFresh: false,
  openHubModule: vi.fn(),
  openHubModuleWithAction: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  PointerSensor: function PointerSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: function closestCenter() {},
  useSensor: (sensor: unknown, options: unknown) => ({ sensor, options }),
  useSensors: (...sensors: unknown[]) => sensors,
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  arrayMove: <T,>(items: T[], from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    return next;
  },
  rectSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    setActivatorNodeRef: () => undefined,
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule: (...args: unknown[]) => mocks.openHubModule(...args),
  openHubModuleWithAction: (...args: unknown[]) =>
    mocks.openHubModuleWithAction(...args),
}));

vi.mock("../insights/TodayFocusCard", () => ({
  useDashboardFocus: () => mocks.dashboardFocus,
  TodayFocusCard: ({
    focus,
    onAction,
    onDismiss,
  }: {
    focus: TestRec | null;
    onAction: (module: string) => void;
    onDismiss: (id: string) => void;
  }) =>
    focus ? (
      <section data-testid="today-focus-card">
        <p>{focus.title}</p>
        <button type="button" onClick={() => onAction(focus.action)}>
          focus-action
        </button>
        <button type="button" onClick={() => onDismiss(focus.id)}>
          focus-dismiss
        </button>
      </section>
    ) : null,
}));

vi.mock("./HubInsightsPanel", () => ({
  HubInsightsPanel: ({
    items,
    onOpenModule,
    onDismiss,
  }: {
    items: TestRec[];
    onOpenModule: (module: string, hash?: string) => void;
    onDismiss: (id: string) => void;
  }) => (
    <section data-testid="hub-insights-panel">
      <p data-testid="insight-count">{items.length}</p>
      {items.map((item) => (
        <div key={item.id}>
          <span>{item.title}</span>
          <button
            type="button"
            onClick={() => onOpenModule(item.action, item.actionHash)}
          >
            open-{item.id}
          </button>
          <button type="button" onClick={() => onDismiss(item.id)}>
            dismiss-{item.id}
          </button>
        </div>
      ))}
    </section>
  ),
}));

vi.mock("../insights/WeeklyDigestCard", () => ({
  hasLiveWeeklyDigest: () => mocks.digestFresh,
  WeeklyDigestCard: ({ onCollapse }: { onCollapse?: () => void }) => (
    <section data-testid="weekly-digest-card">
      <button type="button" onClick={onCollapse}>
        collapse-digest
      </button>
    </section>
  ),
}));

vi.mock("./dashboard/dashboardCards", () => ({
  StaggerChild: ({ children }: { children: ReactNode }) => <>{children}</>,
  StreakIndicator: () => null,
  AssistantAdviceCard: () => null,
  MotivationalFooter: () => <p data-testid="motivational-footer" />,
  WeeklyDigestFooter: ({
    fresh,
    onExpand,
  }: {
    fresh: boolean;
    onExpand: () => void;
  }) => (
    <button
      type="button"
      data-testid="weekly-digest-footer"
      data-fresh={String(fresh)}
      onClick={onExpand}
    >
      weekly-digest-footer
    </button>
  ),
}));

vi.mock("../insights/useCoachInsight", () => ({
  useCoachInsight: () => ({
    insight: "coach insight",
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("../insights/AssistantAdviceCard", () => ({
  AssistantAdviceCard: ({ insight }: { insight: string | null }) => (
    <section data-testid="assistant-advice-card">{insight}</section>
  ),
}));

vi.mock("../onboarding/FirstActionSheet", () => ({
  FirstActionHeroCard: ({ onDismiss }: { onDismiss: () => void }) => (
    <button type="button" onClick={onDismiss}>
      first-action-hero
    </button>
  ),
}));

// Stub `ModuleChecklist` — its rendered «Фінік: Перші кроки» heading and
// per-step buttons collided with the bento «Фінік» button under
// `getByRole("button", { name: /Фінік/i })`. The post-S3.5 single-hero
// rule shows the checklist whenever `hasRealEntry && sessionDays <= 7`,
// which is the default beforeEach state. The dedicated S3.5 test below
// asserts the checklist appears via its own title selector — other tests
// only need to know it does not pollute the bento buttons.
vi.mock("../onboarding/ModuleChecklist", () => ({
  ModuleChecklist: ({ moduleId }: { moduleId: string }) => (
    <div data-testid={`module-checklist-${moduleId}`}>
      {MODULE_CHECKLISTS[moduleId as keyof typeof MODULE_CHECKLISTS]?.title}
    </div>
  ),
}));

vi.mock("../onboarding/SoftAuthPromptCard", () => ({
  SoftAuthPromptCard: ({ onOpenAuth }: { onOpenAuth: () => void }) => (
    <button type="button" onClick={onOpenAuth}>
      soft-auth-prompt
    </button>
  ),
}));

vi.mock("../onboarding/useFirstEntryCelebration", () => ({
  useFirstEntryCelebration: () => ({
    open: false,
    ttvMs: null,
    close: () => {},
  }),
}));

vi.mock("../onboarding/DailyNudge", () => ({
  DailyNudge: ({ onDismiss }: { onDismiss: () => void }) => (
    <button type="button" onClick={onDismiss}>
      daily-nudge
    </button>
  ),
}));

vi.mock("../onboarding/ReEngagementCard", () => ({
  ReEngagementCard: ({
    onContinue,
  }: {
    onContinue: () => void;
    onDismiss: () => void;
  }) => (
    <button type="button" onClick={onContinue}>
      reengagement-card
    </button>
  ),
}));

vi.mock("./dashboard/useMondayAutoDigest", () => ({
  useMondayAutoDigest: () => undefined,
}));

import { HubDashboard } from "./HubDashboard";

function renderDashboard({
  onOpenModule = vi.fn(),
  onShowAuth = vi.fn(),
}: {
  onOpenModule?: (module: string) => void;
  onShowAuth?: () => void;
} = {}) {
  render(
    <ToastProvider>
      <HubDashboard
        user={null}
        onOpenModule={onOpenModule}
        onShowAuth={onShowAuth}
      />
    </ToastProvider>,
  );
  return { onOpenModule, onShowAuth };
}

function rec(overrides: Partial<TestRec>): TestRec {
  return {
    id: "rec-1",
    module: "finyk",
    priority: 100,
    icon: "",
    title: "Recommendation",
    body: "Body",
    action: "finyk",
    ...overrides,
  };
}

describe("HubDashboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T09:00:00+03:00"));
    localStorage.clear();
    // Past the FTUX gate: render `HubInsightsPanel` and the «Аналітика»
    // section (incl. `WeeklyDigestFooter`). Also suppresses
    // `ModuleChecklist`, whose «Фінік: Перші кроки» heading would
    // collide with the bento «Фінік» button under `getByRole`.
    localStorage.setItem("hub_first_real_entry_done_v1", "1");
    mocks.dashboardFocus.focus = null;
    mocks.dashboardFocus.rest = [];
    mocks.dashboardFocus.dismiss.mockClear();
    mocks.digestFresh = false;
    mocks.openHubModule.mockClear();
    mocks.openHubModuleWithAction.mockClear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("renders module previews from quick stats and empty states for modules without data", () => {
    localStorage.setItem(
      STORAGE_KEYS.FINYK_QUICK_STATS,
      JSON.stringify({ todaySpent: 1250, budgetLeft: 7300 }),
    );
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ todayDone: 2, todayTotal: 4, streak: 5 }),
    );

    renderDashboard();

    expect(screen.getByText(EXPECTED_FINYK_MAIN)).toBeInTheDocument();
    expect(screen.getByText(EXPECTED_FINYK_SUB)).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByText(EXPECTED_ROUTINE_SUB)).toBeInTheDocument();
    expect(screen.getAllByText(MODULE_CONFIGS.fizruk.emptyLabel)).toHaveLength(
      2,
    );
  });

  it("keeps the pre-FTUX dashboard focused on first-entry guidance", () => {
    localStorage.removeItem(FIRST_REAL_ENTRY_KEY);

    renderDashboard();

    // Single-hero rule (S3.5): pre-FTUX (no real entry) `ModuleChecklist`
    // is suppressed — `FirstActionHeroCard` / `TodayFocusCard` is the
    // sole next-steps surface and the bento module grid handles ad-hoc
    // entry points. Stacking the checklist on top would split user
    // attention into two competing «do these N steps» surfaces.
    expect(screen.queryByTestId("today-focus-card")).toBeNull();
    expect(screen.queryByText(MODULE_CHECKLISTS.finyk.title)).toBeNull();
    expect(screen.queryByTestId("assistant-advice-card")).toBeNull();
    expect(screen.queryByTestId("hub-insights-panel")).toBeNull();
    expect(screen.queryByTestId("weekly-digest-footer")).toBeNull();
  });

  it("renders module checklist post-FTUX within first week (single-hero S3.5)", () => {
    // Past the FTUX gate (default beforeEach state): `hasRealEntry` true,
    // `firstActionVisible` false, `sessionDays <= 7`. The checklist now
    // takes over as the post-celebration guide toward 2nd/3rd entry.
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["finyk"]));

    renderDashboard();

    expect(screen.getByText(MODULE_CHECKLISTS.finyk.title)).toBeInTheDocument();
  });

  it("opens module cards and keeps quick-add actions scoped to active modules with recommendation signal", () => {
    const onOpenModule = vi.fn();
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["finyk"]));
    mocks.dashboardFocus.focus = rec({
      id: "focus-finyk",
      module: "finyk",
      action: "finyk",
    });
    mocks.dashboardFocus.rest = [
      rec({
        id: "rest-fizruk",
        module: "fizruk",
        action: "fizruk",
      }),
    ];

    const finykQuickAction = getModulePrimaryAction("finyk");
    const fizrukQuickAction = getModulePrimaryAction("fizruk");

    renderDashboard({ onOpenModule });

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(DASHBOARD_MODULE_LABELS.finyk),
      }),
    );
    expect(onOpenModule).toHaveBeenCalledWith("finyk");

    expect(
      screen.getByRole("button", { name: finykQuickAction?.label }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: fizrukQuickAction?.label }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: finykQuickAction?.label }),
    );
    expect(mocks.openHubModuleWithAction).toHaveBeenCalledWith(
      "finyk",
      finykQuickAction?.action,
    );
  });

  it("marks inactive modules and persists the hide-inactive toggle", () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["finyk"]));
    const { container } = render(
      <HubDashboard user={null} onOpenModule={vi.fn()} onShowAuth={vi.fn()} />,
    );

    expect(container.querySelectorAll('[data-inactive="true"]')).toHaveLength(
      3,
    );

    const toggle = Array.from(screen.getAllByRole("button")).find((button) =>
      button.textContent?.includes(INACTIVE_TOGGLE_NEEDLE),
    );
    expect(toggle).toBeDefined();
    fireEvent.click(toggle!);

    expect(localStorage.getItem(HIDE_INACTIVE_MODULES_KEY)).toBe("1");
    expect(
      screen.queryByRole("button", {
        name: new RegExp(DASHBOARD_MODULE_LABELS.fizruk),
      }),
    ).toBeNull();
  });

  it("routes hero and insight callbacks to the correct dashboard actions", () => {
    const onOpenModule = vi.fn();
    mocks.dashboardFocus.focus = rec({
      id: "focus",
      title: "Focus recommendation",
      action: "nutrition",
    });
    mocks.dashboardFocus.rest = [
      rec({
        id: "hashed",
        title: "Hashed insight",
        action: "finyk",
        actionHash: "#budgets",
      }),
      rec({
        id: "plain",
        title: "Plain insight",
        action: "fizruk",
      }),
    ];

    renderDashboard({ onOpenModule });

    expect(screen.getByText("Focus recommendation")).toBeInTheDocument();
    expect(screen.getByTestId("insight-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "focus-action" }));
    fireEvent.click(screen.getByRole("button", { name: "open-hashed" }));
    fireEvent.click(screen.getByRole("button", { name: "open-plain" }));
    fireEvent.click(screen.getByRole("button", { name: "dismiss-hashed" }));

    expect(onOpenModule).toHaveBeenCalledWith("nutrition");
    expect(mocks.openHubModule).toHaveBeenCalledWith("finyk", "#budgets");
    expect(onOpenModule).toHaveBeenCalledWith("fizruk");
    expect(mocks.dashboardFocus.dismiss).toHaveBeenCalledWith("hashed");
  });

  it("shows the weekly digest footer on report days and expands the report summary inline", () => {
    vi.setSystemTime(new Date("2026-04-28T09:00:00+03:00"));
    mocks.digestFresh = false;

    renderDashboard();

    expect(screen.getByTestId("weekly-digest-footer")).toHaveAttribute(
      "data-fresh",
      "false",
    );

    fireEvent.click(screen.getByTestId("weekly-digest-footer"));

    expect(screen.getByTestId("weekly-digest-card")).toBeInTheDocument();
  });

  it("shows a stale-day digest footer only when a live weekly digest exists", () => {
    renderDashboard();
    expect(screen.queryByTestId("weekly-digest-footer")).toBeNull();

    cleanup();
    mocks.digestFresh = true;
    renderDashboard();

    expect(screen.getByTestId("weekly-digest-footer")).toHaveAttribute(
      "data-fresh",
      "true",
    );
  });
});
