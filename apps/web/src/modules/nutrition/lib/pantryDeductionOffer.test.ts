import { describe, expect, it } from "vitest";
import { buildPlacedItems, type PantryItem } from "@sergeant/nutrition-domain";
import {
  pantryDeductionOfferFor,
  pantryOfferMessage,
  pantryReturnedMessage,
} from "./pantryDeductionOffer";

const milk: PantryItem = { name: "Молоко", qty: 1, unit: "л", notes: null };
const rice: PantryItem = { name: "Рис", qty: 900, unit: "г", notes: null };
const pack: PantryItem = { name: "Печиво", qty: 2, unit: "уп", notes: null };

describe("pantryDeductionOfferFor", () => {
  it("пропонує вагу рядка, коли назва точно збігається з позицією", () => {
    expect(
      pantryDeductionOfferFor(
        [{ name: "  рис ", amount_g: 150.4 }],
        [milk, rice],
      ),
    ).toEqual({ itemName: "Рис", grams: 150 });
  });

  it("не пропонує за частковим збігом назви", () => {
    expect(
      pantryDeductionOfferFor([{ name: "Рис басматі", amount_g: 150 }], [rice]),
    ).toBeNull();
  });

  it("не пропонує, коли рядків кілька (фото з кількома позиціями)", () => {
    expect(
      pantryDeductionOfferFor(
        [
          { name: "Рис", amount_g: 150 },
          { name: "Молоко", amount_g: 200 },
        ],
        [rice, milk],
      ),
    ).toBeNull();
  });

  it("не пропонує без ваги, з порожньою позицією чи в упаковках", () => {
    expect(
      pantryDeductionOfferFor([{ name: "Рис", amount_g: null }], [rice]),
    ).toBeNull();
    expect(
      pantryDeductionOfferFor(
        [{ name: "Рис", amount_g: 100 }],
        [{ ...rice, qty: 0 }],
      ),
    ).toBeNull();
    expect(
      pantryDeductionOfferFor([{ name: "Печиво", amount_g: 40 }], [pack]),
    ).toBeNull();
  });
});

// Виклик поза модулем (запис через чат, `log_meal`): без React і сховища,
// комора — усі місця одним списком, як її бачить і сама форма прийому.
describe("pantryDeductionOfferFor поза модулем", () => {
  const pantries = [
    { id: "shelf", name: "Полиця", items: [milk], text: "" },
    { id: "fridge", name: "Холодильник", items: [rice], text: "" },
  ];

  it("знаходить позицію в будь-якому місці комори", () => {
    expect(
      pantryDeductionOfferFor(
        [{ name: "Рис", amount_g: 200 }],
        buildPlacedItems(pantries),
      ),
    ).toEqual({ itemName: "Рис", grams: 200 });
  });

  it("без збігу в коморі нічого не пропонує", () => {
    expect(
      pantryDeductionOfferFor(
        [{ name: "Гречка", amount_g: 200 }],
        buildPlacedItems(pantries),
      ),
    ).toBeNull();
  });

  it("кількість невідома — нічого не пропонує", () => {
    expect(
      pantryDeductionOfferFor(
        [{ name: "Рис", amount_g: undefined }],
        buildPlacedItems(pantries),
      ),
    ).toBeNull();
  });
});

describe("тексти пропозиції", () => {
  it("питання і пояснення повернення", () => {
    expect(pantryOfferMessage(150)).toBe("Списати 150\u00a0г із комори?");
    expect(pantryReturnedMessage(150, "г")).toBe(
      "Запис скасовано, 150\u00a0г повернув у комору",
    );
  });
});
