/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Регресія ux-08: крок «Звідки страва?» ховається через `hidden`, і кнопка,
 * що тримала фокус («Далі»), лишала його поза діалогом. Фокус мусить
 * лишитись у діалозі.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useStepFocusKeeper } from "./useStepFocusKeeper";

function Harness() {
  const [step, setStep] = useState<"source" | "fill">("source");
  const anchor = useRef<HTMLDivElement>(null);
  useStepFocusKeeper(true, step, anchor);
  return (
    <div role="dialog" aria-label="Додати прийом їжі">
      <div ref={anchor} hidden={step !== "source"}>
        <button type="button" onClick={() => setStep("fill")}>
          Далі
        </button>
      </div>
      {step === "fill" && <input aria-label="Назва" />}
    </div>
  );
}

afterEach(cleanup);

describe("useStepFocusKeeper", () => {
  it("лишає фокус у діалозі, коли кнопку кроку приховано", () => {
    render(<Harness />);
    const next = screen.getByRole("button", { name: "Далі" });
    next.focus();
    fireEvent.click(next);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });
});
