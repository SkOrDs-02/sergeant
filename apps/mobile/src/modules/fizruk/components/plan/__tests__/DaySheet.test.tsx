/**
 * Presentational coverage for the PlanCalendar day sheet.
 */
import { fireEvent, render } from "@testing-library/react-native";

import type {
  DayRecoveryForecast,
  PlannedWorkoutLike,
} from "@sergeant/fizruk-domain/domain/plan/index";
import type { WorkoutTemplate } from "@sergeant/fizruk-domain/domain/types";

import { DaySheet } from "../DaySheet";

const TEMPLATES: WorkoutTemplate[] = [
  {
    id: "tpl-push",
    name: "Push day",
    exerciseIds: ["bench"],
    groups: [],
    updatedAt: "2026-05-07T08:00:00.000Z",
  },
  {
    id: "tpl-pull",
    name: "Pull day",
    exerciseIds: ["row"],
    groups: [],
    updatedAt: "2026-05-07T09:00:00.000Z",
  },
];

const PLANNED: PlannedWorkoutLike[] = [
  {
    id: "w1",
    planned: true,
    startedAt: "2026-05-07T08:30:00.000Z",
    note: "Ранкова сила",
    items: [
      { id: "i1", nameUk: "Жим лежачи" },
      { id: "i2", name: "Cable row" },
      { id: "i3" },
    ],
  },
  {
    id: "w2",
    planned: true,
    startedAt: null,
    note: "",
    items: [],
  },
];

const FORECAST: DayRecoveryForecast = {
  dateKey: "2026-05-07",
  status: "overworked",
  overworkedMuscles: [
    { id: "chest", label: "Груди", status: "red", daysSince: 1 },
  ],
  recoveredMuscles: [
    { id: "back", label: "Спина", status: "green", daysSince: 3 },
  ],
  noRecentTraining: false,
};

describe("DaySheet", () => {
  it("renders recovery, planned workouts, and applies template choices", () => {
    const onApply = jest.fn();
    const { getByLabelText, getByText, getByTestId } = render(
      <DaySheet
        templateId="tpl-push"
        planned={PLANNED}
        forecast={FORECAST}
        templates={TEMPLATES}
        onApply={onApply}
      />,
    );

    expect(getByTestId("plan-recovery-summary-overworked")).toBeTruthy();
    expect(getByText("Відновлення: перевантаження")).toBeTruthy();
    expect(getByText(/Перевантажені:.*Груди/)).toBeTruthy();
    expect(getByText(/Відновлені:.*Спина/)).toBeTruthy();
    expect(getByText("🏋 Заплановані тренування")).toBeTruthy();
    expect(getByText(/Ранкова сила/)).toBeTruthy();
    expect(getByText("Жим лежачи · Cable row")).toBeTruthy();
    expect(getByText("Тренування")).toBeTruthy();
    expect(getByText("Push day")).toBeTruthy();
    expect(getByText("Pull day")).toBeTruthy();

    fireEvent.press(getByLabelText("Без плану"));
    fireEvent.press(getByLabelText("Pull day"));

    expect(onApply).toHaveBeenNthCalledWith(1, null);
    expect(onApply).toHaveBeenNthCalledWith(2, "tpl-pull");
  });

  it("shows the template setup hint when no templates exist", () => {
    const { getByText, queryByText } = render(
      <DaySheet
        templateId={null}
        planned={[]}
        forecast={null}
        templates={[]}
        onApply={jest.fn()}
      />,
    );

    expect(queryByText("🏋 Заплановані тренування")).toBeNull();
    expect(
      getByText("Спочатку створи шаблон у «Тренування → Шаблони»."),
    ).toBeTruthy();
  });
});
