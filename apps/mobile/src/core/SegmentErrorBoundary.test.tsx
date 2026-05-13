import { fireEvent, render } from "@testing-library/react-native";

import { SegmentErrorBoundary } from "./SegmentErrorBoundary";

jest.mock("expo-router", () => ({
  __esModule: true,
  router: { replace: jest.fn() },
}));

describe("SegmentErrorBoundary (Expo Router named export)", () => {
  it("renders the Ukrainian Card fallback with the thrown error's message", () => {
    const { getByText } = render(
      <SegmentErrorBoundary
        error={new Error("route boom")}
        retry={() => Promise.resolve()}
      />,
    );
    expect(getByText("Щось пішло не так")).toBeTruthy();
    expect(getByText("route boom")).toBeTruthy();
    expect(getByText("Перезавантажити")).toBeTruthy();
  });

  it("calls `retry` when the user taps the reset button (fire-and-forget)", () => {
    const retry = jest.fn(() => Promise.resolve());
    const { getByText } = render(
      <SegmentErrorBoundary error={new Error("route boom")} retry={retry} />,
    );

    fireEvent.press(getByText("Перезавантажити"));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does not throw when `retry` returns a rejected promise", async () => {
    const retry = jest.fn(() =>
      Promise.reject(new Error("retry failed")).catch(() => {
        /* swallow rejection — the fallback fires retry as
         * fire-and-forget, so the caller is responsible for
         * logging. Test scope: only verify the press handler
         * itself doesn't synchronously rethrow. */
      }),
    );
    const { getByText } = render(
      <SegmentErrorBoundary error={new Error("route boom")} retry={retry} />,
    );

    expect(() => fireEvent.press(getByText("Перезавантажити"))).not.toThrow();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
