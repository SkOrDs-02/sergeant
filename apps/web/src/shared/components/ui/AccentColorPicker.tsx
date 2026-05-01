import { useState, useCallback, useEffect } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";
import { safeReadStringLS, safeWriteLS } from "../../lib/storage";

const ACCENT_COLOR_KEY = "sergeant_accent_color_v1";

export interface AccentColor {
  id: string;
  name: string;
  /** CSS custom property value (HSL without hsl()) */
  hsl: string;
  /** Preview color for the picker */
  preview: string;
}

const DEFAULT_ACCENT_COLORS: AccentColor[] = [
  { id: "emerald", name: "Смарагд", hsl: "158 64% 52%", preview: "#10B981" },
  { id: "teal", name: "Бірюза", hsl: "168 80% 37%", preview: "#14B8A6" },
  { id: "blue", name: "Синій", hsl: "217 91% 60%", preview: "#3B82F6" },
  { id: "violet", name: "Фіолет", hsl: "263 70% 50%", preview: "#8B5CF6" },
  { id: "rose", name: "Троянда", hsl: "350 89% 60%", preview: "#F43F5E" },
  { id: "orange", name: "Помаранч", hsl: "25 95% 53%", preview: "#F97316" },
  { id: "amber", name: "Бурштин", hsl: "38 92% 50%", preview: "#F59E0B" },
  { id: "lime", name: "Лайм", hsl: "84 81% 44%", preview: "#84CC16" },
];

interface AccentColorPickerProps {
  /** Available colors to choose from */
  colors?: AccentColor[];
  /** Currently selected color ID */
  value?: string;
  /** Called when a color is selected */
  onChange?: (color: AccentColor) => void;
  /** Show labels under colors */
  showLabels?: boolean;
  /** Size of color swatches */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

const sizes = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
};

/**
 * AccentColorPicker — allows users to customize the app's accent color.
 */
export function AccentColorPicker({
  colors = DEFAULT_ACCENT_COLORS,
  value,
  onChange,
  showLabels = false,
  size = "md",
  className,
}: AccentColorPickerProps) {
  const handleSelect = useCallback(
    (color: AccentColor) => {
      onChange?.(color);
    },
    [onChange],
  );

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {colors.map((color) => {
        const isSelected = value === color.id;
        return (
          <button
            key={color.id}
            type="button"
            onClick={() => handleSelect(color)}
            className={cn(
              "relative flex flex-col items-center gap-1.5",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded-xl",
            )}
            aria-label={color.name}
            aria-pressed={isSelected}
          >
            <div
              className={cn(
                "rounded-full transition-all duration-200",
                "border-2",
                sizes[size],
                isSelected
                  ? "border-text scale-110 shadow-md"
                  : "border-transparent hover:scale-105 hover:shadow-sm",
              )}
              style={{ backgroundColor: color.preview }}
            >
              {isSelected && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Icon
                    name="check"
                    size={size === "sm" ? 14 : size === "md" ? 16 : 20}
                    strokeWidth={3}
                    className="text-white drop-shadow-sm"
                  />
                </span>
              )}
            </div>
            {showLabels && (
              <span
                className={cn(
                  "text-xs",
                  isSelected ? "text-text font-medium" : "text-muted",
                )}
              >
                {color.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hook to manage accent color state and apply it to CSS custom properties.
 */
export function useAccentColor() {
  const [accentId, setAccentId] = useState<string>(() => {
    return safeReadStringLS(ACCENT_COLOR_KEY) || "emerald";
  });

  const accent =
    DEFAULT_ACCENT_COLORS.find((c) => c.id === accentId) ||
    DEFAULT_ACCENT_COLORS[0];

  // Apply accent color to CSS custom properties
  useEffect(() => {
    const root = document.documentElement;

    // Parse HSL values
    const [h, s, l] = accent.hsl.split(" ");

    // Set CSS custom properties
    root.style.setProperty("--accent", accent.hsl);
    root.style.setProperty("--accent-h", h);
    root.style.setProperty("--accent-s", s);
    root.style.setProperty("--accent-l", l);

    // Generate lighter/darker variants
    const lNum = parseInt(l);
    root.style.setProperty(
      "--accent-light",
      `${h} ${s} ${Math.min(95, lNum + 30)}%`,
    );
    root.style.setProperty(
      "--accent-dark",
      `${h} ${s} ${Math.max(20, lNum - 15)}%`,
    );

    // Save to localStorage
    safeWriteLS(ACCENT_COLOR_KEY, accentId);
  }, [accent, accentId]);

  const setAccent = useCallback((color: AccentColor) => {
    setAccentId(color.id);
  }, []);

  const reset = useCallback(() => {
    setAccentId("emerald");
  }, []);

  return {
    accent,
    accentId,
    setAccent,
    reset,
    colors: DEFAULT_ACCENT_COLORS,
  };
}

/**
 * AccentColorPickerCard — A card component with the picker and preview.
 */
export function AccentColorPickerCard({ className }: { className?: string }) {
  const { accent, accentId, setAccent, colors } = useAccentColor();

  return (
    <div
      className={cn("bg-panel border border-line rounded-2xl p-4", className)}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text">Акцентний колір</h3>
          <p className="text-xs text-muted mt-0.5">Поточний: {accent.name}</p>
        </div>
        {/* Preview */}
        <div
          className="w-8 h-8 rounded-xl shadow-sm"
          style={{ backgroundColor: accent.preview }}
        />
      </div>

      <AccentColorPicker
        colors={colors}
        value={accentId}
        onChange={setAccent}
        size="md"
        showLabels={false}
      />

      {/* Preview elements */}
      <div className="mt-4 pt-4 border-t border-line">
        <p className="text-xs text-muted mb-2">Приклад елементів:</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm font-medium rounded-xl transition-colors"
            style={{
              backgroundColor: accent.preview,
              color: "white",
            }}
          >
            Кнопка
          </button>
          <span
            className="text-sm font-medium"
            style={{ color: accent.preview }}
          >
            Посилання
          </span>
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: accent.preview }}
          />
        </div>
      </div>
    </div>
  );
}
