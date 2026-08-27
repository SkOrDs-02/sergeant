/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CrossModuleLinkRow } from "./CrossModuleLinkRow";
import { MIN_N, REPEATING_R } from "./crossModuleLinkTiers";

const poleA = {
  module: "finyk" as const,
  label: "Фінік",
  value: "512",
  unit: "₴ за день",
};
const poleB = {
  module: "nutrition" as const,
  label: "Їжа",
  value: "2 140",
  unit: "ккал за день",
};

describe("CrossModuleLinkRow — згорнутий звʼязок", () => {
  afterEach(cleanup);

  it("показує пару, ступінь і формулювання, але не полюси з числами", () => {
    render(
      <CrossModuleLinkRow
        poleA={poleA}
        poleB={poleB}
        observations={10}
        strength={REPEATING_R}
        phrase="Коли витрачаєш більше — їси більше"
      />,
    );

    expect(screen.getByText("Фінік")).toBeInTheDocument();
    expect(screen.getByText("Їжа")).toBeInTheDocument();
    expect(screen.getByText("Повторюється")).toBeInTheDocument();
    expect(
      screen.getByText("Коли витрачаєш більше — їси більше"),
    ).toBeInTheDocument();
    expect(screen.getByText("10 спостережень")).toBeInTheDocument();
    // Згорнутий вигляд — це рядок, а не мініатюра картки: чисел полюсів і
    // доказової смуги в ньому немає, інакше він не був би компактним.
    expect(screen.queryByText("512")).toBeNull();
    expect(screen.queryByText("₴ за день")).toBeNull();
  });

  it("тап розгортає рядок у повну картку на місці", async () => {
    const user = userEvent.setup();
    render(
      <CrossModuleLinkRow
        poleA={poleA}
        poleB={poleB}
        observations={10}
        strength={REPEATING_R}
        phrase="Коли витрачаєш більше — їси більше"
      />,
    );

    const row = screen.getByRole("button");
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);

    // Тепер видно те, чого в рядку не було, — числа полюсів і одиниці.
    expect(screen.getByText("512")).toBeInTheDocument();
    expect(screen.getByText("₴ за день")).toBeInTheDocument();
    expect(screen.getByText("2 140")).toBeInTheDocument();
    // І формулювання нікуди не поділось.
    expect(
      screen.getByText("Коли витрачаєш більше — їси більше"),
    ).toBeInTheDocument();
  });

  it("нижче порога мовчання не стверджує ступеня", () => {
    render(
      <CrossModuleLinkRow
        poleA={poleA}
        poleB={poleB}
        observations={MIN_N - 3}
        strength={0.9}
        phrase="Коли витрачаєш більше — їси більше"
      />,
    );

    // `gradeCrossModuleLink` → null: пара видно, а от впевненості немає, і
    // рядок про неї мовчить замість того, щоб вигадати слово.
    expect(screen.getByText("Фінік")).toBeInTheDocument();
    expect(screen.queryByText("Поки що збіг")).toBeNull();
    expect(screen.queryByText("Повторюється")).toBeNull();
    expect(screen.queryByText(/спостереж/)).toBeNull();
  });
});
