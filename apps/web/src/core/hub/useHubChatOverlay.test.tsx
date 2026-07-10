/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import {
  HubChatOverlayProvider,
  useHubChatOverlay,
  useHubChatOverlayState,
} from "./useHubChatOverlay";

function OverlayProbe() {
  const api = useHubChatOverlay();
  return (
    <div>
      <span data-testid="open">{String(api.open)}</span>
      <span data-testid="message">{api.initialMessage}</span>
      <span data-testid="auto">{String(api.autoSendInitial)}</span>
      <button
        type="button"
        onClick={() => api.openChat({ initialMessage: "hi" })}
      >
        open
      </button>
      <button
        type="button"
        onClick={() => api.openChat({ initialMessage: "go", autoSend: true })}
      >
        open-auto
      </button>
      <button type="button" onClick={() => api.closeChat()}>
        close
      </button>
    </div>
  );
}

describe("useHubChatOverlayState", () => {
  afterEach(() => cleanup());

  it("opens with optional prefill and auto-send flags", () => {
    const { result } = renderHook(() => useHubChatOverlayState());

    act(() => {
      result.current.openChat({ initialMessage: "budget", autoSend: true });
    });

    expect(result.current.open).toBe(true);
    expect(result.current.initialMessage).toBe("budget");
    expect(result.current.autoSendInitial).toBe(true);
  });

  it("clears prefill state when closeChat runs", () => {
    const { result } = renderHook(() => useHubChatOverlayState());

    act(() => {
      result.current.openChat({ initialMessage: "keep?" });
      result.current.closeChat();
    });

    expect(result.current.open).toBe(false);
    expect(result.current.initialMessage).toBe("");
    expect(result.current.autoSendInitial).toBe(false);
  });
});

describe("useHubChatOverlay", () => {
  afterEach(() => cleanup());

  it("returns a noop API when no provider is mounted", () => {
    render(<OverlayProbe />);
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(screen.getByTestId("message")).toHaveTextContent("");
  });

  it("reads live state from HubChatOverlayProvider", () => {
    function ProviderShell({ children }: { children: React.ReactNode }) {
      const state = useHubChatOverlayState();
      return (
        <HubChatOverlayProvider value={state}>
          {children}
        </HubChatOverlayProvider>
      );
    }

    render(
      <ProviderShell>
        <OverlayProbe />
      </ProviderShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "open-auto" }));
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    expect(screen.getByTestId("message")).toHaveTextContent("go");
    expect(screen.getByTestId("auto")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(screen.getByTestId("message")).toHaveTextContent("");
  });
});
