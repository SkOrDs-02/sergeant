/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Позначка «улюблене» на продукті й рецепті (OD-27 Х-3 б). Перемикач, а не
 * дія: стан читається з `aria-pressed`, серце заповнене, коли позначено.
 * 44px на coarse pointer дає сам `IconButton`.
 */
import { IconButton } from "@shared/components/ui/IconButton";
import { Icon } from "@shared/components/ui/Icon";
import { nutritionFavoritesMessages as COPY } from "@shared/i18n/uk.nutritionFavorites";

interface FavoriteToggleProps {
  name: string;
  favorite: boolean;
  onToggle: () => void;
}

export function FavoriteToggle({
  name,
  favorite,
  onToggle,
}: FavoriteToggleProps) {
  return (
    <IconButton
      variant="ghost"
      size="md"
      aria-pressed={favorite}
      aria-label={(favorite ? COPY.remove : COPY.add).replace("{name}", name)}
      onClick={onToggle}
      className={favorite ? "text-nutrition" : "text-muted"}
    >
      <Icon name="heart" size="md" fill={favorite ? "currentColor" : "none"} />
    </IconButton>
  );
}
