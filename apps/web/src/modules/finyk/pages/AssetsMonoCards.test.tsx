// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsMonoCards } from "./AssetsMonoCards";

const accounts = [
  { id: "acc-1", balance: 123400, currencyCode: 980, type: "black" },
  { id: "acc-2", balance: 500, currencyCode: 980, type: "white" },
];

describe("AssetsMonoCards", () => {
  it("keeps excluded cards visible and labelled", () => {
    render(
      <AssetsMonoCards
        accounts={accounts}
        hiddenAccounts={["acc-2"]}
        toggleHideAccount={vi.fn()}
        showBalance
      />,
    );
    expect(
      screen.getAllByRole("button", { name: /налаштування/ }),
    ).toHaveLength(2);
    expect(screen.getByText("Не враховується")).toBeTruthy();
  });

  it("opens the sheet on tap and toggles the account", () => {
    const toggle = vi.fn();
    render(
      <AssetsMonoCards
        accounts={accounts}
        hiddenAccounts={[]}
        toggleHideAccount={toggle}
        showBalance
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Чорна картка — налаштування/ }),
    );
    const toggleInput = screen.getByRole("switch", {
      name: /Враховувати картку/,
    });
    expect((toggleInput as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggleInput);
    expect(toggle).toHaveBeenCalledWith("acc-1");
  });
});
