// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mark = vi.fn(async () => []);
const clear = vi.fn(async () => true);
vi.mock("../hooks/useInjuries", () => ({
  useInjuries: () => ({
    injuries: [],
    openMarks: [
      {
        id: "inj-1",
        site: "chest",
        startedAt: "2026-08-01T10:00:00.000Z",
        clearedAt: null,
        note: "",
        deletedAt: null,
      },
    ],
    activeSites: new Set(["chest"]),
    mark,
    clear,
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
    fireEvent.click(screen.getByRole("button", { name: "Трицепс" }));
    fireEvent.click(screen.getByRole("button", { name: "Литки" }));
    fireEvent.click(screen.getByRole("button", { name: "Позначити біль" }));
    await waitFor(() =>
      expect(mark).toHaveBeenCalledWith(["triceps", "calves"]),
    );
  });

  it("offers joints and spinal segments, not only atlas muscles", async () => {
    // The whole point of ADR-0083: a muscle-only keyspace cannot name knee or
    // shoulder pain. If these disappear, the model silently reverts to the
    // broken pre-0083 behaviour with no test failure elsewhere.
    render(<InjuryManager />);
    fireEvent.click(screen.getByRole("button", { name: "Коліно" }));
    fireEvent.click(screen.getByRole("button", { name: "Поперек" }));
    fireEvent.click(screen.getByRole("button", { name: "Позначити біль" }));
    await waitFor(() =>
      expect(mark).toHaveBeenCalledWith(["knee", "spine-lumbar"]),
    );
  });

  it("does not offer a site that already carries an open mark", () => {
    render(<InjuryManager />);
    const chestChip = screen
      .getAllByRole("button", { name: "Груди" })
      .find((el) => el.hasAttribute("disabled"));
    expect(chestChip).toBeDefined();
  });
});
