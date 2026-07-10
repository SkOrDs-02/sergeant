// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmupCooldownChecklist } from "./WarmupCooldownChecklist";

const color = { border: "border-fizruk/30", text: "text-fizruk" };

afterEach(cleanup);

describe("WarmupCooldownChecklist", () => {
  it("shows an add prompt when items are null", () => {
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
    expect(onInit).toHaveBeenCalledOnce();
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

  it("shows success styling when every item is done", () => {
    render(
      <WarmupCooldownChecklist
        title="Розминка"
        items={[{ id: "a", label: "Стрибки", done: true }]}
        onToggle={vi.fn()}
        onInit={vi.fn()}
        color={color}
      />,
    );
    expect(screen.getByText("1/1")).toHaveClass("text-success-strong");
  });
});
