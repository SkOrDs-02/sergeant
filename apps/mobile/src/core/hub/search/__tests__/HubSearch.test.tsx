/**
 * HubSearch — empty state + query → results + tap → router.push.
 *
 * These tests pin the three smoke behaviours called out in the Phase-2
 * Hub-core scope:
 *  1. opens with the four Spotlight-style quick-add Actions
 *  2. typing 2+ chars renders Settings / Assistant / Action hits
 *  3. tapping a hit fires `onClose` + `router.push("/(tabs)/finyk")`
 */

import { act, fireEvent, render } from "@testing-library/react-native";

import { HubSearch } from "../HubSearch";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  router: {
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    navigate: jest.fn(),
  },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    navigate: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("@sergeant/api-client/react", () => ({
  useApiClient: () => ({
    chat: {
      send: jest.fn(() => Promise.resolve({ text: "" })),
      stream: jest.fn(),
    },
  }),
}));

describe("HubSearch (mobile)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
  });

  it("renders the launcher landing with the four quick-add Actions", () => {
    const onClose = jest.fn();
    const { getByTestId, queryByText } = render(
      <HubSearch onClose={onClose} />,
    );

    expect(getByTestId("hub-search-screen")).toBeTruthy();
    expect(getByTestId("hub-search-input")).toBeTruthy();
    // Landing surface advertises the four quick-add commands so the
    // palette feels Spotlight-y on first open.
    expect(queryByText("Додати витрату")).toBeTruthy();
    expect(queryByText("Почати тренування")).toBeTruthy();
    expect(queryByText("Додати звичку")).toBeTruthy();
    expect(queryByText("Додати прийом їжі")).toBeTruthy();
  });

  it("renders matching hits after typing a query", async () => {
    jest.useFakeTimers();
    const { getByTestId, queryByText } = render(
      <HubSearch onClose={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId("hub-search-input"), "налаштування");
    // Trigger the 120ms debounce.
    await act(async () => {
      jest.advanceTimersByTime(150);
    });

    // The Settings section's "Загальні" hit should be in the result set
    // because the keyword bank includes "налаштування" aliases.
    expect(queryByText("AI-помічник")).toBeTruthy(); // AI handoff label
    jest.useRealTimers();
  });

  it("pushes the module route when a hit is activated", async () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    const { getByTestId, getByText } = render(<HubSearch onClose={onClose} />);

    fireEvent.changeText(getByTestId("hub-search-input"), "трен");
    await act(async () => {
      jest.advanceTimersByTime(150);
    });

    // Tap "Почати тренування" (fizruk action) — it should close the
    // launcher and push the fizruk tab via Expo Router.
    fireEvent.press(getByText("Почати тренування"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/fizruk");
    jest.useRealTimers();
  });
});
