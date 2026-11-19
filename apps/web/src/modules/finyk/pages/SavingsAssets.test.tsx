// @vitest-environment jsdom
/**
 * Рахунки-активи у вебі (спека `docs/work/specs/finyk-savings-assets.md`):
 * форма додає депозит, рядок показує вартість на сьогодні й вкладене,
 * журнал записує подію, а строк, що минув, дає закрити актив.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { ManualAsset } from "../hooks/useStorage";
import { ManualAssetRow } from "./ManualAssetRow";
import { SavingsAssetForm } from "./SavingsAssetForm";

const deposit = {
  id: "dep",
  name: "Депозит ПУМБ",
  amount: 0,
  currency: "UAH",
  kind: "deposit",
  status: "active",
  deposit: {
    ratePct: 15,
    startDate: "2026-01-10",
    endDate: "2026-04-10",
    capitalization: "monthly",
    taxPct: 23,
  },
  events: [
    {
      id: "e1",
      type: "contribution",
      date: "2026-01-10",
      amountMinor: 10_000_000,
    },
  ],
} as unknown as ManualAsset;

describe("SavingsAssetForm", () => {
  it("додає депозит із внеском і параметрами", () => {
    const onAdd = vi.fn();
    render(
      <SavingsAssetForm
        kind="deposit"
        today="2026-01-10"
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    const add = screen.getByRole("button", { name: "Додати" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Назва активу"), {
      target: { value: "Депозит ПУМБ" },
    });
    fireEvent.change(screen.getByLabelText("Скільки вклав"), {
      target: { value: "100000" },
    });
    fireEvent.change(screen.getByLabelText("Ставка, % річних"), {
      target: { value: "15" },
    });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    const asset = onAdd.mock.calls[0]![0] as ManualAsset;
    expect(asset).toMatchObject({
      kind: "deposit",
      name: "Депозит ПУМБ",
      deposit: { ratePct: 15, taxPct: 23, capitalization: "monthly" },
    });
  });
});

describe("ManualAssetRow для рахунку-активу", () => {
  it("показує вартість, вкладене і пише подію в журнал", () => {
    const onChange = vi.fn();
    render(
      <ManualAssetRow
        asset={deposit}
        today="2026-02-20"
        showBalance
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/Депозит · UAH/)).toBeInTheDocument();
    expect(
      screen.getByText(/15% річних · до 10\.04\.2026/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Вкладено/)).toBeInTheDocument();
    // Параметри типу не редагуються формою старого активу.
    expect(
      screen.queryByRole("button", { name: /Редагувати актив/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Історія активу/ }));
    fireEvent.change(screen.getByLabelText("Сума"), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    const next = onChange.mock.calls[0]![0] as ManualAsset;
    const events = next["events"] as { type: string; amountMinor: number }[];
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: "contribution",
      amountMinor: 500_000,
    });
    // Кешована сума для старих клієнтів оновлюється разом із журналом.
    expect(next.amount).toBeGreaterThan(100_000);
  });

  it("строк минув — актив можна закрити", () => {
    const onChange = vi.fn();
    render(
      <ManualAssetRow
        asset={deposit}
        today="2026-04-10"
        showBalance
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onChange={onChange}
      />,
    );
    const status = screen.getByRole("status");
    expect(within(status).getByText(/Строк минув/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Закрити актив «Депозит ПУМБ»" }),
    );
    expect(onChange.mock.calls[0]![0]).toMatchObject({
      status: "closed",
      closedAt: "2026-04-10",
    });
  });
});
