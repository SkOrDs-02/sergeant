import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { webKVStore } from "@shared/lib/storage/storage";
import { resetOnboardingState, type User } from "@sergeant/shared";
import { useAuth } from "../auth/AuthContext";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

export interface GeneralSectionProps {
  user: User | null;
}

export function GeneralSection({ user }: GeneralSectionProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
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
      {user && (
        <SettingsSubGroup title="Хмарна синхронізація" defaultOpen>
          <p className="text-xs text-subtle leading-snug">
            Нові зміни пишуться у v2 чергу і флюшаться фоново. Ручні v1 кнопки
            збереження / завантаження прибрано, бо legacy sync канал закритий.
          </p>
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="h-10 w-full justify-center gap-2"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            <Icon name="log-out" size={16} />
            {loggingOut ? messages.loadingActions.exiting : "Вийти"}
          </Button>
        </SettingsSubGroup>
      )}
      {tourOpen && (
        <OnboardingWizard mode="tour" onDone={() => setTourOpen(false)} />
      )}
    </SettingsGroup>
  );
}
