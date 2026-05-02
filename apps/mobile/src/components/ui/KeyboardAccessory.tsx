/**
 * Sergeant Design System — KeyboardAccessory (React Native)
 *
 * A compact chip bar rendered above the software keyboard that provides
 * quick-fill actions for the currently focused input. Use cases:
 *
 *  - Finyk: frequently used amounts (100, 200, 500, 1000)
 *  - Nutrition: common portion sizes (100g, 150g, 200g, 250g)
 *  - Fizruk: common weights (10, 20, 30, 40, 50)
 *  - Routine: water intake increments (+250ml, +500ml)
 *
 * The bar sits above the keyboard via `InputAccessoryView` on iOS and
 * a bottom-anchored `Animated.View` on Android (since `InputAccessoryView`
 * is iOS-only). Both implementations share the same chip rendering.
 *
 * @see docs/planning/ux-enhancement-plan.md — Section 4.3 (Keyboard & Input)
 */

import { useCallback, type ReactNode } from "react";
import {
  InputAccessoryView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export interface QuickFillChip {
  /** Label displayed in the chip */
  label: string;
  /** Value to insert/apply when the chip is tapped */
  value: string | number;
}

export interface KeyboardAccessoryProps {
  /** Unique ID linking this accessory to an input via `inputAccessoryViewID` */
  nativeID: string;
  /** Quick-fill chips to display */
  chips: QuickFillChip[];
  /** Called when a chip is tapped. The consumer should update the input value. */
  onChipPress: (chip: QuickFillChip) => void;
  /** Optional "Done" button handler. Shows "Готово" when provided. */
  onDone?: () => void;
  /** Optional leading content (e.g. unit label) */
  leading?: ReactNode;
  /** Module color variant for active chips */
  variant?: "default" | "finyk" | "fizruk" | "routine" | "nutrition";
}

const variantBg: Record<string, string> = {
  default: "bg-brand/10",
  finyk: "bg-finyk/10",
  fizruk: "bg-fizruk/10",
  routine: "bg-routine/10",
  nutrition: "bg-nutrition/10",
};

const variantText: Record<string, string> = {
  default: "text-brand",
  finyk: "text-finyk",
  fizruk: "text-fizruk",
  routine: "text-routine",
  nutrition: "text-nutrition",
};

function ChipBar({
  chips,
  onChipPress,
  onDone,
  leading,
  variant = "default",
}: Omit<KeyboardAccessoryProps, "nativeID">) {
  return (
    <View className="flex-row items-center bg-panel border-t border-line px-2 py-1.5">
      {leading && <View className="mr-2">{leading}</View>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ gap: 6, paddingRight: 8 }}
        className="flex-1"
      >
        {chips.map((chip) => (
          <Pressable
            key={`${chip.label}-${chip.value}`}
            accessibilityRole="button"
            accessibilityLabel={`Вставити ${chip.label}`}
            onPress={() => onChipPress(chip)}
            className={`rounded-full px-3 py-1.5 ${variantBg[variant]} active:opacity-70`}
          >
            <Text className={`text-xs font-semibold ${variantText[variant]}`}>
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {onDone && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрити клавіатуру"
          onPress={onDone}
          className="ml-2 rounded-lg px-3 py-1.5 active:bg-panelHi"
        >
          <Text className="text-sm font-semibold text-brand">Готово</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Keyboard accessory bar. On iOS, uses native `InputAccessoryView` for
 * proper keyboard tracking. On Android, renders a simple bottom bar
 * (consumers should position it above the keyboard via layout).
 *
 * Usage:
 * ```tsx
 * const AMOUNT_CHIPS = [
 *   { label: "100", value: 100 },
 *   { label: "200", value: 200 },
 *   { label: "500", value: 500 },
 * ];
 *
 * <TextInput inputAccessoryViewID="amount-input" ... />
 * <KeyboardAccessory
 *   nativeID="amount-input"
 *   chips={AMOUNT_CHIPS}
 *   onChipPress={(chip) => setValue(String(chip.value))}
 *   onDone={() => Keyboard.dismiss()}
 * />
 * ```
 */
export function KeyboardAccessory({
  nativeID,
  chips,
  onChipPress,
  onDone,
  leading,
  variant = "default",
}: KeyboardAccessoryProps) {
  const handleChipPress = useCallback(
    (chip: QuickFillChip) => {
      onChipPress(chip);
    },
    [onChipPress],
  );

  if (Platform.OS === "ios") {
    return (
      <InputAccessoryView nativeID={nativeID}>
        <ChipBar
          chips={chips}
          onChipPress={handleChipPress}
          onDone={onDone}
          leading={leading}
          variant={variant}
        />
      </InputAccessoryView>
    );
  }

  // Android: rendered inline; the consumer should position this component
  // above the keyboard (e.g. using `useVisualKeyboardInset`).
  return (
    <ChipBar
      chips={chips}
      onChipPress={handleChipPress}
      onDone={onDone}
      leading={leading}
      variant={variant}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESET CHIP SETS — Reusable quick-fill chip arrays for common inputs
   ═══════════════════════════════════════════════════════════════════════════ */

/** Common UAH amounts for Finyk expense entry */
export const AMOUNT_CHIPS_UAH: QuickFillChip[] = [
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "200", value: 200 },
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "2000", value: 2000 },
];

/** Common portion sizes for Nutrition */
export const PORTION_CHIPS_GRAM: QuickFillChip[] = [
  { label: "50g", value: 50 },
  { label: "100g", value: 100 },
  { label: "150g", value: 150 },
  { label: "200g", value: 200 },
  { label: "250g", value: 250 },
  { label: "300g", value: 300 },
];

/** Common weight increments for Fizruk */
export const WEIGHT_CHIPS_KG: QuickFillChip[] = [
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "15", value: 15 },
  { label: "20", value: 20 },
  { label: "25", value: 25 },
  { label: "30", value: 30 },
  { label: "40", value: 40 },
  { label: "50", value: 50 },
];

/** Common rep counts for Fizruk */
export const REP_CHIPS: QuickFillChip[] = [
  { label: "5", value: 5 },
  { label: "8", value: 8 },
  { label: "10", value: 10 },
  { label: "12", value: 12 },
  { label: "15", value: 15 },
  { label: "20", value: 20 },
];

/** Water intake increments for Routine */
export const WATER_CHIPS_ML: QuickFillChip[] = [
  { label: "+150ml", value: 150 },
  { label: "+250ml", value: 250 },
  { label: "+330ml", value: 330 },
  { label: "+500ml", value: 500 },
];
