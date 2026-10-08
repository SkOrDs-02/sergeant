/**
 * Last validated: 2026-05-14
 * Status: Active
 */
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
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Switch } from "@shared/components/ui/Switch";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { useDailyLog } from "../../modules/fizruk/hooks/useDailyLog";
import { isBiometricsCompleteForTdee } from "./biometrics";
import {
  BiometricsFormFields,
  persistBiometricsDiff,
  useBiometricsForm,
} from "./BiometricsFormFields";
import { useBiometrics } from "./useBiometrics";

const COPY = messages.biometrics;

export interface BiometricsSectionProps {
  /**
   * Reflects the page-level "Офлайн" banner — biometrics is a pure
   * client-side store so editing works offline, but the disabled state
   * mirrors the rest of Profile for visual consistency.
   */
  online?: boolean;
}

export function BiometricsSection({ online = true }: BiometricsSectionProps) {
  const { biometrics, saveBiometrics } = useBiometrics();
  // Вага - єдине поле, що їде у Фізрук: запис іде через канонічний
  // fizruk-хук, який дзеркалить її назад у біометрику.
  const { addEntry: addDailyLogEntry } = useDailyLog();
  const toast = useToast();
  const formState = useBiometricsForm(biometrics);
  const tdeeReady = isBiometricsCompleteForTdee(biometrics);

  const handleSave = () => {
    if (!formState.diff) return;
    try {
      persistBiometricsDiff(formState.diff, {
        saveBiometrics,
        addDailyLogEntry,
      });
      toast.success(COPY.saveSuccess);
    } catch {
      // Значення лишились у полях форми, тож повтор шле рівно те саме.
      toast.error(COPY.saveError, undefined, {
        label: "Повторити",
        onClick: () => void handleSave(),
      });
    }
  };

  const editingDisabled = !online;

  return (
    <Card
      radius="lg"
      padding="none"
      className="min-w-0 max-w-full overflow-hidden"
    >
      {/* V-4 (2026-08-08) — той самий фікс, що й `MemoryBankSection.tsx`
          (канонічний коментар там): `COPY.sectionTitle` тут дослівно
          збігався з зовнішнім заголовком «Біометрія» в `ProfilePage.tsx`
          і малювався `text-style-label`, більшим за `xs`-кікер
          `CollapsibleSection`. Прибрано; іконка й статус готовності TDEE
          (мета-інформація) лишились. */}
      <div className="px-4 py-3.5 flex items-center gap-2 border-b border-line">
        <Icon name="activity" size={18} className="text-muted" />
        <span className="ml-auto text-style-caption text-muted">
          {tdeeReady ? COPY.statusReady : COPY.statusIncomplete}
        </span>
      </div>

      <div className="divide-y divide-line/60">
        <BiometricsFormFields
          state={formState}
          disabled={editingDisabled}
          afterActivity={
            /* Тумблер стоїть поруч із рівнем активності, бо він про ту саму
               модель розрахунку: увімкнений, він забирає тренування з
               множника і повертає їх явним доданком. */
            <div className="px-4 py-4 space-y-2">
              <Switch
                checked={formState.form.countWorkoutsInGoal}
                onChange={(checked) =>
                  formState.setForm((prev) => ({
                    ...prev,
                    countWorkoutsInGoal: checked,
                  }))
                }
                disabled={editingDisabled}
                label={COPY.countWorkoutsLabel}
                description={COPY.countWorkoutsHint}
              />
            </div>
          }
        />

        <div className="px-4 py-4 flex items-center justify-end gap-2">
          <Button
            variant="solid"
            size="sm"
            disabled={!formState.dirty || editingDisabled}
            onClick={handleSave}
          >
            {COPY.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}
