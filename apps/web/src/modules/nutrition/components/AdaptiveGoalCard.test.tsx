// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdaptiveGoalCard } from "./AdaptiveGoalCard";
import type { AdaptiveGoalState } from "../hooks/useAdaptiveNutritionGoal";

function state(overrides: Partial<AdaptiveGoalState>): AdaptiveGoalState {
  return {
    mode: "active",
    completeDays: 0,
    weightPoints: 0,
    lastUpdatedAt: null,
    lastReason: null,
    ...overrides,
  };
}

/** Знімок підстави з моменту зміни цілі. */
const REASON = {
  averageIntakeKcal: 2180,
  weightDeltaKg: -0.4,
  tdeeKcal: 2400,
  goalKcal: 2275,
};

// 2026-09-11: вмикач автокалібрування переїхав у Налаштування → Їжа, тож
// дашборд показує рядок лише коли є що робити — `active`/`disabled` мовчать.
describe("AdaptiveGoalCard", () => {
  it("renders nothing for 'active'", () => {
    const { container } = render(
      <AdaptiveGoalCard state={state({ mode: "active" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for 'disabled'", () => {
    const { container } = render(
      <AdaptiveGoalCard state={state({ mode: "disabled" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a compact row with progress for 'calibrating', no action button", () => {
    render(
      <AdaptiveGoalCard
        state={state({ mode: "calibrating", completeDays: 3, weightPoints: 2 })}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByText(/3\/10 повних днів/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an action for 'profile-needed' that calls onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    render(
      <AdaptiveGoalCard
        state={state({ mode: "profile-needed" })}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

/**
 * ПІДСТАВА ЗМІНИ ЦІЛІ.
 *
 * Спека обіцяла «людина бачить причину, не лише число», а картка в
 * режимі `active` робила `return null` — тобто мовчала рівно тоді, коли
 * ціль щойно змінилась. Рішення 2026-09-11 при цьому теж правильне:
 * ПОСТІЙНА картка «все гаразд» — це шум.
 *
 * Мирить їх вікно: пояснюємо подію, а не стан. Тому нижче перевіряється
 * саме межа вікна, а не факт рендеру — інакше тест не відрізнив би
 * «показуємо завжди» від «показуємо навколо зміни».
 */
describe("AdaptiveGoalCard — підстава зміни", () => {
  it("щойно після перерахунку показує три числа й нову ціль", () => {
    render(
      <AdaptiveGoalCard
        state={state({
          mode: "active",
          lastReason: REASON,
          lastUpdatedAt: new Date().toISOString(),
        })}
      />,
    );
    expect(screen.getByText(/2180/)).toBeInTheDocument();
    // Знак обовʼязковий: «0,4» і «−0,4» — протилежні за змістом.
    expect(screen.getByText(/−0,4/)).toBeInTheDocument();
    expect(screen.getByText(/2400/)).toBeInTheDocument();
    expect(screen.getByText(/2275/)).toBeInTheDocument();
  });

  it("через тиждень мовчить — постійна картка була б меблями", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const { container } = render(
      <AdaptiveGoalCard
        state={state({
          mode: "active",
          lastReason: REASON,
          lastUpdatedAt: eightDaysAgo,
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Без дати перерахунку показувати нема чого: підпис говорить про
  // ПОДІЮ, а не про стан.
  it("без дати перерахунку мовчить", () => {
    const { container } = render(
      <AdaptiveGoalCard
        state={state({ mode: "active", lastReason: REASON })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("«калібрується» лишається прогресом, а не підставою", () => {
    render(
      <AdaptiveGoalCard
        state={state({
          mode: "calibrating",
          completeDays: 3,
          weightPoints: 2,
          lastUpdatedAt: new Date().toISOString(),
        })}
      />,
    );
    expect(screen.getByText(/3\/10 повних днів/)).toBeInTheDocument();
  });
});

/**
 * Підстава — ЗНІМОК, а не живий перерахунок.
 *
 * Виміряний TDEE рахується з ковзного 14-денного вікна на кожен рендер.
 * Якщо картка читатиме живі числа, то через день після зміни вона
 * припише минулій зміні сьогоднішні виміри: «ціль оновлено, бо витрата
 * 2400» — тоді як 2400 уже інше число, а ціль з нього не виводилась.
 * Пояснення говорить про ПОДІЮ, і числа мусять бути з неї.
 */
describe("AdaptiveGoalCard — підстава не пливе", () => {
  it("показує знімок, а не те, що виміряно зараз", () => {
    render(
      <AdaptiveGoalCard
        state={state({
          mode: "active",
          lastReason: REASON,
          lastUpdatedAt: new Date().toISOString(),
        })}
      />,
    );
    expect(screen.getByText(/2180/)).toBeInTheDocument();
    expect(screen.getByText(/2275/)).toBeInTheDocument();
  });

  // Без знімка пояснювати нічим: половина підстави гірша за її
  // відсутність.
  it("без знімка мовчить, навіть одразу після зміни", () => {
    const { container } = render(
      <AdaptiveGoalCard
        state={state({
          mode: "active",
          lastReason: null,
          lastUpdatedAt: new Date().toISOString(),
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
