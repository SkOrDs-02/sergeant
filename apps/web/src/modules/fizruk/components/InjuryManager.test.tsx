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
const clear = vi.fn(async () => null);
vi.mock("../hooks/useInjuries", () => ({
  useInjuries: () => ({
    activeInjuries: [
      {
        id: "inj-1",
        userId: "u1",
        muscleGroup: "chest",
        notedAt: "2026-08-01T10:00:00.000Z",
        clearedAt: null,
      },
    ],
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
  it("shows active marks and clears them explicitly", async () => {
    render(<InjuryManager />);
    expect(screen.getAllByText("Груди").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Зняти" }));
    await waitFor(() => expect(clear).toHaveBeenCalledWith("inj-1"));
  });

  it("allows selecting multiple canonical groups", async () => {
    render(<InjuryManager />);
    fireEvent.click(screen.getByRole("button", { name: "Трицепс" }));
    fireEvent.click(screen.getByRole("button", { name: "Литки" }));
    fireEvent.click(screen.getByRole("button", { name: "Позначити біль" }));
    await waitFor(() =>
      expect(mark).toHaveBeenCalledWith(["triceps", "calves"]),
    );
  });
});
