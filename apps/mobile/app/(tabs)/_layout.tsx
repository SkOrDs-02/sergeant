import { useEffect, useState } from "react";
import { Redirect, Tabs } from "expo-router";
import { DeviceEventEmitter, View } from "react-native";
import {
  Home,
  Wallet,
  Dumbbell,
  CheckSquare,
  UtensilsCrossed,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { useUser } from "@sergeant/api-client/react";
import { shouldShowOnboarding } from "@sergeant/shared";
import { OnboardingWizard, getOnboardingStore } from "@/core/OnboardingWizard";
import { useTabBadges } from "@/hooks/useTabBadges";
import { colors } from "@/theme";

type TabIconProps = {
  color: string;
  focused: boolean;
};

function createTabIcon(Icon: LucideIcon) {
  return function TabIcon({ color, focused }: TabIconProps) {
    return (
      <View style={{ opacity: focused ? 1 : 0.6 }}>
        <Icon size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
      </View>
    );
  };
}

/**
 * Dev-only auth bypass for Detox E2E runs.
 *
 * Controlled by `EXPO_PUBLIC_E2E=1`; the flag is set on the Detox build
 * (see `apps/mobile/.detoxrc.js`) and surfaces the tabs to the runner
 * without requiring a Better Auth session. Production / staging builds
 * never set this variable — the check compiles away in release binaries
 * because `process.env.EXPO_PUBLIC_*` is statically inlined by Metro.
 *
 * Docs: `docs/mobile/react-native-migration.md` §8 / §13 Q8.
 */
const E2E_AUTH_BYPASS = process.env.EXPO_PUBLIC_E2E === "1";

export default function TabsLayout() {
  const { data, isLoading } = useUser();
  const badges = useTabBadges();
  // Gate the tab bar behind the shared onboarding check. The MMKV-backed
  // store is owned by `OnboardingWizard` so the "done" flag flips
  // synchronously on `finish()` and the wizard unmounts on the next
  // render. Matches the web behaviour in `apps/web/src/core/App.tsx`
  // where the wizard renders above the populated hub until the user
  // taps through.
  const [onboardingVisible, setOnboardingVisible] = useState<boolean>(() =>
    shouldShowOnboarding(getOnboardingStore()),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("hub:onboardingReset", () => {
      setOnboardingVisible(true);
    });
    return () => sub.remove();
  }, []);

  if (!E2E_AUTH_BYPASS && !isLoading && !data?.user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <>
      {onboardingVisible ? (
        <OnboardingWizard onDone={() => setOnboardingVisible(false)} />
      ) : null}
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Хаб",
            tabBarIcon: createTabIcon(Home),
            tabBarButtonTestID: "tab-hub",
          }}
        />
        <Tabs.Screen
          name="finyk"
          options={{
            title: "ФІНІК",
            tabBarIcon: createTabIcon(Wallet),
            tabBarButtonTestID: "tab-finyk",
            tabBarBadge: badges.finyk,
            tabBarBadgeStyle: { backgroundColor: colors.warning },
          }}
        />
        <Tabs.Screen
          name="fizruk"
          options={{
            title: "ФІЗРУК",
            tabBarIcon: createTabIcon(Dumbbell),
            tabBarButtonTestID: "tab-fizruk",
            // The Fizruk tab hosts a nested Expo Router `Stack` (see
            // `app/(tabs)/fizruk/_layout.tsx`) that draws its own headers
            // per screen. Hiding the Tabs header prevents a double bar.
            headerShown: false,
            tabBarBadge: badges.fizruk,
            tabBarBadgeStyle: { backgroundColor: colors.info },
          }}
        />
        <Tabs.Screen
          name="routine"
          options={{
            title: "Рутина",
            tabBarIcon: createTabIcon(CheckSquare),
            tabBarButtonTestID: "tab-routine",
            tabBarBadge: badges.routine,
          }}
        />
        <Tabs.Screen
          name="nutrition"
          options={{
            title: "Їжа",
            tabBarIcon: createTabIcon(UtensilsCrossed),
            tabBarButtonTestID: "tab-nutrition",
            tabBarBadge: badges.nutrition,
            tabBarBadgeStyle: { backgroundColor: colors.success },
          }}
        />
      </Tabs>
    </>
  );
}
