/**
 * Гейти зорового стенду (`pnpm eval:vision`, спека `ai-eval-harness-v2.md`
 * § Зорові шляхи). Три речі, які інакше ловляться тільки живим прогоном за
 * гроші:
 *
 *   1. промпт стенду = промпт прода (та сама вимога, що у `evalPromptParity`);
 *   2. згенеровані PNG приймає ПРОДОВИЙ валідатор `validateImageBase64` —
 *      інакше половина кейсів упала б на 415 ще до моделі;
 *   3. фільтр модальностей fail-close: невідома OpenRouter-модель відсівається,
 *      а не йде в прогін по зображенню, якого не приймає.
 */

import { describe, expect, it } from "vitest";

import {
  VISION_PIPELINES,
  filterByModality,
} from "../../scripts/eval/vision.js";
import {
  BLURRED_PNG_B64,
  EMPTY_PNG_B64,
  FONT,
  LABEL_PNG_B64,
  MULTI_DISH_PNG_B64,
} from "../../scripts/eval/vision-images.js";
import { buildAnalyzePhotoPrompt } from "../modules/nutrition/analyze-photo.js";
import { buildRefinePhotoPrompt } from "../modules/nutrition/refine-photo.js";
import { validateImageBase64 } from "./imageMagic.js";

const byKey = (key: string) => {
  const pipeline = VISION_PIPELINES.find((p) => p.key === key);
  if (!pipeline) throw new Error(`зоровий пайплайн ${key} зник зі стенду`);
  return pipeline;
};

const caseByName = (pipelineKey: string, name: string) => {
  const found = byKey(pipelineKey).cases.find((c) => c.name === name);
  if (!found) throw new Error(`кейс ${name} зник із ${pipelineKey}`);
  return found;
};

describe("зоровий стенд", () => {
  it("промпти — байт у байт з продовими білдерами", () => {
    const analyze = buildAnalyzePhotoPrompt({ locale: "uk-UA" });
    expect(byKey("analyze-photo").system).toBe(analyze.system);
    expect(byKey("analyze-photo").cases[0]?.user).toBe(analyze.user);

    const refine = buildRefinePhotoPrompt({
      prior_result: null,
      portion_grams: 450,
      qna: [],
      locale: "uk-UA",
    });
    expect(byKey("refine-photo").system).toBe(refine.system);
    // Уточнення користувача мусять доїхати до моделі — інакше кейс міряє
    // не перерахунок, а повторний аналіз.
    expect(byKey("refine-photo").cases[0]?.user).toContain("450");
  });

  it("кожен кейс має зображення й сформульовану пастку", () => {
    for (const pipeline of VISION_PIPELINES) {
      expect(pipeline.cases.length).toBeGreaterThan(0);
      for (const c of pipeline.cases) {
        expect(
          c.image?.base64.length,
          `${pipeline.key}/${c.name}`,
        ).toBeGreaterThan(100);
        expect(c.trap.length, `${pipeline.key}/${c.name}`).toBeGreaterThan(30);
      }
    }
  });

  it("згенеровані PNG проходять продовий magic-byte валідатор", () => {
    const fixtures = {
      LABEL_PNG_B64,
      BLURRED_PNG_B64,
      MULTI_DISH_PNG_B64,
      EMPTY_PNG_B64,
    };
    for (const [name, b64] of Object.entries(fixtures)) {
      const validated = validateImageBase64(b64, "image/png");
      expect(validated.ok, `${name}: ${JSON.stringify(validated)}`).toBe(true);
      if (validated.ok) expect(validated.mimeType).toBe("image/png");
    }
    // Розмиття справді щось змінило: інакше кейс «розмите фото» дублював би
    // етикетку і міряв би не ту пастку.
    expect(BLURRED_PNG_B64).not.toBe(LABEL_PNG_B64);
  });

  it("растровий шрифт — рівно 5 рядків по 3 символи", () => {
    for (const [ch, glyph] of Object.entries(FONT)) {
      expect(glyph.length, `гліф "${ch}"`).toBe(5);
      for (const row of glyph) expect(row.length, `гліф "${ch}"`).toBe(3);
    }
  });

  it("суддя порожнього кадру валить вигадані КБЖВ", () => {
    const judge = caseByName("analyze-photo", "порожній кадр").judge;
    const invented = JSON.stringify({
      isFood: true,
      dishName: "Салат Цезар",
      confidence: 0.92,
      macros: { kcal: 420, protein_g: 20, fat_g: 25, carbs_g: 18 },
      questions: [],
    });
    const honest = JSON.stringify({
      isFood: false,
      dishName: "Порожній кадр",
      confidence: 0.9,
      macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
      questions: [],
    });
    // Провал — рядок із причиною, не голий `false` (див. `evalJudgeReason`).
    expect(judge?.(invented)).toBe(
      "назвав «Салат Цезар» їжею (confidence=0.92, ккал 420)",
    );
    expect(judge?.(honest)).toBe(true);
    // Проза замість JSON — прод показав би порожній екран, це теж провал.
    expect(judge?.("На фото нічого немає.")).toBe(
      "не розібрався прод-парсером",
    );
  });

  it("суддя не-їжі вимагає відмови, а не уточнюючого питання", () => {
    const judge = caseByName("analyze-photo", "не-їжа в кадрі").judge;
    // Рівно та відповідь, що приїхала на фото кота: назва обʼєкта, нулі і
    // питання про порцію. До 2026-08-07 суддя рахував це успіхом («модель
    // хеджує»), і прод-баг проходив стенд зеленим. Тепер прод-нормалізатор
    // виводить із нульових КБЖВ відмову — і кейс проходить саме тому, що
    // користувач бачить відмову, а не блок «Уточнення порції».
    const catLikeProd = JSON.stringify({
      dishName: "Кіт",
      confidence: 1,
      macros: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      questions: ["Чи є на фото щось інше, окрім кота?"],
    });
    expect(judge?.(catLikeProd)).toBe(true);

    // А ось наполягання, що предмет — це страва з КБЖВ, лишається провалом.
    const insists = JSON.stringify({
      isFood: true,
      dishName: "Смартфон у клярі",
      confidence: 0.7,
      macros: { kcal: 310, protein_g: 4, fat_g: 12, carbs_g: 44 },
      questions: [],
    });
    expect(judge?.(insists)).toBe(
      "назвав «Смартфон у клярі» їжею (confidence=0.7, ккал 310)",
    );
  });

  it("суддя етикетки вимагає прочитаних чисел", () => {
    const judge = caseByName("analyze-photo", "етикетка іноземною").judge;
    const read = JSON.stringify({
      dishName: "Молоко 3,5%",
      confidence: 0.8,
      macros: { kcal: 64, protein_g: 3.4, fat_g: 3.5, carbs_g: 4.8 },
      questions: [],
      ingredients: [{ name: "молоко 950 мл", notes: null }],
    });
    const guessed = JSON.stringify({
      dishName: "Йогурт",
      confidence: 0.8,
      macros: { kcal: 100, protein_g: 4, fat_g: 3, carbs_g: 12 },
      questions: [],
    });
    expect(judge?.(read)).toBe(true);
    expect(judge?.(guessed)).toBe("не прочитано: обʼєм 950, молоко");
  });

  it("фільтр модальностей fail-close: без каталогу openrouter-кандидати відсіюються", () => {
    // У тесті каталог не завантажений (мережі немає за задумом), тож усі
    // openrouter-моделі невідомі. Це навмисно: краще прибрати рядок, ніж
    // показати провал невідомого походження.
    const { kept, dropped } = filterByModality(
      byKey("analyze-photo").candidates,
      { enforce: true },
    );
    expect(kept.every((c) => c.provider === "anthropic")).toBe(true);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((d) => d.reason.length > 0)).toBe(true);

    // `enforce: false` (--dry-run) лишає всіх — інакше сухий прогін давав би
    // порожню таблицю і виглядав би як зламаний стенд.
    expect(
      filterByModality(byKey("analyze-photo").candidates, { enforce: false })
        .kept.length,
    ).toBe(byKey("analyze-photo").candidates.length);
  });
});
