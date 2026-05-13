import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";

import { captureError } from "@/lib/observability";

import { ErrorBoundary } from "./ErrorBoundary";

jest.mock("expo-router", () => ({
  __esModule: true,
  router: { replace: jest.fn() },
}));

jest.mock("@/lib/observability", () => ({
  __esModule: true,
  captureError: jest.fn(),
}));

const mockedCaptureError = captureError as jest.MockedFunction<
  typeof captureError
>;

// Silence the expected `console.error` the boundary emits + React's own
// "The above error occurred in..." for a cleaner test report.
let consoleSpy: jest.SpyInstance;
beforeEach(() => {
  mockedCaptureError.mockReset();
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});

function Thrower({ boom, children }: { boom: boolean; children?: ReactNode }) {
  if (boom) {
    throw new Error("kaboom");
  }
  return <>{children}</>;
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Thrower boom={false}>
          <Text>ok</Text>
        </Thrower>
      </ErrorBoundary>,
    );
    expect(getByText("ok")).toBeTruthy();
  });

  it("renders the default fallback when a child throws", () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <Thrower boom>
          <Text>ok</Text>
        </Thrower>
      </ErrorBoundary>,
    );
    expect(queryByText("ok")).toBeNull();
    expect(getByText("Щось пішло не так")).toBeTruthy();
    expect(getByText("kaboom")).toBeTruthy();
    expect(getByText("Перезавантажити")).toBeTruthy();
  });

  it("renders a render-prop fallback with error + resetError", () => {
    const { getByText } = render(
      <ErrorBoundary
        fallback={({ error, resetError }) => (
          <>
            <Text>custom:{error.message}</Text>
            <Text onPress={resetError}>reset</Text>
          </>
        )}
      >
        <Thrower boom>
          <Text>ok</Text>
        </Thrower>
      </ErrorBoundary>,
    );
    expect(getByText("custom:kaboom")).toBeTruthy();
    expect(getByText("reset")).toBeTruthy();
  });

  it("renders a static ReactNode fallback", () => {
    const { getByText } = render(
      <ErrorBoundary fallback={<Text>static-fallback</Text>}>
        <Thrower boom />
      </ErrorBoundary>,
    );
    expect(getByText("static-fallback")).toBeTruthy();
  });

  it("reset button clears error state and re-renders children when the thrower stops throwing", () => {
    let shouldThrow = true;
    function ControlledThrower() {
      if (shouldThrow) throw new Error("kaboom");
      return <Text>recovered</Text>;
    }
    const { getByText, queryByText, rerender } = render(
      <ErrorBoundary>
        <ControlledThrower />
      </ErrorBoundary>,
    );

    expect(getByText("Щось пішло не так")).toBeTruthy();

    // Stop throwing, then press the reset button.
    shouldThrow = false;
    fireEvent.press(getByText("Перезавантажити"));
    rerender(
      <ErrorBoundary>
        <ControlledThrower />
      </ErrorBoundary>,
    );

    expect(queryByText("Щось пішло не так")).toBeNull();
    expect(getByText("recovered")).toBeTruthy();
  });

  it("forwards `captureException` equivalent via console.error (telemetry stub)", () => {
    render(
      <ErrorBoundary>
        <Thrower boom />
      </ErrorBoundary>,
    );

    const matched = consoleSpy.mock.calls.some(
      (call) => call[0] === "[ErrorBoundary] caught error",
    );
    expect(matched).toBe(true);
  });

  it("forwards the caught error to `captureError` from @/lib/observability", () => {
    render(
      <ErrorBoundary>
        <Thrower boom />
      </ErrorBoundary>,
    );

    expect(mockedCaptureError).toHaveBeenCalledTimes(1);
    const [forwardedError, context] = mockedCaptureError.mock.calls[0] ?? [];
    expect(forwardedError).toBeInstanceOf(Error);
    expect((forwardedError as Error).message).toBe("kaboom");
    expect(context).toMatchObject({ componentStack: expect.any(String) });
  });
});
