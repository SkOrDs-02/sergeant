/**
 * Render + interaction tests for the mobile `HabitHeatmap` component.
 *
 * Covers:
 *  - Renders HEATMAP_WEEKS × HEATMAP_DAYS cells when given any input;
 *  - Maps `HeatmapIntensity` buckets to the expected hex fills via the
 *    `testID`-addressable `<Rect>` elements;
 *  - Exposes the legend when no cell is selected, swaps to the details
 *    strip when a cell is pressed and clears selection on the close tap.
 */

import { fireEvent, render } from "@testing-library/react-native";

import {
  HEATMAP_DAYS,
  HEATMAP_WEEKS,
  type Habit,
  type RoutineState,
} from "@sergeant/routine-domain";

import { HabitHeatmap } from "./HabitHeatmap";

// Fixed "today" so date-key assertions are stable. 2025-01-15 is a Wed.
const TODAY = new Date(2025, 0, 15, 12, 0, 0, 0);

/**
 * Очікувані заливки. Значення навмисно вписані літералами, а не взяті з
 * `chartColors.routine`: інакше тест звіряв би джерело саме з собою і
 * пропустив би перестановку відтінків між рівнями. Ціна такого пінa —
 * ручна синхронізація, тому поруч стоїть точний токен-джерело.
 *
 * Три рожеві рівні тут були прострочені (`#ffd4cb` / `#ff8c78` /
 * `#f97066` — шкала до її перетюнінгу). Компонент читає токени, тож
 * помилявся саме фікстур; побачити це CI не міг, бо джоба `check`
 * вмирала раніше, на гейті каденсу свіжості.
 */
const INTENSITY_FILL_HEX = {
  future: "#f5ead8", // brandColors.cream[300]
  empty: "#faf3e8", // brandColors.cream[200]
  l1: "#fed3db", // brandColors.rose[200]
  l2: "#f68da4", // brandColors.rose[400]
  l3: "#eb7691", // brandColors.rose[500]
} as const;

/**
 * `react-native-svg` normalises fill strings through
 * `react-native/Libraries/StyleSheet/processColor` before storing them
 * on the rendered props, so `<Rect fill="#ffd4cb" />` shows up as
 * `{ payload: 0xFFFFD4CB, type: 0 }` in the test tree. Re-encode the
 * expected hex the same way so the comparisons stay tight.
 */
function expectedPayload(
  hex: (typeof INTENSITY_FILL_HEX)[keyof typeof INTENSITY_FILL_HEX],
): { payload: number; type: number } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bad hex fixture: ${hex}`);
  const rgb = Number.parseInt(m[1]!, 16);
  // AARRGGBB with alpha 0xFF — unsigned 32-bit.
  const payload = (0xff000000 | rgb) >>> 0;
  return { payload, type: 0 };
}

function habit(partial: Partial<Habit> & Pick<Habit, "id" | "name">): Habit {
  return {
    recurrence: "daily",
    archived: false,
    tagIds: [],
    categoryId: null,
    reminderTimes: [],
    weekdays: [],
    ...partial,
  };
}

describe("HabitHeatmap", () => {
  it("renders HEATMAP_WEEKS × HEATMAP_DAYS cells regardless of input", () => {
    const { queryAllByTestId } = render(
      <HabitHeatmap habits={[]} completions={{}} today={TODAY} />,
    );
    const cells = queryAllByTestId(/^habit-heatmap-cell-/);
    expect(cells).toHaveLength(HEATMAP_WEEKS * HEATMAP_DAYS);
  });

  it("renders the section title and the legend when nothing is selected", () => {
    const { getByText, getByTestId } = render(
      <HabitHeatmap habits={[]} completions={{}} today={TODAY} />,
    );
    expect(getByText("Активність за рік")).toBeTruthy();
    expect(getByTestId("habit-heatmap-legend")).toBeTruthy();
  });

  it("maps each intensity bucket to its token hex fill", () => {
    const habits = [
      habit({ id: "a", name: "A" }),
      habit({ id: "b", name: "B" }),
      habit({ id: "c", name: "C" }),
    ];
    const completions: RoutineState["completions"] = {
      a: ["2025-01-10", "2025-01-12", "2025-01-14"],
      b: ["2025-01-12", "2025-01-14"],
      c: ["2025-01-14"],
    };

    const { getByTestId } = render(
      <HabitHeatmap habits={habits} completions={completions} today={TODAY} />,
    );

    const cell = (dateKey: string) =>
      getByTestId(`habit-heatmap-cell-${dateKey}`);

    // 1/3 → l1.
    expect(cell("2025-01-10").props.fill).toEqual(
      expectedPayload(INTENSITY_FILL_HEX.l1),
    );
    // 2/3 → l2.
    expect(cell("2025-01-12").props.fill).toEqual(
      expectedPayload(INTENSITY_FILL_HEX.l2),
    );
    // 3/3 → l3.
    expect(cell("2025-01-14").props.fill).toEqual(
      expectedPayload(INTENSITY_FILL_HEX.l3),
    );
    // Past day without completions → empty.
    expect(cell("2025-01-11").props.fill).toEqual(
      expectedPayload(INTENSITY_FILL_HEX.empty),
    );
    // Day after today is future (Wed → Thu 2025-01-16).
    expect(cell("2025-01-16").props.fill).toEqual(
      expectedPayload(INTENSITY_FILL_HEX.future),
    );
  });

  it("swaps the legend for a details strip when a cell is tapped", () => {
    const habits = [habit({ id: "a", name: "A" })];
    const completions: RoutineState["completions"] = {
      a: ["2025-01-12"],
    };
    const { getByTestId, queryByTestId } = render(
      <HabitHeatmap habits={habits} completions={completions} today={TODAY} />,
    );

    fireEvent.press(getByTestId("habit-heatmap-cell-2025-01-12"));

    expect(getByTestId("habit-heatmap-details")).toBeTruthy();
    expect(queryByTestId("habit-heatmap-legend")).toBeNull();
  });

  it("clears the selection when the close button is pressed", () => {
    const habits = [habit({ id: "a", name: "A" })];
    const { getByTestId, queryByTestId } = render(
      <HabitHeatmap habits={habits} completions={{}} today={TODAY} />,
    );

    fireEvent.press(getByTestId("habit-heatmap-cell-2025-01-12"));
    expect(getByTestId("habit-heatmap-details")).toBeTruthy();

    fireEvent.press(getByTestId("habit-heatmap-details-close"));

    expect(queryByTestId("habit-heatmap-details")).toBeNull();
    expect(getByTestId("habit-heatmap-legend")).toBeTruthy();
  });

  it("tapping the same cell twice toggles it off", () => {
    const habits = [habit({ id: "a", name: "A" })];
    const { getByTestId, queryByTestId } = render(
      <HabitHeatmap habits={habits} completions={{}} today={TODAY} />,
    );

    fireEvent.press(getByTestId("habit-heatmap-cell-2025-01-12"));
    fireEvent.press(getByTestId("habit-heatmap-cell-2025-01-12"));

    expect(queryByTestId("habit-heatmap-details")).toBeNull();
    expect(getByTestId("habit-heatmap-legend")).toBeTruthy();
  });
});
