/**
 * Last validated: 2026-11-26
 * Status: Active
 *
 * Нові чеки Сільпо, що пропонуються для комори (спека
 * `docs/work/specs/silpo-pantry-confirm.md` § Рішення дизайну, «Які чеки
 * пропонуються»): куплені не раніше `pantryAutoImportSince`, не відхилені,
 * без жодної заброньованої позиції і з хоча б одним продуктом. Сам хук нічого
 * не пише в комору: картка в огляді лише показує ці чеки, а записує аркуш
 * після «Додати».
 *
 * AI-CONTEXT: увесь прохід по чеках (сторінки списку + деталі кожного) іде
 * ОДНИМ запитом React Query. Його кеш і дедуплікація замінюють ref-замок
 * колишнього автоімпорту: ререндер `NutritionApp` не запускає нових запитів,
 * повтор іде лише після інвалідації `silpoKeys.all` (бронювання, відхилення,
 * синк) або коли дані застаріли. Деталі тягнуться послідовно: ліміт запитів
 * Сільпо вже раз вибухав (PR #1734).
 */
import { useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { mapReceiptItemToCategory } from "@sergeant/finyk-domain/domain";
import {
  silpoApi,
  type SilpoReceiptItemDto,
  type SilpoReceiptSummaryDto,
} from "@shared/api";
import { authAwareRetry } from "@shared/lib/api/queryClient";
import { silpoKeys } from "@shared/lib/api/queryKeys";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { isStaleReceipt, receiptAgeDays } from "../lib/silpoReplenish";

const PAGE_LIMIT = 50;
const STALE_TIME = 30_000;

export interface SilpoPantryOffer {
  summary: SilpoReceiptSummaryDto;
  items: SilpoReceiptItemDto[];
  /** Позиції-продукти чека (без хімії й аптеки). */
  groceryCount: number;
  /**
   * Чек старший за 7 днів на момент завантаження списку: аркуш показує його
   * згорнутим і без галочок.
   * ponytail: момент завантаження, а не відкриття аркуша; список
   * перечитується щонайменше раз на 30 с відкритого огляду.
   */
  stale: boolean;
  /** Повні дні від покупки до того ж моменту: «куплено 9 днів тому». */
  ageDays: number;
}

/**
 * Усі чеки, куплені не раніше `since`. Сервер віддає сторінки від новіших до
 * старіших, тож перший старший чек означає кінець: без цього після кількох
 * днів без відкриття Харчування чеки поза першою сторінкою губились назавжди.
 */
async function fetchReceiptsSince(
  since: number,
  signal: AbortSignal,
): Promise<SilpoReceiptSummaryDto[]> {
  const out: SilpoReceiptSummaryDto[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await silpoApi.receipts(
      { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
      { signal },
    );
    for (const r of page.data) {
      if (Date.parse(r.purchasedAt) < since) return out;
      out.push(r);
    }
    if (!page.nextCursor) return out;
    cursor = page.nextCursor;
  }
}

async function loadOffers(
  queryClient: QueryClient,
  since: string,
  signal: AbortSignal,
): Promise<SilpoPantryOffer[]> {
  const candidates = (
    await fetchReceiptsSince(Date.parse(since), signal)
  ).filter((r) => !r.pantryAutoDeclined && r.pantryClaimedCount === 0);
  const now = Date.now();
  const offers: SilpoPantryOffer[] = [];
  for (const summary of candidates) {
    // Інвалідація посеред проходу скасовує цей запит; без перевірки цикл
    // дотягував би деталі для відповіді, яку вже ніхто не читає.
    if (signal.aborted) break;
    const detail = await queryClient
      .fetchQuery({
        // Той самий ключ, що й деталі чека в аркуші: відкриття аркуша
        // повторного запиту не робить.
        queryKey: silpoKeys.receiptDetail(summary.receiptId),
        queryFn: ({ signal: s }) =>
          silpoApi.receiptDetail(summary.receiptId, { signal: s }),
        staleTime: STALE_TIME,
      })
      .catch(() => null);
    if (!detail) continue;
    const groceryCount = detail.items.filter(
      (i) =>
        i.pantryClaimedAt == null &&
        mapReceiptItemToCategory(i) === "groceries",
    ).length;
    if (groceryCount === 0) continue;
    offers.push({
      summary,
      items: detail.items,
      groceryCount,
      stale: isStaleReceipt(summary.purchasedAt, now),
      ageDays: receiptAgeDays(summary.purchasedAt, now),
    });
  }
  return offers;
}

const NO_OFFERS: readonly SilpoPantryOffer[] = [];

export function useSilpoPantryOffers(): {
  offers: readonly SilpoPantryOffer[];
  productCount: number;
} {
  const queryClient = useQueryClient();
  const { status, data: syncState } = useSilpoSyncState();
  const since = syncState?.pantryAutoImportSince ?? null;
  const enabled = status === "connected" && since != null;
  const query = useQuery({
    queryKey: silpoKeys.pantryOffers(since),
    queryFn: ({ signal }) => loadOffers(queryClient, since as string, signal),
    enabled,
    staleTime: STALE_TIME,
    retry: authAwareRetry(2),
  });
  const offers = enabled ? (query.data ?? NO_OFFERS) : NO_OFFERS;
  const productCount = useMemo(
    () => offers.reduce((n, o) => n + o.groceryCount, 0),
    [offers],
  );
  return { offers, productCount };
}
