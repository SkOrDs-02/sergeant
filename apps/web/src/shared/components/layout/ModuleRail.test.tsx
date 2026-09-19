// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { hapticTap, openHubModule, openHubSettingsSection } = vi.hoisted(() => ({
  hapticTap: vi.fn(),
  openHubModule: vi.fn(),
  openHubSettingsSection: vi.fn(),
}));
vi.mock("@shared/lib/adapters/haptic", () => ({ hapticTap }));
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule,
  openHubSettingsSection,
}));

import { ModuleRail } from "./ModuleRail";

describe("ModuleRail", () => {
  beforeEach(() => {
    hapticTap.mockClear();
    openHubModule.mockClear();
    openHubSettingsSection.mockClear();
  });

  it("на хабі: чотири комірки, жодна не вибрана, Tab зупиняється на першій", () => {
    render(<ModuleRail active={null} source="module_rail" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.every((t) => t.getAttribute("aria-selected") === "false")).toBe(
      true,
    );
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(
      tabs.slice(1).every((t) => t.getAttribute("tabindex") === "-1"),
    ).toBe(true);
    // Без чисел: у комірках лише назви модулів.
    expect(screen.getByTestId("module-rail").textContent).toBe(
      "ФінікФізрукРутинаЇжа",
    );
  });

  it("тап відкриває модуль із названим джерелом — рейок хабу рахується окремо від перемикача", () => {
    render(<ModuleRail active={null} source="module_rail" />);
    fireEvent.click(screen.getByRole("tab", { name: /Фізрук/ }));
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(openHubModule).toHaveBeenCalledWith(
      "fizruk",
      undefined,
      "module_rail",
    );
  });

  it("усередині модуля: активна комірка вибрана, тап по ній нічого не робить", () => {
    render(<ModuleRail active="routine" source="module_switcher" />);
    const active = screen.getByRole("tab", {
      name: "Перейти до модуля Рутина",
    });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveAttribute("tabindex", "0");
    fireEvent.click(active);
    expect(openHubModule).not.toHaveBeenCalled();
  });

  it("неактивний модуль лишається в рейку приглушеним і веде в налаштування, не в модуль", () => {
    render(
      <ModuleRail
        active={null}
        source="module_rail"
        activeModules={["finyk", "routine"]}
      />,
    );
    // Рейок сталий за формою: чотири комірки і з двома неактивними.
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    const nutrition = screen.getByRole("tab", { name: /Їжа: неактивний/ });
    expect(nutrition).toHaveAttribute("data-inactive", "true");
    fireEvent.click(nutrition);
    expect(openHubSettingsSection).toHaveBeenCalledWith("dashboard");
    expect(openHubModule).not.toHaveBeenCalled();
  });

  it("44 px на coarse pointer — клас стоїть на кожній комірці", () => {
    render(<ModuleRail active={null} source="module_rail" />);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("pointer-coarse:h-11");
    }
  });
});
