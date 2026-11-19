/**
 * Last validated: 2026-11-19
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_QUESTIONS,
  isPortionWeightQuestion,
  visiblePhotoQuestions,
} from "./photoQuestions";

describe("isPortionWeightQuestion", () => {
  it.each([
    "Яка приблизна вага страви на тарілці?",
    "Скільки грамів рису на тарілці?",
    "Скільки важить порція?",
    "Яка порція?",
    "Який розмір порції?",
    "Яка у тебе порція курки?",
    "What is the approximate weight?",
  ])("дубль поля «Порція (г)»: %s", (q) => {
    expect(isPortionWeightQuestion(q)).toBe(true);
  });

  it.each([
    "Чи використовувалася олія під час приготування, і якщо так, то яка і скільки?",
    "Зі сметаною?",
    "Скільки олії?",
    "Яка начинка у пиріжка?",
    "Сфотографуй таблицю харчової цінності для точності",
    "Чи є соус під куркою?",
  ])("питання про те, чого не видно на фото, лишається: %s", (q) => {
    expect(isPortionWeightQuestion(q)).toBe(false);
  });
});

describe("visiblePhotoQuestions", () => {
  it("прибирає питання про вагу й лишає решту в порядку моделі", () => {
    expect(
      visiblePhotoQuestions([
        "Яка приблизна вага страви на тарілці?",
        "Чи використовувалася олія?",
        "Зі сметаною?",
      ]),
    ).toEqual(["Чи використовувалася олія?", "Зі сметаною?"]);
  });

  it("ріже до ліміту картки вже після фільтра", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Соус ${i}?`);
    expect(visiblePhotoQuestions(["Яка вага?", ...many])).toHaveLength(
      MAX_PHOTO_QUESTIONS,
    );
  });

  it("неправильний вхід дає порожній список, а не виняток", () => {
    expect(visiblePhotoQuestions(undefined)).toEqual([]);
    expect(visiblePhotoQuestions(null)).toEqual([]);
    expect(visiblePhotoQuestions([1, "", "  ", "Зі сметаною?"])).toEqual([
      "Зі сметаною?",
    ]);
  });
});
