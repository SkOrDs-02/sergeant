/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Два тости поспіль після запису страви (OD-27 Х-4 а, П-6 (А)): перший
 * «Страву додано · Скасувати» показує сам шлях запису, другий — «Списати
 * 150 г із комори? · Списати» — цей хук. Спільний компонент тостів не
 * змінюється: одна дія на тост (`docs/design/ui/toast-policy.md`).
 *
 * Шлях запису кличе `offer(meals, ticket)` ПІСЛЯ свого тосту і з його
 * «Скасувати» кличе `link.undo()`. Що робить `undo`:
 * - «Списати» ще не натиснуто — гасить пропозицію: скасованого запису
 *   немає з чого списувати;
 * - списання вже відбулось (через «Списати» або рядок «З комори» у формі,
 *   тоді квитанцію приносить `ticket`) — повертає списане в комору і
 *   пояснює це тостом «Запис скасовано, 150 г повернув у комору»;
 * - списання чекає вибору варіанта — позначає квитанцію скасованою, і
 *   вибір нічого не спише.
 */
import { useCallback, useEffect, useRef } from "react";
import type { Meal, PantryItem } from "@sergeant/nutrition-domain";
import type { ToastApi } from "@shared/hooks/useToast";
import {
  pantryDeductionOfferFor,
  pantryOfferMessage,
  pantryReturnedMessage,
} from "../lib/pantryDeductionOffer";
import type {
  PantryConsumeReceipt,
  PantryConsumeTicket,
} from "./usePantryConsumeWrite";

/** Те, що пропозиції треба від комори (`useNutritionPantries`). */
export interface PantryOfferPort {
  items: readonly PantryItem[];
  consume: (name: string, grams: number) => PantryConsumeTicket | void;
  revert: (receipt: PantryConsumeReceipt) => boolean;
}

export interface MealPantryLink {
  /** Виклик із «Скасувати» тосту запису. */
  undo: () => void;
}

/**
 * `meals` — записані рядки; пропозиція лише на один (фото з кількома
 * позиціями не пропонує, П-7 Б). `ticket` — списання вже зроблене шляхом
 * запису («З комори»): тоді нічого не пропонуємо, лише вміємо його відкотити.
 */
export type MealPantryOffer = (
  meals: readonly Pick<Meal, "name" | "amount_g">[],
  ticket?: PantryConsumeTicket | null,
) => MealPantryLink;

export function offerPantryDeduction(
  toast: ToastApi,
  getPantry: () => PantryOfferPort,
  meals: readonly Pick<Meal, "name" | "amount_g">[],
  ticket: PantryConsumeTicket | null = null,
): MealPantryLink {
  const session = {
    cancelled: false,
    ticket,
    offerId: null as number | null,
  };
  if (!ticket) {
    const offer = pantryDeductionOfferFor(meals, getPantry().items);
    if (offer) {
      session.offerId = toast.info(pantryOfferMessage(offer.grams), undefined, {
        label: "Списати",
        onClick: () => {
          if (session.cancelled) return;
          session.ticket =
            getPantry().consume(offer.itemName, offer.grams) ?? null;
        },
      });
    }
  }
  return {
    undo: () => {
      session.cancelled = true;
      if (session.offerId != null) toast.dismiss(session.offerId);
      const done = session.ticket;
      if (!done) return;
      done.cancelled = true;
      const receipt = done.receipt;
      if (receipt && getPantry().revert(receipt)) {
        toast.success(pantryReturnedMessage(receipt.deducted, receipt.unit));
      }
    },
  };
}

/**
 * Комора читається в мить тапу, а не в мить запису: між тостом і
 * «Списати» чи «Скасувати» її стан міг змінитись (і точно змінився після
 * списання), а відкат зі старого знімка повернув би вдвічі.
 */
export function useMealPantryOffer(
  toast: ToastApi,
  pantry: PantryOfferPort,
): MealPantryOffer {
  const pantryRef = useRef(pantry);
  useEffect(() => {
    pantryRef.current = pantry;
  });
  return useCallback(
    (meals, ticket) =>
      offerPantryDeduction(toast, () => pantryRef.current, meals, ticket),
    [toast],
  );
}
