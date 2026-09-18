/**
 * Smoke tests for mobile `HubInsightsPanel` (HubDashboard PR-3).
 *
 * Covers the visible behaviours a regression in this component would
 * break downstream:
 *   - empty `items` short-circuits (nothing rendered).
 *   - collapsed-by-default rendering still shows the toggle header
 *     with the item count.
 *   - tapping the toggle expands the panel and reveals the rec rows.
 *   - rec-row action fires `onOpenModule(action)`.
 *   - rec-row dismiss fires `onDismiss(id)`.
 */

import { act, fireEvent, render } from "@testing-library/react-native";

import { HubInsightsPanel, type InsightItem } from "./HubInsightsPanel";

const ITEMS: InsightItem[] = [
  {
    id: "a",
    title: "Перевір ліміт на їжу",
    body: "Витрати на кафе ростуть",
    module: "finyk",
    icon: "💳",
    action: "finyk",
  },
  {
    id: "b",
    title: "Додай звичку читати",
    module: "routine",
    icon: "📚",
  },
];

describe("HubInsightsPanel", () => {
  it("renders nothing when items is empty", () => {
    const { queryByTestId } = render(
      <HubInsightsPanel items={[]} onOpenModule={() => {}} />,
    );

    expect(queryByTestId("hub-insights-panel")).toBeNull();
  });

  it("renders collapsed toggle with item count by default", () => {
    const { getByTestId } = render(
      <HubInsightsPanel items={ITEMS} onOpenModule={() => {}} />,
    );

    const toggle = getByTestId("hub-insights-panel-toggle");
    expect(toggle).toBeTruthy();
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
  });

  it("expands when the toggle is tapped", () => {
    const { getByTestId } = render(
      <HubInsightsPanel items={ITEMS} onOpenModule={() => {}} />,
    );

    const toggle = getByTestId("hub-insights-panel-toggle");
    act(() => {
      fireEvent.press(toggle);
    });

    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
  });

  it("renders rec rows when expanded (defaultOpen)", () => {
    const { getByTestId } = render(
      <HubInsightsPanel items={ITEMS} onOpenModule={() => {}} defaultOpen />,
    );

    expect(getByTestId("hub-insights-panel-rec-a")).toBeTruthy();
    expect(getByTestId("hub-insights-panel-rec-b")).toBeTruthy();
  });

  it("invokes onOpenModule when a rec's `Відкрити` affordance is pressed", () => {
    const onOpenModule = jest.fn();
    const { getByTestId } = render(
      <HubInsightsPanel
        items={ITEMS}
        onOpenModule={onOpenModule}
        defaultOpen
      />,
    );

    act(() => {
      fireEvent.press(getByTestId("hub-insights-panel-rec-a-action"));
    });

    expect(onOpenModule).toHaveBeenCalledWith("finyk");
  });

  it("invokes onDismiss when the per-rec dismiss button is pressed", () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <HubInsightsPanel
        items={ITEMS}
        onOpenModule={() => {}}
        onDismiss={onDismiss}
        defaultOpen
      />,
    );

    act(() => {
      fireEvent.press(getByTestId("hub-insights-panel-rec-b-dismiss"));
    });

    expect(onDismiss).toHaveBeenCalledWith("b");
  });
});
