/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { ModuleBlock } from "./WeeklyDigestModuleBlock";

afterEach(cleanup);

describe("WeeklyDigestModuleBlock", () => {
  it("текстовий рядок зберігає факт, coverage та всі рекомендації при розкритті", () => {
    const { container } = render(
      <ModuleBlock
        moduleKey="nutrition"
        badge="· залоговано 2/7"
        data={{
          summary: "Два дні записів",
          comment: "Середнє лише за записані дні: 1900 ккал.",
          recommendations: ["Запиши вечерю", "Перевір ціль білка"],
        }}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Їжа/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const body = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    )!;
    expect(within(body).queryByRole("paragraph")).toBeNull();
    // Єдиний гліф рядка - шеврон стану, інших іконок немає.
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(toggle.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Два дні записів")).toBeInTheDocument();
    expect(screen.getByText("· залоговано 2/7")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(body).getByRole("paragraph")).toHaveTextContent(
      "Середнє лише за записані дні: 1900 ккал.",
    );
    expect(
      screen.getByText("Середнє лише за записані дні: 1900 ккал."),
    ).toBeInTheDocument();
    expect(screen.getByText("Запиши вечерю")).toBeInTheDocument();
    expect(screen.getByText("Перевір ціль білка")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
