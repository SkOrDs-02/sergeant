import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { SIGN_IN_PATH } from "../app/appPaths";
import { useAuth } from "../auth/AuthContext";
import { BiometricsSection } from "./BiometricsSection";
import { ChangePasswordSection } from "./ChangePasswordSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { MemoryBankSection } from "./MemoryBankSection";
import { PersonalInfoSection } from "./PersonalInfoSection";
import { SessionsSection } from "./SessionsSection";

// ProfilePage is always rendered inside the hub as a bottom-nav tab — the
// hub owns the header + bottom-nav chrome and the main scroll container,
// so this component just renders the section stack. The standalone
// `/profile` route was retired; deep-links to `/profile` redirect to the
// hub with the `profile` tab pre-activated (`/?tab=profile`).
export function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const online = useOnlineStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  // Діалог «є незбережене» — відкривається лише тоді, коли `logout()` уже
  // спробував доставити чергу й щось лишилось. `resolve` тримає обіцянку,
  // яку чекає `confirmUnsyncedLoss`: поки людина не відповіла, вихід
  // стоїть і НІЧОГО не стерто.
  const [unsyncedPrompt, setUnsyncedPrompt] = useState<{
    pending: number;
    resolve: (proceed: boolean) => void;
  } | null>(null);

  if (!user) {
    return null;
  }

  // Logout — primary identity-action, owned by Profile (UX roast §10.1 / C10).
  // Settings → General більше не дублює цю кнопку: Profile — єдина точка
  // виходу з акаунта одним тапом. Variant=secondary, бо logout — нейтральне
  // дія, не destructive (на відміну від видалення акаунта в DangerZone).
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      let cancelled = false;
      await logout({
        confirmUnsyncedLoss: (pending) =>
          new Promise<boolean>((resolve) => {
            setUnsyncedPrompt({
              pending,
              resolve: (proceed) => {
                cancelled = !proceed;
                setUnsyncedPrompt(null);
                resolve(proceed);
              },
            });
          }),
      });
      // Людина обрала «Залишитись» — сесія жива, нічого не стерто, тож ні
      // тосту про вихід, ні редіректу на екран входу бути не має.
      if (cancelled) return;
      toast.success("Ви вийшли з акаунта");
      // Send the signed-out user to the auth surface, not the hub root —
      // `logout()` has already cleared the query cache so `user` is `null`,
      // and `/sign-in` renders `AuthPage` instead of a momentary guest hub.
      navigate(SIGN_IN_PATH, { replace: true });
    } catch {
      // Вихід ідемпотентний: якщо сесія вже впала на сервері, повтор просто
      // догортає локальний teardown. Без кнопки користувач лишався на
      // екрані профілю з враженням «я вийшов», хоча сесія жива.
      toast.error("Не вдалося вийти", undefined, {
        label: "Повторити",
        onClick: () => void handleLogout(),
      });
    } finally {
      setLoggingOut(false);
    }
  };

  // Each section is wrapped in a `CollapsibleSection` so the page reads as
  // a stack of single-line entry-points by default and the user opens only
  // what they need. `Особиста інформація` defaults to open because it is
  // the identity preview (avatar + name + email + verification banner) —
  // the section a user opening Profile most often wants to glance at. The
  // remaining four sections — Memory, Password, Sessions, Danger zone —
  // default to collapsed; their open/closed state is persisted per
  // `storageKey` so the user's preference survives reload. Multiple
  // sections can be open simultaneously (non-mutually-exclusive).
  return (
    <div className="max-w-lg mx-auto px-5 pb-10 space-y-2 pt-6">
      <h1 className="sr-only">{messages.nav.profile}</h1>
      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 mb-2">
          <Icon name="wifi-off" size={16} className="text-warning shrink-0" />
          <p className="text-style-label text-warning-strong dark:text-warning">
            Ви офлайн — редагування профілю тимчасово недоступне
          </p>
        </div>
      )}

      <CollapsibleSection
        storageKey="sergeant.profile.personalInfo.open"
        title="Особиста інформація"
        defaultOpen
        collapsedIcon="user"
        collapsedSubtitle={user.email ?? user.name ?? undefined}
      >
        <PersonalInfoSection user={user} online={online} onRefresh={refresh} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sergeant.profile.memory.open"
        title="Пам'ять"
        defaultOpen={false}
        collapsedIcon="brain"
        collapsedSubtitle="Що асистент знає про тебе"
      >
        <MemoryBankSection />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sergeant.profile.biometrics.open"
        title="Біометрія"
        defaultOpen={false}
        collapsedIcon="activity"
        collapsedSubtitle="Зріст, вага, активність — для розрахунку калорій"
      >
        <BiometricsSection online={online} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sergeant.profile.password.open"
        title="Пароль"
        defaultOpen={false}
        collapsedIcon="lock"
        collapsedSubtitle="Зміна пароля"
      >
        <ChangePasswordSection online={online} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sergeant.profile.sessions.open"
        title="Активні сесії"
        defaultOpen={false}
        collapsedIcon="monitor"
        collapsedSubtitle="Пристрої з доступом до акаунта"
      >
        <SessionsSection online={online} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sergeant.profile.danger.open"
        title="Видалення акаунта"
        defaultOpen={false}
        collapsedIcon="alert-triangle"
        collapsedSubtitle="Незворотні дії"
      >
        <DangerZoneSection online={online} onLogout={logout} />
      </CollapsibleSection>

      <Button
        type="button"
        variant="secondary"
        size="md"
        className="w-full justify-center gap-2 mt-4"
        disabled={loggingOut}
        loading={loggingOut}
        onClick={handleLogout}
      >
        <Icon name="log-out" size={16} />
        {loggingOut ? messages.loadingActions.exiting : "Вийти"}
      </Button>

      {/* Вихід стирає локальну базу разом із чергою синхронізації, а поки
          запис не доїхав на сервер — локальна копія єдина. Показуємо це
          лише тоді, коли `logout()` уже спробував доставити чергу й не
          зміг: на живій мережі людина цього діалогу не бачить ніколи. */}
      <ConfirmDialog
        open={unsyncedPrompt !== null}
        danger
        title="Є незбережені записи"
        description={
          <>
            {unsyncedPrompt?.pending === 1
              ? "1 запис ще не збережено на сервері."
              : `${unsyncedPrompt?.pending ?? 0} записів ще не збережено на сервері.`}{" "}
            Якщо вийти зараз, вони зникнуть назавжди. Підключися до мережі й
            зачекай кілька секунд — або виходь, якщо ці записи не потрібні.
          </>
        }
        confirmLabel="Все одно вийти"
        cancelLabel="Залишитись"
        onConfirm={() => unsyncedPrompt?.resolve(true)}
        onCancel={() => unsyncedPrompt?.resolve(false)}
      />
    </div>
  );
}
