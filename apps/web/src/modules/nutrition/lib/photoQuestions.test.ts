/**
 * Last validated: 2026-11-19
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_QUESTIONS,
  isPortionWeightQuestion,
  splitPhotoQuestions,
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
  ])("питання про вагу: %s", (q) => {
    expect(isPortionWeightQuestion(q)).toBe(true);
  });

  it.each([
    "Чи використовувалася олія під час приготування, і якщо так, то яка і скільки?",
    "Зі сметаною?",
    "Скільки олії?",
    "Яка начинка у пиріжка?",
    "Сфотографуй таблицю харчової цінності для точності",
    "Чи є соус під куркою?",
  ])("не про вагу: %s", (q) => {
    expect(isPortionWeightQuestion(q)).toBe(false);
  });
});

describe("splitPhotoQuestions", () => {
  it("питання моделі про вагу страви стає підписом поля порції, а не окремим полем", () => {
    expect(
      splitPhotoQuestions(
        [
          "Яка приблизна вага страви на тарілці?",
          "Чи використовувалася олія?",
          "Зі сметаною?",
        ],
        1,
      ),
    ).toEqual({
      portionQuestion: "Яка приблизна вага страви на тарілці?",
      otherQuestions: ["Чи використовувалася олія?", "Зі сметаною?"],
    });
  });

  it("друге питання про вагу всієї страви теж не дублює поле", () => {
    expect(
      splitPhotoQuestions(["Яка порція?", "Скільки важить страва?"], 1),
    ).toEqual({ portionQuestion: "Яка порція?", otherQuestions: [] });
  });

  it("на кількох позиціях вага однієї з них лишається окремим питанням", () => {
    expect(
      splitPhotoQuestions(
        ["Скільки грамів рису?", "Яка вага всієї тарілки?"],
        2,
      ),
    ).toEqual({
      portionQuestion: "Яка вага всієї тарілки?",
      otherQuestions: ["Скільки грамів рису?"],
    });
  });

  it("без питання про порцію поле лишається зі своїм підписом", () => {
    expect(splitPhotoQuestions(["Зі сметаною?"], 1)).toEqual({
      portionQuestion: null,
      otherQuestions: ["Зі сметаною?"],
    });
  });

  it("ріже решту до ліміту картки, не рахуючи питання про порцію", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Соус ${i}?`);
    const split = splitPhotoQuestions(["Яка вага?", ...many], 1);
    expect(split.portionQuestion).toBe("Яка вага?");
    expect(split.otherQuestions).toHaveLength(MAX_PHOTO_QUESTIONS);
  });

  it("неправильний вхід дає порожній розклад, а не виняток", () => {
    const empty = { portionQuestion: null, otherQuestions: [] };
    expect(splitPhotoQuestions(undefined, 0)).toEqual(empty);
    expect(splitPhotoQuestions(null, 0)).toEqual(empty);
    expect(splitPhotoQuestions([1, "", "  ", "Зі сметаною?"], 1)).toEqual({
      portionQuestion: null,
      otherQuestions: ["Зі сметаною?"],
    });
  });
});
