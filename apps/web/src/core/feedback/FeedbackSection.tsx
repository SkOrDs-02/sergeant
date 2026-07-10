/**
 * @status Active
 * @owner @Skords-01
 */
import { useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { trackEvent } from "../observability/analytics";
import {
  SettingsGroup,
  SettingsSubGroup,
} from "../settings/SettingsPrimitives";
import { FeedbackDialog } from "./FeedbackDialog";

/**
 * Settings-секція feedback-віджета (GTM § 3.2). Entry point у самому
 * доступному глобальному місці — Settings → «Загальні» таб; окремий
 * floating-button свідомо не робимо, щоб не з'їдати екран на mobile
 * (FAB вже зайнятий асистентом — див. `HubChatOverlay`).
 *
 * `feedback_widget_opened` — чисельник funnel-а
 * (`opened ≥ submitted`); стріляє на кожне відкриття діалогу.
 */
export function FeedbackSection() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpen = () => {
    trackEvent(ANALYTICS_EVENTS.FEEDBACK_WIDGET_OPENED, {
      source: "settings",
    });
    setDialogOpen(true);
  };

  return (
    <SettingsGroup
      title={messages.feedback.settingsTitle}
      icon="message-circle"
    >
      <SettingsSubGroup
        title={messages.feedback.settingsSubGroupTitle}
        defaultOpen
      >
        <p className="text-xs text-subtle leading-snug">
          {messages.feedback.settingsDescription}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 w-full justify-center gap-2"
          onClick={handleOpen}
        >
          <Icon name="message-circle" size={16} />
          {messages.feedback.openButton}
        </Button>
      </SettingsSubGroup>
      <FeedbackDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </SettingsGroup>
  );
}
