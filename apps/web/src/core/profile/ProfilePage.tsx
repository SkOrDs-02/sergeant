import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { SIGN_IN_PATH } from "../app/appPaths";
import { useAuth } from "../auth/AuthContext";
import { AppLockSettings } from "../security/AppLockSettings";
import { AiMemorySection } from "./AiMemorySection";
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
//
// Огляд 2026-09-04 — правило «Профіль про людину, Налаштування про
// застосунок». Сторінка більше не стос із шести рівних пілюль: хіро
// ідентичності завжди відкрите, під ним одразу «Вийти» (доти вихід лежав
// ПІСЛЯ «Видалення акаунта»), далі три названі групи — «Безпека» (пароль,
// сесії, PIN-блокування, яке переїхало з Налаштувань → Конфіденційність),
// «Про тебе» (банк фактів РАЗОМ із серверною памʼяттю Сержанта, які доти
// були двома входами в одне, і біометрія) та «Акаунт» (видалення).

/**
 * Група секцій Профілю з кікером. `<h2>` тримає дерево заголовків
 * h1 (sr-only «Профіль») → h2 (група) → заголовки секцій усередині.
 */
function ProfileGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-style-overline text-muted px-1">{title}</h2>
      {children}
    </section>
  );
}

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
  // Settings більше не дублює цю кнопку: Profile — єдина точка виходу з
  // акаунта одним тапом. Ghost, бо вихід — нейтральна дія поруч з
  // ідентичністю, не destructive (на відміну від видалення акаунта нижче).
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
      toast.success("Ти вийшов з акаунта");
      // Send the signed-out user to the auth surface, not the hub root —
      // `logout()` has already cleared the query cache so `user` is `null`,
      // and `/sign-in` renders `AuthPage` instead of a momentary guest hub.
      navigate(SIGN_IN_PATH, { replace: true });
    } catch {
      // Вихід ідемпотентний: якщо сесія вже впала на сервері, повтор просто
      // догортає локальний teardown.
      toast.error("Не вдалося вийти", undefined, {
        label: "Повторити",
        onClick: () => void handleLogout(),
      });
    } finally {
      setLoggingOut(false);
    }
  };

  // V-10 (аудит 2026-08-08): контейнер повторює форму кореня
  // `HubSettingsPage.tsx` (`flex flex-col gap-4 pt-3 pb-6`, без власних
  // `max-w`/`px`), тож обидві вкладки хаба мають однакову ширину й ритм.
  //
  // Секції з формами (пароль, сесії, памʼять, біометрія) лишаються
  // дисклоужерами `CollapsibleSection`: розгорнуті всі разом вони дали б
  // сторінку на пʼять екранів. Стан відкритого персиститься per
  // `storageKey`. `headingSize="md"` — V-4: зовнішній заголовок не може
  // бути дрібнішим за будь-який текст усередині.
  return (
    <div className="flex flex-col gap-4 pt-3 pb-6">
      <h1 className="sr-only">{messages.nav.profile}</h1>
      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/30 px-4 py-3">
          <Icon name="wifi-off" size={16} className="text-warning shrink-0" />
          <p className="text-style-label text-warning-strong dark:text-warning">
            Офлайн. Редагувати профіль можна буде, щойно зʼявиться мережа.
          </p>
        </div>
      )}

      <PersonalInfoSection user={user} online={online} onRefresh={refresh} />

      <div className="flex justify-end -mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 text-muted"
          disabled={loggingOut}
          loading={loggingOut}
          onClick={handleLogout}
        >
          <Icon name="log-out" size={16} />
          {loggingOut ? messages.loadingActions.exiting : "Вийти"}
        </Button>
      </div>

      <ProfileGroup title="Безпека">
        <CollapsibleSection
          storageKey="sergeant.profile.password.open"
          title="Пароль"
          defaultOpen={false}
          headingSize="md"
          collapsedIcon="lock"
          collapsedSubtitle="Зміна пароля"
        >
          <ChangePasswordSection online={online} />
        </CollapsibleSection>

        <CollapsibleSection
          storageKey="sergeant.profile.sessions.open"
          title="Активні сесії"
          defaultOpen={false}
          headingSize="md"
          collapsedIcon="monitor"
          collapsedSubtitle="Пристрої з доступом до акаунта"
        >
          <SessionsSection online={online} />
        </CollapsibleSection>

        <CollapsibleSection
          storageKey="sergeant.profile.applock.open"
          title="Блокування застосунку"
          defaultOpen={false}
          headingSize="md"
          collapsedIcon="shield"
          collapsedSubtitle="PIN при відкритті на цьому пристрої"
        >
          <Card radius="lg" padding="md">
            <AppLockSettings />
          </Card>
        </CollapsibleSection>
      </ProfileGroup>

      <ProfileGroup title="Про тебе">
        <CollapsibleSection
          storageKey="sergeant.profile.memory.open"
          title="Памʼять"
          defaultOpen={false}
          headingSize="md"
          collapsedIcon="brain"
          // V-11 (2026-08-09): підпис називає ДЖЕРЕЛО фактів; серверний
          // список тепер стоїть у цій же секції нижче, тож двох входів
          // більше немає.
          collapsedSubtitle="Твої факти й усе, що запамʼятав Сержант"
        >
          <MemoryBankSection />
          <Card radius="lg" padding="md">
            <AiMemorySection />
          </Card>
        </CollapsibleSection>

        <CollapsibleSection
          storageKey="sergeant.profile.biometrics.open"
          title="Біометрія"
          defaultOpen={false}
          headingSize="md"
          collapsedIcon="activity"
          collapsedSubtitle="Зріст, вага, активність для розрахунку калорій"
        >
          <BiometricsSection online={online} />
        </CollapsibleSection>
      </ProfileGroup>

      <ProfileGroup title="Акаунт">
        {/* DangerZoneSection малює власну шапку «Небезпечна зона» — це не
            дублікат зовнішнього заголовка, а застереження про розділ. */}
        <CollapsibleSection
          storageKey="sergeant.profile.danger.open"
          title="Видалення акаунта"
          defaultOpen={false}
          headingSize="md"
          collapsedIcon="alert-triangle"
          collapsedSubtitle="Незворотні дії"
        >
          <DangerZoneSection online={online} onLogout={logout} />
        </CollapsibleSection>
      </ProfileGroup>

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
            зачекай кілька секунд, або виходь, якщо ці записи не потрібні.
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
