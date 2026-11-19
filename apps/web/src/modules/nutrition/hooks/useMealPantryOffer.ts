/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Два тости поспіль після запису страви (OD-27 Х-4 а, П-6 (А)): перший
 * «Страву додано · Скасувати» показує сам шлях запису, другий — «Списати
 * 150 г із комори? · Списати» — цей хук. Спільний компонент тостів не
 * змінюється: одна дія на тост (`docs/design/ui/toast-policy.md`).
 *
 * Шлях запису кличе `offer(meals, { ticket, after })` ПІСЛЯ свого тосту,
 * передає в `after` його id і з його «Скасувати» кличе `link.undo()`.
 * Пропозиція стає в чергу ЗА тостом запису (`afterGone` провайдера) і
 * зʼявляється, коли той зник сам або його закрили, а не стосом поруч:
 * «поспіль» у П-6 (А), одна думка за раз (зйомка 2026-11-19). Що робить
 * `undo`:
 * - пропозиція ще чекає своєї черги або «Списати» не натиснуто — гасить
 *   її: скасованого запису немає з чого списувати;
 * - списання вже відбулось (через «Списати» або рядок «З комори» у формі,
 *   тоді квитанцію приносить `ticket`) — повертає списане в комору і
 *   пояснює це тостом «Запис скасовано, 150 г повернув у комору»;
 * - списання чекає вибору варіанта — позначає квитанцію скасованою, і
 *   вибір нічого не спише.
 *
 * Після «Списати» з готовою квитанцією — короткий тост «Списав 150 г із
 * комори» без дії (`success` за `toast-policy.md`).
 */
import { useCallback, useEffect, useRef } from "react";
import type { Meal, PantryItem } from "@sergeant/nutrition-domain";
import type { ToastApi, ToastContextValue } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { nutritionMealFeedbackMessages as COPY } from "@shared/i18n/uk.nutritionMealFeedback";
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

/** Те, що пропозиції треба від провайдера тостів (`useToast()`). */
export type PantryOfferToast = ToastApi & Pick<ToastContextValue, "afterGone">;

export interface MealPantryOfferOptions {
  /**
   * Списання вже зроблене шляхом запису («З комори»): тоді нічого не
   * пропонуємо, лише вміємо його відкотити.
   */
  ticket?: PantryConsumeTicket | null | undefined;
  /** Id тосту запису: пропозиція зʼявиться, коли він зникне. */
  after?: number | undefined;
}

export interface MealPantryLink {
  /** Виклик із «Скасувати» тосту запису. */
  undo: () => void;
}

/**
 * `meals` — записані рядки; пропозиція лише на один (фото з кількома
 * позиціями не пропонує, П-7 Б).
 */
export type MealPantryOffer = (
  meals: readonly Pick<Meal, "name" | "amount_g">[],
  options?: MealPantryOfferOptions,
) => MealPantryLink;

export function offerPantryDeduction(
  toast: PantryOfferToast,
  getPantry: () => PantryOfferPort,
  meals: readonly Pick<Meal, "name" | "amount_g">[],
  { ticket = null, after }: MealPantryOfferOptions = {},
): MealPantryLink {
  const session = {
    cancelled: false,
    ticket,
    offerId: null as number | null,
  };
  const show = () => {
    if (session.cancelled) return;
    // Комора читається в мить показу: поки пропозиція чекала черги, її
    // стан міг змінитись.
    const offer = pantryDeductionOfferFor(meals, getPantry().items);
    if (!offer) return;
    session.offerId = toast.info(pantryOfferMessage(offer.grams), undefined, {
      label: "Списати",
      onClick: () => {
        if (session.cancelled) return;
        session.ticket =
          getPantry().consume(offer.itemName, offer.grams) ?? null;
        // Тост пропозиції закривається на тап, і без відгуку людина не
        // бачила, що списання відбулось (зйомка 2026-11-18). Лише коли
        // квитанція вже є: вибір варіанта показує свій діалог, і він сам
        // є відгуком. Тост запису на цей момент уже зник, тож відкат живе
        // тут: «Повернути» за квитанцією (рішення власника 2026-11-19, Б).
        const receipt = session.ticket?.receipt;
        if (receipt) {
          showUndoToast(toast, {
            msg: COPY.pantryConsumed.replace("{grams}", String(offer.grams)),
            onUndo: () => {
              // `false` — позицію вже прибрали: списане лишається, і
              // людина має це побачити (`showUndoToast` → тост помилки).
              if (!getPantry().revert(receipt)) {
                throw new Error("pantry revert refused");
              }
              session.ticket = null;
            },
            onUndoErrorMsg: COPY.pantryReturnFailed,
          });
        }
      },
    });
  };
  if (!ticket) {
    if (after == null) show();
    else toast.afterGone(after, show);
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
  toast: PantryOfferToast,
  pantry: PantryOfferPort,
): MealPantryOffer {
  const pantryRef = useRef(pantry);
  useEffect(() => {
    pantryRef.current = pantry;
  });
  return useCallback(
    (meals, options) =>
      offerPantryDeduction(toast, () => pantryRef.current, meals, options),
    [toast],
  );
}
