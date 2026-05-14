// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OutcomeCard } from "./OutcomeCard";

describe("OutcomeCard", () => {
  it("renders an accessible cold-start heading and module actions", () => {
    const onOpenModule = vi.fn();
    render(
      <OutcomeCard
        activeModules={["finyk", "nutrition"]}
        primaryModule="nutrition"
        onOpenModule={onOpenModule}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /живого запису/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Зрозуміти харчування/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Відкрити/i }));
    expect(onOpenModule).toHaveBeenCalledWith("nutrition");

    fireEvent.click(screen.getByLabelText(/Побачити гроші/i));
    expect(onOpenModule).toHaveBeenCalledWith("finyk");
  });
});
