// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TodayFocusCard, useDashboardFocus } from "./TodayFocusCard";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the recommendation engine so we control what recs are returned
const generateRecommendationsMock = vi.fn<
  () => Array<{
    id: string;
    module: string;
    priority: number;
    severity?: string;
    icon: string;
    title: string;
    body: string;
    action: string;
    pwaAction?: string;
  }>
>(() => []);

vi.mock("../lib/recommendationEngine", () => ({
  generateRecommendations: (...args: unknown[]) =>
    generateRecommendationsMock(...(args as [])),
}));

// Mock hubNav so we can verify dispatches without real DOM events
const openHubModuleWithActionMock = vi.fn();
vi.mock("@shared/lib/hubNav", () => ({
  openHubModule: vi.fn(),
  openHubModuleWithAction: (...args: unknown[]) =>
    openHubModuleWithActionMock(...args),
  HUB_OPEN_MODULE_EVENT: "hub:open-module",
}));

// Mock moduleQuickActions
vi.mock("@shared/lib/moduleQuickActions", () => ({
  MODULE_PRIMARY_ACTION: {
    finyk: {
      label: "Додати витрату",
      shortLabel: "+ Витрата",
      action: "add_expense",
    },
    fizruk: {
      label: "Почати тренування",
      shortLabel: "+ Тренування",
      action: "start_workout",
    },
    routine: {
      label: "Додати звичку",
      shortLabel: "+ Звичка",
      action: "add_habit",
    },
    nutrition: {
      label: "Додати прийом їжі",
      shortLabel: "+ Їжа",
      action: "add_meal",
    },
  },
  getModulePrimaryAction: (moduleId: string) => {
    const map: Record<
      string,
      { label: string; shortLabel: string; action: string }
    > = {
      finyk: {
        label: "Додати витрату",
        shortLabel: "+ Витрата",
        action: "add_expense",
      },
      fizruk: {
        label: "Почати тренування",
        shortLabel: "+ Тренування",
        action: "start_workout",
      },
      routine: {
        label: "Додати звичку",
        shortLabel: "+ Звичка",
        action: "add_habit",
      },
      nutrition: {
        label: "Додати прийом їжі",
        shortLabel: "+ Їжа",
        action: "add_meal",
      },
    };
    return map[moduleId] || null;
  },
}));

// Stub Icon and SectionHeading to simplify rendering
vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
vi.mock("@shared/components/ui/SectionHeading", () => ({
  SectionHeading: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    as?: string;
    size?: string;
    variant?: string;
    className?: string;
  }) => (
    <span data-testid="section-heading" {...rest}>
      {children}
    </span>
  ),
}));

// ---------------------------------------------------------------------------
// TodayFocusCard — component rendering tests
// ---------------------------------------------------------------------------

describe("TodayFocusCard", () => {
  const onAction = vi.fn();
  const onDismiss = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    generateRecommendationsMock.mockReturnValue([]);
    onAction.mockClear();
    onDismiss.mockClear();
    openHubModuleWithActionMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it("рендерить порожній стан (EmptyFocus) коли focus=null", () => {
    render(
      <TodayFocusCard focus={null} onAction={onAction} onDismiss={onDismiss} />,
    );

    expect(screen.getByText("Що зафіксуємо?")).toBeTruthy();
    expect(
      screen.getByText("Один тап — один запис. Обери модуль і продовжуй."),
    ).toBeTruthy();
  });

  it("EmptyFocus показує 4 quick-add чипи для модулів", () => {
    render(
      <TodayFocusCard focus={null} onAction={onAction} onDismiss={onDismiss} />,
    );

    // Check for module quick-add buttons by role
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent?.trim());
    expect(labels).toContain("Витрата");
    expect(labels).toContain("Тренування");
    expect(labels).toContain("Звичка");
    expect(labels).toContain("Їжа");
  });

  it("click на quick-add чип запускає openHubModuleWithAction", () => {
    render(
      <TodayFocusCard focus={null} onAction={onAction} onDismiss={onDismiss} />,
    );

    const buttons = screen.getAllByRole("button");
    const finykBtn = buttons.find((b) => b.textContent?.trim() === "Витрата");
    expect(finykBtn).toBeDefined();
    fireEvent.click(finykBtn!);
    expect(openHubModuleWithActionMock).toHaveBeenCalledWith(
      "finyk",
      "add_expense",
    );
  });

  // -----------------------------------------------------------------------
  // Focus card with recommendation
  // -----------------------------------------------------------------------

  it("рендерить фокус-картку з title та body рекомендації", () => {
    const focus = {
      id: "budget_over_food",
      module: "finyk" as const,
      severity: "danger" as const,
      title: 'Бюджет "Продукти" перевищено на 80%',
      body: "Витрачено 900 ₴ з 500 ₴",
      icon: "💸",
      action: "finyk",
      pwaAction: "add_expense" as const,
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    expect(
      screen.getByText(/Бюджет "Продукти" перевищено на 80%/),
    ).toBeTruthy();
    expect(screen.getByText("Витрачено 900 ₴ з 500 ₴")).toBeTruthy();
  });

  it("danger severity додає відповідне стилізування", () => {
    const focus = {
      id: "budget_over_food",
      module: "finyk" as const,
      severity: "danger" as const,
      title: "Бюджет перевищено",
      body: "Дані",
      icon: "💸",
      action: "finyk",
    };

    const { container } = render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    // The card should have danger-themed wash class
    const card = container.firstElementChild;
    expect(card?.className).toContain("bg-danger");
  });

  it("warning severity застосовує warning стилізування", () => {
    const focus = {
      id: "budget_warn_cafe",
      module: "finyk" as const,
      severity: "warning" as const,
      title: "Ліміт майже вичерпано",
      body: "95% бюджету",
      icon: "⚠️",
      action: "finyk",
    };

    const { container } = render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    const card = container.firstElementChild;
    expect(card?.className).toContain("bg-warning");
  });

  it("рендерить іконку рекомендації", () => {
    const focus = {
      id: "fizruk_long_break",
      module: "fizruk" as const,
      title: "10 днів без тренування",
      body: "Пора відновити активність!",
      icon: "🏋️",
      action: "fizruk",
      pwaAction: "start_workout" as const,
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("🏋️")).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // CTA buttons
  // -----------------------------------------------------------------------

  it("click на primary CTA з pwaAction запускає openHubModuleWithAction", () => {
    const focus = {
      id: "fizruk_long_break",
      module: "fizruk" as const,
      title: "10 днів без тренування",
      body: "Пора тренуватися",
      icon: "🏋️",
      action: "fizruk",
      pwaAction: "start_workout" as const,
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    // Primary CTA — find button that contains the CTA label (not secondary)
    const buttons = screen.getAllByRole("button");
    const primaryBtn = buttons.find((b) =>
      b.textContent?.includes("Почати тренування"),
    );
    expect(primaryBtn).toBeDefined();
    fireEvent.click(primaryBtn!);
    expect(openHubModuleWithActionMock).toHaveBeenCalledWith(
      "fizruk",
      "start_workout",
    );
  });

  it("click на primary CTA без pwaAction запускає onAction", () => {
    const focus = {
      id: "spending_velocity_high",
      module: "finyk" as const,
      title: "Витрати на 50% вище",
      body: "За такий же проміжок",
      icon: "📈",
      action: "finyk",
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    const buttons = screen.getAllByRole("button");
    const primaryBtn = buttons.find((b) =>
      b.textContent?.includes("Відкрити Фінік"),
    );
    expect(primaryBtn).toBeDefined();
    fireEvent.click(primaryBtn!);
    expect(onAction).toHaveBeenCalledWith("finyk");
  });

  it("рекомендація з pwaAction показує secondary кнопку 'Відкрити <модуль>'", () => {
    const focus = {
      id: "nutrition_no_meals",
      module: "nutrition" as const,
      title: "Немає записів",
      body: "Зафіксуй їжу",
      icon: "🥗",
      action: "nutrition",
      pwaAction: "add_meal" as const,
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    const secondaryBtn = screen.getByText("Відкрити Харчування");
    fireEvent.click(secondaryBtn);
    expect(onAction).toHaveBeenCalledWith("nutrition");
  });

  it("кнопка 'Пізніше' дисмісить рекомендацію", () => {
    const focus = {
      id: "routine_evening_reminder",
      module: "routine" as const,
      title: "2 звичок ще не виконано",
      body: "Вечір — ще не пізно",
      icon: "✅",
      action: "routine",
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Закрити підказку" }));
    expect(onDismiss).toHaveBeenCalledWith("routine_evening_reminder");
  });

  // -----------------------------------------------------------------------
  // Module-specific rendering
  // -----------------------------------------------------------------------

  it("рендерить fizruk рекомендацію з правильним module accent", () => {
    const focus = {
      id: "fizruk_muscle_chest",
      module: "fizruk" as const,
      title: "Груди не тренували 12 днів",
      body: "Включи вправи на ці мʼязи",
      icon: "💪",
      action: "fizruk",
      pwaAction: "start_workout" as const,
    };

    const { container } = render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    // Accent bar should use fizruk module color
    const accentBar = container.querySelector('[aria-hidden="true"]');
    expect(accentBar?.className).toContain("bg-fizruk");
  });

  it("рендерить routine рекомендацію", () => {
    const focus = {
      id: "routine_streak_7",
      module: "routine" as const,
      title: "7 днів поспіль! Вогонь!",
      body: "Неймовірна серія!",
      icon: "🔥",
      action: "routine",
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText(/7 днів поспіль/)).toBeTruthy();
    expect(screen.getByText("🔥")).toBeTruthy();
  });

  it("рендерить nutrition рекомендацію з add_meal action", () => {
    const focus = {
      id: "nutrition_kcal_low",
      module: "nutrition" as const,
      title: "Лише 400 ккал з 2000 ккал цілі",
      body: "Недостатнє споживання калорій",
      icon: "⚡",
      action: "nutrition",
      pwaAction: "add_meal" as const,
    };

    render(
      <TodayFocusCard
        focus={focus}
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText(/400 ккал/)).toBeTruthy();
    const buttons = screen.getAllByRole("button");
    const primaryBtn = buttons.find((b) =>
      b.textContent?.includes("Додати прийом їжі"),
    );
    expect(primaryBtn).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// useDashboardFocus — hook integration tests
// ---------------------------------------------------------------------------

describe("useDashboardFocus", () => {
  beforeEach(() => {
    localStorage.clear();
    generateRecommendationsMock.mockReturnValue([]);
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("повертає focus=null та rest=[] при порожніх рекомендаціях", () => {
    generateRecommendationsMock.mockReturnValue([]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus).toBeNull();
    expect(result.current.rest).toEqual([]);
  });

  it("повертає найвищий priority рекомендацію як focus", () => {
    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "High priority",
        body: "body",
        action: "finyk",
      },
      {
        id: "r2",
        module: "fizruk",
        priority: 50,
        icon: "🏋️",
        title: "Low priority",
        body: "body",
        action: "fizruk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus?.id).toBe("r1");
    expect(result.current.rest).toHaveLength(1);
    expect(result.current.rest[0].id).toBe("r2");
  });

  it("dismiss приховує рекомендацію", () => {
    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "Rec 1",
        body: "body",
        action: "finyk",
      },
      {
        id: "r2",
        module: "fizruk",
        priority: 50,
        icon: "🏋️",
        title: "Rec 2",
        body: "body",
        action: "fizruk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus?.id).toBe("r1");

    act(() => {
      result.current.dismiss("r1");
    });

    // After dismiss, r2 becomes focus
    expect(result.current.focus?.id).toBe("r2");
    expect(result.current.rest).toHaveLength(0);
  });

  it("dismiss зберігає стан у localStorage", () => {
    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "Rec 1",
        body: "body",
        action: "finyk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    act(() => {
      result.current.dismiss("r1");
    });

    const stored = JSON.parse(
      localStorage.getItem("hub_recs_dismissed_v1") || "{}",
    );
    expect(stored["r1"]).toBeDefined();
    expect(typeof stored["r1"]).toBe("number");
  });

  it("dismissed рекомендації не зʼявляються повторно", () => {
    // Pre-set dismissed state
    localStorage.setItem(
      "hub_recs_dismissed_v1",
      JSON.stringify({ r1: Date.now() }),
    );

    generateRecommendationsMock.mockReturnValue([
      {
        id: "r1",
        module: "finyk",
        priority: 90,
        icon: "💸",
        title: "Should be hidden",
        body: "body",
        action: "finyk",
      },
      {
        id: "r2",
        module: "fizruk",
        priority: 50,
        icon: "🏋️",
        title: "Visible",
        body: "body",
        action: "fizruk",
      },
    ]);

    const { result } = renderHook(() => useDashboardFocus());

    expect(result.current.focus?.id).toBe("r2");
    expect(result.current.rest).toHaveLength(0);
  });
});
