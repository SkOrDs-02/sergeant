/** @vitest-environment jsdom */
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { NudgeDefinition } from "@sergeant/shared";
import {
  HubInsightsBlock,
  type HubInsightsBlockProps,
} from "./HubInsightsBlock";

const weekReportState = vi.hoisted(() => ({
  lines: [] as string[],
  enabledArgs: [] as boolean[],
}));

vi.mock("../../modules/finyk/hooks/useFinykWeekReport", () => ({
  useFinykWeekReport: (enabled = true) => {
    weekReportState.enabledArgs.push(enabled);
    return enabled ? weekReportState.lines : [];
  },
}));

// Секція тримає дітей у DOM і згорнутою, тому стаб рендерить `children`
// безумовно і лише ПОВІДОМЛЯЄ про стан через `onOpenChange` — рівно як
// справжній `CollapsibleSection`. Кнопка дозволяє перемкнути стан у тесті.
vi.mock("@shared/components/ui/CollapsibleSection", () => ({
  CollapsibleSection: ({
    title,
    collapsedSubtitle,
    onOpenChange,
    defaultOpen,
    children,
  }: {
    title: string;
    collapsedSubtitle: ReactNode;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      <p data-testid="collapsed-subtitle">{collapsedSubtitle}</p>
      <button type="button" onClick={() => onOpenChange?.(!defaultOpen)}>
        toggle section
      </button>
      {children}
    </section>
  ),
}));

vi.mock("@shared/components/ui/InsightCard", () => ({
  InsightCard: ({
    title,
    onActivate,
  }: {
    title: string;
    onActivate: () => void;
  }) => (
    <button type="button" onClick={onActivate}>
      {title}
    </button>
  ),
}));

vi.mock("../insights/AssistantAdviceCard", () => ({
  AssistantAdviceCard: ({
    insight,
    loading,
    error,
    onRefresh,
    adviceId,
    sectionOpen,
  }: {
    insight: string | null;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    adviceId?: string | null;
    sectionOpen?: boolean;
  }) => (
    <div
      data-testid="assistant-advice"
      data-advice-id={adviceId ?? ""}
      data-section-open={String(sectionOpen)}
    >
      {loading ? "loading" : (error ?? insight)}
      <button type="button" onClick={onRefresh}>
        refresh advice
      </button>
    </div>
  ),
}));

vi.mock("../onboarding/DailyNudge", () => ({
  DailyNudge: ({
    onDismiss,
  }: {
    nudge: NudgeDefinition;
    sessionDays: number;
    onDismiss: () => void;
  }) => (
    <button type="button" onClick={onDismiss}>
      dismiss nudge
    </button>
  ),
}));

vi.mock("../insights/WeeklyDigestCard", () => ({
  WeeklyDigestCard: ({
    onCollapse,
    surface,
    sectionOpen,
  }: {
    onCollapse: () => void;
    surface?: string;
    sectionOpen?: boolean;
  }) => (
    <button
      type="button"
      onClick={onCollapse}
      data-surface={surface}
      data-section-open={String(sectionOpen)}
    >
      collapse digest
    </button>
  ),
}));

function props(
  overrides: Partial<HubInsightsBlockProps> = {},
): HubInsightsBlockProps {
  return {
    insightsDefaultOpen: true,
    insightsOpen: true,
    onInsightsOpenChange: vi.fn(),
    coachLoading: false,
    coachError: null,
    coachInsightText: "coach insight",
    coachAdviceId: "advice-42",
    coachRefresh: vi.fn(),
    digestFresh: true,
    activeNudge: { id: "nudge-1" } as NudgeDefinition,
    reengagementShow: false,
    sessionDays: 3,
    dismissNudge: vi.fn(),
    digestExpanded: false,
    setDigestExpanded: vi.fn(),
    showDigestFooter: true,
    ...overrides,
  };
}

describe("HubInsightsBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("wires nudge, advice, and digest footer", () => {
    const blockProps = props();
    render(<HubInsightsBlock {...blockProps} />);

    fireEvent.click(screen.getByText("dismiss nudge"));
    fireEvent.click(screen.getByText("refresh advice"));
    // Реальний WeeklyDigestFooter (не застаблений — тримаємо мок-бюджет),
    // текст кнопки — "Звіт тижня".
    fireEvent.click(screen.getByRole("button", { name: /Звіт тижня/ }));

    expect(blockProps.dismissNudge).toHaveBeenCalledTimes(1);
    expect(blockProps.coachRefresh).toHaveBeenCalledTimes(1);
    expect(blockProps.setDigestExpanded).toHaveBeenCalledWith(true);
  });

  it("shows the expanded digest card and suppresses nudge during re-engagement", () => {
    const blockProps = props({ digestExpanded: true, reengagementShow: true });
    render(<HubInsightsBlock {...blockProps} />);

    expect(screen.queryByText("dismiss nudge")).toBeNull();
    fireEvent.click(screen.getByText("collapse digest"));

    expect(blockProps.setDigestExpanded).toHaveBeenCalledWith(false);
  });
  // ── Телеметрія AI-поради (W2-AI-ADVICE-EVENTS, стадія 1) ─────────────────
  //
  // Блок сам подій не емітить — він постачає дітям те, без чого impression
  // збрехав би: ідентичність поради і РЕАЛЬНИЙ стан розгорнутості секції.

  it("прокидає advice_id і стан секції в AssistantAdviceCard", () => {
    render(<HubInsightsBlock {...props({ insightsDefaultOpen: true })} />);

    const advice = screen.getByTestId("assistant-advice");
    expect(advice.getAttribute("data-advice-id")).toBe("advice-42");
    expect(advice.getAttribute("data-section-open")).toBe("true");
  });

  it("віддає вниз згортання секції — картка дізнається, що її не видно", () => {
    // Стан розгорнутості піднято в `HubDashboard` (PR-A1: та сама
    // відповідь потрібна батьківському хуку, щоб не палити AI-квоту на
    // пораду під закритим акордеоном). Тож компонент тепер КЕРОВАНИЙ, і
    // тест мусить тримати стан замість нього — інакше він перевіряв би
    // мок, а не проводку.
    function ControlledHost() {
      const [open, setOpen] = useState(true);
      return (
        <HubInsightsBlock
          {...props({
            insightsDefaultOpen: true,
            insightsOpen: open,
            onInsightsOpenChange: setOpen,
          })}
        />
      );
    }

    render(<ControlledHost />);

    fireEvent.click(screen.getByText("toggle section"));

    expect(
      screen.getByTestId("assistant-advice").getAttribute("data-section-open"),
    ).toBe("false");
  });

  it("позначає дайджест на дашборді як окрему поверхню й ділиться станом секції", () => {
    render(<HubInsightsBlock {...props({ digestExpanded: true })} />);

    const digest = screen.getByText("collapse digest");
    expect(digest.getAttribute("data-surface")).toBe("hub_dashboard");
    expect(digest.getAttribute("data-section-open")).toBe("true");
  });

  // Р23 спеки аналітики v2: локальний звіт тижня під AI-порадою, і підпис
  // згорнутого блоку не чекає моделі.
  it("renders the local week report below the AI advice and uses it as the loading subtitle", () => {
    weekReportState.lines = [
      "Найбільше за тиждень: Продукти, 807 ₴",
      "Виросло проти минулого тижня: Кафе, +120 ₴",
    ];
    render(
      <HubInsightsBlock
        {...props({ coachLoading: true, coachInsightText: null })}
      />,
    );
    const report = screen.getByRole("region", { name: "Тиждень у цифрах" });
    expect(within(report).getAllByRole("listitem")).toHaveLength(2);
    const advice = screen.getByTestId("assistant-advice");
    expect(
      advice.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("collapsed-subtitle")).toHaveTextContent(
      "Найбільше за тиждень: Продукти, 807 ₴",
    );
    weekReportState.lines = [];
  });

  it("hides the money week report when Finyk is not an active module", () => {
    weekReportState.lines = ["Найбільше за тиждень: Продукти, 807 ₴"];
    weekReportState.enabledArgs = [];
    render(
      <HubInsightsBlock
        {...props({ coachLoading: true, coachInsightText: null })}
        finykActive={false}
      />,
    );
    expect(weekReportState.enabledArgs.at(-1)).toBe(false);
    expect(
      screen.queryByRole("region", { name: "Тиждень у цифрах" }),
    ).toBeNull();
    expect(screen.getByTestId("collapsed-subtitle")).toHaveTextContent(
      "Готую пораду Сержанта…",
    );
    weekReportState.lines = [];
  });
});
