import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `text-style-*` are custom semantic typography utilities registered as a
// Tailwind plugin component (packages/design-tokens/tailwind-preset.js).
// Default twMerge treats them as part of the `text-*` (font-size/color)
// group, so a later `text-subtle` color would silently strip
// `text-style-caption`. Teach the merger they're a separate group so
// `cn("text-style-caption", "text-subtle")` keeps both classes.
const twMerge = extendTailwindMerge<"text-style">({
  extend: {
    classGroups: {
      "text-style": [
        {
          "text-style": [
            "display",
            "display-hero",
            "headline",
            "hero",
            "title-lg",
            "title",
            "subtitle",
            "body-lg",
            "body",
            "body-sm",
            "label",
            "caption",
            "overline",
            "code",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
