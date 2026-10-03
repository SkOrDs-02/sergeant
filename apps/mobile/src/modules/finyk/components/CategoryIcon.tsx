/**
 * Last validated: 2026-08-21
 * Status: Active
 *
 * Мобільний рендерер іконки категорії Фініка — пара до
 * `apps/web/src/modules/finyk/components/CategoryIconChip.tsx`.
 *
 * Канонічний набір slug-ів і резолвер `categoryId → slug` живуть у
 * `@sergeant/finyk-domain/lib/categoryIcons`, спільні для обох платформ.
 * Тут лише мапа slug → компонент `lucide-react-native`.
 *
 * AI-CONTEXT (2026-08-21): до цієї дати рядок транзакції діставав
 * «іконку» з підпису категорії — `cat.label.split(" ")[0]`, тобто
 * емодзі-префікс, який резолвер клеїв перед назвою. Гліф малювався
 * системним емодзі-шрифтом (різний вигляд на iOS / Android), не брав
 * `currentColor` і ламався, щойно підпис лишався без префікса. Той самий
 * крок Рутина зробила 2026-08-03 (`HabitGlyph.tsx`).
 *
 * AI-NOTE: `CATEGORY_LUCIDE_ICONS` мусить покривати ВЕСЬ
 * `CATEGORY_ICON_SLUGS` — `Record<CategoryIconName, …>` змушує
 * компілятор це перевірити, тож новий доменний slug не доїде до рантайму
 * без іконки.
 */
import {
  Bell,
  Book,
  Briefcase,
  Coffee,
  Compass,
  CreditCard,
  Droplet,
  Dumbbell,
  HandCoins,
  Heart,
  House,
  Monitor,
  Package,
  Play,
  RefreshCw,
  Repeat,
  ShoppingCart,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react-native";
import {
  categoryIconName,
  type CategoryIconName,
} from "@sergeant/finyk-domain/lib/categoryIcons";

export const CATEGORY_LUCIDE_ICONS: Record<CategoryIconName, LucideIcon> = {
  bell: Bell,
  book: Book,
  briefcase: Briefcase,
  coffee: Coffee,
  compass: Compass,
  "credit-card": CreditCard,
  droplet: Droplet,
  dumbbell: Dumbbell,
  "hand-coins": HandCoins,
  heart: Heart,
  home: House,
  monitor: Monitor,
  package: Package,
  play: Play,
  "refresh-cw": RefreshCw,
  repeat: Repeat,
  "shopping-cart": ShoppingCart,
  sparkles: Sparkles,
  tag: Tag,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  truck: Truck,
};

export interface CategoryIconProps {
  categoryId: string | null | undefined;
  size?: number;
  color?: string;
}

/**
 * Іконка категорії. Невідомий чи кастомний id падає в `tag` — малювати
 * завжди є що, тож повертатись до емодзі немає підстав.
 */
export function CategoryIcon({
  categoryId,
  size = 20,
  color = "#7A7A7A",
}: CategoryIconProps) {
  const Glyph = CATEGORY_LUCIDE_ICONS[categoryIconName(categoryId)];
  return <Glyph size={size} color={color} />;
}
