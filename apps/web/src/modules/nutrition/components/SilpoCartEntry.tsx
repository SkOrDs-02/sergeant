/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * Точка входу «У кошик Сільпо» — видима лише коли інтеграцію Сільпо
 * звʼязано (Silpo integration трек G, спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * «Cart (MCP write path)»). Гейт-стан реюзає `useSilpoSyncState`
 * (`@finyk/hooks`, read-only) — той самий хук, що вже гейтить
 * `SilpoPantryReplenishEntry` (трек C). `"disabled"`/`"unknown"`/
 * `"disconnected"`/`"reauth_required"` — кнопка не рендериться, тихий
 * degrade: список покупок цілком працює без Сільпо.
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { SilpoCartSheet } from "./SilpoCartSheet";
import { collectUncheckedShoppingItems } from "../lib/silpoCartItems";
import type { ShoppingList } from "@sergeant/nutrition-domain";

export interface SilpoCartEntryProps {
  shoppingList: ShoppingList | null;
}

export function SilpoCartEntry({ shoppingList }: SilpoCartEntryProps) {
  const { status } = useSilpoSyncState();
  const [open, setOpen] = useState(false);
  if (status !== "connected") return null;

  const items = collectUncheckedShoppingItems(shoppingList);
  if (items.length === 0) return null;

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
        {messages.nutrition.silpoCart.entryCta}
      </Button>
      <SilpoCartSheet
        open={open}
        onClose={() => setOpen(false)}
        items={items}
      />
    </>
  );
}
