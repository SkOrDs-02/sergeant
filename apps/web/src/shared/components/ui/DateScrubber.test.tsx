// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { DateScrubber } from "./DateScrubber";

describe("DateScrubber", () => {
  it("підписує сьогоднішній чіп повним словом, а не обрубком «Сьог»", () => {
    render(
      <DateScrubber value={getKyivDayKey()} onChange={vi.fn()} days={3} />,
    );
    const today = screen.getByRole("radio", { name: /^Сьогодні, \d+$/ });
    expect(today).toHaveTextContent(/^Сьогодні\d+$/);
  });
});
