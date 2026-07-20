import { useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_CODE_LENGTH } from "@chowka/shared";
import { getServerHttpUrl } from "../lib/serverUrl";
import { playSound, unlockAudio } from "../lib/sound";
import { PrimaryButton } from "./ui";

type Screen = "menu" | "create" | "join";

function cleanName(raw: string): string {
  return raw.trim().slice(0, 16);
}

const fieldClass =
  "w-full rounded-2xl border-2 border-sky-soft/30 bg-surface px-4 py-3.5 font-display text-base text-ink outline-none focus:border-o2 sm:py-4 sm:text-lg";

export function HomeLobby() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(next: Screen) {
    unlockAudio();
    playSound("tap");
    setError(null);
    setScreen(next);
  }

  async function confirmCreate() {
    const trimmed = cleanName(name);
    if (!trimmed) {
      setError("Enter your name first");
      return;
    }
    unlockAudio();
    playSound("join");
    setBusy(true);
    setError(null);
    const serverUrl = getServerHttpUrl();
    try {
      const res = await fetch(`${serverUrl}/api/lobby`, { method: "POST" });
      if (!res.ok) throw new Error("Could not create lobby");
      const data = (await res.json()) as { code: string };
      const params = new URLSearchParams({
        code: data.code,
        name: trimmed,
        max: String(maxPlayers),
      });
      window.location.href = `/play?${params.toString()}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      const looksNetwork =
        msg === "Failed to fetch" ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed");
      setError(
        looksNetwork
          ? `Can't reach the game server (${serverUrl}). Set PUBLIC_GAME_SERVER_URL on Vercel to your Worker URL, allow this site in ALLOWED_ORIGINS, and redeploy.`
          : msg,
      );
      setBusy(false);
    }
  }

  function confirmJoin() {
    const trimmed = cleanName(name);
    if (!trimmed) {
      setError("Enter your name first");
      return;
    }
    const c = code.trim().toUpperCase();
    if (c.length !== ROOM_CODE_LENGTH) {
      setError(`Enter the ${ROOM_CODE_LENGTH}-letter lobby code`);
      return;
    }
    unlockAudio();
    playSound("join");
    const params = new URLSearchParams({ code: c, name: trimmed });
    window.location.href = `/play?${params.toString()}`;
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-start px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:justify-center sm:py-10">
      <div className="animate-fadeIn">
        <p className="font-display text-sm font-semibold uppercase tracking-widest text-o2">
          Party board game
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-surface animate-bob sm:text-5xl">
          CHOWKA BHARA
        </h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-surface/80 sm:mt-4 sm:text-lg">
          The classic cross-and-circle race. Throw the shells, chase your rivals home, and
          rush all four pawns to the center.
        </p>

        {screen === "menu" && (
          <div className="mt-10 space-y-4">
            <div className="rounded-3xl bg-surface p-2 shadow-card">
              <PrimaryButton onClick={() => go("create")}>Create Lobby</PrimaryButton>
            </div>
            <div className="rounded-3xl bg-surface/15 p-2 ring-2 ring-surface/30">
              <PrimaryButton variant="ghost" onClick={() => go("join")}>
                Join Lobby
              </PrimaryButton>
            </div>
            <p className="pt-2 text-center text-sm text-surface/60">
              Playing on a TV? Create a lobby first, then open the TV link from your phone.
            </p>
          </div>
        )}

        {screen === "create" && (
          <div className="mt-8 space-y-5 rounded-3xl bg-surface p-5 text-ink shadow-card">
            <div className="space-y-2">
              <label className="block font-display text-sm font-semibold text-ink-soft">
                Your name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 16))}
                maxLength={16}
                placeholder="Player 1"
                autoComplete="nickname"
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <label className="block font-display text-sm font-semibold text-ink-soft">
                Party size
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={maxPlayers <= MIN_PLAYERS}
                  onClick={() => setMaxPlayers((n) => Math.max(MIN_PLAYERS, n - 1))}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky text-2xl text-surface disabled:opacity-30"
                >
                  −
                </button>
                <span className="font-display text-5xl font-bold tabular-nums text-o2-dark">
                  {maxPlayers}
                </span>
                <button
                  type="button"
                  disabled={maxPlayers >= MAX_PLAYERS}
                  onClick={() => setMaxPlayers((n) => Math.min(MAX_PLAYERS, n + 1))}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky text-2xl text-surface disabled:opacity-30"
                >
                  +
                </button>
              </div>
              <p className="text-center text-sm text-ink-faint">
                {MIN_PLAYERS}–{MAX_PLAYERS} players
              </p>
            </div>

            <PrimaryButton disabled={busy} onClick={confirmCreate}>
              {busy ? "Creating…" : "Create & continue"}
            </PrimaryButton>
            <PrimaryButton variant="ink" disabled={busy} onClick={() => go("menu")}>
              Back
            </PrimaryButton>
          </div>
        )}

        {screen === "join" && (
          <div className="mt-8 space-y-5 rounded-3xl bg-surface p-5 text-ink shadow-card">
            <div className="space-y-2">
              <label className="block font-display text-sm font-semibold text-ink-soft">
                Lobby code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={ROOM_CODE_LENGTH}
                placeholder="ABCD"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className={`${fieldClass} text-center text-2xl tracking-[0.35em]`}
              />
            </div>

            <div className="space-y-2">
              <label className="block font-display text-sm font-semibold text-ink-soft">
                Your name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 16))}
                maxLength={16}
                placeholder="Player"
                autoComplete="nickname"
                className={fieldClass}
              />
            </div>

            <PrimaryButton onClick={confirmJoin}>Join Lobby</PrimaryButton>
            <PrimaryButton variant="ink" onClick={() => go("menu")}>
              Back
            </PrimaryButton>
          </div>
        )}

        {error && (
          <p className="mt-5 rounded-2xl bg-danger/20 px-4 py-3 text-sm text-danger-soft" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
