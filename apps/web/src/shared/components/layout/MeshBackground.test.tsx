// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CSSProperties } from "react";
import { MeshBackground } from "./MeshBackground";

describe("MeshBackground", () => {
  it("renders children inside the app-height mesh shell", () => {
    render(
      <MeshBackground data-testid="mesh">
        <main>Hub content</main>
      </MeshBackground>,
    );

    const mesh = screen.getByTestId("mesh");
    expect(mesh).toHaveTextContent("Hub content");
    expect(mesh.className).toContain("h-app-dvh");
    expect(mesh.className).toContain("flex-col");
    expect(mesh.className).toContain("overflow-x-hidden");
    expect(mesh.className).toContain("overflow-y-hidden");
    expect(mesh.className).toContain("bg-mesh");
  });

  it("merges shell classes and inline CSS variables from callers", () => {
    render(
      <MeshBackground
        data-testid="mesh"
        className="module-shell"
        style={{ "--bottom-nav-height": "72px" } as CSSProperties}
      >
        <span>Module</span>
      </MeshBackground>,
    );

    const mesh = screen.getByTestId("mesh");
    expect(mesh.className).toContain("bg-mesh");
    expect(mesh.className).toContain("module-shell");
    expect(mesh.style.getPropertyValue("--bottom-nav-height")).toBe("72px");
  });

  // Regression (browser QA 2026-08-23): `/sign-in` не скролився на 720px і
  // нижче — кнопка реєстрації та легальні лінки лишались недосяжними. Одна
  // з двох половин причини: базовий шорткат `overflow-hidden` не витіснявся
  // переданим `overflow-y-auto`, бо tailwind-merge зводить різні групи.
  it("lets a caller take over the vertical scroll axis", () => {
    render(
      <MeshBackground data-testid="mesh" className="overflow-y-auto">
        <span>Auth</span>
      </MeshBackground>,
    );

    const mesh = screen.getByTestId("mesh");
    expect(mesh.className).toContain("overflow-y-auto");
    expect(mesh.className).not.toContain("overflow-y-hidden");
    // Горизонтальна вісь лишається закритою — це шел, а не карусель.
    expect(mesh.className).toContain("overflow-x-hidden");
  });
});
