// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mark = vi.fn();
const clear = vi.fn();
vi.mock("../hooks/useInjuries", () => ({
  useInjuries: () => ({
    all: [
      {
        id: "inj-1",
        site: "chest",
        startedAt: "2026-08-01T10:00:00.000Z",
        clearedAt: null,
        note: "",
      },
    ],
    active: [
      {
        id: "inj-1",
        site: "chest",
        startedAt: "2026-08-01T10:00:00.000Z",
        clearedAt: null,
        note: "",
      },
    ],
    activeSites: new Set(["chest"]),
    mark,
    clear,
    remove: vi.fn(),
  }),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { InjuryManager } from "./InjuryManager";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InjuryManager", () => {
  it("shows open marks and clears them explicitly", async () => {
    render(<InjuryManager />);
    expect(screen.getAllByText("Груди").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Зняти" }));
    await waitFor(() => expect(clear).toHaveBeenCalledWith("inj-1"));
  });

  it("allows selecting several muscle groups", async () => {
    render(<InjuryManager />);
    // Мʼязи згорнуті за замовчуванням (патерн фініш-фло, 2026-08-08) —
    // спершу розгорнути групу.
    fireEvent.click(screen.getByRole("button", { name: /Мʼязи/ }));
    fireEvent.click(screen.getByRole("button", { name: "Трицепс" }));
    fireEvent.click(screen.getByRole("button", { name: "Литки" }));
    fireEvent.click(screen.getByRole("button", { name: "Позначити біль" }));
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(2));
    expect(mark).toHaveBeenCalledWith("triceps");
    expect(mark).toHaveBeenCalledWith("calves");
  });

  it("offers joints and spinal segments, not only atlas muscles", async () => {
    // The whole point of ADR-0083: a muscle-only keyspace cannot name knee or
    // shoulder pain. If these disappear, the model silently reverts to the
    // broken pre-0083 behaviour with no test failure elsewhere.
    render(<InjuryManager />);
    fireEvent.click(screen.getByRole("button", { name: "Коліно" }));
    fireEvent.click(screen.getByRole("button", { name: "Поперек" }));
    fireEvent.click(screen.getByRole("button", { name: "Позначити біль" }));
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(2));
    expect(mark).toHaveBeenCalledWith("knee");
    expect(mark).toHaveBeenCalledWith("spine-lumbar");
  });

  it("renders joints expanded but muscles collapsed by default", () => {
    render(<InjuryManager />);
    // Суглоби видно одразу…
    expect(screen.getByRole("button", { name: "Коліно" })).toBeInTheDocument();
    // …а мʼязові чипи — ні, лише тогл групи.
    expect(
      screen.queryByRole("button", { name: "Трицепс" }),
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Мʼязи/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Трицепс" })).toBeInTheDocument();
  });

  it("does not offer a site that already carries an open mark", () => {
    render(<InjuryManager />);
    fireEvent.click(screen.getByRole("button", { name: /Мʼязи/ }));
    const chestChip = screen
      .getAllByRole("button", { name: "Груди" })
      .find((el) => el.hasAttribute("disabled"));
    expect(chestChip).toBeDefined();
  });

  // Founder audit round2 2026-09-11 (D2): the Atlas picker had diverged into
  // `rounded-full` pills in a `flex-wrap` list, while the workout finish
  // flow (`WorkoutFinishSheets`) and this component's own doc comment both
  // claim a shared rectangular-grid layout. Pin the shape so it can't drift
  // back silently — mutated to `rounded-full`/`flex flex-wrap` locally to
  // confirm this fails on the old shape (see PR report).
  it("renders sites as rectangular grid chips, not rounded-full pills in flex-wrap (D2 audit)", () => {
    render(<InjuryManager />);
    const chip = screen.getByRole("button", { name: "Коліно" });
    expect(chip.className).toContain("rounded-lg");
    expect(chip.className).not.toContain("rounded-full");
    expect(chip.className).toContain("w-full");
    const grid = chip.parentElement;
    expect(grid?.className).toContain("grid");
    expect(grid?.className).not.toContain("flex-wrap");
  });

  it("shows a visible check glyph on an already-marked site, not just a border tint", () => {
    render(<InjuryManager />);
    fireEvent.click(screen.getByRole("button", { name: /Мʼязи/ }));
    const chestChip = screen
      .getAllByRole("button", { name: "Груди" })
      .find((el) => el.hasAttribute("disabled"));
    expect(chestChip?.querySelector("svg")).not.toBeNull();
  });
});
