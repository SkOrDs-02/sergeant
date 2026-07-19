/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { SectionErrorBoundary } from "./SectionErrorBoundary";

afterEach(cleanup);

function Boom(): never {
  throw new Error("kaboom");
}

describe("SectionErrorBoundary", () => {
  it("renders children when there is no error", () => {
    const { getByText } = render(
      <SectionErrorBoundary>
        <div>ok content</div>
      </SectionErrorBoundary>,
    );
    expect(getByText("ok content")).toBeInTheDocument();
  });

  it("renders the default fallback with the error message when a child throws", () => {
    // Suppress React's noisy error-boundary console.error during this test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = render(
      <SectionErrorBoundary>
        <Boom />
      </SectionErrorBoundary>,
    );
    expect(getByText("Помилка")).toBeInTheDocument();
    expect(getByText("kaboom")).toBeInTheDocument();
    expect(getByText("Відновити")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("uses custom title and resetLabel props", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = render(
      <SectionErrorBoundary title="Збій" resetLabel="Спробувати ще">
        <Boom />
      </SectionErrorBoundary>,
    );
    expect(getByText("Збій")).toBeInTheDocument();
    expect(getByText("Спробувати ще")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("clears the error and calls onReset when the reset button is clicked", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();
    let shouldThrow = true;
    function Toggle() {
      if (shouldThrow) throw new Error("first failure");
      return <div>recovered</div>;
    }
    const { getByText } = render(
      <SectionErrorBoundary onReset={onReset}>
        <Toggle />
      </SectionErrorBoundary>,
    );
    expect(getByText("first failure")).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(getByText("Відновити"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(getByText("recovered")).toBeInTheDocument();
    spy.mockRestore();
  });
});
