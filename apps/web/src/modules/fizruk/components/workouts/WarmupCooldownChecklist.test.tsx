// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WarmupCooldownChecklist } from "./WarmupCooldownChecklist";

const color = { border: "border-fizruk/30", text: "text-fizruk" };

describe("WarmupCooldownChecklist", () => {
  afterEach(cleanup);

  it("shows add prompt when items are null and calls onInit", () => {
    const onInit = vi.fn();
    render(
      <WarmupCooldownChecklist
        title="Розминка"
        items={null}
        onToggle={vi.fn()}
        onInit={onInit}
        color={color}
      />,
    );

    expect(screen.getByText("Розминка")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(onInit).toHaveBeenCalledTimes(1);
  });

  it("renders checklist items and toggles completion", () => {
    const onToggle = vi.fn();
    render(
      <WarmupCooldownChecklist
        title="Заминка"
        items={[
          { id: "a", label: "Розтяжка", done: false },
          { id: "b", label: "Дихання", done: true },
        ]}
        onToggle={onToggle}
        onInit={vi.fn()}
        color={color}
      />,
    );

    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Позначити як завершене" }),
    );
    expect(onToggle).toHaveBeenCalledWith("a");
  });

  it("shows success styling when all items are done", () => {
    render(
      <WarmupCooldownChecklist
        title="Розминка"
        items={[{ id: "a", label: "Біг", done: true }]}
        onToggle={vi.fn()}
        onInit={vi.fn()}
        color={color}
      />,
    );

    expect(screen.getByText("1/1")).toHaveClass("text-success-strong");
  });
});
