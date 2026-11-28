/**
 * Last validated: 2026-11-26
 * Status: Active
 *
 * Картка нових чеків Сільпо в огляді Харчування (спека
 * `docs/work/specs/silpo-pantry-confirm.md` § Рішення дизайну, «Де видно»).
 * Висить, поки є хоч один чек, що пропонується; «Переглянути» відкриває
 * аркуш з усіма такими чеками, «Не додавати» відхиляє всі чеки картки. Без
 * «Додати» в аркуші в комору не пишеться нічого.
 */
import { useState } from "react";
import { pluralUa } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { failedCopy } from "@shared/i18n/failedCopy";
import { useToast } from "@shared/hooks/useToast";
import { usePantryRelease } from "@finyk/hooks/useSilpoReceipts";
import { useSilpoPantryOffers } from "../hooks/useSilpoPantryOffers";
import { SilpoPantryReplenishSheet } from "./SilpoPantryReplenishSheet";
import type { PantryItem } from "../lib/pantryTextParser";

const COPY = messages.nutrition.pantryReplenish;

/** «Новий чек Сільпо: 12 продуктів», «3 нові чеки Сільпо: 27 продуктів». */
export function offersCardTitle(
  receiptCount: number,
  productCount: number,
): string {
  const products = `${productCount} ${pluralUa(productCount, {
    one: "продукт",
    few: "продукти",
    many: "продуктів",
  })}`;
  if (receiptCount === 1) return `Новий чек Сільпо: ${products}`;
  const receipts = pluralUa(receiptCount, {
    one: "новий чек",
    few: "нові чеки",
    many: "нових чеків",
  });
  return `${receiptCount} ${receipts} Сільпо: ${products}`;
}

export interface SilpoPantryOffersCardProps {
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
  busy: boolean;
}

export function SilpoPantryOffersCard({
  pantryItems,
  upsertItem,
  busy,
}: SilpoPantryOffersCardProps) {
  const toast = useToast();
  const { offers, productCount } = useSilpoPantryOffers();
  const { release } = usePantryRelease();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  async function dismissAll() {
    setDismissing(true);
    const results = await Promise.allSettled(
      offers.map((o) => release(o.summary.receiptId, [], true)),
    );
    setDismissing(false);
    if (results.some((r) => r.status === "rejected")) {
      toast.error(failedCopy("прибрати чеки"), undefined, {
        label: "Повторити",
        onClick: () => void dismissAll(),
      });
    }
  }

  return (
    <>
      {offers.length > 0 && (
        // `min-w-0`: картка - grid-item огляду, і без нього довгий рядок
        // заголовка розпирав би трек колонки разом з усіма картками.
        <div
          className="min-w-0 border-y border-line py-3"
          data-testid="silpo-pantry-offers-card"
        >
          <p className="min-w-0 truncate text-style-body font-semibold text-text">
            {offersCardTitle(offers.length, productCount)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              disabled={dismissing}
            >
              {COPY.offersReviewCta}
            </Button>
            <Button
              type="button"
              variant="text"
              onClick={() => void dismissAll()}
              disabled={dismissing}
            >
              {COPY.offersDismissCta}
            </Button>
          </div>
        </div>
      )}
      <SilpoPantryReplenishSheet
        open={open}
        onClose={() => setOpen(false)}
        pantryItems={pantryItems}
        upsertItem={upsertItem}
        busy={busy}
        offers={offers}
      />
    </>
  );
}
