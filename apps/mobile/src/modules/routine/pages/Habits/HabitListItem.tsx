/**
 * Sergeant Routine — HabitListItem (React Native)
 *
 * Mobile port of
 * `apps/web/src/modules/routine/components/settings/HabitListItem.tsx`.
 *
 * Parity notes:
 *  - Renders `{emoji} {name}` as the headline, a subtle meta row with
 *    the human-readable recurrence label (± optional time-of-day /
 *    start-date / end-date), and an action cluster on the right
 *    (`↑` / `↓` / «Змінити» / «В архів» / «Видалити»).
 *  - «Деталі» is intentionally omitted in this PR — the mobile detail
 *    sheet is not ported yet. Wiring it up is a follow-up (see PR body).
 *  - Recurrence labels come from the shared
 *    `RECURRENCE_OPTIONS` constant in `@sergeant/routine-domain` so
 *    mobile + web copy stay in sync.
 *
 * Intentional differences from web:
 *  - No HTML5 drag-and-drop. Reorder is driven by the ↑ / ↓ buttons
 *    (same keyboard / screen-reader accessible affordance the web
 *    component already ships). Long-press + drag gesture-handler
 *    reorder is flagged as an explicit follow-up in the PR body.
 *  - Memoised with `React.memo` so editing one row does not re-render
 *    the whole active-habits list (parity with the web file).
 */

import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { RECURRENCE_OPTIONS, type Habit } from "@sergeant/routine-domain";
import { HabitGlyph } from "../../components/HabitGlyph";

export interface HabitListItemProps {
  habit: Habit;
  editing: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartEdit: () => void;
  onArchive: () => void;
  onRequestDelete: () => void;
  /** `false` by default — hides «Відновити» in favour of «В архів». */
  archived?: boolean;
  /** Callback for the «Відновити» action when rendered in archive mode. */
  onUnarchive?: () => void;
  /** Optional testID root — children derive stable sub-ids. */
  testID?: string;
}

export const HabitListItem = memo(function HabitListItem({
  habit: h,
  editing,
  onMoveUp,
  onMoveDown,
  onStartEdit,
  onArchive,
  onRequestDelete,
  archived = false,
  onUnarchive,
  testID,
}: HabitListItemProps) {
  const recLabel =
    RECURRENCE_OPTIONS.find((o) => o.value === (h.recurrence || "daily"))
      ?.label || "";

  const meta = [
    recLabel,
    h.timeOfDay ? h.timeOfDay : null,
    h.startDate ? `з ${h.startDate}` : null,
    h.endDate ? `до ${h.endDate}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rowClass = editing
    ? "py-3 border-b border-cream-200 last:border-b-0 rounded-xl bg-rose-50"
    : "py-3 border-b border-cream-200 last:border-b-0";

  return (
    <View className={rowClass} testID={testID}>
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <HabitGlyph value={h.emoji} size={14} />
            <Text
              className="text-sm font-medium text-fg flex-1"
              numberOfLines={1}
            >
              {h.name || ""}
            </Text>
          </View>
          {meta ? (
            <Text className="text-xs text-fg-muted mt-0.5" numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row flex-wrap justify-end gap-1.5 mt-2">
        {!archived ? (
          <>
            <Pressable
              onPress={onMoveUp}
              accessibilityRole="button"
              accessibilityLabel="Вгору в списку"
              testID={testID ? `${testID}-up` : undefined}
              className="min-w-[36px] min-h-[36px] rounded-lg border border-cream-300 bg-cream-50 items-center justify-center"
            >
              <Text className="text-xs text-fg-muted">↑</Text>
            </Pressable>
            <Pressable
              onPress={onMoveDown}
              accessibilityRole="button"
              accessibilityLabel="Вниз в списку"
              testID={testID ? `${testID}-down` : undefined}
              className="min-w-[36px] min-h-[36px] rounded-lg border border-cream-300 bg-cream-50 items-center justify-center"
            >
              <Text className="text-xs text-fg-muted">↓</Text>
            </Pressable>
            <Pressable
              onPress={onStartEdit}
              accessibilityRole="button"
              accessibilityLabel={`Редагувати ${h.name}`}
              testID={testID ? `${testID}-edit` : undefined}
              className="h-9 px-3 rounded-lg border border-cream-300 bg-cream-50 items-center justify-center"
            >
              <Text className="text-xs font-medium text-fg">Змінити</Text>
            </Pressable>
            <Pressable
              onPress={onArchive}
              accessibilityRole="button"
              accessibilityLabel={`Відправити ${h.name} в архів`}
              testID={testID ? `${testID}-archive` : undefined}
              className="h-9 px-3 rounded-lg border border-cream-300 bg-cream-50 items-center justify-center"
            >
              <Text className="text-xs font-medium text-fg">В архів</Text>
            </Pressable>
          </>
        ) : onUnarchive ? (
          <Pressable
            onPress={onUnarchive}
            accessibilityRole="button"
            accessibilityLabel={`Відновити ${h.name} з архіву`}
            testID={testID ? `${testID}-unarchive` : undefined}
            className="h-9 px-3 rounded-lg border border-cream-300 bg-cream-50 items-center justify-center"
          >
            <Text className="text-xs font-medium text-fg">Відновити</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onRequestDelete}
          accessibilityRole="button"
          accessibilityLabel={`Видалити ${h.name}`}
          testID={testID ? `${testID}-delete` : undefined}
          className="h-9 px-3 rounded-lg border border-danger/40 bg-transparent items-center justify-center"
        >
          <Text className="text-xs font-medium text-danger">Видалити</Text>
        </Pressable>
      </View>
    </View>
  );
});
