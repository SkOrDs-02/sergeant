// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { InjurySection } from "./InjurySection";
import { useInjuries } from "../hooks/useInjuries";

vi.mock("../hooks/useInjuries", () => ({ useInjuries: vi.fn() }));

const mockUseInjuries = vi.mocked(useInjuries);

function setup(over: Partial<ReturnType<typeof useInjuries>> = {}) {
  const mark = vi.fn();
  const clear = vi.fn();
  mockUseInjuries.mockReturnValue({
    all: [],
    active: [],
    activeSites: new Set(),
    mark,
    clear,
    remove: vi.fn(),
    ...over,
  });
  render(<InjurySection />);
  return { mark, clear };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("InjurySection", () => {
  it("invites the user to mark a zone when nothing is marked", () => {
    setup();
    expect(screen.getByText(/Нічого не позначено/)).toBeInTheDocument();
  });

  it("lists an active mark with a way to lift it", () => {
    const { clear } = setup({
      active: [
        {
          id: "inj_1",
          site: "knee",
          startedAt: "2026-08-01T10:00:00.000Z",
          clearedAt: null,
        },
      ],
      activeSites: new Set(["knee"] as const),
    });
    expect(screen.getByText("Коліно")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Зняти: Коліно/ }));
    expect(clear).toHaveBeenCalledWith("inj_1");
  });

  it("offers joints and spine, not only atlas muscles", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Позначити зону" }));
    // The whole point of ADR-0083: these have no home in the 18-muscle atlas.
    for (const label of ["Коліно", "Лікоть", "Плечовий суглоб", "Поперек"]) {
      expect(
        screen.getByRole("button", { name: `Позначити зону: ${label}` }),
      ).toBeInTheDocument();
    }
    // …and muscles are still reachable.
    expect(
      screen.getByRole("button", { name: "Позначити зону: Груди" }),
    ).toBeInTheDocument();
  });

  it("marks the picked zone", () => {
    const { mark } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Позначити зону" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Позначити зону: Коліно" }),
    );
    expect(mark).toHaveBeenCalledWith("knee");
  });

  // Fixed 2026-08-08 (fizruk audit wave 2, defect #6): an already-marked
  // chip used to flip to `disabled`, which drops it out of the tab order —
  // a keyboard user who just marked a zone loses their focus position
  // mid-interaction. `mark()` is a documented no-op for an already-active
  // site (see `useInjuries.ts`), so the chip now stays focusable and
  // clickable; state is communicated via `aria-pressed` + a label suffix
  // instead of via removal from the accessibility tree.
  it("keeps an already-marked zone focusable — state via aria-pressed, not disabled", () => {
    const { mark } = setup({ activeSites: new Set(["knee"] as const) });
    fireEvent.click(screen.getByRole("button", { name: "Позначити зону" }));
    const chip = screen.getByRole("button", {
      name: /Коліно — уже позначено/,
    });
    expect(chip).not.toBeDisabled();
    expect(chip).toHaveAttribute("aria-pressed", "true");

    chip.focus();
    fireEvent.click(chip);

    // Still focusable/enabled after the click — no focus loss.
    expect(chip).not.toBeDisabled();
    expect(document.activeElement).toBe(chip);
    expect(mark).toHaveBeenCalledWith("knee");
  });

  it("states the limits instead of promising safety", () => {
    setup();
    const note = screen.getByText(/не діагностує й не лікує/);
    expect(note).toBeInTheDocument();
    // The custom-exercise gap must be visible, not buried (ADR-0083).
    expect(note.textContent).toMatch(/перевірка за суглобом неможлива/);
  });
});
