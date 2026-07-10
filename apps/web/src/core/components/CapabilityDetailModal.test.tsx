/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { AssistantCapability } from "@sergeant/shared";

import { CapabilityDetailModal } from "./CapabilityDetailModal";

afterEach(cleanup);

const safeCapability: AssistantCapability = {
  id: "log_meal",
  module: "nutrition",
  label: "Записати прийом їжі",
  icon: "utensils",
  description: "Додай продукти до щоденника харчування.",
  examples: ["додай 200 г рису", "запиши сніданок"],
  prompt: "Запиши прийом їжі: ",
  requiresInput: true,
  requiresOnline: false,
};

const riskyCapability: AssistantCapability = {
  id: "hide_transaction",
  module: "finyk",
  label: "Приховати транзакцію",
  icon: "eye-off",
  description: "Прибрати транзакцію зі статистики (без видалення).",
  examples: ["сховай транзакцію m_42 зі звіту"],
  prompt: "Сховай транзакцію: ",
  requiresInput: true,
  risky: true,
  requiresOnline: true,
};

describe("CapabilityDetailModal", () => {
  it("renders nothing when capability is null", () => {
    render(
      <CapabilityDetailModal
        capability={null}
        onClose={vi.fn()}
        onTryInChat={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows label, description, and examples when open", () => {
    render(
      <CapabilityDetailModal
        capability={safeCapability}
        onClose={vi.fn()}
        onTryInChat={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(safeCapability.label)).toBeTruthy();
    expect(screen.getByText(safeCapability.description)).toBeTruthy();
    expect(screen.getByText("Приклади")).toBeTruthy();
    for (const example of safeCapability.examples) {
      expect(screen.getByText(`«${example}»`)).toBeTruthy();
    }
  });

  it("shows a warning banner for risky capabilities", () => {
    render(
      <CapabilityDetailModal
        capability={riskyCapability}
        onClose={vi.fn()}
        onTryInChat={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Критична дія\. Перевір дані перед відправкою/),
    ).toBeTruthy();
  });

  it("fires onTryInChat with the capability when the primary action is clicked", () => {
    const onTryInChat = vi.fn();

    render(
      <CapabilityDetailModal
        capability={safeCapability}
        onClose={vi.fn()}
        onTryInChat={onTryInChat}
      />,
    );

    fireEvent.click(
      screen.getByTestId(`capability-detail-try-${safeCapability.id}`),
    );

    expect(onTryInChat).toHaveBeenCalledTimes(1);
    expect(onTryInChat).toHaveBeenCalledWith(safeCapability);
  });
});
