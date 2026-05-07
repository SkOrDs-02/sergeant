import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { webKVStore } from "@shared/lib/storage/storage";
import { resetOnboardingState, type User } from "@sergeant/shared";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

export interface GeneralSectionProps {
  user: User | null;
}

export function GeneralSection({ user: _user }: GeneralSectionProps) {
  const toast = useToast();
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <SettingsGroup title="Загальні" emoji="⚙️">
      <SettingsSubGroup title="Онбординг">
        <p className="text-xs text-subtle leading-snug">
          Подивитись tour - побачити вітальний екран ще раз без скидання твого
          стану. Перезапуск не видаляє твої дані - повертає вітальний екран і
          підказки першого запуску.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 w-full justify-center gap-2"
          onClick={() => setTourOpen(true)}
        >
          <Icon name="compass" size={16} />
          Подивитись tour
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 w-full"
          onClick={() => {
            resetOnboardingState(webKVStore);
            toast.success("Онбординг перезапущено");
            try {
              window.location.assign("/welcome");
            } catch {
              /* noop */
            }
          }}
        >
          Перезапустити онбординг
        </Button>
      </SettingsSubGroup>
      {tourOpen && (
        <OnboardingWizard mode="tour" onDone={() => setTourOpen(false)} />
      )}
    </SettingsGroup>
  );
}
