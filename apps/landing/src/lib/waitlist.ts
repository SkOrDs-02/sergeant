// Клієнт вейтліста. Контракт — WaitlistSubmitSchema у packages/shared
// (email, tier_interest, source, locale). Лендінг завжди шле source: "landing".
export type WaitlistTier = "free" | "plus" | "pro" | "unsure";

export interface WaitlistResult {
  ok: true;
  /** true — новий запис; false — email уже був у списку. */
  created: boolean;
}

export async function submitWaitlist(
  email: string,
  tierInterest: WaitlistTier = "unsure",
): Promise<WaitlistResult> {
  const res = await fetch("/api/v1/waitlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // M10 CSRF guard: сервер вимагає non-simple header (як у api-client).
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      tier_interest: tierInterest,
      source: "landing",
      locale: "uk",
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    // Не показуємо сирі серверні повідомлення (типу "Server error") —
    // мапимо статуси на дружні тексти українською.
    if (res.status === 429) {
      throw new Error("Забагато спроб. Зачекай хвилину і спробуй ще раз.");
    }
    if (res.status === 400 && body?.message) {
      throw new Error("Перевір адресу — схоже, email некоректний.");
    }
    throw new Error("Щось пішло не так. Спробуй ще раз за хвилину.");
  }

  return (await res.json()) as WaitlistResult;
}
