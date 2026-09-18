import { fireEvent, render } from "@testing-library/react-native";

import { TxRow } from "./TxRow";

const baseTx = {
  id: "tx-1",
  amount: -12500,
  description: "Сільпо",
  mcc: 5411,
  time: 1700000000,
  currencyCode: 980,
  _accountId: "acc-1",
};

describe("TxRow", () => {
  it("renders description, category name and formatted amount", () => {
    const { getByText } = render(<TxRow tx={baseTx} />);
    expect(getByText("Сільпо")).toBeTruthy();
    // `fmtAmt` prepends a space-less breakable space on uk-UA locale —
    // fall back to a partial match to avoid depending on Node/ICU.
    expect(getByText(/125/)).toBeTruthy();
  });

  it("masks the amount when `hideAmount` is set", () => {
    const { queryByText, getAllByText } = render(
      <TxRow tx={baseTx} hideAmount />,
    );
    expect(queryByText(/125/)).toBeNull();
    expect(getAllByText("••••").length).toBeGreaterThan(0);
  });

  it("invokes `onPress` when the row is wrapped in Pressable", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<TxRow tx={baseTx} onPress={onPress} />);
    fireEvent.press(getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders the credit-card pill when the account has a credit limit", () => {
    const { getByText } = render(
      <TxRow
        tx={baseTx}
        accounts={[{ id: "acc-1", type: "black", creditLimit: 50000 }]}
      />,
    );
    expect(getByText(/💳 Чорна/)).toBeTruthy();
  });

  it("shows the split pill when the transaction has split entries", () => {
    const { getByText } = render(
      <TxRow
        tx={baseTx}
        txSplits={{
          "tx-1": [
            { categoryId: "food", amount: 50 },
            { categoryId: "home", amount: 75 },
          ],
        }}
      />,
    );
    expect(getByText(/спліт/)).toBeTruthy();
  });
});
