/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubChatComposer } from "./HubChatComposer";
import type { HubChatComposerProps } from "./HubChatComposer";

vi.mock("../../components/ChatQuickActions", () => ({
  ChatQuickActions: ({
    loading,
    online,
    onSend,
    onPrefill,
  }: {
    loading: boolean;
    online: boolean;
    onSend: (prompt: string) => void;
    onPrefill: (prompt: string) => void;
  }) => (
    <div
      data-testid="quick-actions"
      data-loading={String(loading)}
      data-online={String(online)}
    >
      <button type="button" onClick={() => onSend("Підсумуй тиждень")}>
        quick-send
      </button>
      <button type="button" onClick={() => onPrefill("Підготуй звіт")}>
        quick-prefill
      </button>
    </div>
  ),
}));

vi.mock("../../components/ChatInput", () => ({
  ChatInput: ({
    input,
    loading,
    online,
    speaking,
    setSpeaking,
    onSend,
    onHelp,
    sendRef,
    focusInputRef,
  }: {
    input: string;
    loading: boolean;
    online: boolean;
    speaking: boolean;
    setSpeaking: (next: boolean) => void;
    onSend: () => void;
    onHelp: () => void;
    sendRef: { current: ((text?: string) => Promise<void>) | null };
    focusInputRef: { current: (() => void) | null };
  }) => (
    <div
      data-testid="chat-input"
      data-input={input}
      data-loading={String(loading)}
      data-online={String(online)}
      data-speaking={String(speaking)}
      data-send-ref={String(sendRef.current !== null)}
      data-focus-ref={String(focusInputRef.current !== null)}
    >
      <button type="button" onClick={onSend}>
        input-send
      </button>
      <button type="button" onClick={onHelp}>
        input-help
      </button>
      <button type="button" onClick={() => setSpeaking(!speaking)}>
        toggle-speaking
      </button>
    </div>
  ),
}));

function makeProps(
  overrides: Partial<HubChatComposerProps> = {},
): HubChatComposerProps {
  return {
    activeModule: null,
    loading: false,
    online: true,
    speaking: false,
    setSpeaking: vi.fn(),
    input: "",
    setInput: vi.fn(),
    onSend: vi.fn(),
    onHelp: vi.fn(),
    sendRef: { current: vi.fn().mockResolvedValue(undefined) },
    focusInputRef: { current: vi.fn() },
    ...overrides,
  };
}

describe("HubChatComposer", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("forwards quick-action sends and prefill focus requests", () => {
    vi.useFakeTimers();
    const focusInput = vi.fn();
    const props = makeProps({ focusInputRef: { current: focusInput } });
    render(<HubChatComposer {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "quick-send" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-prefill" }));
    vi.runOnlyPendingTimers();

    expect(props.onSend).toHaveBeenCalledWith("Підсумуй тиждень");
    expect(props.setInput).toHaveBeenCalledWith("Підготуй звіт");
    expect(focusInput).toHaveBeenCalledTimes(1);
  });

  it("renders the offline notice and passes disabled context to children", () => {
    render(
      <HubChatComposer
        {...makeProps({ loading: true, online: false, input: "draft" })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Асистент недоступний без інтернету.",
    );
    expect(screen.getByTestId("quick-actions")).toHaveAttribute(
      "data-online",
      "false",
    );
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-loading",
      "true",
    );
    expect(screen.getByTestId("chat-input")).toHaveAttribute(
      "data-input",
      "draft",
    );
  });

  it("delegates input send/help and speaking toggles", () => {
    const props = makeProps({ speaking: true });
    render(<HubChatComposer {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "input-send" }));
    fireEvent.click(screen.getByRole("button", { name: "input-help" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle-speaking" }));

    expect(props.onSend).toHaveBeenCalledWith();
    expect(props.onHelp).toHaveBeenCalledTimes(1);
    expect(props.setSpeaking).toHaveBeenCalledWith(false);
  });
});
