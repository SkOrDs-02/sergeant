/**
 * Кільце прогресу для макросу (кілокалорії / білки / жири / вуглеводи).
 *
 * Web-версія рендерить такі кільця інлайн у `NutritionDashboard.tsx`
 * через SVG. На native використовуємо `react-native-svg` — візуально
 * зберігаємо той самий ринг +90° counterclockwise start і закруглений
 * stroke-cap.
 */
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { chartColors } from "@/theme";

export interface MacroRingProps {
  /** Поточне значення (відображається в центрі). */
  value: number;
  /** Цільове значення; якщо ≤ 0 — кільце малюється без fill-сегмента. */
  target: number;
  /** Колір активного сегмента (за замовчуванням — помаранчевий ккал). */
  color?: string;
  /** Діаметр у px. Дефолт 56 (як на web). */
  size?: number;
  /** Товщина stroke у px. Дефолт 5. */
  stroke?: number;
  label: string;
  /** Unit-suffix над targets (`г` / порожньо для ккал). */
  unit?: string;
}

export function MacroRing({
  value,
  target,
  color = chartColors.nutrition.kcal,
  size = 56,
  stroke = 5,
  label,
  unit,
}: MacroRingProps) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const percent = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const dash = (percent / 100) * circ;

  return (
    <View className="items-center gap-1">
      <View style={{ width: size, height: size }}>
        <Svg
          width={size}
          height={size}
          // -90° rotation щоб segment стартував згори
          style={{ transform: [{ rotate: "-90deg" }] }}
        >
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={chartColors.nutrition.track}
            strokeWidth={stroke}
          />
          {target > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
            />
          ) : null}
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-xs font-bold text-fg leading-none">
            {Math.round(value)}
          </Text>
        </View>
      </View>
      <Text className="text-[10px] font-semibold text-fg-muted leading-none">
        {label}
      </Text>
      {target > 0 ? (
        <Text className="text-[9px] text-fg-subtle leading-none">
          / {target}
          {unit || ""}
        </Text>
      ) : null}
    </View>
  );
}
