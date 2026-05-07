import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
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
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // PR-18 / §C12 — два чітко розділені affordance-и в Settings → Онбординг:
  //   1. Екскурсія (read-only replay) — нічого не зачіпає, просто перепоказ
  //      welcome-екрана.
  //   2. Скидання FTUX-підказок — повертає user-а до vibe-picks/first-action
  //      flags, модульні дані залишаються. Завжди через confirm-modal.
  const handleResetConfirm = () => {
    resetOnboardingState(webKVStore);
    setResetConfirmOpen(false);
    toast.success(messages.onboarding.tourResetSuccess);
    try {
      window.location.assign("/welcome");
    } catch {
      /* noop */
    }
  };

  return (
    <SettingsGroup title="Загальні" emoji="⚙️">
      <SettingsSubGroup title={messages.onboarding.tourSettingsTitle}>
        <p className="text-xs text-subtle leading-snug">
          {messages.onboarding.tourCopyExplanation}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 w-full justify-center gap-2"
          onClick={() => setTourOpen(true)}
        >
          <Icon name="compass" size={16} />
          {messages.onboarding.tourLaunchLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 w-full justify-center gap-2"
          onClick={() => setResetConfirmOpen(true)}
        >
          <Icon name="refresh-cw" size={16} />
          {messages.onboarding.tourResetLabel}
        </Button>
      </SettingsSubGroup>
      {tourOpen && (
        <OnboardingWizard mode="tour" onDone={() => setTourOpen(false)} />
      )}
      <ConfirmDialog
        open={resetConfirmOpen}
        title={messages.onboarding.tourResetConfirmTitle}
        description={messages.onboarding.tourResetConfirmDescription}
        confirmLabel={messages.onboarding.tourResetConfirmAction}
        danger={false}
        onConfirm={handleResetConfirm}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </SettingsGroup>
  );
}
