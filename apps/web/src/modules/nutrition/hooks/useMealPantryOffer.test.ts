import { describe, expect, it, vi } from "vitest";
import type { ToastAction, ToastApi } from "@shared/hooks/useToast";
import type { PantryItem } from "@sergeant/nutrition-domain";
import {
  offerPantryDeduction,
  type PantryOfferPort,
} from "./useMealPantryOffer";
import type {
  PantryConsumeReceipt,
  PantryConsumeTicket,
} from "./usePantryConsumeWrite";

function fakeToast() {
  const shown: Array<{ id: number; msg: unknown; action?: ToastAction }> = [];
  let next = 1;
  const push = (msg: unknown, _d?: unknown, action?: ToastAction) => {
    const id = next++;
    shown.push({ id, msg, ...(action ? { action } : {}) });
    return id;
  };
  const toast = {
    show: vi.fn((msg, _type, d, action) => push(msg, d, action)),
    success: vi.fn(push),
    error: vi.fn(push),
    info: vi.fn(push),
    warning: vi.fn(push),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  } as unknown as ToastApi;
  return { toast, shown };
}

const rice: PantryItem = { name: "Рис", qty: 500, unit: "г", notes: null };
const receipt: PantryConsumeReceipt = {
  pantryId: "home",
  itemKey: "рис",
  before: rice,
  after: { ...rice, qty: 350 },
  deducted: 150,
  unit: "г",
};

function port(over: Partial<PantryOfferPort> = {}): PantryOfferPort {
  return {
    items: [rice],
    consume: vi.fn((): PantryConsumeTicket => ({ receipt, cancelled: false })),
    revert: vi.fn(() => true),
    ...over,
  };
}

describe("offerPantryDeduction", () => {
  it("показує пропозицію і «Списати» списує вагу рядка", () => {
    const { toast, shown } = fakeToast();
    const pantry = port();
    offerPantryDeduction(toast, () => pantry, [{ name: "Рис", amount_g: 150 }]);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.msg).toBe("Списати 150\u00a0г із комори?");
    expect(shown[0]!.action?.label).toBe("Списати");
    shown[0]!.action!.onClick();
    expect(pantry.consume).toHaveBeenCalledWith("Рис", 150);
  });

  // Зйомка 2026-11-18: після «Списати» тост просто зникав, і людина не
  // бачила, що списання відбулось.
  it("після «Списати» коротко підтверджує списання, без дії", () => {
    const { toast, shown } = fakeToast();
    offerPantryDeduction(toast, () => port(), [{ name: "Рис", amount_g: 150 }]);
    shown[0]!.action!.onClick();
    expect(shown).toHaveLength(2);
    expect(shown[1]!.msg).toBe("Списав 150\u00a0г із комори");
    expect(shown[1]!.action).toBeUndefined();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("списання чекає вибору варіанта: підтвердження не показує", () => {
    const { toast, shown } = fakeToast();
    const pantry = port({
      consume: vi.fn((): PantryConsumeTicket => ({
        receipt: null,
        cancelled: false,
      })),
    });
    offerPantryDeduction(toast, () => pantry, [{ name: "Рис", amount_g: 150 }]);
    shown[0]!.action!.onClick();
    expect(shown).toHaveLength(1);
  });

  it("без збігу з коморою нічого не пропонує", () => {
    const { toast, shown } = fakeToast();
    offerPantryDeduction(toast, () => port(), [
      { name: "Гречка", amount_g: 150 },
    ]);
    expect(shown).toHaveLength(0);
  });

  it("«Скасувати» до «Списати» гасить пропозицію, і вона вже не списує", () => {
    const { toast, shown } = fakeToast();
    const pantry = port();
    const link = offerPantryDeduction(toast, () => pantry, [
      { name: "Рис", amount_g: 150 },
    ]);
    link.undo();
    expect(toast.dismiss).toHaveBeenCalledWith(shown[0]!.id);
    shown[0]!.action!.onClick();
    expect(pantry.consume).not.toHaveBeenCalled();
    expect(pantry.revert).not.toHaveBeenCalled();
  });

  it("«Скасувати» після «Списати» повертає списане і пояснює це", () => {
    const { toast, shown } = fakeToast();
    const pantry = port();
    const link = offerPantryDeduction(toast, () => pantry, [
      { name: "Рис", amount_g: 150 },
    ]);
    shown[0]!.action!.onClick();
    link.undo();
    expect(pantry.revert).toHaveBeenCalledWith(receipt);
    expect(shown.at(-1)!.msg).toBe(
      "Запис скасовано, 150\u00a0г повернув у комору",
    );
  });

  it("списання «З комори» не пропонується вдруге, але відкочується", () => {
    const { toast, shown } = fakeToast();
    const pantry = port();
    const ticket: PantryConsumeTicket = { receipt, cancelled: false };
    const link = offerPantryDeduction(
      toast,
      () => pantry,
      [{ name: "Рис", amount_g: 150 }],
      ticket,
    );
    expect(shown).toHaveLength(0);
    link.undo();
    expect(ticket.cancelled).toBe(true);
    expect(pantry.revert).toHaveBeenCalledWith(receipt);
    expect(shown).toHaveLength(1);
  });

  it("відкат, якого не вдалось зробити, не каже «повернув»", () => {
    const { toast, shown } = fakeToast();
    const pantry = port({ revert: vi.fn(() => false) });
    const ticket: PantryConsumeTicket = { receipt, cancelled: false };
    offerPantryDeduction(toast, () => pantry, [], ticket).undo();
    expect(shown).toHaveLength(0);
  });
});
