// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Unit tests for ChatInput — send button, keyboard shortcut, mic toggle, speak-stop.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, type Dispatch, type SetStateAction } from "react";
import { ChatInput } from "./ChatInput";

vi.mock("../lib/hubChatSpeech", () => ({
  stopSpeaking: vi.fn(),
  unlockTTS: vi.fn(),
}));

vi.mock("../hooks/useSpeech", () => ({
  useSpeech: vi.fn(() => ({
    listening: false,
    toggle: vi.fn(),
    supported: false,
  })),
}));

vi.mock("@shared/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { stopSpeaking } from "../lib/hubChatSpeech";
import { useSpeech } from "../hooks/useSpeech";

// jsdom does not implement matchMedia — stub it so ChatInput's autofocus
// effect does not throw.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

function TestWrapper({
  input = "",
  loading = false,
  online = true,
  speaking = false,
  setSpeaking = vi.fn() as Dispatch<SetStateAction<boolean>>,
  onSend = vi.fn(),
  onHelp = vi.fn(),
}: {
  input?: string;
  loading?: boolean;
  online?: boolean;
  speaking?: boolean;
  setSpeaking?: Dispatch<SetStateAction<boolean>>;
  onSend?: () => void;
  onHelp?: () => void;
}) {
  const sendRef = useRef<((text?: string, fromVoice?: boolean) => void) | null>(
    null,
  );
  const setInput = vi.fn();
  return (
    <ChatInput
      input={input}
      setInput={setInput}
      loading={loading}
      online={online}
      speaking={speaking}
      setSpeaking={setSpeaking}
      onSend={onSend}
      onHelp={onHelp}
      sendRef={sendRef}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSpeech).mockReturnValue({
    listening: false,
    toggle: vi.fn(),
    supported: false,
  });
});

describe("ChatInput", () => {
  it("renders the input and send button", () => {
    render(<TestWrapper />);
    expect(
      screen.getByRole("textbox", { name: "Повідомлення асистенту" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Надіслати" }),
    ).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<TestWrapper input="" />);
    const btn = screen.getByRole("button", { name: "Надіслати" });
    expect(btn).toBeDisabled();
  });

  it("send button is disabled when offline", () => {
    render(<TestWrapper input="hello" online={false} />);
    const btn = screen.getByRole("button", {
      name: "Надсилання недоступне офлайн",
    });
    expect(btn).toBeDisabled();
  });

  it("send button is enabled when there is input and online", () => {
    render(<TestWrapper input="hello" online={true} />);
    const btn = screen.getByRole("button", { name: "Надіслати" });
    expect(btn).not.toBeDisabled();
  });

  it("clicking send button calls onSend", () => {
    const onSend = vi.fn();
    render(<TestWrapper input="test" onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "Надіслати" }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("pressing Enter in the input calls onSend when online", () => {
    const onSend = vi.fn();
    render(<TestWrapper input="test" onSend={onSend} online={true} />);
    const input = screen.getByRole("textbox", {
      name: "Повідомлення асистенту",
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("pressing Enter does NOT call onSend offline", () => {
    const onSend = vi.fn();
    render(<TestWrapper input="test" onSend={onSend} online={false} />);
    const input = screen.getByRole("textbox", {
      name: "Повідомлення асистенту",
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("renders help button", () => {
    render(<TestWrapper />);
    expect(
      screen.getByRole("button", { name: "Команди: показати довідку" }),
    ).toBeInTheDocument();
  });

  it("clicking help button calls onHelp", () => {
    const onHelp = vi.fn();
    render(<TestWrapper onHelp={onHelp} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Команди: показати довідку" }),
    );
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it("when speaking=true, renders stop-speaking button and calls stopSpeaking on click", () => {
    const setSpeaking = vi.fn() as Dispatch<SetStateAction<boolean>>;
    render(<TestWrapper speaking={true} setSpeaking={setSpeaking} />);
    const stopBtn = screen.getByRole("button", { name: "Зупинити озвучення" });
    expect(stopBtn).toBeInTheDocument();
    fireEvent.click(stopBtn);
    expect(stopSpeaking).toHaveBeenCalledTimes(1);
    expect(setSpeaking).toHaveBeenCalledWith(false);
  });

  it("shows mic button when speech is supported and not speaking", () => {
    vi.mocked(useSpeech).mockReturnValue({
      listening: false,
      toggle: vi.fn(),
      supported: true,
    });
    render(<TestWrapper speaking={false} />);
    expect(
      screen.getByRole("button", { name: "Голосовий ввід" }),
    ).toBeInTheDocument();
  });

  it("input is disabled when offline", () => {
    render(<TestWrapper online={false} />);
    const input = screen.getByRole("textbox", {
      name: "Повідомлення асистенту",
    });
    expect(input).toBeDisabled();
  });

  it("shows offline placeholder when offline", () => {
    render(<TestWrapper online={false} />);
    const input = screen.getByRole("textbox", {
      name: "Повідомлення асистенту",
    });
    expect(input).toHaveAttribute(
      "placeholder",
      "Немає зʼєднання — асистент офлайн",
    );
  });
});
