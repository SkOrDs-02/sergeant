/** @vitest-environment jsdom */
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  moduleAccentRgb,
  type ModuleAccent,
} from "@sergeant/design-tokens/tokens";
import { ModuleAccentProvider, useModuleAccent } from "./ModuleAccentProvider";

const MODULES: ModuleAccent[] = ["finyk", "fizruk", "routine", "nutrition"];

function AccentProbe() {
  const accent = useModuleAccent();
  return <span data-testid="probe">{accent ?? "none"}</span>;
}

afterEach(cleanup);

describe("ModuleAccentProvider", () => {
  it.each(MODULES)(
    "публікує --module-accent-rgb + --module-accent-strong-rgb для %s",
    (mod) => {
      const { container } = render(
        <ModuleAccentProvider module={mod}>
          <AccentProbe />
        </ModuleAccentProvider>,
      );
      const wrapper = container.firstChild as HTMLElement;

      // Значення тягнуться з design-tokens SSOT — guard від drift
      // between React and Tailwind.
      expect(wrapper.style.getPropertyValue("--module-accent-rgb")).toBe(
        moduleAccentRgb[mod].default,
      );
      expect(wrapper.style.getPropertyValue("--module-accent-strong-rgb")).toBe(
        moduleAccentRgb[mod].strong,
      );
    },
  );

  it.each(MODULES)("ставить data-module-accent=%s на wrapper", (mod) => {
    const { container } = render(
      <ModuleAccentProvider module={mod}>
        <AccentProbe />
      </ModuleAccentProvider>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute("data-module-accent")).toBe(mod);
  });

  it.each(MODULES)("useModuleAccent() повертає поточний %s", (mod) => {
    const { getByTestId } = render(
      <ModuleAccentProvider module={mod}>
        <AccentProbe />
      </ModuleAccentProvider>,
    );
    expect(getByTestId("probe").textContent).toBe(mod);
  });

  it("useModuleAccent() повертає null поза провайдером", () => {
    const { getByTestId } = render(<AccentProbe />);
    expect(getByTestId("probe").textContent).toBe("none");
  });

  it("asShellRoot додає flex-column viewport класи", () => {
    const { container } = render(
      <ModuleAccentProvider module="finyk" asShellRoot>
        <AccentProbe />
      </ModuleAccentProvider>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("h-dvh");
    expect(wrapper.className).toContain("flex");
    expect(wrapper.className).toContain("flex-col");
  });
});

describe("moduleAccentRgb (design-tokens SSOT)", () => {
  it("defines a default + strong triplet for every module", () => {
    for (const mod of MODULES) {
      expect(moduleAccentRgb[mod]).toMatchObject({
        default: expect.stringMatching(/^\d+\s+\d+\s+\d+$/),
        strong: expect.stringMatching(/^\d+\s+\d+\s+\d+$/),
      });
    }
  });

  it("strong triplet is darker than default (sum of channels)", () => {
    // Heuristic rather than a full WCAG calc — if this flips, someone
    // swapped `default` and `strong` by accident.
    for (const mod of MODULES) {
      const sumDefault = moduleAccentRgb[mod].default
        .split(/\s+/)
        .reduce((acc, n) => acc + Number(n), 0);
      const sumStrong = moduleAccentRgb[mod].strong
        .split(/\s+/)
        .reduce((acc, n) => acc + Number(n), 0);
      expect(sumStrong, `expected ${mod} strong to be darker`).toBeLessThan(
        sumDefault,
      );
    }
  });
});
