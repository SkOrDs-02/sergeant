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
    headers: { "Content-Type": "application/json" },
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
    throw new Error(body?.message ?? `Помилка ${res.status}. Спробуй ще раз.`);
  }

  return (await res.json()) as WaitlistResult;
}
