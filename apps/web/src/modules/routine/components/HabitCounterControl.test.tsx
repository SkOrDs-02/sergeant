/** @vitest-environment jsdom */
/**
 * Рядок звички з лічильником і поля форми (Р-1 (а), Р-1 (в), міграція 170).
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { emptyHabitDraft, type HabitDraft } from "@sergeant/routine-domain";

import { HabitCounterControl } from "./HabitCounterControl";
import {
  HabitCounterFields,
  parseCountTargetInput,
} from "./settings/HabitCounterFields";

describe("HabitCounterControl", () => {
  it("показує «2 з 3», кроки +1 і −1", () => {
    const onStep = vi.fn();
    render(
      <HabitCounterControl
        name="Вода"
        count={2}
        target={3}
        unit="склянки"
        done={false}
        futureDay={false}
        onStep={onStep}
      />,
    );
    expect(screen.getByLabelText("Вода: 2 з 3 склянки")).toHaveTextContent(
      "2 з 3",
    );
    fireEvent.click(screen.getByRole("button", { name: "Додати: Вода" }));
    fireEvent.click(screen.getByRole("button", { name: "Відняти: Вода" }));
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
  });

  it("після цілі рахує далі; «−» неактивний на нулі; майбутній день заблоковано", () => {
    const { rerender } = render(
      <HabitCounterControl
        name="Вода"
        count={4}
        target={3}
        done
        futureDay={false}
        onStep={vi.fn()}
      />,
    );
    expect(screen.getByText("4 з 3")).toBeInTheDocument();
    rerender(
      <HabitCounterControl
        name="Вода"
        count={0}
        target={3}
        done={false}
        futureDay
        onStep={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Відняти: Вода" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /ще попереду/ })).toBeDisabled();
  });
});

function Harness({ onDraft }: { onDraft: (d: HabitDraft) => void }) {
  const [draft, setDraft] = useState<HabitDraft>(emptyHabitDraft());
  onDraft(draft);
  return <HabitCounterFields habitDraft={draft} setHabitDraft={setDraft} />;
}

describe("HabitCounterFields", () => {
  it("ціль, одиниця і джерело автовідмітки потрапляють у чернетку", () => {
    let last: HabitDraft = emptyHabitDraft();
    render(<Harness onDraft={(d) => (last = d)} />);
    expect(screen.getByLabelText("Одиниця")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ціль на день"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Одиниця"), {
      target: { value: "склянки" },
    });
    fireEvent.change(screen.getByLabelText("Відмічати саму, коли…"), {
      target: { value: "nutrition_water_goal" },
    });
    expect(last.countTarget).toBe(3);
    expect(last.countUnit).toBe("склянки");
    expect(last.autoMarkSource).toBe("nutrition_water_goal");
    fireEvent.change(screen.getByLabelText("Відмічати саму, коли…"), {
      target: { value: "" },
    });
    expect(last.autoMarkSource).toBeNull();
  });

  it("порожнє поле цілі — звичка «так/ні», сміття — невалідна ціль", () => {
    expect(parseCountTargetInput("  ")).toBeNull();
    expect(parseCountTargetInput("5")).toBe(5);
    expect(parseCountTargetInput("1.5")).toBe(1.5);
  });
});
