import { useCallback, useEffect, useState } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { useNavigate, useSearchParams } from "react-router-dom";
import { recordModuleOpen } from "../lib/recentModules";

const VALID_MODULES = new Set(["finyk", "fizruk", "routine", "nutrition"]);

export type HubModuleId = ModuleAccent;

export interface OpenModuleOptions {
  hash?: string | null;
}

export interface HubNavigation {
  activeModule: HubModuleId | null;
  openModule: (id: string | null | undefined, opts?: OpenModuleOptions) => void;
  goToHub: () => void;
  moduleAnimClass: "module-enter" | "hub-enter";
}

function parseModule(value: string | null): HubModuleId | null {
  if (value && VALID_MODULES.has(value)) return value as HubModuleId;
  return null;
}

export function useHubNavigation(): HubNavigation {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialModule = parseModule(searchParams.get("module"));

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

  const openModule = useCallback(
    (id: string | null | undefined, opts: OpenModuleOptions = {}) => {
      const nextId = String(id ?? "").trim();
      if (!VALID_MODULES.has(nextId)) return;
      const typedId = nextId as HubModuleId;
      const isSame = typedId === activeModule;

      let hashStr = "";
      try {
        const raw = opts.hash != null ? String(opts.hash).trim() : "";
        if (raw) {
          hashStr = raw.startsWith("#") ? raw : `#${raw}`;
          window.location.hash = hashStr;
        } else if (!isSame) {
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
      navigate(`/?module=${typedId}${hashStr}`, { replace: false });
    },
    [activeModule, navigate],
  );

  useEffect(() => {
    const mod = parseModule(searchParams.get("module"));
    if (mod !== activeModule) {
      setModuleAnimClass(mod ? "module-enter" : "hub-enter");
      setActiveModule(mod);
    }
    // `activeModule` is read but also set — adding it would loop.
    // Setters (`setActiveModule`, `setModuleAnimClass`) are stable.
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  return { activeModule, openModule, goToHub, moduleAnimClass };
}
