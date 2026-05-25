import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LOCALE,
  type Locale,
  parseLocale,
  getMessages,
  type MessageCatalog,
} from "./index";

/**
 * `useLocale` — single source of truth for UI language selection.
 *
 * Resolution priority (highest wins):
 *   1. `?lang=` query parameter on current URL — explicit override (e.g.
 *      Stripe redirect-back with locale, marketing-shared link).
 *   2. `localStorage["sergeant:locale"]` — user's last persisted choice.
 *   3. `DEFAULT_LOCALE` ("uk").
 *
 * The hook is **storage-write-on-URL-change**: коли user landed on
 * `?lang=en`, ми persist у localStorage щоб subsequent navigations без
 * query param лишались EN. Якщо user явно setLocale('uk') — записуємо
 * "uk" у localStorage І чистимо `?lang` із URL (history.replaceState).
 *
 * Чому НЕ react-router-dom `useSearchParams`: hook повинен бути доступним
 * з `<HubChatOverlay>`, `<PaywallModal>` тощо у contexts де router може
 * не бути присутнім (storybook, isolated tests). Native `URLSearchParams`
 * + `popstate` listener покриває use case без додаткової залежності.
 *
 * SSR safety: на сервері `window` undefined → повертаємо `DEFAULT_LOCALE`.
 * Sergeant — SPA-only зараз, але keeping SSR-safe не коштує нічого.
 */

const LOCALE_STORAGE_KEY = "sergeant:locale";

function readInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get("lang");
    if (urlLang) return parseLocale(urlLang);
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) return parseLocale(stored);
  } catch {
    // localStorage може кидати у Safari private-mode або quota errors;
    // SecurityError у sandboxed iframes. Fall through до default.
  }
  return DEFAULT_LOCALE;
}

export interface UseLocaleResult {
  /** Currently resolved locale ('uk' or 'en'). */
  locale: Locale;
  /** Fully-resolved message catalog for the current locale. */
  messages: MessageCatalog;
  /** Imperative setter — persists to localStorage + cleans up `?lang` URL param. */
  setLocale: (next: Locale) => void;
}

export function useLocale(): UseLocaleResult {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  // Listen for back/forward navigation that changes `?lang=` (e.g. user hits
  // back after a Stripe redirect). `popstate` fires only on actual history
  // moves — not on pushState — which is exactly what we want.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      const next = readInitialLocale();
      setLocaleState((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* private-mode / quota — ignore */
    }
    // Clean `?lang=` from URL if present — without it, subsequent loads
    // resolve from localStorage cleanly. `history.replaceState` keeps the
    // user on the same URL без додаткового pushState navigation.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.delete("lang");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* malformed URL or cross-origin — ignore */
    }
  }, []);

  return {
    locale,
    messages: getMessages(locale),
    setLocale,
  };
}
