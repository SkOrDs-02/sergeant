/**
 * Fizruk BodyAtlas — React Native port (Phase 6 · PR-C).
 *
 * Web counterpart: `apps/web/src/modules/fizruk/components/BodyAtlas.tsx`,
 * which renders a silhouette through the web-only `body-highlighter`
 * package. React Native has no DOM, so this component implements
 * §6.8 path A of `docs/engineering/mobile/react-native-migration.md` — a hand-tuned
 * silhouette on `react-native-svg`, sharing the muscle-id contract with
 * the web renderer through `@sergeant/fizruk-domain` (see
 * `packages/fizruk-domain/src/data/bodyAtlas.ts`).
 *
 * Design goals for this first cut:
 *
 *   - Type-safe, minimal public surface: `muscles` (list of highlighted
 *     muscle groups + 0..1 intensity), optional controlled `side`, and
 *     an `onMusclePress` callback. Everything else (legend, toggle,
 *     height) has a safe default.
 *   - Same muscle id keyspace as the web client, so the same
 *     `statusByMuscle` payload feeds both platforms (recovery /
 *     atlas data-layer ports unchanged — see Atlas page wiring).
 *   - Accessible: each interactive region carries a Ukrainian
 *     `accessibilityLabel` (e.g. «Груди, інтенсивність 80%»).
 *   - Styled via NativeWind on the shell + `@sergeant/design-tokens`
 *     hex values for SVG fill / stroke (SVG paints are inline
 *     attributes, not Tailwind classes — tokens are the canonical
 *     source so web and mobile stay visually aligned).
 *
 * The silhouette is stylised (ellipses / rounded rects via `<Path>`)
 * rather than anatomically accurate — the purpose is legibility at
 * small sizes and offline rendering with no bitmap assets. Refinement
 * lands in a follow-up PR once mobile-native designers have a pass.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Rect,
  type GProps,
} from "react-native-svg";

import { statusColors } from "@sergeant/design-tokens/tokens";
import {
  BODY_ATLAS_MUSCLE_LABELS_UK,
  BODY_ATLAS_MUSCLE_SIDE,
  type BodyAtlasMuscleId,
  type BodyAtlasSide,
} from "@sergeant/fizruk-domain/data/bodyAtlas";

/** A single highlighted muscle entry. */
export interface ActiveMuscle {
  id: BodyAtlasMuscleId;
  /**
   * Highlight intensity, 0..1. 0 means "not highlighted" and falls back
   * to the baseline silhouette fill. 1 is the maximum accent colour.
   * Values in-between drive `fillOpacity` on the SVG shape.
   */
  intensity: number;
}

export interface BodyAtlasProps {
  /** Highlighted muscle groups. Defaults to none (plain silhouette). */
  muscles?: readonly ActiveMuscle[];
  /**
   * Which side to display. When provided, the component is controlled
   * and the built-in front/back toggle is hidden. When omitted,
   * a local state seeded to `"front"` powers the toggle buttons.
   */
  side?: BodyAtlasSide;
  /** Optional tap-through handler (receives the canonical muscle id). */
  onMusclePress?: (id: BodyAtlasMuscleId) => void;
  /** Height of the SVG viewport in px. Aspect-ratio is preserved. */
  height?: number;
  /** Show the side toggle (ignored when `side` is controlled). */
  showToggle?: boolean;
  /** testID prefix for tests (defaults to `"body-atlas"`). */
  testID?: string;
}

// Hex values live in the shared design tokens so web + mobile match.
// Shapes are painted through inline SVG attributes (not NativeWind),
// which is why we resolve hex strings eagerly here.
const ACCENT_HEX = "#14b8a6"; // teal-500 (Fizruk primary).
const SILHOUETTE_FILL = "#e7e5e4"; // warm neutral body colour.
const SILHOUETTE_STROKE = "#a8a29e"; // subtle warm-grey outline.

/** Clamp `n` into [min, max]. */
function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Build an a11y label like «Груди, інтенсивність 80%» (no suffix when
 * intensity is 0 so screen readers don't announce empty state).
 */
function buildAccessibilityLabel(
  id: BodyAtlasMuscleId,
  intensity: number,
): string {
  const label = BODY_ATLAS_MUSCLE_LABELS_UK[id];
  if (intensity <= 0) return label;
  const pct = Math.round(intensity * 100);
  return `${label}, інтенсивність ${pct}%`;
}

/**
 * Render one muscle shape. Shapes are declared as JSX so each muscle
 * can use the primitive that fits its silhouette (ellipse / rounded
 * rect / custom path) rather than a one-size-fits-all data table.
 */
interface MuscleShellProps {
  id: BodyAtlasMuscleId;
  intensity: number;
  onPress?: (id: BodyAtlasMuscleId) => void;
  children: GProps["children"];
  testID?: string;
}

function MuscleShell({
  id,
  intensity,
  onPress,
  children,
  testID,
}: MuscleShellProps) {
  const effective = clamp(intensity, 0, 1);
  return (
    <G
      onPress={onPress ? () => onPress(id) : undefined}
      fill={effective > 0 ? ACCENT_HEX : SILHOUETTE_FILL}
      fillOpacity={effective > 0 ? 0.35 + effective * 0.65 : 1}
      stroke={SILHOUETTE_STROKE}
      strokeWidth={0.75}
      accessible
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={buildAccessibilityLabel(id, effective)}
      testID={testID}
    >
      {children}
    </G>
  );
}

/**
 * Lookup helper — finds the intensity for a muscle id in the sparse
 * `muscles` list. Highest entry wins when duplicates sneak in (shouldn't
 * happen in normal data flow, but defensive anyway).
 */
function resolveIntensity(
  list: readonly ActiveMuscle[] | undefined,
  id: BodyAtlasMuscleId,
): number {
  if (!list || list.length === 0) return 0;
  let best = 0;
  for (const entry of list) {
    if (entry?.id !== id) continue;
    const v = clamp(entry.intensity, 0, 1);
    if (v > best) best = v;
  }
  return best;
}

/** Aspect ratio of the SVG viewport (height ÷ width). */
const VIEWPORT_RATIO = 420 / 200;

/**
 * Public BodyAtlas component — see file-level JSDoc for the design
 * rationale. This component deliberately avoids any web-only API
 * (`createBodyHighlighter`, `document`, Tailwind on SVG nodes).
 */
export function BodyAtlas({
  muscles,
  side: controlledSide,
  onMusclePress,
  height = 420,
  showToggle = true,
  testID = "body-atlas",
}: BodyAtlasProps) {
  const [uncontrolledSide, setUncontrolledSide] =
    useState<BodyAtlasSide>("front");
  const isControlled = controlledSide !== undefined;
  const side: BodyAtlasSide = controlledSide ?? uncontrolledSide;

  const width = Math.round(height / VIEWPORT_RATIO);

  // Precompute intensity for every muscle — cheap and keeps JSX terse.
  const iNeck = resolveIntensity(muscles, "neck");
  const iTrap = resolveIntensity(muscles, "trapezius");
  const iChest = resolveIntensity(muscles, "chest");
  const iFrontDelts = resolveIntensity(muscles, "front-deltoids");
  const iBackDelts = resolveIntensity(muscles, "back-deltoids");
  const iBiceps = resolveIntensity(muscles, "biceps");
  const iTriceps = resolveIntensity(muscles, "triceps");
  const iForearm = resolveIntensity(muscles, "forearm");
  const iAbs = resolveIntensity(muscles, "abs");
  const iObliques = resolveIntensity(muscles, "obliques");
  const iUpperBack = resolveIntensity(muscles, "upper-back");
  const iLowerBack = resolveIntensity(muscles, "lower-back");
  const iGluteal = resolveIntensity(muscles, "gluteal");
  const iQuads = resolveIntensity(muscles, "quadriceps");
  const iHamstring = resolveIntensity(muscles, "hamstring");
  const iAdductor = resolveIntensity(muscles, "adductor");
  const iAbductors = resolveIntensity(muscles, "abductors");
  const iCalves = resolveIntensity(muscles, "calves");

  return (
    <View className="gap-2" testID={testID}>
      {(!isControlled && showToggle) || (isControlled && showToggle) ? (
        <View className="flex-row items-center justify-center gap-2">
          <Pressable
            testID={`${testID}-toggle-front`}
            accessibilityRole="button"
            accessibilityLabel="Показати вигляд спереду"
            accessibilityState={{ selected: side === "front" }}
            onPress={
              isControlled ? undefined : () => setUncontrolledSide("front")
            }
            disabled={isControlled}
            className={
              side === "front"
                ? "px-3 py-1.5 rounded-full bg-teal-600"
                : "px-3 py-1.5 rounded-full border border-line bg-white"
            }
          >
            <Text
              className={
                side === "front"
                  ? "text-xs font-semibold text-white"
                  : "text-xs font-semibold text-fg"
              }
            >
              Спереду
            </Text>
          </Pressable>
          <Pressable
            testID={`${testID}-toggle-back`}
            accessibilityRole="button"
            accessibilityLabel="Показати вигляд ззаду"
            accessibilityState={{ selected: side === "back" }}
            onPress={
              isControlled ? undefined : () => setUncontrolledSide("back")
            }
            disabled={isControlled}
            className={
              side === "back"
                ? "px-3 py-1.5 rounded-full bg-teal-600"
                : "px-3 py-1.5 rounded-full border border-line bg-white"
            }
          >
            <Text
              className={
                side === "back"
                  ? "text-xs font-semibold text-white"
                  : "text-xs font-semibold text-fg"
              }
            >
              Ззаду
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View className="items-center justify-center">
        <Svg
          width={width}
          height={height}
          viewBox="0 0 200 420"
          testID={`${testID}-svg`}
        >
          {/* Silhouette baseline — head + torso + limbs outline. */}
          <G fill={SILHOUETTE_FILL} stroke={SILHOUETTE_STROKE} strokeWidth={1}>
            {/* Head */}
            <Circle cx="100" cy="38" r="22" />
            {/* Torso (rounded rect via Path) */}
            <Path d="M65 80 Q65 72 85 72 L115 72 Q135 72 135 80 L140 210 Q140 222 128 222 L72 222 Q60 222 60 210 Z" />
            {/* Hips */}
            <Path d="M65 218 L135 218 L142 260 L58 260 Z" />
            {/* Left leg */}
            <Path d="M66 258 L98 258 L96 400 L74 400 Z" />
            {/* Right leg */}
            <Path d="M102 258 L134 258 L126 400 L104 400 Z" />
            {/* Left arm */}
            <Path d="M40 90 L65 82 L68 200 L46 200 Z" />
            {/* Right arm */}
            <Path d="M160 90 L135 82 L132 200 L154 200 Z" />
          </G>

          {side === "front" ? (
            <G testID={`${testID}-front`}>
              {BODY_ATLAS_MUSCLE_SIDE.neck !== "back" ? (
                <MuscleShell
                  id="neck"
                  intensity={iNeck}
                  onPress={onMusclePress}
                  testID={`${testID}-muscle-neck`}
                >
                  <Rect x="90" y="58" width="20" height="14" rx="4" />
                </MuscleShell>
              ) : null}
              <MuscleShell
                id="trapezius"
                intensity={iTrap}
                onPress={onMusclePress}
                testID={`${testID}-muscle-trapezius`}
              >
                <Path d="M70 76 Q100 66 130 76 L126 86 Q100 78 74 86 Z" />
              </MuscleShell>
              <MuscleShell
                id="front-deltoids"
                intensity={iFrontDelts}
                onPress={onMusclePress}
                testID={`${testID}-muscle-front-deltoids`}
              >
                <Ellipse cx="60" cy="92" rx="14" ry="12" />
                <Ellipse cx="140" cy="92" rx="14" ry="12" />
              </MuscleShell>
              <MuscleShell
                id="chest"
                intensity={iChest}
                onPress={onMusclePress}
                testID={`${testID}-muscle-chest`}
              >
                <Ellipse cx="86" cy="110" rx="18" ry="14" />
                <Ellipse cx="114" cy="110" rx="18" ry="14" />
              </MuscleShell>
              <MuscleShell
                id="biceps"
                intensity={iBiceps}
                onPress={onMusclePress}
                testID={`${testID}-muscle-biceps`}
              >
                <Ellipse cx="54" cy="130" rx="10" ry="18" />
                <Ellipse cx="146" cy="130" rx="10" ry="18" />
              </MuscleShell>
              <MuscleShell
                id="forearm"
                intensity={iForearm}
                onPress={onMusclePress}
                testID={`${testID}-muscle-forearm`}
              >
                <Ellipse cx="52" cy="176" rx="9" ry="20" />
                <Ellipse cx="148" cy="176" rx="9" ry="20" />
              </MuscleShell>
              <MuscleShell
                id="abs"
                intensity={iAbs}
                onPress={onMusclePress}
                testID={`${testID}-muscle-abs`}
              >
                <Rect x="90" y="130" width="20" height="72" rx="6" />
              </MuscleShell>
              <MuscleShell
                id="obliques"
                intensity={iObliques}
                onPress={onMusclePress}
                testID={`${testID}-muscle-obliques`}
              >
                <Ellipse cx="78" cy="176" rx="8" ry="22" />
                <Ellipse cx="122" cy="176" rx="8" ry="22" />
              </MuscleShell>
              <MuscleShell
                id="quadriceps"
                intensity={iQuads}
                onPress={onMusclePress}
                testID={`${testID}-muscle-quadriceps`}
              >
                <Ellipse cx="82" cy="292" rx="14" ry="34" />
                <Ellipse cx="118" cy="292" rx="14" ry="34" />
              </MuscleShell>
              <MuscleShell
                id="adductor"
                intensity={iAdductor}
                onPress={onMusclePress}
                testID={`${testID}-muscle-adductor`}
              >
                <Ellipse cx="92" cy="282" rx="6" ry="22" />
                <Ellipse cx="108" cy="282" rx="6" ry="22" />
              </MuscleShell>
              <MuscleShell
                id="calves"
                intensity={iCalves}
                onPress={onMusclePress}
                testID={`${testID}-muscle-calves`}
              >
                <Ellipse cx="84" cy="370" rx="10" ry="22" />
                <Ellipse cx="116" cy="370" rx="10" ry="22" />
              </MuscleShell>
            </G>
          ) : (
            <G testID={`${testID}-back`}>
              <MuscleShell
                id="neck"
                intensity={iNeck}
                onPress={onMusclePress}
                testID={`${testID}-muscle-neck`}
              >
                <Rect x="90" y="58" width="20" height="14" rx="4" />
              </MuscleShell>
              <MuscleShell
                id="trapezius"
                intensity={iTrap}
                onPress={onMusclePress}
                testID={`${testID}-muscle-trapezius`}
              >
                <Path d="M72 76 Q100 68 128 76 L120 110 Q100 102 80 110 Z" />
              </MuscleShell>
              <MuscleShell
                id="back-deltoids"
                intensity={iBackDelts}
                onPress={onMusclePress}
                testID={`${testID}-muscle-back-deltoids`}
              >
                <Ellipse cx="60" cy="94" rx="14" ry="12" />
                <Ellipse cx="140" cy="94" rx="14" ry="12" />
              </MuscleShell>
              <MuscleShell
                id="upper-back"
                intensity={iUpperBack}
                onPress={onMusclePress}
                testID={`${testID}-muscle-upper-back`}
              >
                <Path d="M76 106 Q100 100 124 106 L132 166 Q100 160 68 166 Z" />
              </MuscleShell>
              <MuscleShell
                id="lower-back"
                intensity={iLowerBack}
                onPress={onMusclePress}
                testID={`${testID}-muscle-lower-back`}
              >
                <Rect x="82" y="170" width="36" height="44" rx="8" />
              </MuscleShell>
              <MuscleShell
                id="triceps"
                intensity={iTriceps}
                onPress={onMusclePress}
                testID={`${testID}-muscle-triceps`}
              >
                <Ellipse cx="54" cy="132" rx="10" ry="22" />
                <Ellipse cx="146" cy="132" rx="10" ry="22" />
              </MuscleShell>
              <MuscleShell
                id="forearm"
                intensity={iForearm}
                onPress={onMusclePress}
                testID={`${testID}-muscle-forearm`}
              >
                <Ellipse cx="52" cy="180" rx="9" ry="20" />
                <Ellipse cx="148" cy="180" rx="9" ry="20" />
              </MuscleShell>
              <MuscleShell
                id="gluteal"
                intensity={iGluteal}
                onPress={onMusclePress}
                testID={`${testID}-muscle-gluteal`}
              >
                <Ellipse cx="84" cy="238" rx="16" ry="16" />
                <Ellipse cx="116" cy="238" rx="16" ry="16" />
              </MuscleShell>
              <MuscleShell
                id="abductors"
                intensity={iAbductors}
                onPress={onMusclePress}
                testID={`${testID}-muscle-abductors`}
              >
                <Ellipse cx="66" cy="258" rx="7" ry="16" />
                <Ellipse cx="134" cy="258" rx="7" ry="16" />
              </MuscleShell>
              <MuscleShell
                id="hamstring"
                intensity={iHamstring}
                onPress={onMusclePress}
                testID={`${testID}-muscle-hamstring`}
              >
                <Ellipse cx="82" cy="300" rx="14" ry="34" />
                <Ellipse cx="118" cy="300" rx="14" ry="34" />
              </MuscleShell>
              <MuscleShell
                id="calves"
                intensity={iCalves}
                onPress={onMusclePress}
                testID={`${testID}-muscle-calves`}
              >
                <Ellipse cx="84" cy="370" rx="10" ry="22" />
                <Ellipse cx="116" cy="370" rx="10" ry="22" />
              </MuscleShell>
            </G>
          )}
        </Svg>
      </View>
    </View>
  );
}

/**
 * Re-export the design-tokens status palette alongside the component so
 * screens that want to map recovery status → intensity colour can do so
 * without adding another import line. Keeps the atlas a one-stop shop
 * for Fizruk consumers.
 */
export const BODY_ATLAS_STATUS_COLORS = statusColors;

export default BodyAtlas;
