// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  FIRST_REAL_ENTRY_KEY,
  MODULE_CHECKLISTS,
  STORAGE_KEYS,
  VIBE_PICKS_KEY,
  type Rec,
  type User,
} from "@sergeant/shared";
import { ToastProvider } from "@shared/hooks/useToast";
import { expandSingleCollapsedSection } from "../../test/helpers/collapsibleSection";

type TestRec = Rec & { actionHash?: string };

const mocks = vi.hoisted(() => ({
  dashboardFocus: {
    focus: null as TestRec | null,
    rest: [] as TestRec[],
    dismiss: vi.fn(),
  },
  digestFresh: false,
  openHubModule: vi.fn(),
  openHubModuleWithAction: vi.fn(),
  openHubSettingsSection: vi.fn(),
  /**
   * Аргументи КОЖНОГО виклику `useCoachInsight`.
   *
   * Мок нижче раніше аргумент ковтав — і саме тому жоден веб-тест не міг
   * упіймати дрейф `enabled`. Рівно ця хвороба вже ловилась на мобілці
   * (PR #1187): зелена галочка, яка документує дефект замість падати на
   * ньому. Тут вона була й на вебі.
   */
  coachInsightCalls: [] as Array<{ enabled?: boolean } | undefined>,
}));

vi.mock("@shared/lib/modules/hubNav", async (importOriginal) => ({
  // Частковий мок ламався, щойно граф дашборда дотягнувся до `appPaths`
  // (`HUB_MODULE_IDS`) через AuthContext у `useAskAiQuota` (FUN-1, аудит
  // 2026-09) — тримаємо реальні експорти, підміняємо лише навігацію.
  ...(await importOriginal<typeof import("@shared/lib/modules/hubNav")>()),
  openHubModule: (...args: unknown[]) => mocks.openHubModule(...args),
  openHubModuleWithAction: (...args: unknown[]) =>
    mocks.openHubModuleWithAction(...args),
  openHubSettingsSection: (...args: unknown[]) =>
    mocks.openHubSettingsSection(...args),
}));

vi.mock("../insights/TodayFocusCard", () => ({
  // `useNowItems` (вісь дії) імпортує ключ сховища звідси — без нього
  // мок кидає на імпорті.
  HUB_RECS_DISMISSED_KEY: "hub_recs_dismissed_v1",
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
  useCoachInsight: (opts?: { enabled?: boolean }) => {
    mocks.coachInsightCalls.push(opts);
    return {
      insight: "coach insight",
      loading: false,
      error: null,
      refresh: vi.fn(),
    };
  },
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
  user = null,
}: {
  onOpenModule?: (module: string) => void;
  onShowAuth?: () => void;
  user?: User | null;
} = {}) {
  const result = render(
    <MemoryRouter>
      <ToastProvider>
        <HubDashboard
          user={user}
          onOpenModule={onOpenModule}
          onShowAuth={onShowAuth}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...result, onOpenModule, onShowAuth };
}

/** Signed-in user whose account was created `daysAgo` days ago. */
function userAged(daysAgo: number): User {
  return {
    id: "user-1",
    email: "test@example.com",
    name: "Test",
    image: null,
    emailVerified: true,
    createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
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
    mocks.openHubSettingsSection.mockClear();
    mocks.coachInsightCalls.length = 0;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
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

  it("hides the checklist for an established account on a fresh device", () => {
    // Regression: `sessionDays` lives in localStorage, so a reinstall or a
    // second browser restarted it at 1 and resurrected «Перші кроки» for
    // users who had been running Фінік for months. The FTUX window is now
    // anchored to the server-stamped account age instead.
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["finyk"]));

    renderDashboard({ user: userAged(200) });

    expect(screen.queryByText(MODULE_CHECKLISTS.finyk.title)).toBeNull();
  });

  it("still shows the checklist for a genuinely new account", () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["finyk"]));

    renderDashboard({ user: userAged(2) });

    expect(screen.getByText(MODULE_CHECKLISTS.finyk.title)).toBeInTheDocument();
  });

  it("shows the weekly digest footer and expands the report summary inline", () => {
    // UX-feedback 2026-05-13: footer is always rendered (regardless of day
    // or `digestFresh`) so users always have a 1-tap entry into the
    // weekly digest. Empty/fresh state is reflected by `data-fresh`.
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

  it("renders the weekly digest footer mid-week regardless of digest freshness", () => {
    // 2026-04-29 is a Wednesday — pre-change this hid the footer unless a
    // live digest existed (UX feedback: users couldn't find the report
    // mid-week). Footer is now always present; the `data-fresh` flag
    // still reflects whether a live digest is available.
    renderDashboard();
    expect(screen.getByTestId("weekly-digest-footer")).toHaveAttribute(
      "data-fresh",
      "false",
    );

    cleanup();
    mocks.digestFresh = true;
    renderDashboard();

    expect(screen.getByTestId("weekly-digest-footer")).toHaveAttribute(
      "data-fresh",
      "true",
    );
  });
  // ── PR-A1, залишок ─────────────────────────────────────────────────
  // Юніт на `shouldFetchCoachInsight` перевіряє лише чистий предикат.
  // Ці два піни перевіряють ПРОВОДКУ: що справжня розгорнутість секції
  // (localStorage + `onOpenChange` у `CollapsibleSection`) доходить до
  // хука через `HubDashboard`. Саме проводка тут і була відсутня.
  it("не палить AI-квоту коуча, поки блок «Що зараз важливо» згорнутий", () => {
    renderDashboard();

    // Секція монтується згорнутою (рішення «Тихо»), тож це не крайній
    // випадок, а звичайний вхід на хаб.
    expect(mocks.coachInsightCalls.length).toBeGreaterThan(0);
    expect(mocks.coachInsightCalls.every((c) => c?.enabled === false)).toBe(
      true,
    );
  });

  it("вмикає запит коуча, коли людина розгорнула блок", () => {
    const { container } = renderDashboard();

    expandSingleCollapsedSection(container);

    // Останній виклик — уже після розгортання.
    expect(mocks.coachInsightCalls.at(-1)?.enabled).toBe(true);
  });
  it("гейт коуча правильний уже на ПЕРШОМУ рендері, коли секція збережена розгорнутою", () => {
    // Пін на ініціалізацію стану зі сховища. Раніше батько стартував із
    // `false` і чекав на ефект секції, тож ПЕРШИЙ виклик хука завжди йшов
    // із `enabled: false`, навіть коли людина лишила блок розгорнутим.
    // Один зайвий прохід рендера на кожному вході в хаб — і гейт, який
    // тактом пізніше.
    localStorage.setItem("sergeant:hub.insights.open", "true");

    renderDashboard();

    expect(mocks.coachInsightCalls[0]?.enabled).toBe(true);
  });
});

// Вісь дії — спека `docs/work/specs/hub-action-axis.md`. Купи РЕАЛЬНІ (храповик
// `vi.mock` цього файлу вже на межі): на порожніх кешах «Зараз» показує
// порожній рядок, «Закрито» не рендериться. Їхню логіку покривають власні
// тести (`now/*.test.ts*`), тут — розкладка.
describe("HubDashboard — вісь дії", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T09:00:00+03:00"));
    localStorage.clear();
    localStorage.setItem("hub_first_real_entry_done_v1", "1");
    localStorage.setItem(
      VIBE_PICKS_KEY,
      JSON.stringify(["finyk", "fizruk", "routine", "nutrition"]),
    );
    mocks.dashboardFocus.focus = null;
    mocks.dashboardFocus.rest = [];
    mocks.openHubModule.mockClear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("з реальним записом: рейок, купа «Зараз», купа «Закрито»; сітки немає", () => {
    renderDashboard();
    expect(screen.getByTestId("module-rail")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Зараз" })).toBeInTheDocument();
    expect(screen.getByTestId("now-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("today-focus-card")).toBeNull();
    // Акордеон під віссю — лише порада й звіт.
    expect(screen.getByText("Порада й звіт тижня")).toBeInTheDocument();
  });

  it("тап по комірці рейка відкриває модуль із джерелом module_rail", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("tab", { name: /Фізрук/ }));
    expect(mocks.openHubModule).toHaveBeenCalledWith(
      "fizruk",
      undefined,
      "module_rail",
    );
  });

  it("новачок без запису: FTUX-hero і рейок, куп немає", () => {
    localStorage.removeItem(FIRST_REAL_ENTRY_KEY);
    localStorage.removeItem("hub_first_real_entry_done_v1");
    renderDashboard();
    expect(screen.getByTestId("module-rail")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Зараз" })).toBeNull();
    expect(screen.queryByTestId("now-empty")).toBeNull();
  });

  it("збережений застарілий calmMode ігнорується: порада й звіт лишаються", () => {
    localStorage.setItem(
      STORAGE_KEYS.HUB_PREFS,
      JSON.stringify({ calmMode: true }),
    );
    renderDashboard();
    expect(screen.getByTestId("now-empty")).toBeInTheDocument();
    expect(screen.getByText("Порада й звіт тижня")).toBeInTheDocument();
  });
});
