/**
 * Тривалість вікна, у якому прохання видалити акаунт ще можна скасувати.
 *
 * Живе в `@sergeant/shared`, бо число читають обидва боки: сервер рахує
 * ним дедлайн добивача (`modules/me/deletionPoller.ts`), а веб малює ту
 * саму дату на екрані підтвердження і на блокері. Розʼїхавшись, вони дали
 * б людині одну дату на екрані, а видалення сталося б іншого дня.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Момент остаточного видалення для акаунта, позначеного в `requestedAt`. */
export function accountDeletionDeadline(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
}

/** Машинний код, яким сервер відповідає на роутах, закритих вікном. */
export const ACCOUNT_PENDING_DELETION_CODE = "account_pending_deletion";
