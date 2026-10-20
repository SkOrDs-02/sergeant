// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TxTagsField } from "./TxTagsField";

describe("TxTagsField (Р6.1, Р6.5)", () => {
  it("новий тег бере написання першого вжитку і додається Enter-ом", () => {
    const onChange = vi.fn();
    render(
      <TxTagsField
        tags={["ремонт"]}
        known={[{ key: "відпустка", label: "Відпустка", count: 2 }]}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Новий тег" });
    fireEvent.change(input, { target: { value: " відпустка " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["ремонт", "Відпустка"]);
  });

  it("дубль за регістром не додається, чип прибирає тег", () => {
    const onChange = vi.fn();
    render(<TxTagsField tags={["Кава"]} known={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Новий тег" }), {
      target: { value: "кава" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Прибрати тег «Кава»" }),
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
