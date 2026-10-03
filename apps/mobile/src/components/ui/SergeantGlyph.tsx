/**
 * SergeantGlyph — гліф AI-шару на mobile: три шеврони сержанта з
 * `BrandLogo` (web), стиснуті в сітку 24, плюс крапка статусу заливкою.
 *
 * Дзеркало `Icon name="sergeant"` з web (`Icon.paths.status.tsx`). Замінює
 * lucide `Sparkles` як маркер «це зробив Сержант» — рішення власника
 * 2026-09-01 (анти-слоп аудит, F2/Q1): іскра — індустріальний дефолт
 * Gemini / Notion / Copilot, тобто чужий символ на головному
 * диференціаторі продукту. Святкові стани (`FirstEntryCelebrationModal`)
 * іскру лишають — це не маркер AI.
 *
 * Status: Active
 */

import Svg, { Circle, Path } from "react-native-svg";

interface SergeantGlyphProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

export function SergeantGlyph({
  size = 18,
  color,
  strokeWidth = 2,
}: SergeantGlyphProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={12} cy={3.5} r={1.6} fill={color} />
      <Path
        d="M5 11l7-4 7 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 16l7-4 7 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 21l7-4 7 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
