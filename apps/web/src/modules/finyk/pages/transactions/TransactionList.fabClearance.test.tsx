// @vitest-environment jsdom
/**
 * Запас під кутову «Додати» в «Операціях» (виправлення після зйомки Ф-2 а,
 * 2026-11-18). Правий відступ двох останніх рядків стискав їх навіть тоді,
 * коли короткий список (наприклад, під пошуком) стоїть угорі екрана, далеко
 * від кнопки: «неділя, 1 ли…», сума посеред рядка.
 *
 * Механізм тепер один: нижній запас контенту `page-tabbar-pad`, у який
 * входить смуга кнопки (`--sgt-fab-inset`). Довгий список у кінці
 * прокрутки ставить останній рядок над кнопкою (замір на прод-білді: низ
 * рядка 714 px = верх кнопки 714 px), короткий не дістає до неї взагалі.
 * Геометрію jsdom не рахує, тож тест фіксує обидві половини контракту:
 * рядки на повну ширину і нижній запас на контейнері.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { vi } from "vitest";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

vi.mock("@shared/components/ui/VirtualList", () => ({
  VirtualList: ({
    items,
    children,
  }: {
    items: unknown[];
    children: (item: unknown, index: number) => React.ReactNode;
  }) => (
    <div data-testid="virtual-list">
      {items.map((item, i) => (
        <div key={i}>{children(item, i)}</div>
      ))}
    </div>
  ),
}));

import { TransactionList } from "./TransactionList";

const NOOP = (): void => undefined;

function tx(id: string, day: string, description: string): Transaction {
  return {
    id,
    amount: -76400,
    time: Math.floor(new Date(`${day}T12:00:00+03:00`).getTime() / 1000),
    date: day,
    description,
    mcc: 0,
    categoryId: "food",
    type: "expense",
    source: "mono",
    accountId: "mono-1",
    manual: false,
    _source: "mono",
    _accountId: "mono-1",
    _manual: false,
  } as Transaction;
}

function renderList(groups: { key: string; items: Transaction[] }[]) {
  const flat = groups.flatMap((g) => g.items);
  return render(
    <TransactionList
      loading={false}
      activeTx={flat}
      filtered={flat}
      groupedByDate={groups}
      groupCounts={groups.map((g) => g.items.length)}
      flatItems={flat}
      collapsedKeys={new Set()}
      daySummaries={{}}
      showBalance
      toggleDay={NOOP}
      selectMode={false}
      selectedIds={new Set()}
      hiddenTxIdSet={new Set()}
      excludedStatTxIdSet={new Set()}
      txCategories={{}}
      txSplits={{}}
      accounts={undefined}
      customCategories={undefined}
      onToggleSelect={NOOP}
      onSwipeHideTx={NOOP}
      onSwipeDeleteManual={NOOP}
      onOpenTransaction={NOOP}
    />,
  );
}

afterEach(cleanup);

describe("TransactionList: запас під кутову кнопку", () => {
  it("короткий список: останні рядки на повну ширину, без правого відступу", () => {
    const { container } = renderList([
      { key: "2026-11-18", items: [tx("a", "2026-11-18", "Сільпо")] },
      { key: "2026-11-01", items: [tx("b", "2026-11-01", "Сільпо Київ")] },
    ]);
    expect(container.querySelector(".fab-clear-row")).toBeNull();
    const headers = screen.getAllByRole("button", { expanded: true });
    for (const h of headers) {
      expect(h.style.paddingRight).toBe("");
    }
  });

  it("довгий список: останній рядок відводить від кнопки нижній запас контенту", () => {
    const groups = Array.from({ length: 20 }, (_, i) => {
      const day = `2026-11-${String(20 - i).padStart(2, "0")}`;
      return { key: day, items: [tx(`t${i}`, day, `Покупка ${i}`)] };
    });
    const { container } = renderList(groups);
    const list = screen.getByTestId("virtual-list");
    // Список лежить усередині контейнера з нижнім запасом під кнопку.
    expect(list.closest(".page-tabbar-pad")).not.toBeNull();
    expect(container.querySelector(".fab-clear-row")).toBeNull();
  });
});
