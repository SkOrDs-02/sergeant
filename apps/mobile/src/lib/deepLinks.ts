/**
 * Pure `sergeant://` + HTTPS-Universal-Link deep-link parser + builder.
 *
 * Source of truth for the URL schemes this module supports is
 * `docs/mobile/overview.md` (section "Deep links"). Keep that table and the
 * `SergeantDeepLink` discriminated union below in lock-step.
 *
 * Intentionally dep-free — runs in any JS environment (node tests,
 * Hermes, web). Runtime wiring into `expo-router` lives in
 * `useDeepLinks.ts`; this file exports only pure helpers so the
 * scheme-matching rules are unit-testable without mocking
 * `expo-linking` / `expo-router`.
 */
import type { Href } from "expo-router";

export const SERGEANT_SCHEME = "sergeant://";

/**
 * Allow-list of hosts that may open the RN app via iOS Universal
 * Links / Android verified App Links. The same list lives in:
 *
 *   - `apps/mobile/app.config.ts` (`UNIVERSAL_LINK_HOSTS`)
 *   - `apps/mobile-shell/src/index.ts` (`DEEP_LINK_HTTPS_HOSTS`)
 *   - `apps/web/public/.well-known/apple-app-site-association`
 *   - `apps/web/public/.well-known/assetlinks.json`
 *
 * Strict equality match (case-insensitive) on the URL `host` —
 * **no suffix wildcard** so `sergeant.vercel.app.evil.com` never
 * passes for `sergeant.vercel.app`. Mirrors the hardening in
 * `apps/mobile-shell` (M19 — `docs/security/hardening/`).
 */
export const UNIVERSAL_LINK_HOSTS: readonly string[] = Object.freeze([
  "sergeant.vercel.app",
  "sergeant.2dmanager.com.ua",
]);

/**
 * Structured representation of every deep link the mobile client
 * currently accepts. Adding a new scheme = extending this union +
 * adding a case in `parseSergeantUrl` / `buildSergeantUrl` /
 * `hrefForDeepLink`.
 */
export type SergeantDeepLink =
  | { type: "hub" }
  | { type: "hub-chat" }
  | { type: "workout-new" }
  | { type: "workout"; id: string }
  | { type: "food-log" }
  | { type: "food-scan" }
  | { type: "food-pantry" }
  | { type: "food-recipe"; id: string }
  | { type: "finance" }
  | { type: "finance-tx"; id: string }
  | { type: "routine" }
  | { type: "routine-habit"; id: string }
  | { type: "settings" }
  | { type: "auth-callback"; token: string; params?: Record<string, string> };

/**
 * Parse a raw URL string into a `SergeantDeepLink`. Returns `null`
 * for anything the client does not know how to route.
 *
 * Accepted shapes:
 *   - **Custom scheme** — `sergeant://<path>?<query>#<frag>`. The
 *     scheme must be exactly lower-case `sergeant://`; `SERGEANT://`,
 *     `sergeant:/…`, etc. all return `null`.
 *   - **HTTPS Universal / App Link** — `https://<host>/<path>` where
 *     `<host>` is an exact case-insensitive match against
 *     `UNIVERSAL_LINK_HOSTS`. `http://`, `exp://`, and hosts outside
 *     the allow-list return `null`.
 *
 * Common contract (both shapes share the path/query semantics):
 *   - Leading / trailing slashes on the path are ignored, so
 *     `sergeant://routine`, `sergeant://routine/`, and
 *     `https://sergeant.vercel.app/routine/` all parse identically.
 *   - Dynamic segments (`{id}`) preserve whatever string the caller
 *     passed, including zero-padded IDs (`workout/007`) and
 *     percent-encoded UUIDs — callers are responsible for decoding
 *     / validating before using it in native query params.
 *   - `auth/callback` additionally requires a non-empty `token`
 *     query param; missing / empty token → `null`.
 *   - Unknown segment combinations (`sergeant://foo`, extra segments
 *     after a terminal route like `workout/123/extra`) → `null`,
 *     so the caller can fall back to the hub.
 */
export function parseSergeantUrl(
  raw: string | null | undefined,
): SergeantDeepLink | null {
  if (!raw || typeof raw !== "string") return null;

  const parsed = extractPathAndQuery(raw);
  if (!parsed) return null;
  const { pathPart, queryPart } = parsed;

  const tokens = pathPart
    .split("/")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return { type: "hub" };
  }

  const [a, b, c, ...rest4] = tokens;

  switch (a) {
    case "hub-chat": {
      if (b === undefined && c === undefined && rest4.length === 0) {
        return { type: "hub-chat" };
      }
      return null;
    }
    case "workout": {
      if (rest4.length > 0) return null;
      if (b === "new" && c === undefined) return { type: "workout-new" };
      if (b && c === undefined && b !== "new")
        return { type: "workout", id: b };
      return null;
    }
    case "food": {
      if (b === "log" && c === undefined && rest4.length === 0)
        return { type: "food-log" };
      if (b === "scan" && c === undefined && rest4.length === 0)
        return { type: "food-scan" };
      if (b === "pantry" && c === undefined && rest4.length === 0)
        return { type: "food-pantry" };
      if (b === "recipe" && c && rest4.length === 0)
        return { type: "food-recipe", id: c };
      return null;
    }
    case "finance": {
      if (b === undefined) return { type: "finance" };
      if (b === "tx" && c && rest4.length === 0)
        return { type: "finance-tx", id: c };
      return null;
    }
    case "routine": {
      if (b === undefined) return { type: "routine" };
      if (b === "habit" && c && rest4.length === 0)
        return { type: "routine-habit", id: c };
      return null;
    }
    case "settings": {
      if (b === undefined && c === undefined) return { type: "settings" };
      return null;
    }
    case "auth": {
      if (b === "callback" && c === undefined && rest4.length === 0) {
        const params = parseQuery(queryPart);
        const token = params.token;
        if (!token) return null;
        return { type: "auth-callback", token, params };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Inverse of `parseSergeantUrl`. Always returns a canonical URL
 * (lower-case scheme, no duplicate slashes) so round-tripping
 * `buildSergeantUrl(parseSergeantUrl(u))` yields a normalised form.
 */
export function buildSergeantUrl(link: SergeantDeepLink): string {
  switch (link.type) {
    case "hub":
      return "sergeant://";
    case "hub-chat":
      return "sergeant://hub-chat";
    case "workout-new":
      return "sergeant://workout/new";
    case "workout":
      return `sergeant://workout/${encodeURIComponent(link.id)}`;
    case "food-log":
      return "sergeant://food/log";
    case "food-scan":
      return "sergeant://food/scan";
    case "food-pantry":
      return "sergeant://food/pantry";
    case "food-recipe":
      return `sergeant://food/recipe/${encodeURIComponent(link.id)}`;
    case "finance":
      return "sergeant://finance";
    case "finance-tx":
      return `sergeant://finance/tx/${encodeURIComponent(link.id)}`;
    case "routine":
      return "sergeant://routine";
    case "routine-habit":
      return `sergeant://routine/habit/${encodeURIComponent(link.id)}`;
    case "settings":
      return "sergeant://settings";
    case "auth-callback": {
      const params = { ...(link.params ?? {}), token: link.token };
      const qs = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      return `sergeant://auth/callback?${qs}`;
    }
  }
}

/**
 * Map a parsed deep link onto the Expo Router `Href` it resolves to.
 *
 * Kept separate from `parseSergeantUrl` so unit tests do not need
 * to know the file-based route tree (which may evolve as modules
 * are fleshed out). When a target route has not landed yet we
 * still return a typed `Href` to a stub screen — see
 * `app/(tabs)/fizruk/workout/[id].tsx` etc.
 *
 * Non-routable entries (currently only `auth-callback`, which the
 * caller consumes imperatively via `@better-auth/expo/client`)
 * return `null` so the hook does not push a spurious screen.
 */
export function hrefForDeepLink(link: SergeantDeepLink): Href | null {
  switch (link.type) {
    case "hub":
      return "/(tabs)";
    case "hub-chat":
      return "/hub-chat";
    case "workout-new":
      return "/(tabs)/fizruk/workout/new";
    case "workout":
      return {
        pathname: "/(tabs)/fizruk/workout/[id]",
        params: { id: link.id },
      };
    case "food-log":
      return "/(tabs)/nutrition";
    case "food-scan":
      return "/(tabs)/nutrition/scan";
    case "food-pantry":
      return "/(tabs)/nutrition/pantry";
    case "food-recipe":
      return {
        pathname: "/(tabs)/nutrition/recipe/[id]",
        params: { id: link.id },
      };
    case "finance":
      return "/(tabs)/finyk";
    case "finance-tx":
      return {
        pathname: "/(tabs)/finyk/tx/[id]",
        params: { id: link.id },
      };
    case "routine":
      return "/(tabs)/routine";
    case "routine-habit":
      return {
        pathname: "/(tabs)/routine/habit/[id]",
        params: { id: link.id },
      };
    case "settings":
      return "/settings";
    case "auth-callback":
      // Consumed imperatively by the Better Auth Expo client; no
      // visible route push is required.
      return null;
  }
}

/**
 * Alias map applied to HTTPS Universal Links so a user who taps the
 * **web** URL (`https://sergeant.vercel.app/finyk/tx/42`) lands on
 * the same RN screen as a user who launches the **custom-scheme**
 * URL (`sergeant://finance/tx/42`).
 *
 * Custom-scheme uses the cross-platform _domain_ names (`finance`,
 * `food`); the web (`apps/web`) uses the user-facing _module_ slugs
 * (`finyk`, `nutrition`, etc.). The aliases below convert the
 * web slug to the domain name so the rest of the parser sees the
 * canonical shape.
 *
 * `fizruk` has no top-level deep-link target — the RN side only
 * exposes specific `workout/{id}` and `workout/new` routes — so
 * `fizruk/workout/...` strips the `fizruk` prefix and leaves
 * `workout/...` for the regular parser. Bare `https://host/fizruk`
 * deliberately returns `null` and the caller falls back to the hub.
 */
const HTTPS_FIRST_SEGMENT_ALIASES: Readonly<Record<string, string>> = {
  finyk: "finance",
  nutrition: "food",
};

/**
 * Split `raw` into its `pathPart` (no leading slash, no query, no
 * fragment) and `queryPart` (no leading `?`). Returns `null` for
 * inputs that are neither a recognised custom-scheme URL nor an
 * allow-listed HTTPS Universal Link.
 *
 * For HTTPS URLs the first path segment is additionally rewritten
 * via `HTTPS_FIRST_SEGMENT_ALIASES` so web slugs (`/finyk`,
 * `/nutrition`) route to the same `SergeantDeepLink` variants as
 * the canonical custom-scheme paths (`sergeant://finance`,
 * `sergeant://food`).
 *
 * The HTTPS host match is strict (case-insensitive equality against
 * `UNIVERSAL_LINK_HOSTS`) and rejects `userinfo@host` shapes — the
 * latter mirrors the M19 hardening in `apps/mobile-shell` so a
 * carefully crafted `https://evil@sergeant.vercel.app/...` cannot
 * smuggle a deep link through the parser.
 */
function extractPathAndQuery(
  raw: string,
): { pathPart: string; queryPart: string } | null {
  if (raw.startsWith(SERGEANT_SCHEME)) {
    return splitPathAndQuery(raw.slice(SERGEANT_SCHEME.length));
  }

  if (raw.startsWith("https://")) {
    const afterScheme = raw.slice("https://".length);
    // Reject `userinfo@host` — both `:` (port) / `?` (query) /
    // `#` (fragment) / `/` (path) terminate the authority. If `@`
    // appears before any of those, the URL is using `userinfo` and
    // we treat it as untrusted.
    const authorityEnd = firstIndexOfAny(afterScheme, "/?#");
    const authority =
      authorityEnd < 0 ? afterScheme : afterScheme.slice(0, authorityEnd);
    if (authority.includes("@")) return null;

    // Strip an optional `:port`. We do not enforce a specific port;
    // production traffic is on `:443` (the default), but tests / a
    // future preview proxy might serve over a custom port.
    const colonIdx = authority.indexOf(":");
    const host = colonIdx >= 0 ? authority.slice(0, colonIdx) : authority;

    const hostLower = host.toLowerCase();
    const matches = UNIVERSAL_LINK_HOSTS.some(
      (allowed) => allowed.toLowerCase() === hostLower,
    );
    if (!matches) return null;

    const tail = authorityEnd < 0 ? "" : afterScheme.slice(authorityEnd);
    // `tail` starts with `/`, `?`, or `#`. Normalise so the shared
    // path/query splitter sees the same shape as the custom-scheme
    // branch.
    const normalised = tail.startsWith("/") ? tail.slice(1) : tail;
    const split = splitPathAndQuery(normalised);
    return {
      pathPart: rewriteHttpsFirstSegment(split.pathPart),
      queryPart: split.queryPart,
    };
  }

  return null;
}

function rewriteHttpsFirstSegment(pathPart: string): string {
  if (!pathPart) return pathPart;
  const slashIdx = pathPart.indexOf("/");
  const head = slashIdx >= 0 ? pathPart.slice(0, slashIdx) : pathPart;
  const tail = slashIdx >= 0 ? pathPart.slice(slashIdx) : "";
  // `fizruk` is special-cased — the RN side has no top-level
  // `fizruk` deep link, only `workout/...`. Strip the `fizruk`
  // prefix so `fizruk/workout/123` collapses to `workout/123`;
  // bare `fizruk` (no tail) is left as-is so the regular parser
  // returns `null` and the caller falls back to the hub.
  if (head === "fizruk" && tail.length > 0) {
    return tail.replace(/^\//, "");
  }
  const aliased = HTTPS_FIRST_SEGMENT_ALIASES[head];
  return aliased === undefined ? pathPart : aliased + tail;
}

function firstIndexOfAny(s: string, chars: string): number {
  let min = -1;
  for (const c of chars) {
    const i = s.indexOf(c);
    if (i >= 0 && (min < 0 || i < min)) min = i;
  }
  return min;
}

function splitPathAndQuery(rest: string): {
  pathPart: string;
  queryPart: string;
} {
  const hashIdx = rest.indexOf("#");
  const withoutHash = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
  const queryIdx = withoutHash.indexOf("?");
  const pathPart = queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash;
  const queryPart = queryIdx >= 0 ? withoutHash.slice(queryIdx + 1) : "";
  return { pathPart, queryPart };
}

function parseQuery(q: string): Record<string, string> {
  if (!q) return {};
  const out: Record<string, string> = {};
  for (const pair of q.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : "";
    if (!k) continue;
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}
