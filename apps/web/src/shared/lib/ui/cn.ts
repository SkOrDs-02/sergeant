import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `text-style-*` are custom semantic typography utilities registered as a
// Tailwind plugin component (packages/design-tokens/tailwind-preset.js).
// Default twMerge treats them as part of the `text-*` (font-size/color)
// group, so a later color/size `text-*` class silently strips them —
// e.g. `text-style-label-lg` (Button size="lg"/"xl") would drop the
// variant's `text-white`, leaving near-black ink on a dark primary CTA.
// Teach the merger they're a separate group so both classes survive.
//
// This list MUST mirror the `.text-style-*` component utilities emitted by
// the preset exactly — a missing entry silently reintroduces the strip bug.
// Verify with: grep -oE '\.text-style-[a-z0-9-]+' packages/design-tokens/tailwind-preset.js | sort -u
const twMerge = extendTailwindMerge<"text-style">({
  extend: {
    classGroups: {
      "text-style": [
        {
          "text-style": [
            "display",
            "headline",
            "hero",
            "title",
            "label",
            "label-lg",
            "body",
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
