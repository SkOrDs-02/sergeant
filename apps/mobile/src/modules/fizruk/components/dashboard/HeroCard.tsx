/**
 * `HeroCard` — top-of-dashboard hero that surfaces the most-actionable
 * "what next?" slot for the user.
 *
 * Four mutually-exclusive states:
 *  1. Active workout in progress → resumes the workout screen.
 *  2. Next plan session is today → "Почати тренування" + template name.
 *  3. Next plan session in the near future → "{N} днів" + date.
 *  4. Nothing scheduled → empty nudge pointing to the Plan screen.
 */

import type { DashboardNextSession } from "@sergeant/fizruk-domain/domain";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface HeroCardProps {
  /** Active workout id, when a session is currently in progress. */
  activeWorkoutId: string | null;
  /** Live elapsed seconds for the active workout (monotonic). */
  elapsedSec: number;
  /** Next scheduled plan session (or `null`). */
  nextSession: DashboardNextSession | null;
  /** Tapping the primary CTA in any state. Callers route with haptics. */
  onPrimaryPress: () => void;
  testID?: string;
}

function formatElapsed(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDateShort(dateKey: string): string {
  try {
    const d = new Date(dateKey);
    d.setHours(12, 0, 0, 0);
    return d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  } catch {
    return dateKey;
  }
}

function formatDaysAway(days: number): string {
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Завтра";
  const mod100 = days % 100;
  const mod10 = days % 10;
  if (mod100 >= 11 && mod100 <= 14) return `За ${days} днів`;
  if (mod10 === 1) return `За ${days} день`;
  if (mod10 >= 2 && mod10 <= 4) return `За ${days} дні`;
  return `За ${days} днів`;
}

export function HeroCard({
  activeWorkoutId,
  elapsedSec,
  nextSession,
  onPrimaryPress,
  testID = "fizruk-dashboard-hero",
}: HeroCardProps) {
  if (activeWorkoutId) {
    return (
      <Card variant="fizruk" radius="xl" padding="lg" testID={testID}>
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-xs font-semibold text-teal-100">
              Тренування триває
            </Text>
            <Text
              className="text-2xl font-bold text-white"
              testID={`${testID}-elapsed`}
            >
              {formatElapsed(elapsedSec)}
            </Text>
            <Text className="text-sm text-teal-100">
              Повернись у сесію, сети й таймер лишилися там, де ти їх залишив.
            </Text>
          </View>
          <Button
            variant="secondary"
            size="lg"
            onPress={onPrimaryPress}
            accessibilityLabel="Повернутися до активного тренування"
            testID={`${testID}-resume`}
          >
            Продовжити
          </Button>
        </View>
      </Card>
    );
  }

  if (nextSession) {
    const isToday = nextSession.isToday;
    const variant = isToday ? "fizruk" : "fizruk-soft";
    const primaryText = isToday ? "Почати тренування" : "До плану";
    return (
      <Card variant={variant} radius="xl" padding="lg" testID={testID}>
        <View className="gap-3">
          <View className="gap-1">
            <Text
              className={
                isToday
                  ? "text-xs font-semibold text-teal-100"
                  : "text-xs font-semibold text-teal-800"
              }
            >
              {isToday ? "Сьогоднішнє тренування" : "Наступне тренування"}
            </Text>
            <Text
              className={
                isToday
                  ? "text-xl font-bold text-white"
                  : "text-xl font-bold text-fg"
              }
              testID={`${testID}-title`}
            >
              {nextSession.templateName}
            </Text>
            <Text
              className={
                isToday ? "text-sm text-teal-100" : "text-sm text-teal-800/80"
              }
              testID={`${testID}-meta`}
            >
              {formatDaysAway(nextSession.daysFromNow)} ·{" "}
              {formatDateShort(nextSession.dateKey)}
              {nextSession.exerciseCount != null &&
              nextSession.exerciseCount > 0
                ? ` · ${nextSession.exerciseCount} вправ`
                : ""}
            </Text>
          </View>
          <Button
            variant={isToday ? "secondary" : "fizruk"}
            size="lg"
            onPress={onPrimaryPress}
            accessibilityLabel={primaryText}
            testID={`${testID}-start`}
          >
            {primaryText}
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <Card variant="fizruk-soft" radius="xl" padding="lg" testID={testID}>
      <View className="gap-3">
        <View className="gap-1">
          <Text className="text-xs font-semibold text-teal-800">
            Швидкий старт
          </Text>
          <Text className="text-base font-semibold text-fg">
            План поки порожній
          </Text>
          <Text className="text-sm text-teal-800/80 leading-snug">
            Заплануй тренування у «Плані», або почни довільну сесію з каталогу.
          </Text>
        </View>
        <Button
          variant="fizruk"
          size="md"
          onPress={onPrimaryPress}
          accessibilityLabel="Перейти до тренувань"
          testID={`${testID}-workouts`}
        >
          До тренувань
        </Button>
      </View>
    </Card>
  );
}

export default HeroCard;
