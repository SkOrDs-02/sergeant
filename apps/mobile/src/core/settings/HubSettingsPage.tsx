/**
 * Sergeant Hub-core — HubSettingsPage shell (React Native)
 *
 * Mobile port of `apps/web/src/core/hub/HubSettingsPage.tsx`.
 *
 * Features:
 *  - Sticky group tabs for quick navigation between setting categories
 *  - Visual grouping with section headers
 *  - All eight Hub-core sections porting in: `GeneralSection`,
 *    `NotificationsSection`, `RoutineSection`, `FinykSection`,
 *    `FizrukSection`, `AIDigestSection`, `AssistantCatalogueSection`,
 *    `ExperimentalSection`.
 *
 * UX Improvements:
 *  - Category chips for quick jumping between sections
 *  - Visual hierarchy with group titles
 *  - Consistent spacing and layout
 */

import { useRef, useState, type ComponentType } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { hapticTap } from "@sergeant/shared";

import { AccountSection } from "./AccountSection";
import { AIDigestSection } from "./AIDigestSection";
import { AssistantCatalogueSection } from "./AssistantCatalogueSection";
import { ExperimentalSection } from "./ExperimentalSection";
import { FinykSection } from "./FinykSection";
import { FizrukSection } from "./FizrukSection";
import { GeneralSection } from "./GeneralSection";
import { NotificationsSection } from "./NotificationsSection";
import { RoutineSection } from "./RoutineSection";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

interface SettingGroup {
  id: string;
  title: string;
  icon: string;
  sections: ComponentType[];
}

const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "general",
    title: "Загальні",
    icon: "gear",
    sections: [GeneralSection, NotificationsSection],
  },
  {
    id: "modules",
    title: "Модулі",
    icon: "grid",
    sections: [RoutineSection, FinykSection, FizrukSection],
  },
  {
    id: "ai",
    title: "AI",
    icon: "sparkles",
    sections: [AIDigestSection, AssistantCatalogueSection],
  },
  {
    id: "account",
    title: "Акаунт",
    icon: "user",
    sections: [ExperimentalSection, AccountSection],
  },
];

export function HubSettingsPage() {
  const scrollRef = useRef<ScrollView>(null);
  const [activeGroup, setActiveGroup] = useState<string>("general");
  const groupPositions = useRef<Record<string, number>>({});

  const handleGroupLayout = (groupId: string) => (event: LayoutChangeEvent) => {
    groupPositions.current[groupId] = event.nativeEvent.layout.y;
  };

  const scrollToGroup = (groupId: string) => {
    hapticTap();
    setActiveGroup(groupId);
    const position = groupPositions.current[groupId];
    if (position !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: position - 60, animated: true });
    }
  };

  const handleScroll = (event: {
    nativeEvent: { contentOffset: { y: number } };
  }) => {
    const scrollY = event.nativeEvent.contentOffset.y + 80;

    // Find the active group based on scroll position
    let currentGroup = "general";
    for (const group of SETTING_GROUPS) {
      const position = groupPositions.current[group.id];
      if (position !== undefined && scrollY >= position) {
        currentGroup = group.id;
      }
    }

    if (currentGroup !== activeGroup) {
      setActiveGroup(currentGroup);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg" edges={["top"]}>
      {/* Sticky Category Tabs */}
      <View className="border-b border-line bg-panel dark:bg-cream-900 px-4 py-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {SETTING_GROUPS.map((group) => {
            const isActive = activeGroup === group.id;
            return (
              <Pressable
                key={group.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Перейти до ${group.title}`}
                onPress={() => scrollToGroup(group.id)}
                className={cx(
                  "px-4 py-2 rounded-full active:scale-95",
                  isActive
                    ? "bg-brand/15 dark:bg-brand/25"
                    : "bg-cream-100 dark:bg-cream-800",
                )}
                testID={`settings-group-${group.id}`}
              >
                <Text
                  className={cx(
                    "text-sm font-medium",
                    isActive ? "text-brand" : "text-fg-muted",
                  )}
                >
                  {group.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <Text className="text-[22px] font-bold text-fg mb-4">Налаштування</Text>

        {SETTING_GROUPS.map((group) => (
          <View
            key={group.id}
            onLayout={handleGroupLayout(group.id)}
            className="mb-6"
          >
            {/* Group Header */}
            <View className="flex-row items-center gap-2 mb-3">
              <View className="h-1 w-1 rounded-full bg-brand" />
              {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
              <Text className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                {group.title}
              </Text>
              <View className="flex-1 h-px bg-line dark:bg-cream-700 ml-2" />
            </View>

            {/* Group Sections */}
            <View className="gap-3">
              {group.sections.map((Section, idx) => (
                <Section key={idx} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default HubSettingsPage;
