/**
 * Biometrics — hub-level form for the inputs Nutrition needs to run
 * the Mifflin-St Jeor BMR/TDEE estimate (height, birth-date, sex,
 * activity level, current weight). Lives on Profile so a user without
 * the Fizruk module still has a place to enter and edit them — see the
 * design discussion in `biometrics-storage-plan.md`.
 *
 * Weight in particular round-trips to Fizruk Body's `daily_log`
 * (`fizruk_daily_log_v1`): saving here writes today's entry, and a
 * Fizruk-side weigh-in updates the value displayed here. The dual-write
 * lives in `biometrics.ts` so this component only orchestrates the
 * form — no cross-module knowledge leaks into the JSX.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { Select } from "@shared/components/ui/Select";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { useDailyLog } from "../../modules/fizruk/hooks/useDailyLog";
import {
  ACTIVITY_LEVELS,
  SEX_VALUES,
  computeAgeYears,
  isBiometricsCompleteForTdee,
  type ActivityLevel,
  type Biometrics,
  type Sex,
} from "./biometrics";
import { useBiometrics } from "./useBiometrics";

const COPY = messages.biometrics;

const SEX_LABEL: Record<Sex, string> = {
  male: COPY.sexMale,
  female: COPY.sexFemale,
};

interface ActivityMeta {
  label: string;
  hint: string;
}

const ACTIVITY_META: Record<ActivityLevel, ActivityMeta> = {
  sedentary: {
    label: COPY.activitySedentaryLabel,
    hint: COPY.activitySedentaryHint,
  },
  light: {
    label: COPY.activityLightLabel,
    hint: COPY.activityLightHint,
  },
  moderate: {
    label: COPY.activityModerateLabel,
    hint: COPY.activityModerateHint,
  },
  active: {
    label: COPY.activityActiveLabel,
    hint: COPY.activityActiveHint,
  },
  very_active: {
    label: COPY.activityVeryActiveLabel,
    hint: COPY.activityVeryActiveHint,
  },
};

interface FormState {
  heightCm: string;
  birthDate: string;
  sex: Sex | "";
  activityLevel: ActivityLevel | "";
  weightKg: string;
}

function biometricsToForm(b: Biometrics): FormState {
  return {
    heightCm: b.heightCm == null ? "" : String(b.heightCm),
    birthDate: b.birthDate ?? "",
    sex: b.sex ?? "",
    activityLevel: b.activityLevel ?? "",
    weightKg: b.weightKg == null ? "" : String(b.weightKg),
  };
}

function parseNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/**
 * Returns `null` when every form field matches its persisted source
 * (no dirty state). Otherwise returns the diff to feed into
 * `saveBiometrics`. Computed in a `useMemo` so the "Зберегти" button's
 * disabled state stays in lockstep with the form without a separate
 * `dirty` flag drifting out of sync.
 */
function diffFormAgainst(
  form: FormState,
  source: Biometrics,
):
  | (Partial<Omit<Biometrics, "updatedAt" | "weightUpdatedAt">> & {
      changed: true;
    })
  | null {
  const patch: Partial<Omit<Biometrics, "updatedAt" | "weightUpdatedAt">> = {};
  let changed = false;

  const formHeight = parseNumberOrNull(form.heightCm);
  if (formHeight !== source.heightCm) {
    patch.heightCm = formHeight;
    changed = true;
  }

  const formBirthDate = form.birthDate.trim() === "" ? null : form.birthDate;
  if (formBirthDate !== source.birthDate) {
    patch.birthDate = formBirthDate;
    changed = true;
  }

  const formSex: Sex | null = form.sex === "" ? null : form.sex;
  if (formSex !== source.sex) {
    patch.sex = formSex;
    changed = true;
  }

  const formActivity: ActivityLevel | null =
    form.activityLevel === "" ? null : form.activityLevel;
  if (formActivity !== source.activityLevel) {
    patch.activityLevel = formActivity;
    changed = true;
  }

  const formWeight = parseNumberOrNull(form.weightKg);
  if (formWeight !== source.weightKg) {
    patch.weightKg = formWeight;
    changed = true;
  }

  if (!changed) return null;
  return { ...patch, changed: true };
}

export interface BiometricsSectionProps {
  /**
   * Reflects the page-level "Ви офлайн" banner — biometrics is a pure
   * client-side store so editing works offline, but the disabled state
   * mirrors the rest of Profile for visual consistency.
   */
  online?: boolean;
}

export function BiometricsSection({ online = true }: BiometricsSectionProps) {
  const { biometrics, saveBiometrics } = useBiometrics();
  // Weight is the only field that round-trips to Fizruk Body — saving
  // a new value here logs a daily-log entry through the canonical
  // fizruk hook (which in turn calls `mirrorWeightToBiometrics` to
  // keep this section's snapshot in sync). Funnelling the cross-module
  // write through `useDailyLog` keeps the SQLite overlay (PR #030,
  // storage-roadmap) transparent — `biometrics.ts` no longer touches
  // `STORAGE_KEYS.FIZRUK_DAILY_LOG` directly.
  const { addEntry: addDailyLogEntry } = useDailyLog();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() =>
    biometricsToForm(biometrics),
  );

  // Whenever the persisted record changes from outside the form (Fizruk
  // weigh-in, cross-tab sync, CloudSync pull) reset the form to the new
  // source-of-truth. Editing a single field doesn't lose the user's
  // input either: the dependency array is the persisted record, not the
  // form state, so typing into "heightCm" doesn't re-trigger the reset.
  useEffect(() => {
    setForm(biometricsToForm(biometrics));
  }, [biometrics]);

  const diff = useMemo(
    () => diffFormAgainst(form, biometrics),
    [form, biometrics],
  );
  const dirty = diff !== null;

  const ageYears = useMemo(
    () => computeAgeYears(biometrics.birthDate),
    [biometrics.birthDate],
  );
  const tdeeReady = isBiometricsCompleteForTdee(biometrics);

  const handleSave = () => {
    if (!diff) return;
    const { changed: _changed, weightKg, ...rest } = diff;
    void _changed;
    const weightInPatch = Object.prototype.hasOwnProperty.call(
      diff,
      "weightKg",
    );
    try {
      // Weight first: addEntry mirrors back into biometrics with its
      // own `at` timestamp, so we want that write to land before the
      // non-weight save (which preserves `weightUpdatedAt`). When the
      // user clears the weight to `null` we still want the rest of the
      // form to persist, but we don't write a `null` daily-log entry
      // (Profile "clear" is a snapshot edit, not a journal deletion).
      if (weightInPatch && weightKg != null) {
        addDailyLogEntry({ weightKg });
      }
      if (Object.keys(rest).length > 0 || (weightInPatch && weightKg == null)) {
        // Pass the weight clear through so `weightKg: null` and
        // `weightUpdatedAt` get bumped; otherwise just the non-weight
        // fields go to biometrics.
        const patch =
          weightInPatch && weightKg == null
            ? { ...rest, weightKg: null }
            : rest;
        saveBiometrics(patch);
      }
      toast.success(COPY.saveSuccess);
    } catch {
      toast.error(COPY.saveError);
    }
  };

  const editingDisabled = !online;

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-2 border-b border-line">
        <Icon name="activity" size={18} className="text-muted" />
        <span className="text-style-label text-text">{COPY.sectionTitle}</span>
        <span className="ml-auto text-2xs text-muted">
          {tdeeReady ? COPY.statusReady : COPY.statusIncomplete}
        </span>
      </div>

      <div className="divide-y divide-line/60">
        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-height"
            className="text-style-caption block text-muted"
          >
            {COPY.heightLabel}
          </label>
          <Input
            id="biometrics-height"
            type="number"
            inputMode="numeric"
            min={80}
            max={260}
            step={1}
            value={form.heightCm}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, heightCm: e.target.value }))
            }
            placeholder="175"
            disabled={editingDisabled}
          />
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-birth-date"
            className="text-style-caption block text-muted"
          >
            {COPY.birthDateLabel}
          </label>
          <Input
            id="biometrics-birth-date"
            type="date"
            value={form.birthDate}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, birthDate: e.target.value }))
            }
            disabled={editingDisabled}
            helperText={
              ageYears != null
                ? `${COPY.ageLabel}: ${ageYears} ${COPY.ageYearsSuffix}`
                : undefined
            }
          />
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-sex"
            className="text-style-caption block text-muted"
          >
            {COPY.sexLabel}
          </label>
          <Select
            id="biometrics-sex"
            value={form.sex}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                sex: (e.target.value as Sex | "") ?? "",
              }))
            }
            disabled={editingDisabled}
          >
            <option value="">{COPY.sexPlaceholder}</option>
            {SEX_VALUES.map((value) => (
              <option key={value} value={value}>
                {SEX_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-activity"
            className="text-style-caption block text-muted"
          >
            {COPY.activityLabel}
          </label>
          <Select
            id="biometrics-activity"
            value={form.activityLevel}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                activityLevel: (e.target.value as ActivityLevel | "") ?? "",
              }))
            }
            disabled={editingDisabled}
          >
            <option value="">{COPY.activityPlaceholder}</option>
            {ACTIVITY_LEVELS.map((value) => (
              <option key={value} value={value}>
                {ACTIVITY_META[value].label}
              </option>
            ))}
          </Select>
          {form.activityLevel !== "" && (
            <p className="text-xs text-muted">
              {ACTIVITY_META[form.activityLevel].hint}
            </p>
          )}
        </div>

        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="biometrics-weight"
            className="text-style-caption block text-muted"
          >
            {COPY.weightLabel}
          </label>
          <Input
            id="biometrics-weight"
            type="number"
            inputMode="decimal"
            min={20}
            max={400}
            step={0.1}
            value={form.weightKg}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, weightKg: e.target.value }))
            }
            placeholder="75.5"
            disabled={editingDisabled}
            helperText={COPY.weightSyncHint}
          />
        </div>

        <div className="px-4 py-4 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || editingDisabled}
            onClick={handleSave}
          >
            {COPY.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}
