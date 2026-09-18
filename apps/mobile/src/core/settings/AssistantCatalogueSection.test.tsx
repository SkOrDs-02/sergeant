/**
 * Render + interaction tests for `<AssistantCatalogueSection>`.
 *
 * Covers:
 *  - the collapsed group header renders ("Що вміє Сержант");
 *  - expanding the group reveals the description + launcher button;
 *  - tapping the launcher pushes `/assistant` via Expo Router.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { AssistantCatalogueSection } from "./AssistantCatalogueSection";

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

beforeEach(() => {
  mockRouterPush.mockClear();
});

describe("AssistantCatalogueSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<AssistantCatalogueSection />);
    expect(getByText("Що вміє Сержант")).toBeTruthy();
    // Description copy starts with "~60+" and is hidden until expanded.
    expect(queryByText(/~60\+/)).toBeNull();
  });

  it("reveals the launcher when expanded and routes to /assistant on tap", () => {
    const { getByText, getByTestId } = render(<AssistantCatalogueSection />);
    fireEvent.press(getByText("Що вміє Сержант"));

    expect(getByText(/~60\+/)).toBeTruthy();

    const launcher = getByTestId("open-assistant-catalogue");
    fireEvent.press(launcher);

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/assistant");
  });
});
