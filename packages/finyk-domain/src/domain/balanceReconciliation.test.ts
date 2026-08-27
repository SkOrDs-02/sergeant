/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * AI-CONTEXT: контракт §6.1 каже, що розходження — це БАГ, а не «приблизна
 * картина». Отже ціна хибного спрацювання тут особлива: банер, який
 * помиляється, знецінює саме те твердження, заради якого існує. Тому
 * половина асертів нижче — про те, коли функція має **промовчати**.
 */
import { describe, expect, it } from "vitest";

import {
  reconcileAccount,
  reconcileAccounts,
  type ReconcileTransaction,
} from "./balanceReconciliation";

const tx = (
  id: string,
  time: string,
  balance: number | null,
  hold?: boolean,
): ReconcileTransaction => ({
  id,
  time,
  balance,
  ...(hold === undefined ? {} : { hold }),
});

describe("reconcileAccount", () => {
  it("баланс рахунку == balance найсвіжішої транзакції → ok", () => {
    const res = reconcileAccount({
      accountBalance: 12_345,
      transactions: [
        tx("t1", "2026-07-20T10:00:00Z", 20_000),
        tx("t2", "2026-07-24T18:30:00Z", 12_345),
        tx("t3", "2026-07-22T09:00:00Z", 15_000),
      ],
    });
    expect(res.status).toBe("ok");
    expect(res.diffMinor).toBe(0);
    // Якір — саме найсвіжіша, а не остання в масиві: порядок довільний.
    expect(res.anchorTxId).toBe("t2");
  });

  it("розходження → mismatch зі значущим ЗНАКОМ", () => {
    // Знак — це діагноз. Додатне: банк показує більше, ніж пояснює наш
    // потік, тобто не доїхали надходження. Якщо його загубити (Math.abs),
    // екран «розібратись» втратить половину інформації.
    const res = reconcileAccount({
      accountBalance: 13_000,
      transactions: [tx("t1", "2026-07-24T18:30:00Z", 12_345)],
    });
    expect(res.status).toBe("mismatch");
    expect(res.diffMinor).toBe(655);
  });

  it("розходження в інший бік дає відʼємну різницю", () => {
    const res = reconcileAccount({
      accountBalance: 12_000,
      transactions: [tx("t1", "2026-07-24T18:30:00Z", 12_345)],
    });
    expect(res.diffMinor).toBe(-345);
  });

  it("hold-транзакція НЕ береться за якір, навіть якщо найсвіжіша", () => {
    // Сума в холді ще може змінитись. Звірка по ній дала б «розходження»,
    // яке зникне саме за пару днів — тобто банер, що бреше в половині
    // випадків. Беремо попередню фінальну.
    const res = reconcileAccount({
      accountBalance: 12_345,
      transactions: [
        tx("final", "2026-07-24T18:30:00Z", 12_345),
        tx("pending", "2026-07-25T09:00:00Z", 11_000, true),
      ],
    });
    expect(res.status).toBe("ok");
    expect(res.anchorTxId).toBe("final");
  });

  it("транзакції без balance пропускаються, а не ламають звірку", () => {
    const res = reconcileAccount({
      accountBalance: 12_345,
      transactions: [
        tx("no-balance", "2026-07-25T09:00:00Z", null),
        tx("ok", "2026-07-24T18:30:00Z", 12_345),
      ],
    });
    expect(res.status).toBe("ok");
    expect(res.anchorTxId).toBe("ok");
  });

  it("немає транзакцій → unknown, НЕ mismatch", () => {
    // Найважливіший асерт файлу. Свіжий рахунок і зламаний рахунок
    // виглядають однаково, і сказати «дані розходяться» на порожньому
    // рахунку означало б вигадати проблему. `unknown` — не помилка.
    const res = reconcileAccount({ accountBalance: 12_345, transactions: [] });
    expect(res.status).toBe("unknown");
    expect(res.diffMinor).toBeNull();
  });

  it("усі транзакції без balance → unknown", () => {
    const res = reconcileAccount({
      accountBalance: 12_345,
      transactions: [tx("a", "2026-07-24T18:30:00Z", null)],
    });
    expect(res.status).toBe("unknown");
  });

  it("баланс рахунку невідомий → unknown", () => {
    const res = reconcileAccount({
      accountBalance: null,
      transactions: [tx("a", "2026-07-24T18:30:00Z", 12_345)],
    });
    expect(res.status).toBe("unknown");
  });

  it("зіпсований час не робить транзакцію якорем", () => {
    // Чесно про силу цього асерта: перевірка `Number.isFinite(t)` у коді
    // **захисна, а не несуча** — `NaN > -Infinity` і так false, тож без неї
    // результат не змінився б. Тест фіксує ПОВЕДІНКУ (зіпсований час не
    // стає якорем), а не ловить видалення саме того рядка. Пишу це прямо,
    // бо перевірено прогоном: прибрав guard — тест лишився зеленим.
    const res = reconcileAccount({
      accountBalance: 12_345,
      transactions: [
        tx("broken", "не дата", 999),
        tx("good", "2026-07-24T18:30:00Z", 12_345),
      ],
    });
    expect(res.status).toBe("ok");
    expect(res.anchorTxId).toBe("good");
  });

  it("нуль — валідний баланс, а не «немає даних»", () => {
    // Класична пастка `if (!balance)`: рахунок у нулі — цілком нормальний
    // стан, і трактувати його як відсутність даних означало б мовчки
    // ховати саме той випадок, коли людині цікаво.
    const res = reconcileAccount({
      accountBalance: 0,
      transactions: [tx("a", "2026-07-24T18:30:00Z", 0)],
    });
    expect(res.status).toBe("ok");
  });
});

describe("reconcileAccounts", () => {
  it("повертає СПИСОК проблемних рахунків, а не одну цифру", () => {
    // Агрегат уміє занулити сам себе: +500 і −500 дадуть 0, і продукт
    // сказав би «все гаразд» на ДВОХ зламаних рахунках. Рішення про банер
    // приймається по довжині списку, а не по сумі.
    const summary = reconcileAccounts([
      {
        accountId: "acc-1",
        accountBalance: 1_500,
        transactions: [tx("a", "2026-07-24T10:00:00Z", 1_000)],
      },
      {
        accountId: "acc-2",
        accountBalance: 500,
        transactions: [tx("b", "2026-07-24T10:00:00Z", 1_000)],
      },
    ]);
    expect(summary.totalDiffMinor).toBe(0);
    expect(summary.mismatched.map((m) => m.accountId)).toEqual([
      "acc-1",
      "acc-2",
    ]);
  });

  it("рахунки без даних лічаться окремо і НЕ потрапляють у проблемні", () => {
    const summary = reconcileAccounts([
      { accountId: "fresh", accountBalance: 100, transactions: [] },
      {
        accountId: "ok",
        accountBalance: 1_000,
        transactions: [tx("a", "2026-07-24T10:00:00Z", 1_000)],
      },
    ]);
    expect(summary.mismatched).toEqual([]);
    expect(summary.unknownCount).toBe(1);
  });

  it("порожній вхід → нічого не знайдено, без падіння", () => {
    const summary = reconcileAccounts([]);
    expect(summary.mismatched).toEqual([]);
    expect(summary.unknownCount).toBe(0);
    expect(summary.totalDiffMinor).toBe(0);
  });
});
