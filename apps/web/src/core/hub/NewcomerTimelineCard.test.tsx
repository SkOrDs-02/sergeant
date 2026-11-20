/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NewcomerTimelineCard } from "./NewcomerTimelineCard";

describe("NewcomerTimelineCard", () => {
  afterEach(() => cleanup());

  it("показує що й коли зʼявиться, з прогресом звʼязків", () => {
    render(
      <NewcomerTimelineCard
        activeModules={["finyk", "fizruk", "routine", "nutrition"]}
        signedIn
        sharedDays={0}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Що зʼявиться і коли" }),
    ).toBeTruthy();
    expect(screen.getByText("Три факти з історії банку")).toBeTruthy();
    expect(screen.getByText("Звіт тижня")).toBeTruthy();
    expect(
      screen.getByText("Після 10 днів із записами у двох сферах"),
    ).toBeTruthy();
    expect(screen.getByText("0 з 10 днів")).toBeTruthy();
    // Смуги «Модулів увімкнено» більше немає.
    expect(screen.queryByText(/Модулів увімкнено/)).toBeNull();
  });

  it("гість з одним модулем без Фініка не бачить картки", () => {
    const { container } = render(
      <NewcomerTimelineCard
        activeModules={["fizruk"]}
        signedIn={false}
        sharedDays={0}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
