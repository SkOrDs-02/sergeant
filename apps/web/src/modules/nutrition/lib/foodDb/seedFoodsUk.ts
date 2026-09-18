/**
 * Last validated: 2026-08-23
 * Status: Active
 *
 * Клієнтський посів базової їжі — ПОХІДНЕ від спільного корпусу.
 *
 * Доти тут лежали 19 власних файлів із 390 позиціями, а серверний
 * `generic_foods` мав ті самі дані окремо. Дві копії розійшлись би першою
 * ж правкою, і той самий продукт мав би різні числа онлайн і офлайн —
 * розбіжність, яку користувач побачив би як «застосунок бреше», причому
 * без жодного падіння чи логу.
 *
 * Тепер джерело правди одне: `@sergeant/shared/data/genericFoods`. Тут
 * лишається тільки адаптер до локальної форми `SeedFood`.
 *
 * AI-DANGER: імпорт саме ПІДПАТОЧНИЙ, не з барелю `@sergeant/shared`.
 * Барель тягнеться в десятках місць на критичному шляху, і корпус із
 * нього поїхав би в eager-чанк повз гейт ≤ 280 kB. Модуль лишається
 * lazy: `foodDb.ts` вантажить його через `await import()`.
 */
import { GENERIC_FOODS } from "@sergeant/shared/data/genericFoods";
import type { Macros } from "../macros";

export interface SeedFood {
  name: string;
  per100: Macros;
}

/**
 * Локальна форма: клієнтській базі потрібні лише назва й макроси.
 * `slug`, `category`, `aliases` і `alcohol_g` — серверні поля; на клієнті
 * пошук іде по `norm`, який `foodDb` рахує сам тим самим
 * `buildProductSearchKey`, що й сервер.
 */
export const SEED_FOODS_UK: SeedFood[] = GENERIC_FOODS.map((food) => ({
  name: food.name,
  per100: {
    kcal: food.per100.kcal,
    protein_g: food.per100.protein_g,
    fat_g: food.per100.fat_g,
    carbs_g: food.per100.carbs_g,
  },
}));
