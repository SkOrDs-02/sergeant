import { fireEvent, render } from "@testing-library/react-native";

import { TxListItem } from "./TxListItem";

const manualTx = {
  id: "m-1",
  _manual: true,
  amount: -5000,
  description: "Обід",
  mcc: 5812,
  time: 1700000000,
  currencyCode: 980,
};

describe("TxListItem", () => {
  it("fires `onPressManual` when the underlying row is pressed for a manual tx", () => {
    const onPressManual = jest.fn();
    const { getByRole } = render(
      <TxListItem tx={manualTx} onPressManual={onPressManual} />,
    );
    fireEvent.press(getByRole("button"));
    expect(onPressManual).toHaveBeenCalledWith(manualTx);
  });

  it("does not wire a press for a non-manual tx (no `onEditManual` call path)", () => {
    const onPressManual = jest.fn();
    const bankTx = { ...manualTx, _manual: false, id: "bank-1" };
    const { queryByRole } = render(
      <TxListItem tx={bankTx} onPressManual={onPressManual} />,
    );
    expect(queryByRole("button")).toBeNull();
  });
});
