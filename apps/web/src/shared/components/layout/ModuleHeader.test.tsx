// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const { hapticTap, emitHubBus, openHubModule } = vi.hoisted(() => ({
  hapticTap: vi.fn(),
  emitHubBus: vi.fn(),
  openHubModule: vi.fn(),
}));

vi.mock("@shared/lib/adapters/haptic", () => ({ hapticTap }));
vi.mock("@shared/lib/modules/hubBus", () => ({ emitHubBus }));
vi.mock("@shared/lib/modules/hubNav", () => ({ openHubModule }));

import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
  ModuleHeaderChevronButton,
  ModuleHeaderHubButton,
  ModuleHeaderIconButton,
  ModuleHeaderSettingsButton,
  ModuleSwitcher,
} from "./ModuleHeader";

describe("ModuleHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the default title stack and optional slots", () => {
    render(
      <ModuleHeader
        title="ФІЗРУК"
        eyebrow="ОСОБИСТИЙ ЖУРНАЛ"
        subtitle="Тренування · прогрес"
        left={<button type="button">Назад</button>}
        right={<button type="button">Дія</button>}
        className="custom-header"
      />,
    );

    expect(screen.getByText("ФІЗРУК")).toBeInTheDocument();
    expect(screen.getByText("ОСОБИСТИЙ ЖУРНАЛ")).toBeInTheDocument();
    expect(screen.getByText("Тренування · прогрес")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Дія" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("ФІЗРУК").closest(".custom-header")).not.toBeNull();
  });

  it("uses titleSlot and suppresses the switcher when requested", () => {
    const { container } = render(
      <ModuleHeader
        module="finyk"
        showSwitcher={false}
        titleSlot={<div data-testid="title-slot">Custom title</div>}
      />,
    );

    expect(screen.getByTestId("title-slot")).toHaveTextContent("Custom title");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "from-finyk/5",
    );
  });

  it("renders module switcher tabs and opens inactive modules", () => {
    render(<ModuleHeader module="nutrition" title="Харчування" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(
      screen.getByRole("tab", { name: "Перейти до модуля Їжа" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Їжа")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Фінік/ }));
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(openHubModule).toHaveBeenCalledWith("finyk");

    fireEvent.click(screen.getByRole("tab", { name: "Перейти до модуля Їжа" }));
    expect(openHubModule).toHaveBeenCalledTimes(1);
  });
});

describe("ModuleSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks only the active tab as selected", () => {
    render(<ModuleSwitcher active="routine" className="switcher-extra" />);

    const tablist = screen.getByRole("tablist");
    expect(tablist.className).toContain("switcher-extra");
    for (const tab of within(tablist).getAllByRole("tab")) {
      const selected = tab.getAttribute("aria-selected") === "true";
      expect(tab.tabIndex).toBe(selected ? 0 : -1);
    }
  });
});

describe("ModuleHeader buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs callbacks from icon, back, hub, chevron and settings buttons", () => {
    const onIcon = vi.fn();
    const onBack = vi.fn();
    const onHub = vi.fn();
    const onChevron = vi.fn();
    const onSettings = vi.fn();
    render(
      <>
        <ModuleHeaderIconButton ariaLabel="Іконка" onClick={onIcon}>
          I
        </ModuleHeaderIconButton>
        <ModuleHeaderBackButton onClick={onBack} label="" />
        <ModuleHeaderHubButton onClick={onHub} />
        <ModuleHeaderChevronButton onClick={onChevron} ariaLabel="До списку" />
        <ModuleHeaderSettingsButton onClick={onSettings} title="Налаштувати" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Іконка" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    fireEvent.click(screen.getByRole("button", { name: "На хаб" }));
    fireEvent.click(screen.getByRole("button", { name: "До списку" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Налаштування модуля" }),
    );

    expect(onIcon).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onHub).toHaveBeenCalledTimes(1);
    expect(onChevron).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Назад")).toBeNull();
    expect(screen.getByTitle("Налаштувати")).toBeInTheDocument();
  });

  it("opens the assistant through the hub bus", () => {
    render(<ModuleHeaderAssistantButton ariaLabel="AI" title="Асистент" />);

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(emitHubBus).toHaveBeenCalledWith("openChat", {
      message: null,
      autoSend: false,
    });
    expect(screen.getByTitle("Асистент")).toBeInTheDocument();
  });
});
