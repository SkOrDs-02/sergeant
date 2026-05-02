/**
 * Sergeant Design System — OfflineBanner (React Native)
 *
 * Global banner shown when the app is fully offline.
 * Uses NetInfo to detect connectivity status and displays
 * a persistent, non-intrusive banner at the top of the screen.
 *
 * Features:
 * - Auto-hides when connectivity is restored
 * - Slide-in/out animation
 * - Safe area aware
 * - Reduced motion support
 */

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { WifiOff, RefreshCw } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface OfflineBannerProps {
  /** Custom message (default: "Немає підключення до інтернету") */
  message?: string;
  /** Additional context (default: "Дані будуть синхронізовані після відновлення") */
  subtitle?: string;
  /** Hide the banner even when offline */
  forceHide?: boolean;
}

export function OfflineBanner({
  message = "Немає підключення до інтернету",
  subtitle = "Дані синхронізуються після відновлення",
  forceHide = false,
}: OfflineBannerProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const insets = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Subscribe to network state
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(offline);
    });

    // Check initial state
    NetInfo.fetch().then((state) => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(offline);
    });

    return unsubscribe;
  }, []);

  // Check reduced motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => sub.remove();
  }, []);

  // Animate banner visibility
  useEffect(() => {
    const shouldShow = isOffline && !forceHide;

    if (reduceMotion) {
      translateY.setValue(shouldShow ? 0 : -100);
      opacity.setValue(shouldShow ? 1 : 0);
    } else {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: shouldShow ? 0 : -100,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(opacity, {
          toValue: shouldShow ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOffline, forceHide, reduceMotion, translateY, opacity]);

  // Don't render if not needed
  if (!isOffline && !forceHide) return null;

  return (
    <Animated.View
      style={{
        transform: [{ translateY }],
        opacity,
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingTop: insets.top,
      }}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View className="mx-3 mt-2 px-4 py-3 bg-warning rounded-2xl flex-row items-center gap-3 shadow-lg">
        <View className="w-9 h-9 rounded-xl bg-white/20 items-center justify-center">
          <WifiOff size={20} color="#fff" strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-white">{message}</Text>
          <Text className="text-xs text-white/80 mt-0.5">{subtitle}</Text>
        </View>
        <View className="w-6 h-6 items-center justify-center">
          <RefreshCw size={16} color="rgba(255,255,255,0.6)" strokeWidth={2} />
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Hook to check offline status.
 * Useful for conditional rendering or logic based on connectivity.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(offline);
    });

    NetInfo.fetch().then((state) => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(offline);
    });

    return unsubscribe;
  }, []);

  return isOffline;
}
