// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WarmupCooldownChecklist } from "./WarmupCooldownChecklist";

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
      />,
    );

    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Розтяжка: позначити як завершене" }),
    );
    expect(onToggle).toHaveBeenCalledWith("a");
  });

  it("gives each toggle a distinct accessible name that includes the item label", () => {
    render(
      <WarmupCooldownChecklist
        title="Заминка"
        items={[
          { id: "a", label: "Розтяжка", done: false },
          { id: "b", label: "Дихання", done: true },
        ]}
        onToggle={vi.fn()}
        onInit={vi.fn()}
      />,
    );

    // Both toggles previously shared the generic "Позначити як
    // завершене/незавершене" name, so a screen reader could not tell
    // them apart. Each accessible name must now carry the item label.
    expect(
      screen.getByRole("button", { name: "Розтяжка: позначити як завершене" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Дихання: позначити як незавершене",
      }),
    ).toBeInTheDocument();
  });

  it("shows success styling when all items are done", () => {
    render(
      <WarmupCooldownChecklist
        title="Розминка"
        items={[{ id: "a", label: "Біг", done: true }]}
        onToggle={vi.fn()}
        onInit={vi.fn()}
      />,
    );

    expect(screen.getByText("1/1")).toHaveClass("text-success-strong");
  });
});
