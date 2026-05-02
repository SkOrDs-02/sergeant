/**
 * Smoke test for the mobile `RoutineSpikeSection`.
 *
 * Mirrors `apps/web/src/core/settings/RoutineSpikeSection.test.tsx` —
 * verifies the flag-gate (panel mounts only when
 * `feature.routine.sqlite_v2` is on).
 */

import { fireEvent, render } from "@testing-library/react-native";

import { _getMMKVInstance, safeWriteLS } from "@/lib/storage";
import { FLAGS_KEY } from "../lib/featureFlags";

// Stub the panel so we can assert mount/unmount without spinning up
// the SPIKE library or expo-sqlite.
//
// `jest.mock` factories are hoisted above imports, so the factory
// cannot close over a top-level `Text` import — the standard pattern
// is to load `react-native` lazily inside the factory body. The
// `@typescript-eslint/no-require-imports` rule is suspended for that
// one line because there is no static-import alternative that
// satisfies the hoisting constraint.
jest.mock("../../modules/routine/components/RoutineSpikeDevPanel", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native") as typeof import("react-native");
  return {
    __esModule: true,
    RoutineSpikeDevPanel: () => (
      <Text testID="routine-spike-dev-panel-stub">PANEL_MOUNTED</Text>
    ),
  };
});

import { RoutineSpikeSection } from "./RoutineSpikeSection";

describe("RoutineSpikeSection (mobile)", () => {
  beforeEach(() => {
    _getMMKVInstance().clearAll();
  });

  // The mobile `SettingsGroup` mounts children only when the user
  // expands the card (cf. `apps/mobile/src/core/settings/SettingsPrimitives.tsx`),
  // so each spec presses the header before asserting on body content.
  function expand(getByLabelText: (label: string) => unknown) {
    fireEvent.press(getByLabelText("Routine SPIKE — dev panel") as never);
  }

  it("renders the disabled-state notice when the flag is off", () => {
    const { queryByTestId, getByText, getByLabelText } = render(
      <RoutineSpikeSection />,
    );
    expand(getByLabelText);
    expect(queryByTestId("routine-spike-dev-panel-stub")).toBeNull();
    expect(getByText("feature.routine.sqlite_v2")).toBeTruthy();
  });

  it("mounts the panel when the flag is on", () => {
    safeWriteLS(FLAGS_KEY, { "feature.routine.sqlite_v2": true });
    const { queryByText, getByTestId, getByLabelText } = render(
      <RoutineSpikeSection />,
    );
    expand(getByLabelText);
    expect(getByTestId("routine-spike-dev-panel-stub")).toBeTruthy();
    expect(queryByText(/вимкнений/)).toBeNull();
  });
});
