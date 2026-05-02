/**
 * Модалка тижневого дайджеста — `useWeeklyDigest` + рендер модульних
 * `summary` (як на web, без story viewer).
 */
import { memo, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { getWeekKey } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

import { useWeeklyDigest } from "./useWeeklyDigest";

const MODULE_ORDER = ["finyk", "fizruk", "nutrition", "routine"] as const;
const MODULE_LABEL: Record<(typeof MODULE_ORDER)[number], string> = {
  finyk: "Фінанси",
  fizruk: "Тренування",
  nutrition: "Харчування",
  routine: "Звички",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface WeeklyDigestCardProps {
  weekKey?: string;
  open: boolean;
  onClose: () => void;
  testID?: string;
}

export const WeeklyDigestCard = memo(function WeeklyDigestCard({
  weekKey,
  open,
  onClose,
  testID,
}: WeeklyDigestCardProps) {
  const resolvedWeekKey = weekKey ?? getWeekKey();
  const { digest, loading, error, generate, isCurrentWeek } =
    useWeeklyDigest(weekKey);

  const onGenerate = useCallback(() => {
    void generate();
  }, [generate]);

  const generatedAt = digest?.generatedAt
    ? new Date(
        typeof digest.generatedAt === "string" ||
          typeof digest.generatedAt === "number"
          ? digest.generatedAt
          : String(digest.generatedAt),
      )
    : null;

  const hasData = Boolean(
    digest &&
    MODULE_ORDER.some((k) => isRecord((digest as Record<string, unknown>)[k])),
  );

  const showBody = open;

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      testID={testID ?? "weekly-digest-card"}
    >
      <View className="flex-1 bg-black/40 px-4 justify-end">
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          className="absolute inset-0"
        />
        <Card className="mb-6 max-h-[85%] rounded-3xl bg-cream-50 p-5">
          <ScrollView>
            <View className="gap-2">
              <Text className="text-sm font-semibold uppercase text-fg-muted">
                Тижневий дайджест
              </Text>
              <Text className="text-xl font-bold text-fg">
                Тиждень {resolvedWeekKey}
              </Text>
              {generatedAt ? (
                <Text className="text-xs text-fg-muted">
                  Згенеровано{" "}
                  {generatedAt.toLocaleDateString("uk-UA", {
                    day: "numeric",
                    month: "long",
                  })}
                </Text>
              ) : null}

              {showBody && loading ? (
                <View className="flex-row items-center gap-2 py-4">
                  <ActivityIndicator size="small" color="#0d9488" />
                  <Text className="text-xs text-fg-muted">Генерую звіт…</Text>
                </View>
              ) : null}

              {showBody && error && !loading ? (
                <View className="gap-2">
                  <Text className="rounded-lg bg-red-100 px-2 py-1.5 text-xs text-red-800">
                    {error}
                  </Text>
                  {isCurrentWeek ? (
                    <Button variant="secondary" onPress={onGenerate}>
                      <Text className="text-sm font-semibold text-fg">
                        Спробувати знову
                      </Text>
                    </Button>
                  ) : null}
                </View>
              ) : null}

              {showBody && !hasData && !loading && !error && isCurrentWeek ? (
                <View className="gap-2 py-1">
                  <Text className="text-xs leading-relaxed text-fg-muted">
                    AI-звіт підсумовує прогрес по всіх модулях і дає
                    рекомендації на тиждень.
                  </Text>
                  <Button variant="primary" onPress={onGenerate}>
                    <Text className="text-center text-sm font-semibold text-white">
                      Згенерувати звіт
                    </Text>
                  </Button>
                </View>
              ) : null}

              {showBody && hasData && !loading
                ? MODULE_ORDER.map((key) => {
                    const mod = (digest as Record<string, unknown>)[key];
                    if (!isRecord(mod)) return null;
                    const summary = mod.summary;
                    const comment = mod.comment;
                    return (
                      <View
                        key={key}
                        className="mt-1 rounded-xl border border-line bg-white/80 p-2.5"
                      >
                        <Text className="text-xs font-semibold text-fg">
                          {MODULE_LABEL[key]}
                        </Text>
                        {typeof summary === "string" && summary ? (
                          <Text className="text-xs text-fg-muted">
                            {summary}
                          </Text>
                        ) : null}
                        {typeof comment === "string" && comment ? (
                          <Text className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                            {comment}
                          </Text>
                        ) : null}
                        {Array.isArray(mod.recommendations) &&
                        mod.recommendations.length > 0 ? (
                          <View className="mt-1">
                            {(mod.recommendations as unknown[]).map((rec, i) =>
                              typeof rec === "string" ? (
                                <Text
                                  key={i}
                                  className="text-xs leading-snug text-fg"
                                >
                                  → {rec}
                                </Text>
                              ) : null,
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                : null}

              {showBody &&
              digest &&
              Array.isArray(
                (digest as Record<string, unknown>).overallRecommendations,
              ) &&
              (
                (digest as Record<string, unknown>)
                  .overallRecommendations as unknown[]
              ).length > 0 ? (
                <View className="mt-1 rounded-xl border border-brand-200/60 bg-brand-50/80 p-2.5">
                  <SectionHeading size="2xs" variant="accent">
                    Загальні рекомендації
                  </SectionHeading>
                  {(
                    (digest as Record<string, unknown>)
                      .overallRecommendations as string[]
                  ).map((rec, i) => (
                    <Text key={i} className="text-xs text-fg">
                      ★ {rec}
                    </Text>
                  ))}
                </View>
              ) : null}

              {showBody && !hasData && !isCurrentWeek && !loading && !error ? (
                <Text className="text-xs text-fg-muted">
                  За цей тиждень звіт у кеші не знайдено.
                </Text>
              ) : null}

              <Button
                variant="secondary"
                onPress={onClose}
                className="mt-4 self-end"
                testID={testID ? `${testID}-close` : "weekly-digest-card-close"}
              >
                <Text className="text-sm font-semibold text-fg">Закрити</Text>
              </Button>
            </View>
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
});
