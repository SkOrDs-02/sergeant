/**
 * Collapsible card chrome shared by the four Hub-Reports module cards.
 *
 * Mirrors the per-card collapse header from the web report cards
 * (`FitnessCard` / `ExpensesCard` / …): an emoji + eyebrow on the left,
 * the collapsed stat + delta on the right, and a chevron that rotates
 * with the expanded state. Collapse state persists per module in MMKV
 * via `useLocalStorage`, matching the web `hub_reports_collapsed_v1:<mod>`
 * key shape.
 */

import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { useLocalStorage } from "@/lib/storage";
import { SectionHeading } from "@/components/ui/SectionHeading";

export interface ReportCardShellProps {
  /** Module slug — used for the persisted collapse key. */
  moduleKey: string;
  emoji: string;
  title: string;
  /** Compact stat rendered in the header when collapsed. */
  collapsedStat: ReactNode;
  /** Expanded body (hero stat, prev line, chart). */
  children: ReactNode;
}

export function ReportCardShell({
  moduleKey,
  emoji,
  title,
  collapsedStat,
  children,
}: ReportCardShellProps) {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(
    `hub_reports_collapsed_v1:${moduleKey}`,
    true,
  );

  return (
    <View
      className={`rounded-2xl border border-line bg-panel ${
        collapsed ? "p-3" : "gap-3 p-4"
      }`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        onPress={() => setCollapsed((c) => !c)}
        className="-m-1 flex-row items-center gap-2 rounded-xl p-1"
      >
        <Text className="shrink-0 text-lg" accessibilityElementsHidden>
          {emoji}
        </Text>
        <SectionHeading
          size="xs"
          variant="muted"
          className="min-w-0 flex-1"
          numberOfLines={1}
        >
          {title}
        </SectionHeading>
        {collapsed ? (
          <View className="shrink-0 flex-row items-center gap-2">
            {collapsedStat}
          </View>
        ) : null}
        <ChevronDown
          size={16}
          color="#78716c"
          style={{ transform: [{ rotate: collapsed ? "-90deg" : "0deg" }] }}
        />
      </Pressable>
      {!collapsed ? children : null}
    </View>
  );
}
