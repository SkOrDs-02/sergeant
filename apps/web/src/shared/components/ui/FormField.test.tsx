/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FormField, Label } from "./FormField";

afterEach(cleanup);

describe("Label", () => {
  it("renders the uppercase eyebrow by default", () => {
    render(<Label>Сума</Label>);
    const label = screen.getByText("Сума");
    expect(label.className).toContain("uppercase");
  });

  it("normalCase switches to the label style", () => {
    render(<Label normalCase>Назва</Label>);
    const label = screen.getByText("Назва");
    expect(label.className).toContain("text-style-label");
    expect(label.className).not.toContain("uppercase");
  });

  it("optional appends the · необов'язково suffix", () => {
    render(<Label optional>Нотатка</Label>);
    expect(screen.getByText(/необов/)).toBeInTheDocument();
  });
});

describe("FormField", () => {
  it("wires label htmlFor to the auto-generated control id", () => {
    render(
      <FormField label="Email">
        <input data-testid="ctl" />
      </FormField>,
    );
    const input = screen.getByTestId("ctl");
    const label = screen.getByText("Email") as HTMLLabelElement;
    expect(label.htmlFor).toBeTruthy();
    expect(input.id).toBe(label.htmlFor);
  });

  it("respects an explicit htmlFor", () => {
    render(
      <FormField label="Name" htmlFor="my-id">
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(screen.getByTestId("ctl").id).toBe("my-id");
    expect((screen.getByText("Name") as HTMLLabelElement).htmlFor).toBe(
      "my-id",
    );
  });

  it("renders helperText linked via aria-describedby", () => {
    render(
      <FormField label="Field" helperText="Підказка">
        <input data-testid="ctl" />
      </FormField>,
    );
    const input = screen.getByTestId("ctl");
    const hint = screen.getByText("Підказка");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(hint.id).toMatch(/-hint$/);
  });

  it("error overrides helperText, marks the control invalid and uses role=alert", () => {
    render(
      <FormField label="Field" helperText="Підказка" error="Обовʼязкове поле">
        <input data-testid="ctl" />
      </FormField>,
    );
    const input = screen.getByTestId("ctl");
    const err = screen.getByRole("alert");
    expect(err.textContent).toBe("Обовʼязкове поле");
    expect(screen.queryByText("Підказка")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(err.id);
    expect(err.id).toMatch(/-error$/);
  });

  it("does not override an id the child already provides", () => {
    render(
      <FormField label="Field">
        <input data-testid="ctl" id="explicit-child-id" />
      </FormField>,
    );
    expect(screen.getByTestId("ctl").id).toBe("explicit-child-id");
  });

  it("leaves multiple children untouched (no id cloning)", () => {
    render(
      <FormField label="Group">
        <input data-testid="a" />
        <input data-testid="b" />
      </FormField>,
    );
    // With >1 child, no aria plumbing is cloned onto either.
    expect(screen.getByTestId("a").getAttribute("aria-describedby")).toBeNull();
    expect(screen.getByTestId("b").getAttribute("aria-describedby")).toBeNull();
  });

  it("renders without a label when none is given", () => {
    const { container } = render(
      <FormField>
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(container.querySelector("label")).toBeNull();
  });
});
