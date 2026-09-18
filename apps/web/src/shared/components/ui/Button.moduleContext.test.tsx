/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Пін на те, що кнопка бере акцент із `ModuleAccentProvider`, коли проп
 * `module` не вказано (PR-C1, рішення власника 2026-09-14) — і, що
 * важливіше, на межу цього правила.
 *
 * Найцінніші тут НЕ кейси «колір змінився», а кейси «форма НЕ змінилась».
 * Гарантія тримається на одному факті: усі беспропні виклики в репо йдуть
 * ЛЕГАСІ-гілкою `resolveStyleKey`, де `MODULE_LEGACY_OVERRIDE` мапить лише
 * `primary`/`secondary`. Канонічна гілка такої гарантії не дає — клітинок
 * `outline × модуль` і `ghost × модуль` у `EMPHASIS_TONE_MAP` немає, тож
 * там стався б фолбек у суцільний `primary`. Якщо колись слово `ghost`
 * приберуть із легасі-набору, 33 кнопки модулів мовчки стануть суцільними
 * синіми — саме це й ловлять кейси нижче.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";
import { ModuleAccentProvider } from "../layout/ModuleAccentProvider";

function cls(name: string): string {
  return screen.getByRole("button", { name }).className;
}

describe("Button × ModuleAccentProvider", () => {
  it("беспропний primary усередині модуля бере акцент модуля", () => {
    render(
      <ModuleAccentProvider module="finyk">
        <Button>Зберегти</Button>
      </ModuleAccentProvider>,
    );
    // finyk-варіант фарбує саме бренд-токеном модуля, а не brand-*.
    expect(cls("Зберегти")).toContain("finyk");
  });

  it("поза провайдером той самий виклик лишається генеричним", () => {
    render(<Button>Зберегти</Button>);
    expect(cls("Зберегти")).not.toContain("finyk");
  });

  it("явний проп `module` виграє над контекстом", () => {
    render(
      <ModuleAccentProvider module="finyk">
        <Button module="fizruk">Зберегти</Button>
      </ModuleAccentProvider>,
    );
    const c = cls("Зберегти");
    expect(c).toContain("fizruk");
    expect(c).not.toContain("finyk");
  });

  it("ghost усередині модуля лишається ghost — НЕ стає суцільним", () => {
    // Межа. `ghost` живе в легасі-наборі, який `resolveStyleKey` перевіряє
    // ПЕРШИМ і повертає без читання таблиці канонічних клітинок. Приберуть
    // його звідти — і ця кнопка стане суцільною синьою.
    render(
      <ModuleAccentProvider module="finyk">
        <Button variant="ghost">Закрити</Button>
      </ModuleAccentProvider>,
    );
    const c = cls("Закрити");
    expect(c).not.toContain("finyk");
    // Ghost прозорий: у нього немає заливки бренд-кольором.
    expect(c).not.toContain("bg-brand");
  });

  it("danger усередині модуля лишається небезпечним, а не модульним", () => {
    // Колір небезпеки — семантичний, він НЕ має підмінятись акцентом
    // модуля: «Видалити» має виглядати однаково скрізь.
    render(
      <ModuleAccentProvider module="nutrition">
        <Button variant="danger">Видалити</Button>
      </ModuleAccentProvider>,
    );
    expect(cls("Видалити")).not.toContain("nutrition");
  });
});
