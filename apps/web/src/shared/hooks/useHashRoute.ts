import { useCallback, useEffect, useState } from "react";

/**
 * Hash-based router primitive shared across Sergeant modules.
 *
 * Every module (Фінік / Фізрук / Рутина / Харчування) historically rolled
 * its own `parseHash` + `setHash` + hashchange effect. They all shared the
 * same canonical shape (`#page` or `#page/seg1/seg2`) and the same legacy
 * tolerance (`#/page` → `#page`), so this hook captures it once.
 *
 * Given a whitelist of valid pages and a default, it returns the current
 * page + any extra `/`-separated segments, plus a `navigate` function that
 * writes the hash. Legacy `#/page` URLs are normalized on mount via
 * `history.replaceState`. `aliases` maps retired page ids to canonical
 * ones (Finyk's `payments` → `budgets`, Nutrition's legacy routes etc.).
 *
 * Navigation accepts either a bare page id (`navigate("dashboard")`) or
 * a full hash with segments (`navigate("exercise/abc123")`).
 */

export interface UseHashRouteOptions<TPage extends string> {
  defaultPage: TPage;
  validPages: readonly TPage[];
  /** Retired page ids that should resolve to a canonical page. */
  aliases?: Readonly<Record<string, TPage>>;
}

export interface HashRoute<TPage extends string> {
  page: TPage;
  /** Extra path segments after `#page/`. Empty for bare `#page`. */
  segments: readonly string[];
}

export interface UseHashRouteResult<
  TPage extends string,
> extends HashRoute<TPage> {
  navigate: (next: TPage | string) => void;
}

function parseRaw<TPage extends string>(
  raw: string,
  options: UseHashRouteOptions<TPage>,
): HashRoute<TPage> {
  const normalized = raw.replace(/^#\/?/, "").trim();
  if (!normalized) {
    return { page: options.defaultPage, segments: [] };
  }
  const [head, ...rest] = normalized.split("/").filter(Boolean);
  const aliased = options.aliases?.[head!];
  const candidate = (aliased ?? head) as TPage;
  if (!options.validPages.includes(candidate)) {
    return { page: options.defaultPage, segments: [] };
  }
  return { page: candidate, segments: rest };
}

function readHashFromLocation(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash || "";
}

export function useHashRoute<TPage extends string>(
  options: UseHashRouteOptions<TPage>,
): UseHashRouteResult<TPage> {
  const [route, setRoute] = useState<HashRoute<TPage>>(() =>
    parseRaw(readHashFromLocation(), options),
  );

  // Keep an effect-stable reference to options so callers can pass inline
  // objects without tearing down the hashchange listener on every render.
  // The listener reads the latest options via closure over this state slot.
  const [frozen] = useState(options);

  useEffect(() => {
    const onHash = () => setRoute(parseRaw(readHashFromLocation(), frozen));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [frozen]);

  // One-time normalization of legacy `#/page` or aliased hashes. We only
  // rewrite when the raw hash differs from the canonical one so clean
  // URLs without any fragment stay clean. Compare against the fragment
  // body (hash minus the leading `#`) rather than the stripped form so
  // the legacy `#/page` prefix is actually detected as different.
  useEffect(() => {
    const body = readHashFromLocation().replace(/^#/, "");
    if (!body) return;
    const parsed = parseRaw(readHashFromLocation(), frozen);
    const canonical =
      parsed.segments.length > 0
        ? `${parsed.page}/${parsed.segments.join("/")}`
        : parsed.page;
    if (body !== canonical) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${canonical}`,
      );
    }
    // Mount-only — subsequent changes go through navigate().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((next: string) => {
    const target = next.startsWith("#") ? next : `#${next}`;
    if (window.location.hash === target) return;
    window.location.hash = target;
  }, []);

  return { page: route.page, segments: route.segments, navigate };
}
