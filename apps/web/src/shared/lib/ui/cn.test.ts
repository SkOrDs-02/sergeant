import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("returns a single class unchanged", () => {
    expect(cn("text-subtle")).toBe("text-subtle");
  });

  it("joins multiple classes", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center");
  });

  it("deduplicates conflicting Tailwind utilities (last wins)", () => {
    // tailwind-merge: p-4 wins over p-2
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("preserves text-style-* alongside text color (custom group)", () => {
    // Without the custom group config, twMerge would drop text-style-caption
    expect(cn("text-style-caption", "text-subtle")).toBe(
      "text-style-caption text-subtle",
    );
  });

  it("handles falsy values gracefully", () => {
    expect(cn("flex", false, undefined, null, "gap-2")).toBe("flex gap-2");
  });

  it("handles conditional objects", () => {
    const isActive = true;
    expect(cn("base", { "bg-primary": isActive, "bg-muted": !isActive })).toBe(
      "base bg-primary",
    );
  });

  it("handles arrays", () => {
    expect(cn(["flex", "items-center"], "gap-4")).toBe(
      "flex items-center gap-4",
    );
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("handles all text-style variants without stripping", () => {
    const variants = [
      "display",
      "headline",
      "title",
      "body",
      "caption",
      "label",
    ] as const;
    for (const v of variants) {
      const result = cn(`text-style-${v}`, "text-primary");
      expect(result).toContain(`text-style-${v}`);
      expect(result).toContain("text-primary");
    }
  });
});
