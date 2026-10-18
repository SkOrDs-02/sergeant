// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DayProgress } from "./DayProgress";

afterEach(cleanup);
describe("DayProgress", () => {
  it("opens the report with the complete accessible day count", () => {
    const onClick = vi.fn();
    render(<DayProgress completed={2} scheduled={5} onClick={onClick} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("з 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Прогрес дня: 2 з 5/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("does not present an empty day as a zero percent failure", () => {
    render(<DayProgress completed={0} scheduled={0} />);
    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.queryByText("з 0")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /нічого не заплановано/ }),
    ).toBeInTheDocument();
  });
  it("keeps six-digit counts readable without thousands of DOM cells", () => {
    const { container } = render(
      <DayProgress completed={123456} scheduled={123456} />,
    );
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.getByText("з 123456")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /123456 з 123456/ }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("*").length).toBeLessThan(15);
    expect(container.querySelector("svg")).toBeNull();
  });
});
