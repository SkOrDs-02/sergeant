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

  // PR-F4 (founder-UX audit wave 6, «Чесність показників»): the marker was
  // wired ONLY to `isTransfer`, so an explicitly excluded transaction
  // (`excludedStatTxIds`, single or batch via `TransactionsBatchToolbar`)
  // carried no visible sign in the list — summaries moved, the row didn't.
  it("shows the marker for an explicitly excluded (non-transfer) transaction", () => {
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
        isExcludedFromStats
      />,
    );

    expect(screen.getByText("не в статистиці")).toBeInTheDocument();
  });

  // Рішення власника 2026-10-01: нога скасованого платежу («Uklon −189» /
  // «Скасування. Uklon +189») не рахується у статистиці — і рядок каже
  // чому, а не лише «не в статистиці».
  it("shows «скасовано» for a leg of a cancelled payment", () => {
    render(
      <TxRowMetaChips
        tx={TX}
        catId="other"
        catName="Інше"
        isIncome
        overrideCatId={null}
        existingSplitsCount={0}
        isCreditCard={false}
        account={undefined}
        accountName={null}
        isCancelled
      />,
    );

    expect(screen.getByText("скасовано")).toBeInTheDocument();
    expect(screen.queryByText("не в статистиці")).not.toBeInTheDocument();
  });

  it("«скасовано» вдруге не дублюється словом «не в статистиці», навіть коли ногу виключено явно", () => {
    render(
      <TxRowMetaChips
        tx={TX}
        catId="other"
        catName="Інше"
        isIncome
        overrideCatId={null}
        existingSplitsCount={0}
        isCreditCard={false}
        account={undefined}
        accountName={null}
        isCancelled
        isExcludedFromStats
      />,
    );

    expect(screen.getByText("скасовано")).toBeInTheDocument();
    expect(screen.queryByText("не в статистиці")).not.toBeInTheDocument();
  });

  it("no «скасовано» marker for an ordinary row", () => {
    render(
      <TxRowMetaChips
        tx={TX}
        catId="other"
        catName="Інше"
        isIncome
        overrideCatId={null}
        existingSplitsCount={0}
        isCreditCard={false}
        account={undefined}
        accountName={null}
      />,
    );

    expect(screen.queryByText("скасовано")).not.toBeInTheDocument();
  });

  it("drops the marker once the explicit exclusion is lifted", () => {
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
        isExcludedFromStats={false}
      />,
    );

    expect(screen.queryByText("не в статистиці")).not.toBeInTheDocument();
  });
});
