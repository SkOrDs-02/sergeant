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
      toast.success("Вихід виконано");
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
  //
  // V-10 (deep-module-audit 2026-08-08, § «Профіль і Налаштування»,
  // рішення власника: Профіль рухається до сітки Налаштувань): контейнер
  // раніше дублював `max-w-lg`/`px-5` ОБОЛОНКИ хаба (`HubMainContent.tsx`
  // dає `max-w-lg md:max-w-2xl lg:max-w-3xl` + `contentClassName="px-5
  // pb-28"` обом вкладкам), тож `px-5` рахувався двічі (=40px), власний
  // `max-w-lg` перебивав ширші брейкпоінти оболонки на планшеті/десктопі,
  // а `space-y-2` (8px) удвічі щільніший за `gap-4` (16px) сусідньої
  // вкладки Налаштувань. Форма нижче — точна копія кореневого контейнера
  // `HubSettingsPage.tsx` (`flex flex-col gap-4 pt-3 pb-6`, без власних
  // `max-w`/`px`), тож обидві вкладки одного хаба тепер мають однакову
  // ширину й ритм. `pb-6` (не `pb-10`, як було) — оболонка вже резервує
  // `pb-28` під нижню навігацію в `contentClassName`, тож власний нижній
  // відступ і там, і там лишається лише «повітрям» між останнім елементом
  // і межею скролу, без подвоєння.
  return (
    <div className="flex flex-col gap-4 pt-3 pb-6">
      <h1 className="sr-only">{messages.nav.profile}</h1>
      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/30 px-4 py-3">
          <Icon name="wifi-off" size={16} className="text-warning shrink-0" />
          <p className="text-style-label text-warning-strong dark:text-warning">
            Офлайн, редагування профілю тимчасово недоступне
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

      {/* V-4 (аудит 2026-08-08): решта пʼяти секцій малюють власну шапку
          картки (іконка + заголовок/мета) — `headingSize="md"` піднімає
          зовнішній заголовок до того самого `text-style-label`, яким
          намальована внутрішня шапка, щоб зовнішній рівень ієрархії
          більше не був ДРІБНІШИМ за вкладений. Деталі й що саме прибрано
          з кожної внутрішньої шапки — канонічний коментар у
          `MemoryBankSection.tsx` над її `<div>`-шапкою; решта файлів лише
          посилаються на нього. `PersonalInfoSection` тут навмисно БЕЗ
          `headingSize` — її шапка (аватар-хіро) не малює текстового
          заголовка, дублю немає, інверсії немає. */}
      <CollapsibleSection
        storageKey="sergeant.profile.memory.open"
        title="Памʼять"
        defaultOpen={false}
        headingSize="md"
        collapsedIcon="brain"
        // V-11 (аудит Профілю/Налаштувань, фаза 2 L-8 — 2026-08-09). Тут
        // стояло «Що асистент знає про тебе» — майже дослівний ЗАГОЛОВОК
        // сусідньої секції в Конфіденційності («Що ШІ про тебе памʼятає»),
        // тобто підзаголовок одного входу дорівнював назві іншого, і
        // розрізнити їх було неможливо. Після дзеркалення фактів у
        // `ai_memories` це вже не два списки одного, а джерело і обсяг:
        // ТУТ — те, що людина розповіла сама і може редагувати; ТАМ —
        // усе, що асистент запамʼятав, із чату й модулів теж. Підзаголовок
        // тепер називає саме джерело.
        collapsedSubtitle="Твої факти: інтервʼю, вручну, імпорт"
      >
        <MemoryBankSection />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="sergeant.profile.biometrics.open"
        title="Біометрія"
        defaultOpen={false}
        headingSize="md"
        collapsedIcon="activity"
        collapsedSubtitle="Зріст, вага, активність – для розрахунку калорій"
      >
        <BiometricsSection online={online} />
      </CollapsibleSection>

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

      {/* DangerZoneSection малює власну шапку «Небезпечна зона» — на
          відміну від решти чотирьох, це НЕ дублікат зовнішнього заголовка
          («Видалення акаунта»), а окрема інформація (застереження про
          розділ), тож текст лишається. Але вона все одно намальована
          `text-style-label`, тож без `headingSize="md"` зовнішній xs-кікер
          був би дрібнішим за неї — та сама інверсія, лише без дублю
          тексту. */}
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

      <Button
        type="button"
        variant="secondary"
        size="md"
        className="w-full justify-center gap-2"
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
