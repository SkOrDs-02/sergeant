import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { submitWaitlist, type WaitlistTier } from "../lib/waitlist";

interface WaitlistFormProps {
  tierInterest?: WaitlistTier;
  buttonLabel?: string;
  compact?: boolean;
}

export default function WaitlistForm({
  tierInterest = "unsure",
  buttonLabel = "Приєднатись",
  compact = false,
}: WaitlistFormProps) {
  const navigate = useNavigate();
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const result = await submitWaitlist(email, tierInterest);
      navigate(`/thanks?created=${result.created ? "1" : "0"}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Щось пішло не так.");
    }
  }

  return (
    <div className={`w-full ${compact ? "max-w-md" : "max-w-lg"}`}>
      <form
        onSubmit={handleSubmit}
        className="flex w-full flex-col gap-2 rounded-2xl border border-cardline bg-card p-1.5 backdrop-blur-md sm:flex-row sm:gap-0"
      >
        <label htmlFor={inputId} className="sr-only">
          Email
        </label>
        <input
          id={inputId}
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="твоя@пошта.com"
          className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-xl bg-accent px-6 py-3 text-sm font-extrabold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
        >
          {status === "loading" ? "Хвилинку…" : buttonLabel}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 px-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
