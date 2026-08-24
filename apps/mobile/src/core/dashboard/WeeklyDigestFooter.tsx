/**
 * Sergeant Hub — WeeklyDigestFooter (mobile).
 *
 * Thin pressable link rendered at the very bottom of the hub. When
 * tapped, opens the `WeeklyDigestCard` placeholder modal with the
 * current week's digest preloaded. A small "fresh" dot is shown when
 * the shared `hasLiveWeeklyDigest()` helper reports the digest is
 * live for this session (Monday OR current-week digest present OR
 * last week's digest generated within 48h).
 *
 * Visibility rules — mirror the web footer:
 *   - always visible on Monday / Tuesday (so the user spots the
 *     "ready-to-generate" CTA),
 *   - otherwise visible only when fresh.
 *
 * The footer is intentionally chromeless (no border, muted text):
 * the full-card variant only shows up in the hero slot of the
 * dashboard on live weeks; this stays out of the way on quiet days.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { hasLiveWeeklyDigest } from "./weeklyDigestStorage";
import { WeeklyDigestCard } from "./WeeklyDigestCard";

export interface WeeklyDigestFooterProps {
  /**
   * Optional clock injection — `useMondayAutoDigest` and tests want
   * a deterministic "now", product code doesn't need to supply this.
   */
  now?: Date;
  testID?: string;
}

function shouldRenderFooter(now: Date, fresh: boolean): boolean {
  const dow = now.getDay();
  // Monday or Tuesday: always render so the "ready to generate" CTA
  // surfaces even when the user hasn't tapped yet.
  if (dow === 1 || dow === 2) return true;
  return fresh;
}

export const WeeklyDigestFooter = memo(function WeeklyDigestFooter({
  now,
  testID,
}: WeeklyDigestFooterProps) {
  const resolvedNow = useMemo(() => now ?? new Date(), [now]);
  const fresh = useMemo(() => hasLiveWeeklyDigest(resolvedNow), [resolvedNow]);
  const render = shouldRenderFooter(resolvedNow, fresh);

  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  if (!render) return null;

  return (
    <View testID={testID ?? "weekly-digest-footer"}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={
          fresh
            ? "Відкрити тижневий дайджест, свіжий"
            : "Відкрити тижневий дайджест"
        }
        onPress={handleOpen}
        className="flex-row items-center justify-center gap-2 px-3 py-2 active:opacity-70"
        testID="weekly-digest-footer-link"
      >
        {fresh ? (
          <View
            className="h-2 w-2 rounded-full bg-brand-500"
            testID="weekly-digest-footer-fresh-dot"
          />
        ) : null}
        <Text className="text-xs font-medium text-fg-muted">
          Тижневий дайджест
        </Text>
        <Text className="text-xs text-fg-subtle">›</Text>
      </Pressable>
      <WeeklyDigestCard open={open} onClose={handleClose} />
    </View>
  );
});
