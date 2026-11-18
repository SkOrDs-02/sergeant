// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarcodeBindRow } from "./BarcodeBindRow";

describe("BarcodeBindRow", () => {
  it("«Скасувати» вирівняна з текстом і лишає дотикову ціль 44 px", () => {
    const onCancel = vi.fn();
    render(<BarcodeBindRow code="4820024700016" onCancel={onCancel} />);
    const btn = screen.getByRole("button", {
      name: "Скасувати привʼязку штрихкоду",
    });
    // `variant="text"` має `px-2`: від'ємне поле на ту саму ширину ставить
    // підпис у лінію з текстом рядка, не зменшуючи зону дотику.
    expect(btn.className).toContain("-ml-2");
    expect(btn.className).toContain("min-h-[44px]");
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
