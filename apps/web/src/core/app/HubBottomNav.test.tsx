/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HubBottomNav } from "./HubBottomNav";

const STORAGE_KEY = "sergeant.hub.reportsTabRevealedAt";

type TestHubView = "dashboard" | "reports" | "profile" | "settings";

function renderNav(props: {
  hubView?: TestHubView;
  showReports?: boolean;
  showProfile?: boolean;
  onChange?: (v: TestHubView) => void;
}) {
  const onChange = props.onChange ?? vi.fn();
  return {
    onChange,
    ...render(
      <HubBottomNav
        hubView={props.hubView ?? "dashboard"}
        onChange={onChange}
        showReports={props.showReports ?? true}
        showProfile={props.showProfile}
      />,
    ),
  };
}

describe("HubBottomNav", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("рендерить три таби за замовчуванням", () => {
    renderNav({});
    expect(screen.getByRole("tab", { name: /Головна/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Звіти/ })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Налаштування/ }),
    ).toBeInTheDocument();
  });

  it("ховає «Звіти» коли showReports=false", () => {
    renderNav({ showReports: false });
    expect(screen.queryByRole("tab", { name: /Звіти/ })).toBeNull();
  });

  it("ховає «Профіль» за замовчуванням (гість)", () => {
    renderNav({});
    expect(screen.queryByRole("tab", { name: /Профіль/ })).toBeNull();
  });

  it("показує «Профіль» коли showProfile=true (залогінений)", () => {
    renderNav({ showProfile: true });
    expect(screen.getByRole("tab", { name: /Профіль/ })).toBeInTheDocument();
  });

  it("виклик onChange при кліку на «Профіль»", () => {
    const { onChange } = renderNav({ showProfile: true });
    fireEvent.click(screen.getByRole("tab", { name: /Профіль/ }));
    expect(onChange).toHaveBeenCalledWith("profile");
  });

  it("активний таб має aria-selected=true", () => {
    renderNav({ hubView: "reports" });
    const reports = screen.getByRole("tab", { name: /Звіти/ });
    expect(reports).toHaveAttribute("aria-selected", "true");

    const dashboard = screen.getByRole("tab", { name: /Головна/ });
    expect(dashboard).toHaveAttribute("aria-selected", "false");
  });

  it("рендерить один sliding pill для активного таба", () => {
    const { container } = renderNav({ hubView: "settings" });

    const indicator = screen.getByTestId("hub-bottom-nav-active-indicator");
    expect(
      container.querySelectorAll(
        '[data-testid="hub-bottom-nav-active-indicator"]',
      ),
    ).toHaveLength(1);
    expect(indicator).toHaveStyle({
      left: "calc(2 * (100% / 3) + (100% / 3 - 2.5rem) / 2)",
    });
  });

  it("виклик onChange при кліку на таб", () => {
    const { onChange } = renderNav({});
    fireEvent.click(screen.getByRole("tab", { name: /Налаштування/ }));
    expect(onChange).toHaveBeenCalledWith("settings");
  });

  it("tablist semantics: кожен таб має aria-controls", () => {
    renderNav({});
    const tabs = screen.getAllByRole("tab");
    for (const tab of tabs) {
      expect(tab).toHaveAttribute("aria-controls");
    }
  });

  it("ставить прапор у localStorage коли reports з'являється", () => {
    const { rerender, onChange } = renderNav({ showReports: false });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    rerender(
      <HubBottomNav
        hubView="dashboard"
        onChange={onChange}
        showReports={true}
      />,
    );
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("не показує ««Звіти» тепер доступні» toast при reveal-і (UX roast 2026-Q2 R1)", () => {
    const { rerender, onChange } = renderNav({ showReports: false });
    rerender(
      <HubBottomNav
        hubView="dashboard"
        onChange={onChange}
        showReports={true}
      />,
    );
    expect(screen.queryByText(/«Звіти» тепер доступні/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("все ще запускає bounce-анімацію на «Звіти» при першому reveal-і", () => {
    const { rerender, onChange } = renderNav({ showReports: false });
    rerender(
      <HubBottomNav
        hubView="dashboard"
        onChange={onChange}
        showReports={true}
      />,
    );
    const reports = screen.getByRole("tab", { name: /Звіти/ });
    expect(reports.className).toContain("animate-bounce-in");
  });

  it("не показує toast вдруге: якщо прапор вже у localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "123");
    renderNav({ showReports: true });
    // Bounce class = .animate-bounce-in. Без прапора й без transition «false→true»
    // анімація не повинна ставитись.
    const reports = screen.getByRole("tab", { name: /Звіти/ });
    expect(reports.className).not.toContain("animate-bounce-in");
  });

  // PR-23 / §7.2 — Layout shift fix on Reports tab reveal.
  describe("шар-резерв слота для «Звіти» (CLS-fix, UX-roast §7.2)", () => {
    it("слот «Звіти» рендериться у DOM навіть коли showReports=false (як invisible)", () => {
      const { container } = renderNav({ showReports: false });
      // AT не бачить hidden-слот: `getByRole("tab", ..)` за замовчуванням
      // ігнорує елементи з `visibility: hidden` (computed style).
      expect(screen.queryByRole("tab", { name: /Звіти/ })).toBeNull();
      // Але слот реально існує у DOM — це і фіксує геометрію tab-strip-у.
      const hiddenReports =
        container.querySelector<HTMLButtonElement>("#hub-tab-reports");
      expect(hiddenReports).not.toBeNull();
      expect(hiddenReports!).toBeInTheDocument();
      expect(hiddenReports!.style.visibility).toBe("hidden");
      expect(hiddenReports!.className).toContain("invisible");
      expect(hiddenReports!.className).toContain("pointer-events-none");
      expect(hiddenReports!.tabIndex).toBe(-1);
    });

    it("кількість слотів у tablist стабільна між showReports=false → true (без CLS)", () => {
      const { container, rerender, onChange } = renderNav({
        showReports: false,
      });
      const slotsBefore = container.querySelectorAll('[role="tab"]').length;

      rerender(
        <HubBottomNav
          hubView="dashboard"
          onChange={onChange}
          showReports={true}
        />,
      );
      const slotsAfter = container.querySelectorAll('[role="tab"]').length;
      expect(slotsAfter).toBe(slotsBefore);
    });

    it("слот «Звіти» не виконує onChange при кліку, поки прихований", () => {
      const { container, onChange } = renderNav({ showReports: false });
      const hiddenReports =
        container.querySelector<HTMLButtonElement>("#hub-tab-reports");
      expect(hiddenReports).not.toBeNull();
      fireEvent.click(hiddenReports!);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
