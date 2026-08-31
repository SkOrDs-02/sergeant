// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { INTERNAL_TRANSFER_ID } from "../constants";
import { TxRowMetaChips } from "./TxRowMetaChips";
import type { TxRowTx } from "./txRowHelpers";

const TX: TxRowTx = {
  id: "tx-1",
  amount: 50000,
  description: "Зарахування",
  _manual: false,
};

afterEach(cleanup);

describe("TxRowMetaChips", () => {
  it("renders the transfer chip right after the row is marked as a transfer", () => {
    render(
      <TxRowMetaChips
        tx={TX}
        catId={INTERNAL_TRANSFER_ID}
        catName="Переказ"
        isIncome
        overrideCatId={INTERNAL_TRANSFER_ID}
        existingSplitsCount={0}
        isCreditCard={false}
        account={undefined}
        accountName={null}
      />,
    );

    expect(screen.getByText("не в статистиці")).toBeInTheDocument();
  });

  it("omits the transfer chip for a regular category", () => {
    render(
      <TxRowMetaChips
        tx={TX}
        catId="in_salary"
        catName="Зарплата"
        isIncome
        overrideCatId={null}
        existingSplitsCount={0}
        isCreditCard={false}
        account={undefined}
        accountName={null}
      />,
    );

    expect(screen.queryByText("не в статистиці")).not.toBeInTheDocument();
  });
});
