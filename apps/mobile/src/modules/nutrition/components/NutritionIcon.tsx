/**
 * Last validated: 2026-08-21
 * Status: Active
 *
 * Мобільний рендерер гліфів Харчування — типи прийомів їжі та категорії
 * комори. Пара до вебового `<Icon name={…}>`.
 *
 * Імена гліфів приходять із `@sergeant/nutrition-domain`
 * (`MEAL_TYPES[].iconName`, `FOOD_CATEGORIES[].iconName`); тут лише мапа
 * на компоненти `lucide-react-native`.
 *
 * AI-CONTEXT (2026-08-21): до цієї дати домен ніс емодзі
 * (`"🌅"`, `"🥕"`, …), і обидві платформи малювали їх текстом. Гліф
 * залежав від системного emoji-шрифту, не брав колір і не мав теми.
 * Той самий крок Рутина зробила 2026-08-03 (`HabitGlyph.tsx`), Фінік —
 * цим же PR (`CategoryIcon.tsx`).
 *
 * AI-NOTE: доменні `iconName` типізовані як `string`, тож компілятор не
 * ловить пропуск. Покриття мапи звіряє `NutritionIcon.test.tsx`.
 */
import {
  Apple,
  Carrot,
  Coffee,
  Droplet,
  Egg,
  Fish,
  Moon,
  Package,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from "lucide-react-native";

export const NUTRITION_GLYPH_ICONS: Record<string, LucideIcon> = {
  apple: Apple,
  carrot: Carrot,
  coffee: Coffee,
  droplet: Droplet,
  egg: Egg,
  fish: Fish,
  moon: Moon,
  package: Package,
  utensils: UtensilsCrossed,
  wheat: Wheat,
};

export interface NutritionIconProps {
  name: string;
  size?: number;
  color?: string;
}

/**
 * Невідоме імʼя падає в `Package` — нейтральний «щось у коморі». Порожній
 * слот був би гіршим: рядок поїхав би, а причина лишилась невидимою.
 */
export function NutritionIcon({
  name,
  size = 16,
  color = "#7A7A7A",
}: NutritionIconProps) {
  const Glyph = NUTRITION_GLYPH_ICONS[name] ?? Package;
  return <Glyph size={size} color={color} />;
}
