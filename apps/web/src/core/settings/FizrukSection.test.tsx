/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const restSettings = vi.hoisted(() => ({
  settings: {
    compound: 90,
    isolation: 60,
    cardio: 30,
    bodyweight: 45,
  } as Record<string, number>,
  updateSetting: vi.fn(),
}));

vi.mock("../../modules/fizruk/hooks/useRestSettings", () => ({
  useRestSettings: () => restSettings,
  REST_CATEGORY_LABELS: {
    compound: "Базові",
    isolation: "Ізоляція",
    cardio: "Кардіо",
    bodyweight: "Своя вага",
  },
}));

import { FizrukSection } from "./FizrukSection";

async function openSection() {
  fireEvent.click(await screen.findByRole("button", { name: /Фізрук/i }));
}

describe("FizrukSection", () => {
  beforeEach(() => {
    restSettings.updateSetting.mockReset();
    restSettings.settings["compound"] = 90;
  });

  afterEach(() => cleanup());

  it("renders rest timer presets for each exercise category", async () => {
    render(<FizrukSection />);
    await openSection();

    expect(screen.getByText("Базові")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "90с" }).length,
    ).toBeGreaterThan(0);
  });

  it("calls updateSetting when a preset duration is chosen", async () => {
    render(<FizrukSection />);
    await openSection();

    const buttons = screen.getAllByRole("button", { name: "120с" });
    fireEvent.click(buttons[0]!);
    expect(restSettings.updateSetting).toHaveBeenCalledWith("compound", 120);
  });
});
