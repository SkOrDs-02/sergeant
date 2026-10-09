// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

  it("стрілка лише переносить фокус між комірками і не веде в модуль (WCAG 3.2.1)", () => {
    // Раніше ArrowRight викликав `click()` сусідньої комірки, тобто
    // `openHubModule`: просте переміщення фокуса переводило в інший модуль.
    render(<ModuleRail active="finyk" source="module_switcher" />);
    const finyk = screen.getByRole("tab", { name: /Фінік/ });
    finyk.focus();
    fireEvent.keyDown(finyk, { key: "ArrowRight" });

    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: /Фізрук/ }),
    );
    expect(openHubModule).not.toHaveBeenCalled();
    expect(hapticTap).not.toHaveBeenCalled();
  });

  it("Home/End теж не активують комірку", () => {
    render(<ModuleRail active="finyk" source="module_switcher" />);
    const finyk = screen.getByRole("tab", { name: /Фінік/ });
    finyk.focus();
    fireEvent.keyDown(finyk, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: /Їжа/ }),
    );
    expect(openHubModule).not.toHaveBeenCalled();
  });

  it("Enter на сфокусованій комірці відкриває модуль", async () => {
    const user = userEvent.setup();
    render(<ModuleRail active={null} source="module_rail" />);
    screen.getByRole("tab", { name: /Фінік/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(openHubModule).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(openHubModule).toHaveBeenCalledTimes(1);
    expect(openHubModule).toHaveBeenCalledWith(
      "fizruk",
      undefined,
      "module_rail",
    );
  });
});
