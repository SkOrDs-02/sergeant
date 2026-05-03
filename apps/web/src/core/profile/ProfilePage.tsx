import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { Icon } from "@shared/components/ui/Icon";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { useAuth } from "../auth/AuthContext";
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

  if (!user) {
    return null;
  }

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
      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 mb-2">
          <Icon name="wifi-off" size={16} className="text-warning shrink-0" />
          <p className="text-style-label text-warning">
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
    </div>
  );
}
