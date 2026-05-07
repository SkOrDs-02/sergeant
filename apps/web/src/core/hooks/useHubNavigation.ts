import { useCallback, useEffect, useState } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { capturePostHogEvent } from "../observability/posthog";
import { recordModuleOpen } from "../lib/recentModules";
import { PATH_BASED_MODULE_IDS } from "../app/appPaths";

const VALID_MODULES = new Set(["finyk", "fizruk", "routine", "nutrition"]);

/**
 * Subset of {@link VALID_MODULES} which has graduated from the legacy
 * `?module=<id>` URL contract to a top-level path-based one (initiative
 * 0006 §Phase 2). For these modules we (a) recognize `/<id>[/...]` as
 * `activeModule = id` and (b) emit clean `/<id>` URLs from
 * `openModule(id, { hash })` instead of `/?module=<id>#<hash>`.
 *
 * Single source of truth lives in `core/app/appPaths.ts` so the App
 * shell's standalone-route 404 fallback (`renderStandaloneRoute`) and
 * this hook agree on which URLs are owned by a module.
 */
const PATH_BASED_MODULES = PATH_BASED_MODULE_IDS;

export type HubModuleId = ModuleAccent;

export interface OpenModuleOptions {
  hash?: string | null;
}

export interface HubNavigation {
  activeModule: HubModuleId | null;
  openModule: (id: string | null | undefined, opts?: OpenModuleOptions) => void;
  goToHub: () => void;
  /** Navigate to hub and scroll to the given module's settings section. */
  goToModuleSettings: (moduleId: HubModuleId) => void;
  moduleAnimClass: "module-enter" | "hub-enter";
}

function parseModule(value: string | null): HubModuleId | null {
  if (value && VALID_MODULES.has(value)) return value as HubModuleId;
  return null;
}

/**
 * Path-based module detection. `/<id>` and `/<id>/...` count; `/<id>foo`
 * does not (would otherwise alias `/finykprofile` → finyk). Returns the
 * first segment when it matches a `PATH_BASED_MODULES` id, else `null`.
 *
 * Why this is in addition to `?module=<id>` and not a replacement: legacy
 * deep-links (PWA installs, share-cards, push notifications) still ship
 * with `?module=<id>` URLs, and we keep them functional through Phase 5
 * cleanup. New navigation emits the clean URL — see `openModule`.
 */
function parsePathnameModule(pathname: string): HubModuleId | null {
  if (typeof pathname !== "string" || pathname.length < 2) return null;
  if (!pathname.startsWith("/")) return null;
  const firstSegment = pathname.slice(1).split("/", 1)[0] ?? "";
  if (!firstSegment) return null;
  if (!PATH_BASED_MODULES.has(firstSegment as HubModuleId)) return null;
  return firstSegment as HubModuleId;
}

export function useHubNavigation(): HubNavigation {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Pathname wins over `?module=` — once a domain has migrated, the
  // path is the canonical contract and we don't want a stale
  // `?module=...` query param to override it.
  const initialModule =
    parsePathnameModule(location.pathname) ??
    parseModule(searchParams.get("module"));

  const [activeModule, setActiveModule] = useState<HubModuleId | null>(
    initialModule,
  );
  const [moduleAnimClass, setModuleAnimClass] = useState<
    "module-enter" | "hub-enter"
  >("module-enter");

  const goToHub = useCallback(() => {
    setModuleAnimClass("hub-enter");
    setActiveModule(null);
    navigate("/", { replace: false });
  }, [navigate]);

  const goToModuleSettings = useCallback(
    (moduleId: HubModuleId) => {
      capturePostHogEvent(ANALYTICS_EVENTS.MODULE_SETTINGS_OPENED, {
        module: moduleId,
      });
      setModuleAnimClass("hub-enter");
      setActiveModule(null);
      navigate(`/#settings-${moduleId}`, { replace: false });
    },
    [navigate],
  );

  const openModule = useCallback(
    (id: string | null | undefined, opts: OpenModuleOptions = {}) => {
      const nextId = String(id ?? "").trim();
      if (!VALID_MODULES.has(nextId)) return;
      const typedId = nextId as HubModuleId;
      const isSame = typedId === activeModule;

      const isPathBased = PATH_BASED_MODULES.has(typedId);
      let hashStr = "";
      let pathSuffix = "";
      try {
        const raw = opts.hash != null ? String(opts.hash).trim() : "";
        if (raw) {
          // For path-based modules, "log" means `/nutrition/log`; for
          // hash-based ones it stays `#log` until they migrate.
          // Strip leading `#` either way so callers can pass either form.
          const cleaned = raw.startsWith("#") ? raw.slice(1) : raw;
          if (isPathBased) {
            pathSuffix = cleaned ? `/${cleaned}` : "";
          } else {
            hashStr = `#${cleaned}`;
            window.location.hash = hashStr;
          }
        } else if (!isPathBased && !isSame) {
          // Legacy hash-router modules expect a clean hash on entry
          // when no specific page was requested.
          window.location.hash = "";
        }
      } catch {
        /* ignore */
      }

      setModuleAnimClass("module-enter");
      setActiveModule(typedId);
      // Best-effort tracker for `prefetchCriticalModules` priority —
      // see `core/lib/recentModules.ts`. Storage failures are swallowed
      // there; nothing here cares about the result.
      recordModuleOpen(typedId);
      const target = isPathBased
        ? `/${typedId}${pathSuffix}`
        : `/?module=${typedId}${hashStr}`;
      navigate(target, { replace: false });
    },
    [activeModule, navigate],
  );

  useEffect(() => {
    const mod =
      parsePathnameModule(location.pathname) ??
      parseModule(searchParams.get("module"));
    if (mod !== activeModule) {
      setModuleAnimClass(mod ? "module-enter" : "hub-enter");
      setActiveModule(mod);
    }
    // `activeModule` is read but also set — adding it would loop.
    // Setters (`setActiveModule`, `setModuleAnimClass`) are stable.
  }, [location.pathname, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    activeModule,
    openModule,
    goToHub,
    goToModuleSettings,
    moduleAnimClass,
  };
}
