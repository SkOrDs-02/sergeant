import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Showcase-local UI state. We deliberately keep this isolated from the
 * app-wide theme (`useDarkMode`) so toggles in the styleguide do not
 * spill into other surfaces (Hub, modules) once the user navigates
 * back. Only the `theme` toggle mirrors to `document.documentElement`
 * because the dark-mode tokens are declared on the `.dark` selector
 * (`apps/web/src/styles/theme.css`).
 */
export type ShowcaseTheme = "light" | "dark" | "hc";
export type ShowcaseDensity = "comfortable" | "compact";
export type ShowcaseDirection = "ltr" | "rtl";
export type ShowcaseReducedMotion = "auto" | "force";

export interface ShowcaseSettings {
  theme: ShowcaseTheme;
  density: ShowcaseDensity;
  direction: ShowcaseDirection;
  reducedMotion: ShowcaseReducedMotion;
}

export interface ShowcaseSettingsApi extends ShowcaseSettings {
  setTheme: (next: ShowcaseTheme) => void;
  setDensity: (next: ShowcaseDensity) => void;
  setDirection: (next: ShowcaseDirection) => void;
  setReducedMotion: (next: ShowcaseReducedMotion) => void;
}

const ShowcaseSettingsContext = createContext<ShowcaseSettingsApi | null>(null);

/**
 * Reads the live app theme on first render so toggling away and back
 * does not flash; subsequent updates are driven by the toggle row in
 * the showcase header.
 */
function readInitialTheme(): ShowcaseTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ShowcaseSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ShowcaseTheme>(readInitialTheme);
  const [density, setDensity] = useState<ShowcaseDensity>("comfortable");
  const [direction, setDirection] = useState<ShowcaseDirection>("ltr");
  const [reducedMotion, setReducedMotion] =
    useState<ShowcaseReducedMotion>("auto");

  const setTheme = useCallback((next: ShowcaseTheme) => {
    setThemeState(next);
    if (typeof document === "undefined") return;
    // `dark` and `hc` both turn on the .dark token cascade so contrast
    // stays correct; `hc` additionally bumps token saturation via the
    // showcase root attribute (Theming section demos the matrix).
    const root = document.documentElement;
    if (next === "light") root.classList.remove("dark");
    else root.classList.add("dark");
  }, []);

  const value = useMemo(
    () => ({
      theme,
      density,
      direction,
      reducedMotion,
      setTheme,
      setDensity,
      setDirection,
      setReducedMotion,
    }),
    [theme, density, direction, reducedMotion, setTheme],
  );

  return (
    <ShowcaseSettingsContext.Provider value={value}>
      {children}
    </ShowcaseSettingsContext.Provider>
  );
}

export function useShowcaseSettings(): ShowcaseSettingsApi {
  const ctx = useContext(ShowcaseSettingsContext);
  if (!ctx) {
    throw new Error(
      "useShowcaseSettings must be used inside <ShowcaseSettingsProvider />",
    );
  }
  return ctx;
}
