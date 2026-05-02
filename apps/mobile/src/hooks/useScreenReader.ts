/**
 * useScreenReader — detects if screen reader (VoiceOver/TalkBack) is active.
 *
 * Use this to:
 * - Provide alternative layouts for screen reader users
 * - Announce dynamic content changes
 * - Skip complex visual-only elements
 *
 * @example
 * ```tsx
 * function InteractiveChart() {
 *   const { isActive, announce } = useScreenReader();
 *
 *   if (isActive) {
 *     return <TextSummary data={data} />;
 *   }
 *
 *   return <Chart data={data} onDataChange={(d) => announce(`Value: ${d}`)} />;
 * }
 * ```
 */
import { useEffect, useState, useCallback } from "react";
import { AccessibilityInfo } from "react-native";

export interface UseScreenReaderResult {
  /** Whether a screen reader is currently active */
  isActive: boolean;
  /** Announce a message to the screen reader */
  announce: (message: string) => void;
  /** Announce a message for live regions (polite) */
  announceForAccessibility: (message: string) => void;
}

/**
 * Hook that detects screen reader status and provides announcement utilities.
 */
export function useScreenReader(): UseScreenReaderResult {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Get initial value
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      setIsActive(enabled);
    });

    // Listen for changes
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      (enabled) => {
        setIsActive(enabled);
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const announce = useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const announceForAccessibility = useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  return {
    isActive,
    announce,
    announceForAccessibility,
  };
}

/**
 * Hook that announces a message when it changes.
 * Useful for dynamic content that should be announced to screen reader users.
 */
export function useAnnounceOnChange(message: string | null): void {
  const { isActive, announce } = useScreenReader();

  useEffect(() => {
    if (isActive && message) {
      announce(message);
    }
  }, [isActive, message, announce]);
}

export default useScreenReader;
