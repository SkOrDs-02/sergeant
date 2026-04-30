import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { webKVStore } from "@shared/lib/storage";
import { resetOnboardingState, type User } from "@sergeant/shared";
import { useAuth } from "../auth/AuthContext";
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
          Перезапуск не видаляє твої дані — лише повертає вітальний екран та
          підказки першого запуску.
        </p>
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
    </SettingsGroup>
  );
}
