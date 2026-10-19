// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const { hapticTap, emitHubBus, openHubModule, openHubSettingsSection } =
  vi.hoisted(() => ({
    hapticTap: vi.fn(),
    emitHubBus: vi.fn(),
    openHubModule: vi.fn(),
    openHubSettingsSection: vi.fn(),
  }));

vi.mock("@shared/lib/adapters/haptic", () => ({ hapticTap }));
vi.mock("@shared/lib/modules/hubBus", () => ({ emitHubBus }));
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule,
  openHubSettingsSection,
}));
vi.mock("@shared/lib/modules/moduleFacts", () => ({
  MODULE_ORDER: ["finyk", "fizruk", "routine", "nutrition"],
  MODULE_HUE: {
    finyk: "bg-chart-finyk",
    fizruk: "bg-chart-fizruk",
    routine: "bg-chart-routine",
    nutrition: "bg-chart-nutrition",
  },
  readModuleFact: (id: string) => (id === "routine" ? "3 / 5" : null),
  // Їжу вимкнено в налаштуваннях дашборда.
  readActiveModules: () => ["finyk", "fizruk", "routine"],
}));

import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderChevronButton,
  ModuleHeaderHubButton,
  ModuleHeaderIconButton,
} from "./ModuleHeader";

describe("ModuleHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the default title stack and optional slots", () => {
    render(
      <ModuleHeader
        title="ФІЗРУК"
        subtitle="Тиждень 42"
        left={<button type="button">Назад</button>}
        right={<button type="button">Дія</button>}
        className="custom-header"
      />,
    );

    expect(screen.getByText("ФІЗРУК")).toBeInTheDocument();
    // Module chrome title is shell decoration, not a section heading — it
    // precedes each page's own <h1> in DOM order, so it must not register
    // as a heading (would invert the a11y heading outline).
    expect(screen.queryByRole("heading", { name: "ФІЗРУК" })).toBeNull();
    expect(screen.getByText("Тиждень 42")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Дія" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("ФІЗРУК").closest(".custom-header")).not.toBeNull();
  });

  it("мова H: titleSlot, без ряду модулів, без скла й зони", () => {
    const { container } = render(
      <ModuleHeader
        module="finyk"
        titleSlot={<div data-testid="title-slot">Custom title</div>}
      />,
    );

    expect(screen.getByTestId("title-slot")).toHaveTextContent("Custom title");
    expect(screen.queryByRole("tablist")).toBeNull();
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("bg-bg");
    expect(cls).not.toMatch(/blur|zone/);
  });

  it("назва модуля 26 / 700", () => {
    render(<ModuleHeader module="nutrition" title="Їжа" />);
    expect(screen.getByTestId("module-header-title").className).toContain(
      "text-style-headline",
    );
  });
});

describe("ModuleHeader: перемикач модулів", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSwitcher(onOpenSettings = vi.fn()) {
    render(
      <ModuleHeader
        module="finyk"
        switcher="finyk"
        title="Фінік"
        onOpenSettings={onOpenSettings}
      />,
    );
    return onOpenSettings;
  }

  it("тап по назві відкриває аркуш «Модулі» з чотирма модулями", () => {
    renderSwitcher();
    const title = screen.getByTestId("module-header-title");
    expect(title.tagName).toBe("BUTTON");
    expect(title).toHaveAttribute("aria-haspopup", "dialog");
    expect(title).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(title);

    expect(title).toHaveAttribute("aria-expanded", "true");
    const sheet = screen.getByRole("dialog", { name: "Модулі" });
    for (const name of ["Фінік", "Фізрук", "Рутина"]) {
      expect(
        within(sheet).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
    // Факт модуля другим рядком, як у панелі модулів хаба.
    expect(within(sheet).getByText("3 / 5")).toBeInTheDocument();
  });

  it("поточний модуль позначено aria-current і заливкою чорнилом, без тексту «Обрано»", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("module-header-title"));
    const sheet = screen.getByRole("dialog", { name: "Модулі" });
    const current = within(sheet).getByRole("button", { name: /Фінік/ });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current).toHaveClass("bg-text", "text-bg", "rounded-lg");
    expect(
      within(sheet).getByRole("button", { name: /Рутина/ }),
    ).not.toHaveAttribute("aria-current");
    expect(within(sheet).queryByText("Обрано")).toBeNull();
  });

  it("рядок іншого модуля веде туди тим самим входом, що й хаб", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("module-header-title"));
    const sheet = screen.getByRole("dialog", { name: "Модулі" });

    fireEvent.click(within(sheet).getByRole("button", { name: /Рутина/ }));

    expect(openHubModule).toHaveBeenCalledWith(
      "routine",
      undefined,
      "module_switcher",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("вимкнений модуль веде в налаштування дашборда, як панель хаба", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("module-header-title"));
    const sheet = screen.getByRole("dialog", { name: "Модулі" });
    const off = within(sheet).getByRole("button", {
      name: "Їжа: неактивний, увімкнути в налаштуваннях",
    });
    expect(off).toHaveClass("text-subtle", "hover:bg-panel");

    fireEvent.click(off);

    expect(openHubSettingsSection).toHaveBeenCalledWith("dashboard");
    expect(openHubModule).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("неактивні рядки мають hover панеллю, свотч квадратом 3 px", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("module-header-title"));
    const row = within(screen.getByRole("dialog")).getByRole("button", {
      name: /Рутина/,
    });
    expect(row).toHaveClass("hover:bg-panel", "text-text");
    expect(row.querySelector("[aria-hidden]")).toHaveClass("rounded-mark");
  });

  it("тап по поточному модулю лише закриває аркуш", () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("module-header-title"));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /Фінік/ }),
    );
    expect(openHubModule).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("«Налаштування модуля» останнім рядком кличе той самий обробник, що й колишня шестерня", () => {
    const onOpenSettings = renderSwitcher();
    fireEvent.click(screen.getByTestId("module-header-title"));
    const sheet = screen.getByRole("dialog", { name: "Модулі" });
    const rows = within(sheet).getAllByRole("button", {
      name: /Фінік|Фізрук|Рутина|Їжа|Налаштування модуля/,
    });
    expect(rows.at(-1)).toHaveTextContent("Налаштування модуля");

    fireEvent.click(rows.at(-1)!);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ModuleHeader buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs callbacks from icon, hub and chevron buttons", () => {
    const onIcon = vi.fn();
    const onHub = vi.fn();
    const onChevron = vi.fn();
    render(
      <>
        <ModuleHeaderIconButton ariaLabel="Іконка" onClick={onIcon}>
          I
        </ModuleHeaderIconButton>
        <ModuleHeaderHubButton onClick={onHub} />
        <ModuleHeaderChevronButton onClick={onChevron} ariaLabel="До списку" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Іконка" }));
    fireEvent.click(screen.getByRole("button", { name: "На хаб" }));
    fireEvent.click(screen.getByRole("button", { name: "До списку" }));

    expect(onIcon).toHaveBeenCalledTimes(1);
    expect(onHub).toHaveBeenCalledTimes(1);
    expect(onChevron).toHaveBeenCalledTimes(1);
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
