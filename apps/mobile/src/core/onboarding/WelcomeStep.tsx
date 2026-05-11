import { Text, View } from "react-native";

import type { OnboardingHeroCopy } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";

export function WelcomeStep({
  onContinue,
  copy,
}: {
  onContinue: () => void;
  copy: OnboardingHeroCopy;
}) {
  return (
    <View className="items-center gap-5">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10">
        <Text className="text-4xl">✨</Text>
      </View>
      <View className="items-center gap-2">
        <Text className="text-center text-2xl font-bold text-fg">
          {copy.title}
        </Text>
        <Text className="text-center text-sm leading-relaxed text-fg-muted">
          {copy.subtitle}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-xs text-fg-subtle">🔒 {copy.badges[0]}</Text>
        <Text className="text-xs text-fg-subtle">☁️ {copy.badges[1]}</Text>
        <Text className="text-xs text-fg-subtle">🚫 {copy.badges[2]}</Text>
      </View>
      <Button
        variant="primary"
        size="lg"
        onPress={onContinue}
        testID="onboarding-next-welcome"
        className="w-full"
      >
        {copy.primaryCta}
      </Button>
    </View>
  );
}
