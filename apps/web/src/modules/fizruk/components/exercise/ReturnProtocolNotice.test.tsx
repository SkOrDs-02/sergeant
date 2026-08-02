// @vitest-environment jsdom
/**
 * Протокол повернення — окремий продуктовий стан (канон `fizruk.md` §6).
 *
 * Тести пінять саме контракт довіри: у мʼякому режимі видно ЗНИЖЕНИЙ
 * орієнтир і причину, а поза ним картки немає взагалі.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { computeOneRmAging } from "@sergeant/fizruk-domain/domain";
import { ReturnProtocolNotice } from "./ReturnProtocolNotice";

const NOW = new Date("2026-08-02T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

afterEach(cleanup);

describe("ReturnProtocolNotice", () => {
  it("мовчить, поки 1RM свіжа", () => {
    const aging = computeOneRmAging({
      peak1rm: 120,
      lastSessionAt: daysAgo(3),
      now: NOW,
    });
    const { container } = render(<ReturnProtocolNotice aging={aging} />);
    expect(container.firstChild).toBeNull();
  });

  it("після довгої перерви показує знижений орієнтир, а не пік", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(56),
      now: NOW,
    });
    render(<ReturnProtocolNotice aging={aging} />);
    expect(screen.getByText(/Рекорд застарів/)).toBeTruthy();
    // 4 тижні понад поріг × 2.5% = −10% → 90 кг, і на екрані саме воно.
    expect(screen.getByText(/орієнтир: 90 кг/)).toBeTruthy();
    expect(screen.getByText(/−10%/)).toBeTruthy();
  });

  it("після зняття позначки травми називає саме цю причину", () => {
    const aging = computeOneRmAging({
      peak1rm: 100,
      lastSessionAt: daysAgo(2),
      injuryClearedAt: daysAgo(1),
      now: NOW,
    });
    render(<ReturnProtocolNotice aging={aging} />);
    expect(screen.getByText(/Повернення після позначки/)).toBeTruthy();
    expect(screen.getByText(/орієнтир: 90 кг/)).toBeTruthy();
  });
});
