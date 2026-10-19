import { afterEach, describe, expect, it } from "vitest";
import { isFinykBalanceHidden, maskAmountsInText } from "./balanceVisibility";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "./sqliteReader";

describe("balanceVisibility", () => {
  afterEach(clearFinykSqliteCache);

  it("читає прапорець із SQLite-кешу: false = приховано", () => {
    __setFinykSqliteStateCacheForTests({ showBalance: false });
    expect(isFinykBalanceHidden()).toBe(true);
    __setFinykSqliteStateCacheForTests({ showBalance: true });
    expect(isFinykBalanceHidden()).toBe(false);
  });

  it("маскує суми в тексті порад і лишає решту", () => {
    __setFinykSqliteStateCacheForTests({ showBalance: false });
    expect(
      maskAmountsInText("Сьогодні 1\u00a0835 ₴, на 40% вище середнього"),
    ).toBe("Сьогодні ••••, на 40% вище середнього");
    expect(maskAmountsInText("Витрачено 800 ₴ з 1 000 ₴")).toBe(
      "Витрачено •••• з ••••",
    );
  });

  it("з увімкненим показом текст не чіпає", () => {
    __setFinykSqliteStateCacheForTests({ showBalance: true });
    expect(maskAmountsInText("Сьогодні 280 ₴")).toBe("Сьогодні 280 ₴");
  });
});
