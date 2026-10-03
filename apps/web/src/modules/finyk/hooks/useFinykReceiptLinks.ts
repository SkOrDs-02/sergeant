import { useCallback, useState } from "react";
import {
  readReceiptLinks,
  writeReceiptLink,
  type ReceiptLinkMap,
} from "../lib/receiptLinks";

export interface UseFinykReceiptLinksResult {
  /** Чи знає ЦЕЙ пристрій про чек, привʼязаний до `txId` (mono tx id або
   * manual-expense id). Джерело — `lib/receiptLinks.ts` (LS-only, § docstring). */
  hasReceipt: (txId: string) => boolean;
  /** `receiptId` для `txId`, або `null`, якщо цей пристрій про нього не знає. */
  getReceiptId: (txId: string) => number | null;
  /** Запамʼятати щойно збережений/зісканований лінк (викликається одразу
   * після успішного `saveReceipt()`). */
  recordReceiptLink: (txRef: string, receiptId: number) => void;
}

/**
 * React-обгортка над `lib/receiptLinks.ts` — тримає карту в стейті, щоб
 * `recordReceiptLink` синхронно ретригерив рендер списку транзакцій
 * (індикатор розгортки зʼявляється одразу після збереження чека, без
 * очікування наступного `useQuery`/pull).
 */
export function useFinykReceiptLinks(): UseFinykReceiptLinksResult {
  const [links, setLinks] = useState<ReceiptLinkMap>(() => readReceiptLinks());

  const recordReceiptLink = useCallback((txRef: string, receiptId: number) => {
    setLinks(writeReceiptLink(txRef, receiptId));
  }, []);

  const hasReceipt = useCallback(
    (txId: string) => Object.prototype.hasOwnProperty.call(links, txId),
    [links],
  );
  const getReceiptId = useCallback(
    (txId: string): number | null => links[txId] ?? null,
    [links],
  );

  return { hasReceipt, getReceiptId, recordReceiptLink };
}
