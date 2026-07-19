import { PrimaryButton } from "./ui";

const RULES = [
  {
    title: "Race four pawns home",
    body: "Each player has 4 pawns. First to bring all 4 to the center square wins.",
  },
  {
    title: "Throw the shells",
    body: "On your turn, throw 4 cowrie shells. You roll a 1, 2, 3, 4, or 8, then move one pawn that many steps.",
  },
  {
    title: "Bonus turns",
    body: "Roll a 4 or an 8 — or capture an opponent — and you go again.",
  },
  {
    title: "Capture (kadi)",
    body: "Land on an opponent's pawn (except on a starred safe square) to send it back to its base and earn a bonus roll.",
  },
  {
    title: "No doubling your own",
    body: "You cannot land on a square that already has one of your pawns (except your home base and the center).",
  },
  {
    title: "Exact finish",
    body: "You need the exact roll to land a pawn on the center. Overshooting isn't allowed. No moves? Tap Skip.",
  },
];

export function rulesStorageKey(code: string): string {
  return `chowka-rules-v1-${code.toUpperCase()}`;
}

export function hasAcknowledgedRules(code: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(rulesStorageKey(code)) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeRules(code: string): void {
  try {
    sessionStorage.setItem(rulesStorageKey(code), "1");
  } catch {
    /* ignore */
  }
}

export function RulesScreen({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="animate-fadeIn flex flex-1 flex-col">
      <h2 className="font-display text-3xl font-bold text-surface">How to play</h2>
      <p className="mt-1 text-sm text-surface/70">
        Chowka Bhara — an ancient cross-and-circle race game.
      </p>

      <ol className="mt-6 space-y-3">
        {RULES.map((r, i) => (
          <li key={r.title} className="rounded-2xl bg-surface px-4 py-3 text-ink shadow-card">
            <p className="font-display text-sm font-semibold text-o2-dark">
              {i + 1}. {r.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-auto space-y-3 pt-8">
        <PrimaryButton onClick={onDone}>Got it — let's play</PrimaryButton>
        {onBack && (
          <PrimaryButton variant="ghost" onClick={onBack}>
            Back
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}
