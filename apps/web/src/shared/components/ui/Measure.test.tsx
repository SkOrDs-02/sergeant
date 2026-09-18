/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Тести `Measure` (анти-слоп П4 поза Фініком).
 *
 * Компонент розкладає число по вузлах, тож рядкові матчери тут не
 * працюють — усе звіряється через `textContent`. Невидимі символи —
 * ЛИШЕ константами (`NARROW_NBSP` перед одиницею, `\u00a0` між
 * розрядами): літерал у коді ловить `no-irregular-whitespace` і
 * читається як випадковість, а тут він — предмет перевірки.
 */
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NARROW_NBSP } from "@sergeant/shared";
import { Measure } from "./Measure";

afterEach(cleanup);

function textOf(testId: string): string {
  return screen.getByTestId(testId).textContent ?? "";
}

describe("Measure", () => {
  it("ставить вузький нерозривний перед одиницею", () => {
    render(
      <span data-testid="m">
        <Measure value={420} unit="ккал" />
      </span>,
    );
    expect(textOf("m")).toBe(`420${NARROW_NBSP}ккал`);
  });

  it("нормалізує знак у U+2212, а не дефіс", () => {
    render(
      <span data-testid="m">
        <Measure value={-2.5} unit="кг" fractionDigits={1} />
      </span>,
    );
    expect(textOf("m")).toBe(`−2,5${NARROW_NBSP}кг`);
    expect(textOf("m")).not.toContain("-");
  });

  it("додає плюс лише на прохання", () => {
    render(
      <>
        <span data-testid="plain">
          <Measure value={3} unit="кг" />
        </span>
        <span data-testid="signed">
          <Measure value={3} unit="кг" signed />
        </span>
      </>,
    );
    expect(textOf("plain")).toBe(`3${NARROW_NBSP}кг`);
    expect(textOf("signed")).toBe(`+3${NARROW_NBSP}кг`);
  });

  /**
   * Головна відмінність від `Money`: дробова частина НЕ демотується.
   * 0,5 кг — пʼята частина 2,5 кг, тоді як копійка — сота частка гривні.
   */
  it("тримає дробову частину повним кеглем", () => {
    const { container } = render(
      <Measure value={2.5} unit="кг" fractionDigits={1} />,
    );
    const demoted = container.querySelectorAll(".text-\\[0\\.64em\\]");
    expect(demoted).toHaveLength(0);
    // Число цілком — один текстовий вузол, а не два.
    expect(container.textContent).toBe(`2,5${NARROW_NBSP}кг`);
  });

  it("демотує знак і одиницю окремими вузлами", () => {
    const { container } = render(<Measure value={-7} unit="%" />);
    expect(container.querySelector(".text-\\[0\\.78em\\]")?.textContent).toBe(
      "−",
    );
    expect(container.querySelector(".text-\\[0\\.72em\\]")?.textContent).toBe(
      `${NARROW_NBSP}%`,
    );
  });

  it("порожня одиниця не лишає привида пробілу", () => {
    render(
      <span data-testid="m">
        <Measure value={140} unit="" />
      </span>,
    );
    expect(textOf("m")).toBe("140");
  });

  it("групує розряди за uk-UA", () => {
    render(
      <span data-testid="m">
        <Measure value={12500} unit="кг×повт" />
      </span>,
    );
    // Нерозривний пробіл між розрядами — з локалі, не з рук.
    expect(textOf("m")).toBe(`12\u00a0500${NARROW_NBSP}кг×повт`);
  });

  it("tabular-nums стоїть завжди — колонка має лишатись колонкою", () => {
    const { container } = render(<Measure value={9} unit="кг" />);
    expect(container.firstElementChild?.className).toContain("tabular-nums");
  });

  it("тон inherit гасить тири прозорістю, а не власним кольором", () => {
    const { container } = render(
      <Measure value={-9} unit="кг" tone="inherit" />,
    );
    const sign = container.querySelector(".text-\\[0\\.78em\\]");
    expect(sign?.className).toContain("opacity-65");
    expect(sign?.className).not.toContain("text-muted");
  });
});
