/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoriesProgressHeader } from "../components/StoriesProgressHeader";
import { renderSlide } from "../components/slides";
import type {
  FinykSlideData,
  FizrukSlideData,
  NutritionSlideData,
  RoutineSlideData,
  Slide,
} from "../types";

const baseSlide = {
  id: "intro",
  kind: "intro",
  label: "Старт",
  bg: "from-brand to-brand-strong",
  weekRange: "20–26 липня",
} satisfies Slide;

describe("story slide components", () => {
  afterEach(() => cleanup());

  it("renders the intro and overall slides through the router", () => {
    const { rerender } = render(<>{renderSlide(baseSlide)}</>);
    expect(screen.getByText("Твій тиждень")).toBeInTheDocument();
    expect(screen.getByText("20–26 липня")).toBeInTheDocument();

    rerender(
      <>
        {renderSlide({
          ...baseSlide,
          id: "overall",
          kind: "overall",
          label: "Підсумок",
          recommendations: ["Заплануй тренування", "Поповни бюджет"],
        })}
      </>,
    );

    expect(screen.getByText("Що робити далі")).toBeInTheDocument();
    expect(screen.getByText("Заплануй тренування")).toBeInTheDocument();
    expect(screen.getByText("Поповни бюджет")).toBeInTheDocument();
  });

  it("renders Finyk slide top categories and AI summary", () => {
    const slide: FinykSlideData = {
      ...baseSlide,
      id: "finyk",
      kind: "finyk",
      label: "Фінік",
      agg: {
        totalSpent: 1500,
        totalIncome: 2200,
        txCount: 8,
        monthlyBudget: null,
        topCategories: [
          { name: "Кава", amount: 600 },
          { name: "Таксі", amount: 300 },
          { name: "Їжа", amount: 150 },
          { name: "Книги", amount: 50 },
        ],
      },
      ai: {
        summary: "Кава тягне тиждень вгору.",
        comment: "Перевір денний ліміт.",
      },
    };

    render(<>{renderSlide(slide)}</>);

    expect(screen.getByText("Кава")).toBeInTheDocument();
    expect(screen.getByText("Таксі")).toBeInTheDocument();
    expect(screen.getByText("Їжа")).toBeInTheDocument();
    expect(screen.queryByText("Книги")).not.toBeInTheDocument();
    expect(screen.getByText("Кава тягне тиждень вгору.")).toBeInTheDocument();
    expect(screen.getByText("Перевір денний ліміт.")).toBeInTheDocument();
  });

  it("renders Fizruk slide exercises and recovery label", () => {
    const slide: FizrukSlideData = {
      ...baseSlide,
      id: "fizruk",
      kind: "fizruk",
      label: "Фізрук",
      agg: {
        workoutsCount: 3,
        totalVolume: 12345,
        recoveryLabel: "Відновлення добре",
        topExercises: [
          { name: "Жим", totalVolume: 5000 },
          { name: "Присід", totalVolume: 4200 },
          { name: "Тяга", totalVolume: 3000 },
          { name: "Планка", totalVolume: 145 },
        ],
      },
    };

    render(<>{renderSlide(slide)}</>);

    expect(screen.getByText("Головні вправи")).toBeInTheDocument();
    expect(screen.getByText("Жим")).toBeInTheDocument();
    expect(screen.getByText("Присід")).toBeInTheDocument();
    expect(screen.getByText("Тяга")).toBeInTheDocument();
    expect(screen.queryByText("Планка")).not.toBeInTheDocument();
    expect(screen.getByText("Відновлення добре")).toBeInTheDocument();
  });

  it("renders Nutrition slide capped kcal progress and macro stats", () => {
    const slide: NutritionSlideData = {
      ...baseSlide,
      id: "nutrition",
      kind: "nutrition",
      label: "Їжа",
      agg: {
        avgKcal: 1500,
        targetKcal: 1000,
        avgProtein: 120,
        avgFat: 70,
        avgCarbs: 180,
        daysLogged: 5,
      },
      ai: { summary: "Білок стабільний." },
    };
    const { container } = render(<>{renderSlide(slide)}</>);

    expect(
      screen.getByText("140% від цілі · залоговано 5 / 7 днів"),
    ).toBeInTheDocument();
    expect(screen.getByText("Білки")).toBeInTheDocument();
    expect(screen.getByText("Жири")).toBeInTheDocument();
    expect(screen.getByText("Вугл.")).toBeInTheDocument();
    expect(screen.getByText("Білок стабільний.")).toBeInTheDocument();
    expect(container.querySelector('[style="width: 100%;"]')).toBeTruthy();
  });

  it("renders Routine slide top habits sorted by completion rate", () => {
    const slide: RoutineSlideData = {
      ...baseSlide,
      id: "routine",
      kind: "routine",
      label: "Рутина",
      agg: {
        habitCount: 4,
        overallRate: 72,
        habits: [
          { name: "Вода", done: 4, total: 7, completionRate: 57 },
          { name: "Сон", done: 7, total: 7, completionRate: 100 },
          { name: "Читання", done: 5, total: 7, completionRate: 71 },
          { name: "Розтяжка", done: 1, total: 7, completionRate: 14 },
        ],
      },
      ai: { summary: "Сон — найсильніша звичка.", comment: "Тримай темп." },
    };

    render(<>{renderSlide(slide)}</>);

    expect(screen.getByText("Сон")).toBeInTheDocument();
    expect(screen.getByText("Читання")).toBeInTheDocument();
    expect(screen.getByText("Вода")).toBeInTheDocument();
    expect(screen.queryByText("Розтяжка")).not.toBeInTheDocument();
    expect(screen.getByText("7/7")).toBeInTheDocument();
    expect(screen.getByText("Сон — найсильніша звичка.")).toBeInTheDocument();
    expect(screen.getByText("Тримай темп.")).toBeInTheDocument();
  });

  it("returns null for an unknown slide kind", () => {
    const { container } = render(
      <>
        {renderSlide({
          ...baseSlide,
          id: "unknown",
          kind: "unknown",
        } as unknown as Slide)}
      </>,
    );

    expect(container.firstChild).toBeNull();
  });
});

describe("StoriesProgressHeader", () => {
  afterEach(() => cleanup());

  it("shows active progress, week range, and closes from the header button", () => {
    const onClose = vi.fn();
    render(
      <StoriesProgressHeader
        slides={[
          baseSlide,
          { ...baseSlide, id: "nutrition", kind: "nutrition", label: "Їжа" },
          { ...baseSlide, id: "overall", kind: "overall", label: "Підсумок" },
        ]}
        currentIndex={1}
        progress={37}
        paused={false}
        activeLabel="Їжа"
        weekRange="20–26 липня"
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Дайджест · Їжа")).toBeInTheDocument();
    expect(screen.getByText("20–26 липня")).toBeInTheDocument();
    expect(screen.getByTestId("active-story-progress")).toHaveStyle({
      width: "37%",
      transition: "width 50ms linear",
    });

    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("removes active progress transition while paused", () => {
    render(
      <StoriesProgressHeader
        slides={[baseSlide]}
        currentIndex={0}
        progress={80}
        paused
        activeLabel="Старт"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("active-story-progress")).toHaveStyle({
      width: "80%",
      transition: "none",
    });
  });
});
