import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { useFlag, setFlag } from "../lib/featureFlags";
import { clearPinHash, hasPinSet } from "../security/lockStorage";
import { useAppLockContext } from "../security/AppLockContext";
import { ConfirmModal, SettingsGroup, ToggleRow } from "./SettingsPrimitives";

const m = messages.privacy.lock;

export function PrivacySection() {
  const appLock = useAppLockContext();
  const flagEnabled = useFlag("app-lock-enabled");
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      setFlag("app-lock-enabled", true);
      const has = await hasPinSet();
      if (!has) {
        appLock.startSetup();
      }
    } else {
      // Require confirmation before clearing the PIN
      setDisableConfirmOpen(true);
    }
  };

  const handleDisableConfirm = async () => {
    setDisableConfirmOpen(false);
    setFlag("app-lock-enabled", false);
    await clearPinHash();
  };

  return (
    <SettingsGroup title={m.sectionTitle} emoji="🔒">
      <ToggleRow
        label={m.enableLabel}
        description={m.enableDescription}
        checked={flagEnabled}
        onChange={handleToggle}
      />

      {flagEnabled && (
        <div className="flex flex-col gap-3 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={appLock.startChange}
            className="self-start text-brand"
          >
            {m.changePin}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={appLock.lock}
            className="self-start text-muted"
          >
            {m.lockNow}
          </Button>
        </div>
      )}

      <ConfirmModal
        open={disableConfirmOpen}
        title={m.disableConfirmTitle}
        body={m.disableConfirmBody}
        confirmLabel={m.disableConfirmButton}
        danger
        onConfirm={handleDisableConfirm}
        onCancel={() => setDisableConfirmOpen(false)}
      />
    </SettingsGroup>
  );
}
