// @vitest-environment jsdom
/**
 * Last validated: 2026-10-03
 * Status: Active
 *
 * ux-15 (аудит 2026-10-01): Enter у композері при вичерпаному ліміті
 * відкривав пейвол, а keypress того самого Enter натискав «Закрити», на яку
 * пастка фокуса щойно перенесла фокус, — пейвол блимав і зникав. jsdom не
 * робить keypress → click сам, тож браузерну послідовність відтворює helper
 * `pressEnter`: keydown; якщо його не скасовано — keypress-активація кнопки
 * у фокусі.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { ChatInput } from "./ChatInput";
import { PaywallModal } from "../billing/PaywallModal";

vi.mock("../lib/hubChatSpeech", () => ({
  stopSpeaking: vi.fn(),
  unlockTTS: vi.fn(),
}));
vi.mock("../hooks/useSpeech", () => ({
  useSpeech: () => ({ listening: false, toggle: vi.fn(), supported: false }),
}));
vi.mock("@shared/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return { ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS, trackEvent: vi.fn() };
});

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

/** Композер + пейвол так, як їх зʼєднує HubChat при `remaining <= 0`. */
function Harness() {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const sendRef = useRef<((t?: string, v?: boolean) => void) | null>(null);
  return (
    <MemoryRouter>
      <ChatInput
        input="Привіт"
        setInput={vi.fn()}
        loading={false}
        online
        speaking={false}
        setSpeaking={vi.fn()}
        onSend={() => setPaywallOpen(true)}
        onHelp={vi.fn()}
        sendRef={sendRef}
      />
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        surface="ai_chat_limit"
        title="Ліміт вичерпано"
        description="Free план."
      />
    </MemoryRouter>
  );
}

/** Браузерна послідовність Enter: keydown, потім (якщо не скасовано) keypress-клік. */
function pressEnter(target: Element) {
  const proceed = fireEvent.keyDown(target, { key: "Enter" });
  if (!proceed) return;
  const focused = document.activeElement;
  if (focused instanceof HTMLButtonElement) fireEvent.click(focused);
}

afterEach(() => cleanup());

describe("ChatInput Enter × пейвол (ux-15)", () => {
  it("keydown Enter скасовує дефолт, щоб keypress не потрапив у відкритий діалог", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", {
      name: "Повідомлення Сержанту",
    });
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
  });

  it("Shift+Enter не перехоплюється", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", {
      name: "Повідомлення Сержанту",
    });
    expect(fireEvent.keyDown(input, { key: "Enter", shiftKey: true })).toBe(
      true,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter при вичерпаному ліміті: пейвол лишається відкритим", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", {
      name: "Повідомлення Сержанту",
    });
    input.focus();
    pressEnter(input);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
