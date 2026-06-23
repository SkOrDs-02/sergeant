// @vitest-environment jsdom
/**
 * Behavioural tests for the AIPill affordance.
 *
 * The Groq voice hook is mocked so we can drive listening/uploading
 * state deterministically; PendingVoiceChip is stubbed to a marker so we
 * can assert the transcript-confirm flow without a portal. `useNavigate`
 * and the hub bus are spied to lock the chat-open contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateSpy = vi.fn();
const emitHubBusSpy = vi.fn();
const toggleSpy = vi.fn();

let voiceState = {
  listening: false,
  uploading: false,
  supported: true,
  start: vi.fn(),
  stop: vi.fn(),
  toggle: toggleSpy,
};

// Capture the onResult/onError callbacks the component wires in so tests
// can fire them as if a transcript arrived.
let lastVoiceOpts: {
  onResult?: (t: string) => void;
  onError?: (m: string) => void;
} = {};

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("./voice/useGroqVoiceInput", () => ({
  useGroqVoiceInput: (opts: typeof lastVoiceOpts) => {
    lastVoiceOpts = opts;
    return voiceState;
  },
}));

vi.mock("./voice/PendingVoiceChip", () => ({
  PendingVoiceChip: ({
    text,
    onConfirm,
    onCancel,
  }: {
    text: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="pending-chip">
      <span data-testid="chip-text">{text}</span>
      <button type="button" onClick={onConfirm}>
        chip-confirm
      </button>
      <button type="button" onClick={onCancel}>
        chip-cancel
      </button>
    </div>
  ),
}));

vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: (...args: unknown[]) => emitHubBusSpy(...args),
}));

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: vi.fn(),
}));

const toastError = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: toastError, success: vi.fn(), warning: vi.fn() }),
}));

import { AIPill } from "./AIPill";

function renderPill(props: Parameters<typeof AIPill>[0] = {}) {
  return render(
    <MemoryRouter>
      <AIPill {...props} />
    </MemoryRouter>,
  );
}

let rafSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  voiceState = {
    listening: false,
    uploading: false,
    supported: true,
    start: vi.fn(),
    stop: vi.fn(),
    toggle: toggleSpy,
  };
  lastVoiceOpts = {};
  // Run rAF callbacks synchronously so the collapse-on-scroll hook
  // flips state within the same act() tick.
  rafSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
});

afterEach(() => {
  cleanup();
  rafSpy?.mockRestore();
  vi.clearAllMocks();
});

/** Dispatch the two scroll passes that expand the pill (collapsed→false). */
function expandPill() {
  const scroller = document.createElement("div");
  Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true });
  act(() => {
    const ev = new Event("scroll");
    Object.defineProperty(ev, "target", { value: scroller });
    document.dispatchEvent(ev);
    document.dispatchEvent(ev);
  });
}

describe("AIPill", () => {
  it("renders the hub placeholder by default once expanded", () => {
    renderPill();
    // The pill mounts collapsed (no scroll); the primary button is still present.
    expect(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }),
    ).toBeInTheDocument();
  });

  it("uses the module-specific placeholder text", () => {
    renderPill({ module: "finyk" });
    // collapsed initially so placeholder hidden — force expand by scrolling up.
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    // Even collapsed, the group has the assistant aria-label.
    expect(
      screen.getByRole("group", { name: "Відкрити AI-асистента" }),
    ).toBeInTheDocument();
  });

  it("opening chat emits the hub bus event, not a navigate", () => {
    renderPill();
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }),
    );
    expect(emitHubBusSpy).toHaveBeenCalledWith("openChat", {
      message: null,
      autoSend: false,
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("wires the voice hook with module-specific lang and prompt hint", () => {
    renderPill({ module: "fizruk" });
    expect(typeof lastVoiceOpts.onResult).toBe("function");
    expect(typeof lastVoiceOpts.onError).toBe("function");
  });

  it("a transcript surfaces the pending chip; confirm navigates to /chat", () => {
    renderPill();
    act(() => {
      lastVoiceOpts.onResult?.("скільки я витратив");
    });
    expect(screen.getByTestId("pending-chip")).toBeInTheDocument();
    expect(screen.getByTestId("chip-text")).toHaveTextContent(
      "скільки я витратив",
    );
    fireEvent.click(screen.getByText("chip-confirm"));
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy.mock.calls[0]![0]).toContain("q=");
  });

  it("an empty transcript is silently dismissed (no chip)", () => {
    renderPill();
    act(() => {
      lastVoiceOpts.onResult?.("   ");
    });
    expect(screen.queryByTestId("pending-chip")).not.toBeInTheDocument();
  });

  it("cancel dismisses the pending chip without navigating", () => {
    renderPill();
    act(() => {
      lastVoiceOpts.onResult?.("привіт");
    });
    fireEvent.click(screen.getByText("chip-cancel"));
    expect(screen.queryByTestId("pending-chip")).not.toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("onError surfaces a retry toast", () => {
    renderPill();
    act(() => {
      lastVoiceOpts.onError?.("Не вдалося розпізнати");
    });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]![0]).toBe("Не вдалося розпізнати");
  });

  it("onMicTap override replaces the built-in voice toggle", async () => {
    const onMicTap = vi.fn();
    renderPill({ onMicTap });
    expandPill();
    const mic = await screen.findByRole("button", { name: "Голосовий ввід" });
    fireEvent.click(mic);
    expect(onMicTap).toHaveBeenCalledTimes(1);
    expect(toggleSpy).not.toHaveBeenCalled();
  });

  it("reflects a custom bottom offset via inline style", () => {
    renderPill({ bottom: 120 });
    const group = screen.getByRole("group", { name: "Відкрити AI-асистента" });
    expect(group.getAttribute("style")).toContain("120px");
  });

  it("expands on a top-anchored scroll, revealing the placeholder + mic", async () => {
    renderPill({ module: "routine" });
    expandPill();
    const mic = await screen.findByRole("button", { name: "Голосовий ввід" });
    expect(mic).toBeInTheDocument();
    expect(screen.getByText("Запитай про звички…")).toBeInTheDocument();
  });

  it("mic button (expanded) toggles the built-in voice when no override", async () => {
    renderPill();
    expandPill();
    const mic = await screen.findByRole("button", { name: "Голосовий ввід" });
    fireEvent.click(mic);
    expect(toggleSpy).toHaveBeenCalledTimes(1);
  });

  it("recording state relabels the mic button to 'Зупинити запис'", async () => {
    voiceState.listening = true;
    renderPill();
    expandPill();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Зупинити запис" }),
      ).toBeInTheDocument(),
    );
  });

  it("uploading state relabels the mic button to 'Розпізнаю…' and disables it", async () => {
    voiceState.uploading = true;
    renderPill();
    expandPill();
    const mic = await screen.findByRole("button", { name: "Розпізнаю…" });
    expect(mic).toBeDisabled();
  });
});
