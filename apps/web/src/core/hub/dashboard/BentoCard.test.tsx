/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { BentoCard } from "./BentoCard";
import type { ModuleConfig } from "./moduleConfigs";
import { moduleHasRealEntry } from "../../onboarding/firstRealEntry";

vi.mock("../../onboarding/firstRealEntry", () => ({
  moduleHasRealEntry: vi.fn(() => false),
}));

const hasRealEntryMock = vi.mocked(moduleHasRealEntry);

function makeConfig(
  preview: ReturnType<ModuleConfig["getPreview"]>,
  overrides: Partial<ModuleConfig> = {},
): ModuleConfig {
  return {
    icon: "✓",
    label: "Рутина",
    emoji: "✓",
    module: "routine",
    iconClass: "bg-routine-soft text-routine",
    accentClass: "bg-routine",
    inkClass: "text-routine",
    cardBg: "bg-panel border-routine/30",
    description: "Звички та щоденні цілі",
    hasGoal: true,
    emptyLabel: "Почни тут →",
    emptyPromise: "Тут зʼявиться прогрес дня, напр.",
    emptyExample: "3/5",
    getPreview: () => preview,
    ...overrides,
  };
}

describe("BentoCard", () => {
  afterEach(() => {
    cleanup();
    hasRealEntryMock.mockReset();
    hasRealEntryMock.mockReturnValue(false);
  });

  it("summarizes live preview data in the button label and caps progress width", () => {
    const onClick = vi.fn();
    const primaryRef = vi.fn();
    const { container } = render(
      <BentoCard
        config={makeConfig({ main: "4/5", sub: "Серія: 3 дні", progress: 125 })}
        onClick={onClick}
        primaryRef={primaryRef}
        primaryProps={{ "data-testid": "primary-card" }}
      />,
    );

    const card = screen.getByRole("button", {
      name: "Рутина: 4/5, Серія: 3 дні",
    });
    fireEvent.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(card.className).toContain("select-none");
    expect(primaryRef).toHaveBeenCalledWith(screen.getByTestId("primary-card"));
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText("Серія: 3 дні")).toBeInTheDocument();
    expect(container.querySelector('[style="width: 100%;"]')).toBeTruthy();
  });

  it("renders empty and inactive states with distinct accessible labels", () => {
    const { rerender } = render(
      <BentoCard
        config={makeConfig({ main: null, sub: null, progress: 0 })}
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Рутина: Почни тут →" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Звички та щоденні цілі")).toBeInTheDocument();

    rerender(
      <BentoCard
        config={makeConfig({ main: "4/5", sub: "Серія: 3 дні", progress: 80 })}
        inactive
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Рутина: неактивний модуль. Увімкнути в налаштуваннях Hub.",
      }),
    ).toHaveAttribute("data-inactive", "true");
    expect(
      screen.getByText("Неактивний: увімкнути в налаштуваннях"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Серія: 3 дні")).not.toBeInTheDocument();
  });

  it("shows edit-mode drag handle and explainable adaptive lift reason", () => {
    const handleRef = vi.fn();
    const onPointerDown = vi.fn();

    render(
      <BentoCard
        config={makeConfig({ main: "2/5", sub: null, progress: 40 })}
        onClick={vi.fn()}
        editMode
        handleRef={handleRef}
        handleProps={{ onPointerDown }}
        adaptiveReason="ранкова кава"
      />,
    );

    const handle = screen.getByRole("button", { name: "Перетягнути Рутина" });
    fireEvent.pointerDown(handle);

    expect(screen.getByText("ранкова кава")).toBeInTheDocument();
    expect(handleRef).toHaveBeenCalledWith(handle);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  // Regression: половина знімка quick-stats може бути `null` (стрік є,
  // тренувань цього тижня нема; ціль калорій задана, зʼїдено нуль). Раніше
  // це їхало в шаблон і озвучувалось як «Фізрук: null, Серія: 1 тиждень».
  it.each([
    {
      name: "fizruk",
      config: { label: "Фізрук", module: "fizruk" },
      preview: { main: null, sub: "Серія: 1 тиждень" },
      expected: "Фізрук: Серія: 1 тиждень",
      forbidden: "Фізрук: null, Серія: 1 тиждень",
    },
    {
      name: "nutrition",
      config: { label: "Їжа", module: "nutrition" },
      preview: { main: null, sub: "Ціль: 2000 ккал", progress: 0 },
      expected: "Їжа: Ціль: 2000 ккал",
      forbidden: "Їжа: null, Ціль: 2000 ккал",
    },
  ])(
    "never leaks a literal null into the $name tile label",
    ({ config, preview, expected, forbidden }) => {
      render(
        <BentoCard config={makeConfig(preview, config)} onClick={vi.fn()} />,
      );

      const card = screen.getByRole("button", { name: expected });
      expect(card.getAttribute("aria-label")).not.toContain("null");
      expect(screen.queryByRole("button", { name: forbidden })).toBeNull();
    },
  );

  it("keeps the FTUX call-to-action for a module with no entries ever", () => {
    hasRealEntryMock.mockReturnValue(false);

    render(
      <BentoCard
        config={makeConfig({ main: null, sub: null, progress: 0 })}
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Рутина: Почни тут →" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("bento-dormant")).toBeNull();
  });

  it("drops the FTUX call-to-action once the module has history", () => {
    hasRealEntryMock.mockReturnValue(true);

    render(
      <BentoCard
        config={makeConfig(
          { main: null, sub: null, progress: 0 },
          { label: "Їжа", module: "nutrition" },
        )}
        onClick={vi.fn()}
      />,
    );

    expect(hasRealEntryMock).toHaveBeenCalledWith("nutrition");
    expect(screen.getByTestId("bento-dormant")).toHaveTextContent(
      "Сьогодні ще порожньо",
    );
    expect(screen.queryByText(/Почни тут/)).toBeNull();
    const card = screen.getByRole("button", { name: /Сьогодні ще порожньо/ });
    expect(card.getAttribute("aria-label")).not.toContain("Почни тут");
  });

  it("re-reads quick stats after a same-tab storage update", () => {
    let preview: ReturnType<ModuleConfig["getPreview"]> = {
      main: null,
      sub: null,
    };
    const config = makeConfig(preview);
    config.getPreview = () => preview;

    render(<BentoCard config={config} onClick={vi.fn()} />);
    expect(screen.getByText(config.emptyPromise)).toBeInTheDocument();

    preview = { main: "0 ₴", sub: null };
    act(() => emitHubBus("storageUpdated", undefined));

    expect(screen.getByText("0 ₴")).toBeInTheDocument();
    expect(screen.queryByText(config.emptyPromise)).not.toBeInTheDocument();
  });
});
