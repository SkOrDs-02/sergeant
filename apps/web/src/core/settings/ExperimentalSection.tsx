import { useSyncExternalStore } from "react";
import { z } from "zod";
import { messages } from "@shared/i18n/uk";
import { Icon } from "@shared/components/ui/Icon";
import { createTypedStore } from "../../shared/lib/storage/typedStore";
import { FLAG_REGISTRY, setFlag, useAllFlags } from "../lib/featureFlags";
import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";

// Збереження «користувач визнав ризик експериментальних фіч». Живе
// поверх typedStore, аби отримати ту саму валідацію / cross-tab sync, що й
// решта Hub-стейту. Версіонування дозволить у майбутньому розширити шейп
// (наприклад, фіксувати timestamp або версію застереження). PR-36 ux-roast
// 2026-Q2 / §9.3.
const AcknowledgmentSchema = z.object({ acknowledged: z.boolean() });
type Acknowledgment = z.infer<typeof AcknowledgmentSchema>;

const acknowledgmentStore = createTypedStore<Acknowledgment>({
  key: "hub_experimental_acknowledged_v1",
  version: 1,
  schema: AcknowledgmentSchema,
  defaultValue: { acknowledged: false },
});

function useExperimentalAcknowledged(): boolean {
  return useSyncExternalStore(
    (onChange) => acknowledgmentStore.subscribe(onChange),
    () => acknowledgmentStore.get().acknowledged,
    () => acknowledgmentStore.get().acknowledged,
  );
}

function setExperimentalAcknowledged(next: boolean): void {
  acknowledgmentStore.set({ acknowledged: next });
}

/**
 * Секція «Експериментальне» у Settings. Рендерить FLAG_REGISTRY як toggle-
 * рядки. Нові експериментальні фічі з'являються тут автоматично — достатньо
 * додати запис у реєстр.
 *
 * UX-roast 2026-Q2 / §9.3: до першого підтвердження ризику тумблери
 * заблоковані, banner з попередженням завжди видно. Після одного opt-in
 * стан зберігається на пристрої й секція поводиться як звичайна група.
 */
export function ExperimentalSection() {
  const flags = useAllFlags();
  const acknowledged = useExperimentalAcknowledged();
  const items = FLAG_REGISTRY.filter((f) => f.experimental);
  if (items.length === 0) return null;

  const copy = messages.experimentalSection;
  const togglesDisabled = !acknowledged;

  return (
    <SettingsGroup title={copy.title} emoji="🧪">
      <p className="text-xs text-subtle leading-snug">{copy.intro}</p>
      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5"
      >
        <Icon
          name="alert-triangle"
          size={16}
          className="text-warn shrink-0 mt-0.5"
          aria-hidden
        />
        <p className="text-xs text-text leading-snug">{copy.warningBanner}</p>
      </div>
      {!acknowledged && (
        <div className="flex items-start gap-3 text-text">
          <input
            id="experimental-opt-in"
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setExperimentalAcknowledged(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-brand cursor-pointer"
            data-testid="experimental-opt-in"
          />
          <label
            htmlFor="experimental-opt-in"
            className="flex-1 min-w-0 cursor-pointer"
          >
            <span className="text-style-label block">{copy.optInLabel}</span>
            <span className="text-xs text-subtle mt-1 block leading-relaxed">
              {copy.optInHint}
            </span>
          </label>
        </div>
      )}
      <div
        className="space-y-4"
        aria-disabled={togglesDisabled || undefined}
        // Поки користувач не визнав ризик — тумблери видимі, але tap-and-flip
        // без ефекту: setFlag-no-op гасить взаємодію, opacity натякає, що
        // секція розблоковується чекбоксом вище.
        style={togglesDisabled ? { opacity: 0.55 } : undefined}
      >
        {items.map((flag) => (
          <ToggleRow
            key={flag.id}
            label={flag.label}
            description={flag.description}
            checked={Boolean(flags[flag.id])}
            onChange={(checked) => {
              if (togglesDisabled) return;
              setFlag(flag.id, checked);
            }}
          />
        ))}
      </div>
    </SettingsGroup>
  );
}

export const __experimentalAcknowledgmentStoreForTests = acknowledgmentStore;
