/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * Точка входу «Поповнити комору з покупок Сільпо» — видима лише коли
 * інтеграцію Сільпо звʼязано (Silpo integration трек C, спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md`). Гейт-стан
 * реюзає `useSilpoSyncState` (`@finyk/hooks`, read-only) — той самий
 * хук, що вже гейтить секцію «Чек» у деталях транзакції finyk.
 * `"disabled"`/`"unknown"`/`"disconnected"`/`"reauth_required"` — кнопка
 * не рендериться, це тихий degrade без банера (комора цілком працює і
 * без Сільпо).
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { SilpoPantryReplenishSheet } from "./SilpoPantryReplenishSheet";
import type { PantryItem } from "../lib/pantryTextParser";

export interface SilpoPantryReplenishEntryProps {
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
  busy: boolean;
}

export function SilpoPantryReplenishEntry({
  pantryItems,
  upsertItem,
  busy,
}: SilpoPantryReplenishEntryProps) {
  const { status } = useSilpoSyncState();
  const [open, setOpen] = useState(false);

  if (status !== "connected") return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        module="nutrition"
        className="min-h-[44px]"
        onClick={() => setOpen(true)}
      >
        <Icon name="shopping-cart" size={15} aria-hidden />
        {messages.nutrition.pantryReplenish.entryCta}
      </Button>
      <SilpoPantryReplenishSheet
        open={open}
        onClose={() => setOpen(false)}
        pantryItems={pantryItems}
        upsertItem={upsertItem}
        busy={busy}
      />
    </>
  );
}
