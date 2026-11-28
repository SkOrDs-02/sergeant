/**
 * Last validated: 2026-11-26
 * Status: Active
 *
 * Поповнення комори з куплених продуктів Сільпо (Silpo integration трек C,
 * спека `docs/work/specs/silpo-mcp-integration.md` §
 * «Комора - через готовий ledger», далі розширена спекою
 * `docs/work/specs/silpo-pantry-auto-import.md` позначкою «вже в коморі» і
 * бронюванням, і спекою `docs/work/specs/silpo-pantry-confirm.md`: режим
 * нових чеків секціями і навчання «зазвичай не додаєш»).
 *
 * Два режими одного аркуша. Без `offers` - «З чека»: людина обирає один чек
 * з останніх. З `offers` - нові чеки з картки в огляді: кожен чек окремою
 * секцією, одна кнопка «Додати» на всі.
 *
 * AI-CONTEXT: жодного нового шляху запису в комору - позиції, які
 * користувач підтвердив, ідуть через ІСНУЮЧИЙ `pantry.upsertItem`
 * (`useNutritionPantries.ts`) одним викликом на все «Додати», а побудова
 * рядків і перетворення на `PantryItem[]` живуть у чистих функціях
 * `../lib/silpoReplenish.ts`. `confirm()` спершу БРОНЮЄ обрані позиції
 * (`pantry-claim`, `mode: "manual"`), і лише заброньовані сервером пише.
 */
import { useMemo, useState } from "react";
import { buildPantryIndex } from "@sergeant/nutrition-domain";
import {
  useSilpoReceipts,
  useSilpoReceiptDetail,
  usePantryClaim,
  usePantryRelease,
  usePantrySkips,
  useRecordPantrySkips,
} from "@finyk/hooks/useSilpoReceipts";
import {
  buildPantrySkipUpdate,
  buildSilpoReplenishRows,
  rowsToPantryItems,
  type SilpoReplenishRow,
} from "../lib/silpoReplenish";
import type { PantryItem } from "../lib/pantryTextParser";
import type { SilpoPantryOffer } from "./useSilpoPantryOffers";

/** Скільки останніх чеків пропонуємо на вибір — «останні чеки», не архів. */
const RECEIPTS_LIMIT = 10;

export interface UseSilpoPantryReplenishParams {
  /** Хук фетчить чеки лише поки `true` — керує викликач (напр. відкритий sheet). */
  enabled: boolean;
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
  /** Режим нових чеків: секції з цих чеків замість вибору одного з останніх. */
  offers?: readonly SilpoPantryOffer[] | undefined;
}

export interface SilpoReplenishSection {
  receiptId: string;
  /** `null` - список чеків «З чека» ще не приніс зведення цього чека. */
  purchasedAt: string | null;
  /** Чек старший за 7 днів: без галочок за замовчуванням. */
  stale: boolean;
  /** Повні дні від покупки, для підпису давності старого чека. */
  ageDays: number;
  /** Старий чек, який людина ще не розгорнула. */
  collapsed: boolean;
  rows: SilpoReplenishRow[];
}

export function useSilpoPantryReplenish({
  enabled,
  pantryItems,
  upsertItem,
  offers,
}: UseSilpoPantryReplenishParams) {
  const manual = offers == null;
  const receiptsQuery = useSilpoReceipts(
    { limit: RECEIPTS_LIMIT },
    { enabled: enabled && manual },
  );
  const claim = usePantryClaim();
  const { release } = usePantryRelease();
  const skippedKeys = usePantrySkips({ enabled });
  const recordSkips = useRecordPantrySkips();
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(
    null,
  );

  // Дефолт — найсвіжіший чек (сервер уже сортує `purchasedAt DESC` —
  // `silpo.ts` endpoint doc). Render-phase adjustment, не `useEffect` +
  // `setState` - той самий idiom, що seed чекбоксів нижче.
  if (manual && enabled && selectedReceiptId == null) {
    const first = receiptsQuery.receipts[0];
    if (first) setSelectedReceiptId(first.receiptId);
  }

  const detailQuery = useSilpoReceiptDetail(
    manual && enabled ? selectedReceiptId : null,
  );
  const items = useMemo(
    () => detailQuery.data?.items ?? [],
    [detailQuery.data],
  );

  // Нормалізовані назви комори рахуються ОДИН раз на комору, а не заново
  // для кожного рядка чека.
  const pantryIndex = useMemo(
    () => buildPantryIndex(pantryItems),
    [pantryItems],
  );

  const [checkedState, setCheckedState] = useState<Record<number, boolean>>({});
  // Один чекпойнт "seed" на чек: перезаходити в дефолти щоразу, коли юзер
  // сам щось перемкнув, не можна - тому порівнюємо не з `items`, а з
  // `selectedReceiptId`.
  const [seededReceiptId, setSeededReceiptId] = useState<string | null>(null);
  if (manual && selectedReceiptId !== seededReceiptId && items.length > 0) {
    setSeededReceiptId(selectedReceiptId);
    setCheckedState({});
  }

  const [keepFullState, setKeepFullState] = useState<Record<number, boolean>>(
    {},
  );
  // Відхилені в цьому аркуші чеки ховаються одразу, не чекаючи, поки сервер
  // перечитає список.
  const [declinedIds, setDeclinedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const sections = useMemo((): SilpoReplenishSection[] => {
    const common = { pantryIndex, checkedState, keepFullState, skippedKeys };
    if (offers) {
      return offers
        .filter((o) => !declinedIds.has(o.summary.receiptId))
        .map((o) => ({
          receiptId: o.summary.receiptId,
          purchasedAt: o.summary.purchasedAt,
          stale: o.stale,
          ageDays: o.ageDays,
          collapsed: o.stale && !expandedIds.has(o.summary.receiptId),
          rows: buildSilpoReplenishRows({
            ...common,
            items: o.items,
            stale: o.stale,
          }),
        }));
    }
    if (!selectedReceiptId) return [];
    const receipt = receiptsQuery.receipts.find(
      (r) => r.receiptId === selectedReceiptId,
    );
    return [
      {
        receiptId: selectedReceiptId,
        purchasedAt: receipt?.purchasedAt ?? null,
        stale: false,
        ageDays: 0,
        collapsed: false,
        rows: buildSilpoReplenishRows({ ...common, items }),
      },
    ];
  }, [
    offers,
    declinedIds,
    expandedIds,
    selectedReceiptId,
    receiptsQuery.receipts,
    items,
    pantryIndex,
    checkedState,
    keepFullState,
    skippedKeys,
  ]);

  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const checkedCount = rows.reduce((n, r) => (r.checked ? n + 1 : n), 0);

  function selectReceipt(receiptId: string) {
    if (receiptId === selectedReceiptId) return;
    setSelectedReceiptId(receiptId);
  }

  function toggleItem(itemId: number) {
    // Поточне значення обчислюється всередині updater-а - значення з JSX
    // може застаріти між reseed-ом (зміна вибраного чека) і кліком.
    setCheckedState((cur) => {
      const row = rows.find((r) => r.item.id === itemId);
      if (row?.locked) return cur;
      const current = cur[itemId] ?? row?.checked ?? false;
      return { ...cur, [itemId]: !current };
    });
  }

  function toggleExpanded(receiptId: string) {
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (!next.delete(receiptId)) next.add(receiptId);
      return next;
    });
  }

  /**
   * «Вже не актуальний»: чек зникає з аркуша й картки, сервер ставить
   * `pantry_auto_declined_at`. Невдача повертає секцію на місце і кидає
   * помилку далі - тост показує викликач.
   */
  async function declineReceipt(receiptId: string): Promise<void> {
    setDeclinedIds((cur) => new Set(cur).add(receiptId));
    try {
      await release(receiptId, [], true);
    } catch (err) {
      setDeclinedIds((cur) => {
        const next = new Set(cur);
        next.delete(receiptId);
        return next;
      });
      throw err;
    }
  }

  /**
   * Бронює обрані позиції кожного чека (`mode: "manual"` - бронює навіть
   * уже заброньоване), пише в комору ЛИШЕ заброньоване одним `upsertItem`,
   * записує лічильники «зазвичай не додаєш» і в режимі нових чеків
   * відхиляє чеки, з яких не взято нічого (інакше вони висіли б у картці
   * далі). Повертає скільки додано (0 — нема що писати). Якщо бронювання
   * якогось чека впало, заброньоване з решти все одно пишеться, а помилка
   * летить викликачу для «Повторити».
   */
  async function confirm(): Promise<number> {
    const work = sections.map((s) => ({
      section: s,
      checked: s.rows.filter((r) => r.checked),
    }));
    if (!work.some((w) => w.checked.length > 0)) return 0;

    // Паралельно: кожне бронювання інвалідує чеки, і послідовні виклики
    // перезапускали б перечитування списку пропозицій стільки ж разів.
    const results = await Promise.allSettled(
      work.map(({ section, checked }) =>
        checked.length === 0
          ? Promise.resolve<number[]>([])
          : claim.claim(
              section.receiptId,
              checked.map((r) => r.item.id),
              "manual",
            ),
      ),
    );
    const claimedIds = new Set(
      results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    );
    const toAdd = work.flatMap(({ section, checked }) =>
      rowsToPantryItems(
        checked.filter((r) => claimedIds.has(r.item.id)),
        section.purchasedAt ?? new Date(),
      ),
    );
    if (toAdd.length > 0) {
      upsertItem(toAdd);
      const update = buildPantrySkipUpdate(rows, claimedIds);
      if (update.skipped.length > 0 || update.added.length > 0) {
        // Лічильник - підказка, а не запис: його збій не має повертати
        // людину до «Повторити», комора вже поповнена.
        void recordSkips(update.skipped, update.added).catch(() => undefined);
      }
      if (!manual) {
        work.forEach(({ section }, i) => {
          if (results[i]?.status !== "fulfilled") return;
          if (section.rows.some((r) => claimedIds.has(r.item.id))) return;
          void release(section.receiptId, [], true).catch(() => undefined);
        });
      }
    }
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
    return toAdd.length;
  }

  function toggleKeepFull(itemId: number) {
    setKeepFullState((cur) => ({ ...cur, [itemId]: !cur[itemId] }));
  }

  /** Скидає локальний вибір чека/чекбоксів — виклик при закритті sheet-а. */
  function reset() {
    setSelectedReceiptId(null);
    setSeededReceiptId(null);
    setCheckedState({});
    setKeepFullState({});
    setDeclinedIds(new Set());
    setExpandedIds(new Set());
  }

  return {
    receipts: receiptsQuery.receipts,
    receiptsLoading: receiptsQuery.isLoading,
    selectedReceiptId,
    selectReceipt,
    detailLoading: detailQuery.isLoading,
    sections,
    rows,
    checkedCount,
    toggleItem,
    toggleKeepFull,
    toggleExpanded,
    declineReceipt,
    confirm,
    confirmPending: claim.isPending,
    reset,
  };
}
