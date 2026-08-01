import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import {
  resolveLsStore,
  safeRemoveSS,
  webKVStore,
} from "@shared/lib/storage/storage";
import { resetOnboardingState, type User } from "@sergeant/shared";
import { CAPABILITIES_PATH } from "../app/appPaths";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

export interface GeneralSectionProps {
  user: User | null;
}

const HINT_SHOWN_THIS_SESSION_KEY = "sergeant:hints:shown-this-session";

export function GeneralSection({ user: _user }: GeneralSectionProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Два чітко розділені affordance-и в Settings → Онбординг:
  //   1. Огляд можливостей — читальний каталог `/capabilities`, нічого не
  //      зачіпає. До 2026-08-01 тут був `OnboardingWizard mode="tour"`, який
  //      просто переграв вітальний екран: користувач очікував розповіді про
  //      функціонал, а отримував повтор привітання.
  //   2. Скидання FTUX-підказок — повертає user-а до vibe-picks/first-action
  //      flags, модульні дані залишаються. Завжди через confirm-modal.
  const handleResetConfirm = () => {
    resetOnboardingState(webKVStore);
    const durableMirror = resolveLsStore();
    if (durableMirror) resetOnboardingState(durableMirror);
    safeRemoveSS(HINT_SHOWN_THIS_SESSION_KEY);
    setResetConfirmOpen(false);
    toast.success(messages.onboarding.tourResetSuccess);
    try {
      window.location.assign("/welcome");
    } catch {
      /* noop */
    }
  };

  return (
    <SettingsGroup title="Загальні" icon="settings">
      <SettingsSubGroup title={messages.onboarding.tourSettingsTitle}>
        <p className="text-style-caption text-subtle leading-snug">
          {messages.onboarding.tourCopyExplanation}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 w-full justify-center gap-2"
          onClick={() => navigate(CAPABILITIES_PATH)}
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
