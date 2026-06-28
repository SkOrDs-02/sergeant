// @vitest-environment jsdom
/**
 * Behavioural tests for the AIPill affordance.
 *
 * AIPill is now a tap-only compact FAB: a single button that opens the
 * chat overlay via the hub bus. There is no scroll-driven expand and no
 * inline mic (voice lives inside the chat composer). The hub bus is spied
 * to lock the chat-open contract; `useNavigate` is stubbed only because
 * the surrounding router context expects it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const emitHubBusSpy = vi.fn();

vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: (...args: unknown[]) => emitHubBusSpy(...args),
}));

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: vi.fn(),
}));

import { AIPill } from "./AIPill";

function renderPill(props: Parameters<typeof AIPill>[0] = {}) {
  return render(
    <MemoryRouter>
      <AIPill {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("AIPill", () => {
  it("renders a single assistant button", () => {
    renderPill();
    expect(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }),
    ).toBeInTheDocument();
  });

  it("opening chat emits the hub bus event", () => {
    renderPill();
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }),
    );
    expect(emitHubBusSpy).toHaveBeenCalledWith("openChat", {
      message: null,
      autoSend: false,
    });
  });

  it("reflects a custom bottom offset via inline style", () => {
    renderPill({ bottom: 120 });
    const button = screen.getByRole("button", {
      name: "Відкрити AI-асистента",
    });
    expect(button.getAttribute("style")).toContain("120px");
  });

  it("standalone renders the 56px size; default is the 44px compact pip", () => {
    const { rerender } = renderPill({ standalone: true });
    expect(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }).className,
    ).toContain("w-14");

    rerender(
      <MemoryRouter>
        <AIPill />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }).className,
    ).toContain("w-11");
  });

  it("is flush to the edge by default; besideFab offsets it to clear a sibling FAB", () => {
    const { rerender } = renderPill();
    const flushBtn = screen.getByRole("button", {
      name: "Відкрити AI-асистента",
    });
    // Default placement clears the edge, not the FAB corner.
    expect(flushBtn.className).not.toContain("right-[4.5rem]");

    rerender(
      <MemoryRouter>
        <AIPill besideFab />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Відкрити AI-асистента" }).className,
    ).toContain("right-[4.5rem]");
  });
});
