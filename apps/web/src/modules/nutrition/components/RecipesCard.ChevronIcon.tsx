/**
 * Last validated: 2026-06-02
 * Status: Active
 *
 * Tiny chevron atom used in RecipesCard expand/collapse buttons.
 * Extracted in page-audit-08 F7 split.
 */
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <Icon
      name="chevron-right"
      size={16}
      strokeWidth={2.5}
      className={cn(
        "shrink-0 text-subtle transition-transform duration-200",
        open && "rotate-90",
      )}
    />
  );
}
