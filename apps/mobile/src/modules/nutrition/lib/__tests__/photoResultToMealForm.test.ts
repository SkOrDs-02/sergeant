import {
  mapPhotoResultToMealForm,
  notFoodMessage,
} from "../photoResultToMealForm";

describe("notFoodMessage", () => {
  it("називає те, що модель побачила на фото", () => {
    expect(notFoodMessage("Кіт")).toMatch(/Не бачу тут страви.*«Кіт»/);
  });

  it("лишається читабельним без назви", () => {
    expect(notFoodMessage("  ")).toBe(
      "Не бачу тут страви. Спробуй інше фото або введи КБЖВ вручну.",
    );
  });

  it("вітається з тваринкою замість того, щоб просити інше фото", () => {
    expect(notFoodMessage("Кіт", "animal")).toBe(
      "Це не страва, а тваринка: на фото схоже на «Кіт». Краще погладь і пригости смаколиком, а для журналу зроби фото їжі.",
    );
  });

  it("відправляє камеру на тарілку, коли в кадрі людина", () => {
    expect(notFoodMessage("Селфі", "person")).toMatch(
      /Це людина, а не страва.*Наведи камеру на тарілку/,
    );
  });

  it("тримає нейтральний текст для невідомої категорії", () => {
    expect(notFoodMessage("Клавіатура", "other")).toMatch(/Не бачу тут страви/);
  });
});

describe("mapPhotoResultToMealForm", () => {
  it("мапить макроси та назву", () => {
    const f = mapPhotoResultToMealForm({
      isFood: true,
      notFoodKind: null,
      dishName: "Борщ",
      confidence: 0.9,
      portion: null,
      ingredients: [],
      items: [
        {
          name: "Борщ",
          macros: { kcal: 220, protein_g: 10.2, fat_g: 5, carbs_g: 30.7 },
          gramsApprox: null,
          confidence: 0.9,
        },
      ],
      macros: {
        kcal: 220,
        protein_g: 10.2,
        fat_g: 5,
        carbs_g: 30.7,
      },
      questions: [],
    });
    expect(f.name).toBe("Борщ");
    expect(f.kcal).toBe("220");
    expect(f.protein_g).toBe("10");
    expect(f.fat_g).toBe("5");
    expect(f.carbs_g).toBe("31");
  });

  it("додає застереження при низькій confidence", () => {
    const f = mapPhotoResultToMealForm({
      isFood: true,
      notFoodKind: null,
      dishName: "X",
      confidence: 0.2,
      portion: null,
      ingredients: [],
      items: [
        {
          name: "X",
          macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
          gramsApprox: null,
          confidence: 0.2,
        },
      ],
      macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
      questions: [],
    });
    expect(f.err).toMatch(/AI оцінив/);
  });
});
