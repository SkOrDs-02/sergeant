/**
 * SearchResults — mobile mirror of
 * `apps/web/src/core/hub/search/SearchResults.tsx`.
 *
 * Renders grouped result sections, the empty/landing state, and the
 * recents pills. Uses `FlatList` so we get RN's recycling for long
 * `actions+modules+settings+assistant+ai` lists, with section headers
 * inlined as virtual rows. Web's auto-`scrollIntoView` story is dropped
 * because mobile users tap rows directly; the future external-keyboard
 * port can lift the `activeIdx → scrollToIndex` wiring here.
 */

import { useMemo } from "react";
import { Clock, Search } from "lucide-react-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { hapticTap } from "@sergeant/shared";

import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { colors } from "@/theme";

import { SearchResultItem } from "./SearchResultItem";
import type { Hit } from "./searchTypes";

export interface SearchResultsProps {
  query: string;
  results: Hit[];
  flat: Hit[];
  activeIdx: number;
  recents: string[];
  onActivate: (hit: Hit) => void;
  onPickRecent: (q: string) => void;
  onClearRecents: () => void;
  onCommitQuery: (q: string) => void;
  onOpenModule: (moduleId: string) => void;
  onClose: () => void;
}

type Row =
  | { kind: "header"; key: string; moduleId: string; label: string }
  | { kind: "hit"; key: string; hit: Hit; flatIdx: number }
  | {
      kind: "footer";
      key: string;
      moduleId: string;
      label: string;
      count: number;
    };

const FOOTER_MODULES = new Set(["finyk", "fizruk", "routine", "nutrition"]);

export function SearchResults({
  query,
  results,
  flat,
  activeIdx,
  recents,
  onActivate,
  onPickRecent,
  onClearRecents,
  onCommitQuery,
  onOpenModule,
  onClose,
}: SearchResultsProps) {
  const rows = useMemo<Row[]>(() => {
    const acc: Row[] = [];
    const grouped = new Map<string, { label: string; items: Hit[] }>();
    for (const r of results) {
      const g = grouped.get(r.module);
      if (g) {
        g.items.push(r);
      } else {
        grouped.set(r.module, { label: r.moduleLabel, items: [r] });
      }
    }
    for (const [moduleId, group] of grouped) {
      acc.push({
        kind: "header",
        key: `h-${moduleId}`,
        moduleId,
        label: group.label,
      });
      for (const hit of group.items) {
        acc.push({
          kind: "hit",
          key: hit.id,
          hit,
          flatIdx: flat.indexOf(hit),
        });
      }
      if (group.items.length >= 10 && FOOTER_MODULES.has(moduleId)) {
        acc.push({
          kind: "footer",
          key: `f-${moduleId}`,
          moduleId,
          label: group.label,
          count: group.items.length,
        });
      }
    }
    return acc;
  }, [results, flat]);

  const trimmed = query.trim();
  const showRecents = trimmed.length < 2 && recents.length > 0;

  if (trimmed.length >= 2 && results.length === 0) {
    return (
      <View className="flex-1 px-4 py-3" testID="hub-search-empty">
        <EmptyState
          icon={Search}
          title="Нічого не знайдено"
          description={`За запитом «${query}» нічого не знайшлося. Спробуй іншу фразу.`}
        />
      </View>
    );
  }

  if (showRecents && results.length === 0) {
    // Edge case: empty launcher with recents only — render the recents
    // pills full-width so the user has something to tap.
    return (
      <View className="flex-1 px-4 py-3" testID="hub-search-recents-only">
        <RecentsBar
          recents={recents}
          onPick={onPickRecent}
          onClear={onClearRecents}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      keyboardShouldPersistTaps="always"
      testID="hub-search-results"
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
      ListHeaderComponent={
        showRecents ? (
          <RecentsBar
            recents={recents}
            onPick={onPickRecent}
            onClear={onClearRecents}
          />
        ) : null
      }
      ListEmptyComponent={
        trimmed.length < 2 ? (
          <EmptyState
            icon={Search}
            title="Глобальний пошук"
            description="Транзакції, тренування, звички, їжа — все в одному місці."
          />
        ) : null
      }
      renderItem={({ item }) => {
        if (item.kind === "header") {
          return (
            <View className="mt-3 mb-1.5">
              <SectionHeading size="sm" variant="muted">
                {item.label}
              </SectionHeading>
            </View>
          );
        }
        if (item.kind === "footer") {
          return (
            <Pressable
              onPress={() => {
                hapticTap();
                onCommitQuery(query);
                onOpenModule(item.moduleId);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Відкрити ${item.label}`}
              testID={`hub-search-footer-${item.moduleId}`}
              className="mt-1.5 flex-row items-center justify-between rounded-xl px-3 py-2"
            >
              <Text className="text-xs text-fg-muted">
                Показано {item.count} — відкрити {item.label}
              </Text>
            </Pressable>
          );
        }
        return (
          <SearchResultItem
            hit={item.hit}
            index={item.flatIdx}
            active={item.flatIdx === activeIdx && item.flatIdx >= 0}
            onActivate={onActivate}
          />
        );
      }}
    />
  );
}

interface RecentsBarProps {
  recents: string[];
  onPick: (q: string) => void;
  onClear: () => void;
}

function RecentsBar({ recents, onPick, onClear }: RecentsBarProps) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between mb-1.5">
        <SectionHeading size="sm" variant="muted">
          Недавні запити
        </SectionHeading>
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Очистити недавні запити"
          hitSlop={8}
          testID="hub-search-clear-recents"
        >
          <Text className="text-xs text-fg-muted">Очистити</Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {recents.map((r) => (
          <Pressable
            key={r}
            onPress={() => onPick(r)}
            accessibilityRole="button"
            accessibilityLabel={`Шукати ${r}`}
            testID={`hub-search-recent-${r}`}
            className="flex-row items-center gap-1.5 px-3 h-8 rounded-full bg-panel-hi border border-line"
          >
            <Clock size={12} color={colors.textMuted} />
            <Text className="text-sm text-fg">{r}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
