import { useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { meApi, type UserPreferences } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { useFlag, setFlag } from "../lib/featureFlags";
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
          "Увійди в акаунт, щоб керувати налаштуваннями згоди на сервері.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      setFlag("app-lock-enabled", true);
      // Audit F16: check the *current user's* PIN partition, not `anon`.
      // `appLock.hasPin()` closes over `user?.id` from `useAppLock`.
      const has = await appLock.hasPin();
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
    // Audit F16: clear the current user's credential, not the `anon` slot.
    await appLock.disablePin();
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
      setPreferencesError("Не вдалося зберегти налаштування. Спробуй ще раз.");
    } finally {
      setSavingPreference(null);
    }
  };

  return (
    <SettingsGroup title={m.sectionTitle} icon="lock">
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
          <h3 className="text-style-label text-text">
            Згода, дані та сповіщення
          </h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            Обери, що Sergeant може використовувати для якості продукту,
            персоналізації та нагадувань. Дані для входу, безпеки й оплати
            залишаються потрібними для роботи застосунку.
          </p>
        </div>
        <ToggleRow
          label="Аналітика продукту"
          description={
            savingPreference === "analytics"
              ? "Зберігаю…"
              : "Допомагає бачити, де інтерфейс незручний або ламається."
          }
          checked={preferences.analytics}
          onChange={(checked) => void updatePreference("analytics", checked)}
        />
        <ToggleRow
          label="Памʼять для ШІ"
          description={
            savingPreference === "aiMemory"
              ? "Зберігаю…"
              : "Дозволяє ШІ памʼятати корисні факти між сесіями, щоб відповіді були точнішими."
          }
          checked={preferences.aiMemory}
          onChange={(checked) => void updatePreference("aiMemory", checked)}
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
