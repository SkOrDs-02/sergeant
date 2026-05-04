import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { webKVStore } from "@shared/lib/storage/storage";
import { resetOnboardingState, type User } from "@sergeant/shared";
import { useAuth } from "../auth/AuthContext";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

export interface GeneralSectionProps {
  syncing: boolean;
  onSync: () => void;
  onPull: () => void;
  user: User | null;
}

export function GeneralSection({
  syncing,
  onSync,
  onPull,
  user,
}: GeneralSectionProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  // Tour replay (S4.5): show the welcome wizard in read-only mode so
  // users can re-watch the FTUX without resetting their state.
  // Distinct from "Перезапустити онбординг", which wipes vibe picks +
  // first-action flags and routes to /welcome.
  const [tourOpen, setTourOpen] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      toast.success("Ви вийшли з акаунта");
      navigate("/", { replace: true });
    } catch {
      toast.error("Не вдалося вийти, спробуйте ще раз");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <SettingsGroup title="Загальні" emoji="⚙️">
      <SettingsSubGroup title="Онбординг">
        <p className="text-xs text-subtle leading-snug">
          Подивитись tour — побачити вітальний екран ще раз без скидання твого
          стану. Перезапуск не видаляє твої дані — повертає вітальний екран і
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
      {user && (
        <SettingsSubGroup title="Хмарна синхронізація" defaultOpen>
          <p className="text-xs text-subtle leading-snug">
            Основний спосіб зберегти дані — синхронізація з твоїм акаунтом.
            Покриває Фінік, Фізрук, Рутину та Харчування.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 flex-1"
              disabled={syncing}
              onClick={onSync}
            >
              {syncing ? "Зберігаємо…" : "Зберегти в хмару"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 flex-1"
              disabled={syncing}
              onClick={onPull}
            >
              {syncing ? "Завантаження…" : "Завантажити з хмари"}
            </Button>
          </div>
          {/* Quick logout: lives next to sync because both actions belong
              to the "current cloud session" mental model and both are
              gated on `user`. Previously logout was buried 4 taps deep
              (Profile → Видалення акаунта → expand → onLogout from
              `DangerZoneSection`'s post-delete handler). The destructive
              `Account-deletion` path stays where it is — this only
              surfaces a plain sign-out. */}
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="h-10 w-full justify-center gap-2"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            <Icon name="log-out" size={16} />
            {loggingOut ? "Виходимо…" : "Вийти"}
          </Button>
        </SettingsSubGroup>
      )}
      {tourOpen && (
        <OnboardingWizard mode="tour" onDone={() => setTourOpen(false)} />
      )}
    </SettingsGroup>
  );
}
