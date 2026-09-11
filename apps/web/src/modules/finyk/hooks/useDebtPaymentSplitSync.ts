/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Рівень 3 звʼязки «витрата-борг → пасив»: тримає суму привʼязки платежу в
 * згоді з розподілом операції, коли той міняється ВЖЕ ПІСЛЯ привʼязки.
 *
 * До рівня 3 сума була знімком і застарівала мовчки: розписав 300 ₴ на борг,
 * привʼязав, потім переклав на 150 ₴ — `calcDebtRemaining` і далі віднімав
 * 300, тож залишок пасиву показував менше, ніж людина реально винна.
 *
 * **Чому хук, а не гілка в `setSplitTx`.** Мутація сховища не бачить сирої
 * суми транзакції, тож не може відкотити платіж до повної суми у випадку
 * «спліт прибрали повністю». Хук сидить там, де сума є — на сторінці, що
 * рендерить аркуш деталей, — і накриває ВСІ три шляхи зміни розподілу
 * одним обгорнутим `onSplitChange`: редактор спліту, кнопку «прибрати
 * розподіл» і розбивку за чеком Сільпо.
 *
 * **Чому дві різні реакції.** Рішення ухвалює чиста
 * `decideDebtPaymentAfterSplitChange`; хук лише виконує:
 *
 * - сума змінилась → пишемо й показуємо тост із переходом «було → стало»,
 *   бо переписати чужу привʼязку мовчки не можна;
 * - частки боргу не лишилось → НЕ відвʼязуємо самі, а питаємо. Людина може
 *   бути посеред редагування й повернути частку наступним рухом; мовчазне
 *   відвʼязування знищило б ручну роботу без сліду.
 *
 * **Відомий наслідок відвʼязування.** Якщо привʼязка була авто (`auto`),
 * підтверджене відвʼязування дописує id у `autoLinkDismissedTxIds` — тобто
 * правило ключового слова більше не поверне цю транзакцію само. Це та сама
 * анти-воскресальна семантика, що й при ручному відвʼязуванні, і вона тут
 * навмисна: людина щойно сказала «ця операція не гасить цей борг». Якщо
 * частку боргу згодом повернуть, привʼязати можна вручну.
 */
import { useCallback, useState } from "react";
import {
  decideDebtPaymentAfterSplitChange,
  type DebtPaymentSplitSyncDecision,
} from "@sergeant/finyk-domain/domain/debtSplitSync";
import type {
  Debt,
  LinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { TxSplit } from "@sergeant/finyk-domain/domain/types";
import { formatMoney } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";

type SetLinkedTxRole = (
  id: string,
  txId: string,
  type: "debt" | "receivable",
  role: LinkedTxRole | null,
  amountUAH?: number,
) => void;

/** Те, що чекає на відповідь людини: без неї нічого не пишемо. */
export interface PendingDebtUnlink {
  txId: string;
  debtId: string;
  debtName: string;
  previousAmountUAH: number;
}

export interface DebtPaymentSplitSyncApi {
  /** Викликати ПІСЛЯ запису нових сплітів. */
  reconcile: (
    txId: string,
    nextSplits: readonly TxSplit[] | null,
    txAmountUAH: number,
  ) => void;
  pendingUnlink: PendingDebtUnlink | null;
  confirmUnlink: () => void;
  dismissUnlink: () => void;
}

const money = (value: number) => formatMoney(value, { maxFractionDigits: 2 });

export function useDebtPaymentSplitSync(
  manualDebts: readonly Debt[],
  setLinkedTxRole: SetLinkedTxRole,
  toastSuccess: (text: string) => void,
): DebtPaymentSplitSyncApi {
  const [pendingUnlink, setPendingUnlink] = useState<PendingDebtUnlink | null>(
    null,
  );

  const reconcile = useCallback(
    (
      txId: string,
      nextSplits: readonly TxSplit[] | null,
      txAmountUAH: number,
    ) => {
      const decision: DebtPaymentSplitSyncDecision =
        decideDebtPaymentAfterSplitChange({
          txId,
          txAmountUAH,
          nextSplits,
          debts: manualDebts,
        });

      if (decision.kind === "none") return;

      if (decision.kind === "confirm-unlink") {
        setPendingUnlink({
          txId,
          debtId: decision.debtId,
          debtName: decision.debtName,
          previousAmountUAH: decision.previousAmountUAH,
        });
        return;
      }

      setLinkedTxRole(
        decision.debtId,
        txId,
        "debt",
        "payment",
        decision.nextAmountUAH,
      );
      toastSuccess(
        messages.finyk.debtSplitSync.amountUpdated
          .replace("{debt}", decision.debtName)
          .replace("{from}", money(decision.previousAmountUAH))
          .replace("{to}", money(decision.nextAmountUAH)),
      );
    },
    [manualDebts, setLinkedTxRole, toastSuccess],
  );

  // Запис іде ПОЗА оновлювачем стану: React може викликати оновлювач двічі
  // (StrictMode), і тоді відвʼязування писалося б двічі.
  const confirmUnlink = useCallback(() => {
    if (!pendingUnlink) return;
    setLinkedTxRole(pendingUnlink.debtId, pendingUnlink.txId, "debt", null);
    setPendingUnlink(null);
  }, [pendingUnlink, setLinkedTxRole]);

  const dismissUnlink = useCallback(() => setPendingUnlink(null), []);

  return { reconcile, pendingUnlink, confirmUnlink, dismissUnlink };
}
