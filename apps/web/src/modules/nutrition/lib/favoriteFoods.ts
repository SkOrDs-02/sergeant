/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Позначені продукти для блоку «Улюблені» (OD-27 Х-3 б, рішення власника
 * 2026-11-19). Улюблені зберігаються лише як id (`favoriteFoodIds` у prefs),
 * тож для показу продукт шукається в локальній базі. Базовий продукт
 * (`gen_<slug>`), якого в базі під цим id немає (пристрій засіяно до
 * детермінованих id, або позначено серверний хіт), береться з корпусу:
 * це той самий лінивий чанк, що засіває базу для пошуку. Зовнішній хіт
 * (OFF, каталог), якого немає локально, показати нічим: він лишається
 * першим у видачі пошуку, але не в блоці.
 */
import {
  getFoodById,
  makeFoodProduct,
  type FoodProduct,
} from "./foodDb/foodDb";

async function fromCorpus(id: string): Promise<FoodProduct | null> {
  if (!id.startsWith("gen_")) return null;
  const { SEED_FOODS_UK } = await import("./foodDb/seedFoodsUk");
  const seed = SEED_FOODS_UK.find((s) => s.slug === id.slice(4));
  return seed
    ? makeFoodProduct({
        id,
        name: seed.name,
        per100: seed.per100,
        origin: "seed",
      })
    : null;
}

/** Продукти в порядку позначення (новіші першими); нерозвʼязні пропущено. */
export async function resolveFavoriteFoods(
  ids: Iterable<string>,
): Promise<FoodProduct[]> {
  const out: FoodProduct[] = [];
  for (const id of ids) {
    const food = (await getFoodById(id)) ?? (await fromCorpus(id));
    if (food) out.push(food);
  }
  return out;
}
