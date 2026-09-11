/**
 * Status: Active
 *
 * Тумблер «Блокування додатку» + «Змінити PIN» / «Заблокувати зараз» +
 * діалог вимкнення. До огляду 2026-09-04 жив усередині
 * `settings/PrivacySection.tsx`; винесено окремо, бо безпека акаунта
 * (пароль, сесії, PIN) тепер зібрана в Профілі → «Безпека», а
 * «Дані та приватність» лишились про згоди й документи. Логіка не
 * мінялась — коментарі нижче зберігають історію рішень.
 */
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { useFlag, setFlag } from "../lib/featureFlags";
import { ToggleRow } from "../settings/SettingsPrimitives";
import { useAppLockContext } from "./AppLockContext";
import type { LockState } from "./useAppLock";

const m = messages.privacy.lock;

export function AppLockSettings() {
  const appLock = useAppLockContext();
  const flagEnabled = useFlag("app-lock-enabled");
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  // L-11: попередній `appLock.state` — щоб реагувати лише на перехід
  // "locked" -> "idle" (справжнє розблокування або wipe після 10 невдалих
  // спроб), а не на будь-яку зміну. Інакше реконсиляція нижче ганялася б і
  // під час ЖИВОГО ввімкнення тумблера (idle -> setup) і race-ила б із
  // handleToggle, зганяючи щойно виставлений прапор назад у false.
  const prevLockStateRef = useRef<LockState | null>(null);
  // Finding #5 (2026-08-08 adversarial review): ІДЕНТИЧНІСТЬ
  // `appLock.hasPin` міняється лише коли міняється залогінений користувач.
  // Відстеження цього дає реконсиляційному ефекту нижче покрити ще й
  // «спільний пристрій, інший користувач»: перемикання юзерів не чіпає ні
  // `appLock.state`, ні `flagEnabled`.
  const prevHasPinRef = useRef<typeof appLock.hasPin | null>(null);

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
        // Finding #6: `hasPin()` (lockStorage.hasPinSet -> loadCred) РЕДЖЕКТИТЬ
        // при збої IndexedDB (приватний режим Safari, брак сховища), а не
        // резолвиться в `false` — це best-effort реконсиляція, а не дія,
        // видима юзеру, тож ковтаємо її мовчки.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `appLock` — новий обʼєкт-літерал щорендеру (useAppLock.ts не мемоізує повернене значення). Має значення лише ідентичність `.state` і `.hasPin` (остання міняється тільки з userId), обидві вже явно в deps.
  }, [flagEnabled, appLock.state, appLock.hasPin]);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      setFlag("app-lock-enabled", true);
      // Audit F16: перевіряємо PIN-партицію САМЕ поточного користувача, а
      // не `anon`. `appLock.hasPin()` замикається на `user?.id`.
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
    // Audit F16: стираємо креденшел поточного користувача, а не слот `anon`.
    await appLock.disablePin();
  };

  return (
    <>
      <ToggleRow
        label={m.enableLabel}
        description={m.enableDescription}
        checked={flagEnabled}
        onChange={handleToggle}
      />

      {flagEnabled && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={appLock.startChange}>
            {m.changePin}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={appLock.lock}
            className="text-muted"
          >
            {m.lockNow}
          </Button>
        </div>
      )}

      {/* V-6 / finding #1 (2026-08-08): лише портальний `ConfirmDialog` —
          непорталений діалог обрізався всередині glass-картки. */}
      <ConfirmDialog
        open={disableConfirmOpen}
        title={m.disableConfirmTitle}
        description={m.disableConfirmBody}
        confirmLabel={m.disableConfirmButton}
        danger
        onConfirm={handleDisableConfirm}
        onCancel={() => setDisableConfirmOpen(false)}
      />
    </>
  );
}
