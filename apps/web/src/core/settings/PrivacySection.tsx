import { useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { meApi, type UserPreferences } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { useFlag, setFlag } from "../lib/featureFlags";
import { clearPinHash, hasPinSet } from "../security/lockStorage";
import { useAppLockContext } from "../security/AppLockContext";
import { LegalLinks } from "../legal/LegalLinks";
import { ConfirmModal, SettingsGroup, ToggleRow } from "./SettingsPrimitives";

const m = messages.privacy.lock;

const DEFAULT_PREFERENCES: UserPreferences = {
  analytics: true,
  aiMemory: true,
  pushNotifications: false,
  updatedAt: null,
};

type PreferenceKey = "analytics" | "aiMemory" | "pushNotifications";

export function PrivacySection() {
  const appLock = useAppLockContext();
  const flagEnabled = useFlag("app-lock-enabled");
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [preferences, setPreferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] =
    useState<PreferenceKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    meApi
      .getPreferences()
      .then((next) => {
        if (cancelled) return;
        setPreferences(next);
        setPreferencesLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPreferencesLoaded(false);
        setPreferencesError(
          "Увійди в акаунт, щоб керувати серверними consent preferences.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      setFlag("app-lock-enabled", true);
      const has = await hasPinSet();
      if (!has) {
        appLock.startSetup();
      }
    } else {
      setDisableConfirmOpen(true);
    }
  };

  const handleDisableConfirm = async () => {
    setDisableConfirmOpen(false);
    setFlag("app-lock-enabled", false);
    await clearPinHash();
  };

  const updatePreference = async (key: PreferenceKey, checked: boolean) => {
    setPreferencesError(null);
    setSavingPreference(key);
    const previous = preferences;
    setPreferences({ ...previous, [key]: checked });
    try {
      const next = await meApi.updatePreferences({ [key]: checked });
      setPreferences(next);
      setPreferencesLoaded(true);
    } catch {
      setPreferences(previous);
      setPreferencesError("Не вдалося зберегти preference. Спробуй ще раз.");
    } finally {
      setSavingPreference(null);
    }
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

      <div className="space-y-3">
        <div>
          <h3 className="text-style-label text-text">Згода та privacy</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            Керуй серверними consent preferences для аналітики, AI memory і
            push-повідомлень. Essential cookies для входу, безпеки та billing
            залишаються активними.
          </p>
        </div>
        <ToggleRow
          label="Аналітика продукту"
          description={
            savingPreference === "analytics"
              ? "Зберігаю…"
              : "Допомагає бачити якість funnel, UX і стабільність."
          }
          checked={preferences.analytics}
          onChange={(checked) => void updatePreference("analytics", checked)}
        />
        <ToggleRow
          label="AI memory"
          description={
            savingPreference === "aiMemory"
              ? "Зберігаю…"
              : "Дозволяє персоналізувати AI-контекст між сесіями."
          }
          checked={preferences.aiMemory}
          onChange={(checked) => void updatePreference("aiMemory", checked)}
        />
        <ToggleRow
          label="Push-повідомлення"
          description={
            savingPreference === "pushNotifications"
              ? "Зберігаю…"
              : "Керує серверною згодою для нагадувань і системних пушів."
          }
          checked={preferences.pushNotifications}
          onChange={(checked) =>
            void updatePreference("pushNotifications", checked)
          }
        />
        {!preferencesLoaded && preferencesError ? (
          <p className="text-xs text-danger-strong" role="alert">
            {preferencesError}
          </p>
        ) : null}
        <LegalLinks compact className="justify-start" />
      </div>

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
