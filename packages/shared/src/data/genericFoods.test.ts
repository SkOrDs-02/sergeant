import { describe, expect, it } from "vitest";
import { GENERIC_FOODS, type GenericFood } from "./genericFoods";
import {
  buildProductSearchKey,
  normalizeProductText,
} from "../utils/productSearchKey";

/**
 * Ворота якості для КУРОВАНОГО корпусу.
 *
 * На відміну від `product_catalog`, де ті самі перевірки страхують від
 * битого зовнішнього джерела, тут вони страхують від друкарської помилки
 * людини. Помилка в одній цифрі не падає й не логується — вона просто
 * тихо кладе хибне число в чийсь денний план. Тест — єдине місце, де це
 * ловиться до релізу.
 */

/** Сума за Атвотером: 4/9/4 ккал на грам + 7 на грам спирту. */
function atwaterKcal(f: GenericFood): number {
  return (
    4 * f.per100.protein_g +
    9 * f.per100.fat_g +
    4 * f.per100.carbs_g +
    7 * (f.alcohol_g ?? 0)
  );
}

describe("GENERIC_FOODS — цілісність корпусу", () => {
  it("не порожній", () => {
    expect(GENERIC_FOODS.length).toBeGreaterThan(300);
  });

  it("slug унікальний", () => {
    // Дубль slug зламав би PRIMARY KEY при посіві — краще тут, ніж на
    // проді посеред міграції.
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const f of GENERIC_FOODS) {
      const prev = seen.get(f.slug);
      if (prev) dupes.push(`${f.slug}: «${prev}» і «${f.name}»`);
      seen.set(f.slug, f.name);
    }
    expect(dupes).toEqual([]);
  });

  it("slug відповідає CHECK-у в БД", () => {
    // generic_foods_slug_check: ^[a-z0-9][a-z0-9-]{1,63}$
    const bad = GENERIC_FOODS.filter(
      (f) => !/^[a-z0-9][a-z0-9-]{1,63}$/.test(f.slug),
    ).map((f) => `${f.slug} (${f.name})`);
    expect(bad).toEqual([]);
  });

  it("назви унікальні", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const f of GENERIC_FOODS) {
      const key = normalizeProductText(f.name);
      if (seen.has(key)) dupes.push(f.name);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it("назви українською, не латиницею", () => {
    // Варіант із машинним перекладом USDA свідомо відкинуто: «Cucumber,
    // raw» у списку їжі — це те, що людина бачить щодня.
    //
    // Виняток лише для усталених міжнародних абревіатур, які українською
    // не пишуться взагалі. Список явний, а не регекс «дозволити латиницю»:
    // інакше перша ж машинно-перекладена позиція проїхала б непоміченою.
    const LATIN_BY_DESIGN = new Set(["BCAA"]);

    const latinOnly = GENERIC_FOODS.filter(
      (f) =>
        !/[а-щьюяїієґА-ЩЬЮЯЇІЄҐ]/.test(f.name) && !LATIN_BY_DESIGN.has(f.name),
    ).map((f) => f.name);
    expect(latinOnly).toEqual([]);
  });
});

describe("GENERIC_FOODS — ворота Атвотера", () => {
  it("калорійність сходиться з макросами в КОЖНІЙ позиції", () => {
    const bad = GENERIC_FOODS.filter((f) => {
      const at = atwaterKcal(f);
      return Math.abs(f.per100.kcal - at) > Math.max(30, at * 0.25);
    }).map(
      (f) =>
        `${f.name}: заявлено ${f.per100.kcal} ккал, за макросами ${atwaterKcal(f).toFixed(0)}`,
    );
    expect(bad).toEqual([]);
  });

  it("алкогольні позиції несуть alcohol_g", () => {
    // Саме на цьому корпусі знайшлась потреба у четвертому доданку:
    // без спирту всі шість напоїв виглядали «битими» (вино сухе — 82
    // ккал заявлених проти 11 за трьома макросами).
    // Матч по ПЕРШОМУ слову: інакше «Виноград» ловиться на підрядок
    // «вино», а «Свинина» — на «вин». Обидві пастки спрацювали на
    // першому прогоні цього тесту.
    //
    // Межа слова задана явно як `(\s|$)`, а НЕ через `\b`: у JavaScript
    // `\b` визначений лише на ASCII-символах слова, тож між кириличною
    // літерою і пробілом межі для нього не існує і `/^вино\b/` не
    // матчить «Вино сухе» взагалі. Це теж спрацювало тут на живому
    // прогоні — тест мовчки знаходив нуль позицій.
    const alcoholic = GENERIC_FOODS.filter((f) =>
      /^(пиво|вино|горілка|віскі|шампанське|коньяк|лікер|сидр)(\s|$)/i.test(
        f.name,
      ),
    );
    expect(alcoholic.length).toBeGreaterThan(0);
    const missing = alcoholic
      .filter((f) => f.alcohol_g == null)
      .map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it("значення в фізичних межах", () => {
    const bad: string[] = [];
    for (const f of GENERIC_FOODS) {
      const { kcal, protein_g, fat_g, carbs_g } = f.per100;
      if (kcal < 0 || kcal > 1000) bad.push(`${f.name}: ккал ${kcal}`);
      for (const [label, v] of [
        ["білки", protein_g],
        ["жири", fat_g],
        ["вуглеводи", carbs_g],
        ["спирт", f.alcohol_g ?? 0],
      ] as const) {
        if (v < 0 || v > 100) bad.push(`${f.name}: ${label} ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("GENERIC_FOODS — пошукові ключі", () => {
  it("кожна назва дає непорожній нормалізований ключ", () => {
    // Порожній ключ = позиція, яку неможливо знайти текстом; у БД такий
    // рядок відхилив би generic_foods_name_norm_check.
    const empty = GENERIC_FOODS.filter(
      (f) => buildProductSearchKey(f.name).length === 0,
    ).map((f) => f.slug);
    expect(empty).toEqual([]);
  });

  it("синоніми нормалізуються без втрат", () => {
    const broken: string[] = [];
    for (const f of GENERIC_FOODS) {
      for (const a of f.aliases ?? []) {
        if (normalizeProductText(a).length === 0)
          broken.push(`${f.slug}: «${a}»`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("синонім не збігається з власною назвою", () => {
    // Такий синонім нічого не додає до пошуку, лише роздуває індекс.
    const redundant: string[] = [];
    for (const f of GENERIC_FOODS) {
      const own = normalizeProductText(f.name);
      for (const a of f.aliases ?? []) {
        if (normalizeProductText(a) === own)
          redundant.push(`${f.slug}: «${a}»`);
      }
    }
    expect(redundant).toEqual([]);
  });

  it("найчастіші народні запити знаходять канонічну позицію", () => {
    // Регресія на суть синонімів: людина шукає не так, як записано в
    // каноні. Якщо ці зникнуть, пошук «помідор» поверне порожньо.
    const cases: Array<[string, string]> = [
      ["помідор", "tomat"],
      ["печериці", "hryby-shampinony"],
      ["творог", "syr-kyslomolochnyi-5"],
      ["сьомга", "losos"],
      ["болгарський перець", "perets-solodkyi"],
    ];
    for (const [queryText, slug] of cases) {
      const food = GENERIC_FOODS.find((f) => f.slug === slug);
      expect(food, `нема позиції ${slug}`).toBeDefined();
      const aliases = (food?.aliases ?? []).map(normalizeProductText);
      expect(aliases, `${slug} втратив синонім «${queryText}»`).toContain(
        normalizeProductText(queryText),
      );
    }
  });
});
