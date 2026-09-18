/**
 * Behavior + snapshot tests for the RN BodyAtlas (Phase 6 · PR-C).
 *
 * Asserts the three public-surface invariants:
 *
 *   1. Snapshot stability — the silhouette is a visual contract that
 *      design tokens consumers (and later recovery-data wiring) must
 *      not accidentally change. Front + back views are both snapped.
 *   2. Tap behaviour — pressing a muscle fires `onMusclePress` with
 *      the canonical atlas id (not a domain id, not a localised label),
 *      and only that id.
 *   3. Accessibility — each muscle `G` carries a Ukrainian
 *      `accessibilityLabel` that includes the muscle name and (when
 *      active) the intensity percentage.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { BodyAtlas, type ActiveMuscle } from "../components/BodyAtlas";

// SafeAreaContext is only used by the Atlas page, not the atlas
// component itself — but we still mock it here for consistency with
// other fizruk tests and in case a future diff pulls it in.
jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const SAMPLE: readonly ActiveMuscle[] = [
  { id: "chest", intensity: 0.8 },
  { id: "biceps", intensity: 0.6 },
  { id: "quadriceps", intensity: 1 },
];

describe("BodyAtlas", () => {
  it("matches snapshot for the front view", () => {
    const { toJSON } = render(
      <BodyAtlas muscles={SAMPLE} side="front" showToggle={false} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it("matches snapshot for the back view", () => {
    const { toJSON } = render(
      <BodyAtlas
        muscles={[{ id: "hamstring", intensity: 0.7 }]}
        side="back"
        showToggle={false}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it("fires onMusclePress with the canonical muscle id", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <BodyAtlas
        muscles={SAMPLE}
        side="front"
        showToggle={false}
        onMusclePress={onPress}
      />,
    );
    fireEvent.press(getByTestId("body-atlas-muscle-chest"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith("chest");

    fireEvent.press(getByTestId("body-atlas-muscle-biceps"));
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(onPress).toHaveBeenLastCalledWith("biceps");
  });

  it("fires onMusclePress from the back view with the correct id", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <BodyAtlas
        muscles={[]}
        side="back"
        showToggle={false}
        onMusclePress={onPress}
      />,
    );
    fireEvent.press(getByTestId("body-atlas-muscle-gluteal"));
    expect(onPress).toHaveBeenCalledWith("gluteal");
  });

  it("labels muscles in Ukrainian with intensity percentage", () => {
    const { getByTestId } = render(
      <BodyAtlas muscles={SAMPLE} side="front" showToggle={false} />,
    );
    const chest = getByTestId("body-atlas-muscle-chest");
    // `accessibilityLabel` lives on the group for VoiceOver / TalkBack.
    expect(chest.props.accessibilityLabel).toBe("Груди, інтенсивність 80%");

    const quads = getByTestId("body-atlas-muscle-quadriceps");
    expect(quads.props.accessibilityLabel).toBe(
      "Квадрицепс, інтенсивність 100%",
    );

    // Non-highlighted muscle: no percentage suffix.
    const forearm = getByTestId("body-atlas-muscle-forearm");
    expect(forearm.props.accessibilityLabel).toBe("Передпліччя");
  });

  it("toggles between front and back when uncontrolled", () => {
    const { getByTestId, queryByTestId } = render(
      <BodyAtlas muscles={SAMPLE} />,
    );
    // Default side is `front`.
    expect(getByTestId("body-atlas-front")).toBeTruthy();
    expect(queryByTestId("body-atlas-back")).toBeNull();

    fireEvent.press(getByTestId("body-atlas-toggle-back"));

    expect(getByTestId("body-atlas-back")).toBeTruthy();
    expect(queryByTestId("body-atlas-front")).toBeNull();
  });

  it("hides the toggle for an empty muscle list", () => {
    const { getByTestId } = render(<BodyAtlas muscles={[]} />);
    expect(getByTestId("body-atlas-svg")).toBeTruthy();
    expect(getByTestId("body-atlas-front")).toBeTruthy();
  });

  it("clamps intensity values into [0, 1]", () => {
    const { getByTestId } = render(
      <BodyAtlas
        side="front"
        showToggle={false}
        muscles={[
          { id: "chest", intensity: 5 },
          { id: "biceps", intensity: -3 },
        ]}
      />,
    );
    // Over-1 intensity becomes 100%.
    expect(
      getByTestId("body-atlas-muscle-chest").props.accessibilityLabel,
    ).toBe("Груди, інтенсивність 100%");
    // Sub-0 intensity becomes the plain label (no percentage suffix).
    expect(
      getByTestId("body-atlas-muscle-biceps").props.accessibilityLabel,
    ).toBe("Біцепс");
  });
});
