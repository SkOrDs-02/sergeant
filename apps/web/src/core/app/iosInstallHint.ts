import { MIN_INSTALL_SESSIONS } from "./installSessions";

/**
 * О-1 (а): чи показувати в дзвонику хаба рядок «Встанови Sergeant на
 * початковий екран» (спека
 * `docs/work/specs/ios-install-hint-after-two-sessions.md`). Чиста функція:
 * платформу, лічильник і прапорці читає хук `useIosInstallHint`.
 */
export interface IosInstallHintInput {
  /** Гейт хаба: поза вікном першого запису (FTUX), як решта дзвоника. */
  enabled: boolean;
  /** iPhone/iPad у вкладці Safari, застосунок не встановлено. */
  iosBrowserTab: boolean;
  /** Зараховані сесії (`installSessions.ts`). */
  sessions: number;
  /** Закрито «Зрозуміло» або давня явна відмова старого банера. */
  dismissed: boolean;
  /** У цьому візиті підказку вже показано під тумблером нагадувань (О-1 (б)). */
  inlineShownThisVisit: boolean;
}

export function shouldShowIosInstallHint(input: IosInstallHintInput): boolean {
  return (
    input.enabled &&
    input.iosBrowserTab &&
    input.sessions >= MIN_INSTALL_SESSIONS &&
    !input.dismissed &&
    !input.inlineShownThisVisit
  );
}
