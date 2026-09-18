/**
 * Tiny class-name concatenator used by the Overview sub-components.
 *
 * Mirrors the `cn` helper from `apps/web/src/shared/lib/ui/cn.ts` closely
 * enough for our needs: it joins truthy string arguments with spaces so
 * NativeWind receives a single className blob. We purposefully keep it
 * local to the Overview folder rather than reaching for a shared helper
 * so the mobile `pages/Overview` directory can be copy-ported with
 * minimal cross-module coupling.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
