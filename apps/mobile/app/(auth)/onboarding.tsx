import { useRouter } from "expo-router";
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Wallet,
  Dumbbell,
  UtensilsCrossed,
  ArrowRight,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { colors, radius } from "@/theme";

interface Slide {
  Icon: LucideIcon;
  color: string;
  title: string;
  desc: string;
}

const SLIDES: Slide[] = [
  {
    Icon: Wallet,
    color: "#7c6af7",
    title: "Фінанси під контролем",
    desc: "Відстежуй витрати, будуй бюджети та розумій, куди йдуть гроші — все в одному місці.",
  },
  {
    Icon: Dumbbell,
    color: "#0d9488",
    title: "Тренування без зупинок",
    desc: "Програми, логи тренувань та прогрес — для тих, хто хоче результату.",
  },
  {
    Icon: UtensilsCrossed,
    color: "#84cc16",
    title: "Харчування по-людськи",
    desc: "Логуй їжу, відстежуй КБЖУ та будуй здорові звички без зайвого стресу.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  const goNext = () => {
    if (isLast) router.replace("/(auth)/sign-up");
    else setStep((s) => s + 1);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg px-6">
      <Pressable
        className="self-end pt-4 pb-6 active:opacity-70"
        onPress={() => router.replace("/(auth)/sign-up")}
      >
        <Text className="text-muted text-sm">Пропустити</Text>
      </Pressable>

      <View className="flex-1 items-center justify-center gap-6">
        <View
          className="w-28 h-28 rounded-3xl items-center justify-center"
          style={{
            backgroundColor: slide.color + "22",
            borderWidth: 1.5,
            borderColor: slide.color + "44",
          }}
        >
          <slide.Icon size={48} color={slide.color} strokeWidth={1.5} />
        </View>
        <Text className="text-text text-2xl font-extrabold text-center">
          {slide.title}
        </Text>
        <Text className="text-muted text-base text-center leading-6">
          {slide.desc}
        </Text>
      </View>

      <View className="flex-row justify-center gap-2 mb-4">
        {SLIDES.map((_, i) => (
          <Pressable key={i} onPress={() => setStep(i)}>
            <View
              className="h-2 rounded"
              style={{
                width: i === step ? 24 : 8,
                backgroundColor: i === step ? slide.color : colors.textMuted,
              }}
            />
          </Pressable>
        ))}
      </View>

      <View className="pb-6">
        <Pressable
          className="flex-row items-center justify-center gap-2 py-4 active:opacity-80"
          style={{ backgroundColor: slide.color, borderRadius: radius.md }}
          onPress={goNext}
        >
          <Text className="text-white text-base font-bold">
            {isLast ? "Розпочати" : "Далі"}
          </Text>
          <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
