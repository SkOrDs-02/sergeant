import { useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { NAV_SECTIONS } from "./nav";
import { MaturityBadge } from "./primitives";

/**
 * Sticky left rail with anchor links. Highlights the section currently
 * intersecting the viewport via IntersectionObserver — no router state
 * is mutated, just the URL hash, so deep links from the docs work.
 */
export function ShowcaseSidebar() {
  const [active, setActive] = useState<string>(NAV_SECTIONS[0]?.id ?? "");

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }
    const targets: HTMLElement[] = [];
    for (const s of NAV_SECTIONS) {
      const node = document.getElementById(s.id);
      if (node) targets.push(node);
    }
    if (targets.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        rootMargin: "-30% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const t of targets) obs.observe(t);
    return () => obs.disconnect();
  }, []);

  return (
    <aside
      className={cn(
        "hidden lg:block shrink-0",
        "sticky top-16 self-start",
        "w-56 max-h-[calc(100dvh-4.5rem)] overflow-y-auto",
        "pr-3",
      )}
      aria-label="Розділи дизайн-системи"
    >
      <nav className="space-y-0.5">
        {NAV_SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex items-center justify-between gap-2",
                "px-3 py-2 rounded-xl text-xs font-semibold",
                "transition-colors",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-text hover:bg-panelHi",
              )}
            >
              <span>{section.label}</span>
              <MaturityBadge level={section.maturity} />
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
