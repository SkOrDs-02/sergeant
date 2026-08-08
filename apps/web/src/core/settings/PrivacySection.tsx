import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { meApi, type UserPreferences } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import { useFlag, setFlag } from "../lib/featureFlags";
import { useAppLockContext } from "../security/AppLockContext";
import type { LockState } from "../security/useAppLock";
import { LegalLinks } from "../legal/LegalLinks";
import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";
import { writeMemoryEntries } from "../profile/memoryBank";
import { setAnalyticsConsent } from "../observability/analyticsConsent";
import { AiMemoryList } from "./AiMemoryList";

const m = messages.privacy.lock;

// Exported for `PrivacySection.test.tsx` (L-3): the loading gate below
// means this value can never leak into the DOM or `analyticsConsent`
// before hydration resolves, so it has to be asserted directly rather
// than inferred from rendered output (2026-08-08 adversarial review
// finding #4 — the prior test's `not.toBeChecked()` assertion actually
// verified the server-mock response, not this constant).
export const DEFAULT_PREFERENCES: UserPreferences = {
  // L-3: продукт — opt-in analytics, не opt-out. Дефолт тут мусить
  // збігатися з серверним DEFAULT FALSE (apps/server/src/modules/me/
  // dataRights.ts, міграція 111) і з in-memory-кешем `analyticsConsent.ts`
  // ("DENY UNTIL HYDRATED"). До відповіді сервера екран нижче все одно не
  // стверджує ні "увімкнено", ні "вимкнено" — див. `preferencesLoaded`-гейт
  // у розмітці нижче.
  analytics: false,
  aiMemory: true,
  pushNotifications: false,
  sergeantNudges: false,
  healthDataConsent: false,
  // Приватність цим екраном не керує — вибір модулів живе в
  // «Дашборд» (`DashboardSection`) і синхронізується окремо
  // (`activeModulesSync`). `null` тут означає «цей екран нічого не знає
  // про вибір», а не «вибору немає».
  activeModules: null,
  updatedAt: null,
};

type PreferenceKey =
  "analytics" | "aiMemory" | "pushNotifications" | "healthDataConsent";

export function PrivacySection() {
  const appLock = useAppLockContext();
  const flagEnabled = useFlag("app-lock-enabled");
  const queryClient = useQueryClient();
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [preferences, setPreferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] =
    useState<PreferenceKey | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [memoryClearStatus, setMemoryClearStatus] = useState<string | null>(
    null,
  );
  const [clearMemoryConfirmOpen, setClearMemoryConfirmOpen] = useState(false);
  // L-11: попередній `appLock.state` — щоб реагувати лише на перехід
  // "locked" -> "idle" (справжнє розблокування або wipe після 10 невдалих
  // спроб), а не на будь-яку зміну. Інакше реконсиляція нижче ганялася б і
  // під час ЖИВОГО ввімкнення тумблера (idle -> setup) і race-ила б із
  // handleToggle, зганяючи щойно виставлений прапор назад у false.
  const prevLockStateRef = useRef<LockState | null>(null);
  // Finding #5 (2026-08-08 adversarial review): `appLock.hasPin`'s
  // *identity* changes only when the signed-in user changes (see the
  // eslint-disable comment below). Tracking it lets the reconciliation
  // effect below also cover "shared device, different user": switching
  // users touches neither `appLock.state` nor `flagEnabled`, so without
  // this the effect re-ran (hasPin is already in its deps) but always
  // hit the `!isMount && !cameFromLocked` early-return and silently kept
  // showing "Блокування додатку" ON for a user with no PIN in their own
  // partition.
  const prevHasPinRef = useRef<typeof appLock.hasPin | null>(null);

  // L-3: extracted so the error state (see the render below) can offer a
  // real retry instead of a dead end (finding #9) — `[]`-deps `useEffect`
  // bodies can't be re-invoked from a click handler.
  const loadPreferences = useCallback(() => {
    let cancelled = false;
    meApi
      .getPreferences()
      .then((next) => {
        if (cancelled) return;
        setPreferences(next);
        setPreferencesLoaded(true);
        setPreferencesError(null);
        setAnalyticsConsent(next.analytics);
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

  useEffect(() => loadPreferences(), [loadPreferences]);

  useEffect(() => {
    // L-11: стирання PIN-креденшела після 10 невдалих спроб
    // (lockStorage.MAX_FAILED_UNLOCK_ATTEMPTS) міняє лише `appLock.state`
    // (locked -> idle, useAppLock.unlock) — прапор "app-lock-enabled"
    // ніхто не чіпає, тож тумблер лишається ON, хоча PIN-а вже нема.
    // Звіряємо факт при монтуванні, на кожному переході з "locked" і на
    // кожній зміні користувача (finding #5), доки прапор ще ввімкнений.
    const prev = prevLockStateRef.current;
    const isMount = prev === null;
    const cameFromLocked = prev === "locked";
    const userChanged =
      prevHasPinRef.current !== null &&
      prevHasPinRef.current !== appLock.hasPin;
    prevLockStateRef.current = appLock.state;
    prevHasPinRef.current = appLock.hasPin;

    if (!flagEnabled) return;
    if (appLock.state !== "idle") return;
    if (!isMount && !cameFromLocked && !userChanged) return;

    let cancelled = false;
    appLock
      .hasPin()
      .then((has) => {
        if (cancelled || has) return;
        setFlag("app-lock-enabled", false);
      })
      .catch(() => {
        // Finding #6: `hasPin()` (lockStorage.hasPinSet -> loadCred)
        // REJECTS on an IndexedDB failure (Safari private mode, storage
        // pressure) rather than resolving `false` — this is a best-effort
        // reconciliation, not a user-facing action, so swallow it instead
        // of leaving an unhandled rejection on every Settings mount.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `appLock` — новий обʼєкт-літерал щорендеру (useAppLock.ts не мемоізує повернене значення). Додавання ЦІЛОГО обʼєкта в deps ганяло б цей ефект (і реальний IndexedDB-запит `hasPin()`) на КОЖЕН непов'язаний ре-рендер PrivacySection; має значення лише ідентичність `.state` і `.hasPin` (остання міняється тільки з userId), обидві вже явно в deps.
  }, [flagEnabled, appLock.state, appLock.hasPin]);

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
    if (key === "analytics") {
      // Optimistic, ahead of the network round trip (CodeRabbit PR #627):
      // a dismiss fired between this click and the server's response must
      // already respect the user's new choice — waiting for
      // `updatePreferences()` to resolve left a window where a toggle-off
      // still emitted `advice_shown`/`advice_dismissed` under the old
      // (consenting) value. Reverted in the `catch` below on failure.
      setAnalyticsConsent(checked);
    }
    try {
      const next = await meApi.updatePreferences({ [key]: checked });
      setPreferences(next);
      setPreferencesLoaded(true);
      setAnalyticsConsent(next.analytics);
    } catch {
      setPreferences(previous);
      if (key === "analytics") {
        setAnalyticsConsent(previous.analytics);
      }
      setPreferencesError("Не вдалося зберегти налаштування. Спробуй ще раз.");
    } finally {
      setSavingPreference(null);
    }
  };

  const handleClearMemoryConfirm = async () => {
    setClearMemoryConfirmOpen(false);
    // Finding #2 (2026-08-08 adversarial review): batching this with
    // `setClearingMemory(true)` closed the dialog and disabled its own
    // trigger button in the SAME commit. `ConfirmDialog`'s focus-trap
    // cleanup restores focus to that trigger once the dialog unmounts —
    // `.focus()` on an already-`disabled` element is a silent no-op, so
    // keyboard/AT users were stranded on `<body>`. Yielding one microtask
    // lets React commit (and flush the pending passive-effect focus
    // restore for) the dialog-close-only render first: any subsequent
    // `setState` call flushes pending passive effects before processing
    // the new update, so this ordering is deterministic, not a timing
    // race — see `useDialogFocusTrap.ts`'s cleanup.
    await Promise.resolve();
    setClearingMemory(true);
    setMemoryClearStatus(null);
    try {
      await meApi.clearAiMemory();
      writeMemoryEntries([]);
      // L-20: без явної інвалідації aiMemoryKeys інфініт-список у
      // AiMemoryList лишається зі стертими фактами до наступного
      // непов'язаного refetch — той самий ключ, який AiMemoryList сам
      // інвалідує після точкового видалення ОДНОГО факту (AiMemoryList.tsx,
      // remove.onSuccess). Тут стирається ВЕСЬ список, тож той самий шлях.
      // Finding #10: NOT awaited — the clear itself already succeeded and
      // `AiMemoryList`'s own refetch is background work; awaiting it here
      // only kept the button reading "Очищаю…" for an extra round trip on
      // a slow network for no correctness benefit.
      void queryClient.invalidateQueries({ queryKey: aiMemoryKeys.all });
      setMemoryClearStatus("Памʼять ШІ очищено.");
    } catch {
      setMemoryClearStatus("Не вдалося очистити памʼять ШІ.");
    } finally {
      setClearingMemory(false);
    }
  };

  return (
    <SettingsGroup
      title={m.sectionTitle}
      icon="lock"
      anchorId="settings-privacy"
    >
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
          <h3 className="text-style-label text-text">Згода та дані</h3>
          <p className="mt-1 text-style-caption text-subtle leading-relaxed">
            Обери, що Sergeant може використовувати для якості продукту та
            персоналізації. Дані для входу, безпеки й оплати залишаються
            потрібними для роботи застосунку. Сповіщення налаштовуються в
            окремому розділі.
          </p>
        </div>
        {preferencesLoaded ? (
          <>
            <ToggleRow
              label="Аналітика продукту"
              description={
                savingPreference === "analytics"
                  ? "Зберігаю…"
                  : "Допомагає бачити, де інтерфейс незручний або ламається."
              }
              checked={preferences.analytics}
              onChange={(checked) =>
                void updatePreference("analytics", checked)
              }
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
            <ToggleRow
              label="Дані про здоровʼя"
              description={
                savingPreference === "healthDataConsent"
                  ? "Зберігаю…"
                  : "Явна згода на обробку тренувань, самопочуття й харчування — без неї ця інформація не використовується."
              }
              checked={preferences.healthDataConsent}
              onChange={(checked) =>
                void updatePreference("healthDataConsent", checked)
              }
            />
            {preferencesError ? (
              // Finding #7: rendered right next to the toggle group that
              // failed to save, instead of a screen-height away next to
              // `LegalLinks` — a sighted user who just watched a switch
              // silently revert (see `updatePreference`'s `catch` above)
              // needs the explanation next to the control, not below the
              // AI-memory facts list.
              <p className="text-style-caption text-danger-strong" role="alert">
                {preferencesError}
              </p>
            ) : null}
          </>
        ) : preferencesError ? (
          // Finding #9: a failed initial load used to render nothing at
          // all here — no toggles (correct, see L-3 below), but also no
          // way out short of leaving and re-entering Settings. Offer the
          // same error text plus a real retry that re-invokes the fetch.
          <div className="flex flex-col items-start gap-2">
            <p className="text-style-caption text-danger-strong" role="alert">
              {preferencesError}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreferencesError(null);
                loadPreferences();
              }}
            >
              Спробувати ще
            </Button>
          </div>
        ) : (
          // L-3: до відповіді сервера дефолт — false (opt-in), але екран
          // не має стверджувати НІ "увімкнено", НІ "вимкнено" до гідрації —
          // інакше гість чи офлайн-юзер бачить чужий/застарілий стан як
          // свій. Замість цього — явний loading-стан без тумблерів.
          <p
            className="text-style-caption text-subtle"
            role="status"
            aria-live="polite"
          >
            Завантажую налаштування…
          </p>
        )}
        <div className="rounded-2xl border border-line bg-panelHi p-3">
          <p className="text-style-caption text-subtle leading-relaxed">
            Памʼять зберігає підтверджені факти профілю локально та, коли
            перемикач увімкнений, семантичні записи на сервері. Вимкнення блокує
            нові записи й використання між сесіями, але не видаляє вже
            збережене.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={clearingMemory}
            className="mt-2 text-danger-strong"
            onClick={() => setClearMemoryConfirmOpen(true)}
          >
            {clearingMemory ? "Очищаю…" : "Очистити памʼять ШІ"}
          </Button>
          {memoryClearStatus ? (
            <p className="mt-2 text-style-caption text-subtle" role="status">
              {memoryClearStatus}
            </p>
          ) : null}
          <div className="mt-3 border-t border-line pt-3">
            <h4 className="text-style-label text-text">
              {messages.privacy.aiMemory.sectionTitle}
            </h4>
            <p className="mt-1 mb-2 text-style-caption text-subtle leading-relaxed">
              {messages.privacy.aiMemory.sectionHint}
            </p>
            <AiMemoryList />
          </div>
        </div>
        <LegalLinks compact className="justify-start" />
      </div>

      {/* V-6 / finding #1 (2026-08-08 adversarial review): `SettingsGroup`
          is a `Card prominence="glass"` (`backdrop-blur-md`) inside two
          `overflow-hidden` wrappers — `backdrop-filter` makes the card a
          `position: fixed` containing block, so a non-portaled dialog
          (the local `ConfirmModal` this used to be) closes and clips
          INSIDE the settings card instead of covering the screen. Same
          failure already documented on this exact container in
          `OnboardingWizard.tsx`. `ConfirmDialog` (`@shared/components/ui`)
          portals to `document.body`, same primitive `PWASection` already
          uses next to this one. */}
      <ConfirmDialog
        open={disableConfirmOpen}
        title={m.disableConfirmTitle}
        description={m.disableConfirmBody}
        confirmLabel={m.disableConfirmButton}
        danger
        onConfirm={handleDisableConfirm}
        onCancel={() => setDisableConfirmOpen(false)}
      />

      {/* V-6: незворотне видалення (сервер робить DELETE, не soft-delete —
          так само, як точкове видалення в AiMemoryList) підтверджується
          тим самим діалоговим примітивом застосунку, а не нативним
          `window.confirm`, якого дизайн-система забороняє (не
          стилізується, блокує event loop, без focus-trap/фокус-стилів). */}
      <ConfirmDialog
        open={clearMemoryConfirmOpen}
        title="Очистити памʼять ШІ?"
        description="Зникнуть усі факти — і локальні, і на сервері. Відновити не вийде."
        confirmLabel="Очистити назавжди"
        danger
        onConfirm={() => void handleClearMemoryConfirm()}
        onCancel={() => setClearMemoryConfirmOpen(false)}
      />
    </SettingsGroup>
  );
}
