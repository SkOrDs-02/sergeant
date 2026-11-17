/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Пін на те, що `ModuleAccentProvider` кнопку НЕ фарбує (redesign v3.2,
 * позиція 18): головна дія модуля - `solid` чорнилом, як скрізь. До
 * 2026-10-23 контекст підміняв беспропний `solid` / `primary` заливкою
 * модуля, і «Згенерувати денний план» у Їжі виходив лаймовим. Hue модуля на
 * кнопці можливий лише явним `tone` у hero, і це міряє `hueOnButton`.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";
import { ModuleAccentProvider } from "../layout/ModuleAccentProvider";

function cls(name: string): string {
  return screen.getByRole("button", { name }).className;
}

describe("Button × ModuleAccentProvider", () => {
  it("беспропний primary усередині модуля лишається чорнилом", () => {
    render(
      <ModuleAccentProvider module="nutrition">
        <Button>Зберегти</Button>
        <Button variant="solid">Згенерувати денний план</Button>
      </ModuleAccentProvider>,
    );
    for (const name of ["Зберегти", "Згенерувати денний план"]) {
      const c = cls(name);
      expect(c).toContain("bg-text");
      expect(c).not.toContain("nutrition");
    }
  });

  it("явний tone модуля (hero) лишається модульним", () => {
    render(
      <ModuleAccentProvider module="finyk">
        <Button variant="solid" tone="fizruk">
          Почати
        </Button>
      </ModuleAccentProvider>,
    );
    expect(cls("Почати")).toContain("bg-fizruk-strong");
  });

  it("outline і ghost усередині модуля не стають суцільними", () => {
    render(
      <ModuleAccentProvider module="finyk">
        <Button variant="outline">Витрати</Button>
        <Button variant="ghost">Закрити</Button>
      </ModuleAccentProvider>,
    );
    expect(cls("Витрати")).toContain("border-border-strong");
    expect(cls("Закрити")).not.toContain("finyk");
  });

  it("danger усередині модуля лишається небезпечним", () => {
    render(
      <ModuleAccentProvider module="nutrition">
        <Button variant="danger">Видалити</Button>
      </ModuleAccentProvider>,
    );
    expect(cls("Видалити")).not.toContain("nutrition");
  });
});
