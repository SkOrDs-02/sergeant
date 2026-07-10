/** @vitest-environment jsdom */
/**
 * Branch coverage for HubChatComposer — offline banner, quick-action
 * prefill focus, and send wiring not covered by HubChat.test.tsx.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HubChatComposer } from "./HubChatComposer";

vi.mock("../../components/ChatQuickActions", () => ({
  ChatQuickActions: ({
    onSend,
    onPrefill,
    online,
  }: {
    onSend: (prompt: string) => void;
    onPrefill: (prompt: string) => void;
    online: boolean;
  }) => (
    <div data-testid="quick-actions" data-online={String(online)}>
      <button type="button" onClick={() => onSend("quick")}>
        send-quick
      </button>
      <button type="button" onClick={() => onPrefill("prefill me")}>
        prefill
      </button>
    </div>
  ),
}));

vi.mock("../../components/ChatInput", () => ({
  ChatInput: ({ onSend, online }: { onSend: () => void; online: boolean }) => (
    <button
      type="button"
      data-testid="chat-input"
      data-online={String(online)}
      onClick={onSend}
    >
      send-input
    </button>
  ),
}));

describe("HubChatComposer", () => {
  afterEach(() => cleanup());

  function renderComposer(
    overrides: Partial<Parameters<typeof HubChatComposer>[0]> = {},
  ) {
    const setInput = vi.fn();
    const setSpeaking = vi.fn();
    const onSend = vi.fn();
    const focusInputRef = { current: vi.fn() };
    const props = {
      activeModule: null,
      loading: false,
      online: true,
      speaking: false,
      setSpeaking,
      input: "",
      setInput,
      onSend,
      onHelp: vi.fn(),
      sendRef: { current: null },
      focusInputRef,
      ...overrides,
    };
    const view = render(<HubChatComposer {...props} />);
    return { ...props, ...view };
  }

  it("shows the offline status banner when online is false", () => {
    renderComposer({ online: false });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByTestId("quick-actions")).toHaveAttribute(
      "data-online",
      "false",
    );
  });

  it("hides the offline banner while online", () => {
    renderComposer({ online: true });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("forwards quick-action send and input send to onSend", () => {
    const { onSend } = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "send-quick" }));
    expect(onSend).toHaveBeenCalledWith("quick");

    fireEvent.click(screen.getByTestId("chat-input"));
    expect(onSend).toHaveBeenCalledWith();
  });

  it("prefills input and focuses the composer field on quick-action prefill", () => {
    vi.useFakeTimers();
    const { setInput, focusInputRef } = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "prefill" }));
    expect(setInput).toHaveBeenCalledWith("prefill me");

    vi.runAllTimers();
    expect(focusInputRef.current).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
