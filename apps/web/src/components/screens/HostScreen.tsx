import { useCallback, useEffect, useState } from "react";
import { type HostView, type ServerMessage } from "@chowka/shared";
import { useGameSocket } from "../../lib/useGameSocket";
import { useAudio, usePhaseSound } from "../../lib/useAudio";
import { useTravelAnimation } from "../../lib/useTravelAnimation";
import { COLOR_THEME } from "../../lib/colors";
import { Board, Pockets } from "../board";
import { Scorecard } from "./Scorecard";
import {
  CrewList,
  Instruction,
  MuteButton,
  PhaseCountdown,
  PhaseShell,
  ShellDice,
} from "../ui";

function activePlayer(view: HostView) {
  return view.players.find((p) => p.id === view.activePlayerId) ?? null;
}

function TurnBanner({ view }: { view: HostView }) {
  const active = activePlayer(view);
  const theme = active?.color ? COLOR_THEME[active.color] : null;
  return (
    <div className="flex items-center justify-center gap-3 rounded-3xl bg-surface/10 px-6 py-4 ring-1 ring-surface/20">
      {theme && (
        <span
          className="inline-block h-6 w-6 rounded-full ring-2 ring-white/50"
          style={{ background: theme.hex }}
        />
      )}
      <p className="font-display text-3xl font-bold text-surface sm:text-4xl">
        {active ? `${active.name}'s turn` : "…"}
      </p>
    </div>
  );
}

function SidePanel({ view, settleDice }: { view: HostView; settleDice: boolean }) {
  return (
    <div className="space-y-6">
      {(view.phase === "roll" || view.phase === "move" || view.phase === "resolution") && (
        <PhaseShell tone={view.phase === "move" ? "success" : "calm"} className="text-center">
          {view.currentRoll != null ? (
            <ShellDice value={view.currentRoll} size="lg" animate={settleDice} />
          ) : (
            <div>
              <ShellDice value={null} size="lg" />
              <p className="mt-2 text-surface/70">Waiting for the throw…</p>
            </div>
          )}
        </PhaseShell>
      )}

      <aside className="rounded-3xl bg-surface/10 p-5 ring-1 ring-surface/20">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-surface/60">
          Players
        </h3>
        <div className="mt-4">
          <CrewList
            players={view.players}
            phase={view.phase}
            activePlayerId={view.activePlayerId}
          />
        </div>
      </aside>
    </div>
  );
}

function HostBoard({ view }: { view: HostView }) {
  const travel = useTravelAnimation(view.lastMove, view.players, view.phase);
  return (
    <div className="mx-auto max-w-2xl">
      <Board
        players={view.players}
        activePlayerId={view.activePlayerId}
        boardMode={view.boardMode}
        travel={travel}
      />
      <div className="mt-4">
        <Pockets players={view.players} boardMode={view.boardMode} />
      </div>
      {travel && (
        <p className="mt-2 text-center font-display text-lg text-warn">
          Moving {travel.to - travel.from} space{travel.to - travel.from === 1 ? "" : "s"}
        </p>
      )}
      <PhaseCountdown
        phaseEndsAt={view.paused ? null : view.phaseEndsAt}
        className={travel ? "mt-1 text-center text-sm text-surface/50" : "mt-3 text-center text-sm text-surface/50"}
      />
    </div>
  );
}

export function HostScreen({ code }: { code: string }) {
  const { muted, toggleMute, play } = useAudio();
  const [settleDice, setSettleDice] = useState(false);

  const onSocketEvent = useCallback(
    (msg: Extract<ServerMessage, { type: "event" }>) => {
      switch (msg.event.kind) {
        case "rolled":
          play("roll");
          setSettleDice(true);
          break;
        case "moved":
          play("move");
          break;
        case "captured":
          play("capture");
          break;
        case "pawnHome":
          play("home");
          break;
        case "gameOver":
          play(msg.event.result.winnerId ? "victory" : "defeat");
          break;
        case "paused":
        case "resumed":
          play("tap");
          break;
        case "playerLeft":
          play("capture");
          break;
      }
    },
    [play],
  );

  const { view, status, lastError } = useGameSocket({
    code,
    role: "host",
    playerId: "host-display",
    onEvent: onSocketEvent,
  });
  const hostView = view?.role === "host" ? view : null;

  usePhaseSound(hostView?.phase, play);

  useEffect(() => {
    if (!settleDice) return;
    const t = window.setTimeout(() => setSettleDice(false), 550);
    return () => window.clearTimeout(t);
  }, [settleDice]);

  return (
    <main className="min-h-dvh px-6 py-6 sm:px-10">
      <header className="flex items-end justify-between border-b border-surface/20 pb-4">
        <div>
          <p className="font-display text-sm font-semibold uppercase tracking-wider text-o2">
            Chowka Bhara · TV
          </p>
          <p className="font-display text-3xl font-bold tracking-wide text-surface">{code}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-surface/50">
            {status === "open" ? "Live" : status}
            {lastError ? ` — ${lastError}` : ""}
          </p>
          <MuteButton muted={muted} onToggle={toggleMute} />
        </div>
      </header>

      {!hostView ? (
        <p className="mt-16 animate-pulseGlow text-center text-xl text-surface/60">Connecting…</p>
      ) : hostView.phase === "lobby" ? (
        <div className="mt-10">
          <Instruction
            title="Waiting for players"
            subtitle="Share the code, pick colors, ready up — then the host starts."
          />
          <p className="mt-8 text-center font-display text-7xl font-bold tracking-[0.25em] text-o2 sm:text-8xl">
            {hostView.code}
          </p>
          <p className="mt-6 text-center text-xl text-surface/80">
            {hostView.players.filter((p) => p.connected).length}
            {hostView.expectedPlayerCount != null ? ` / ${hostView.expectedPlayerCount}` : ""} joined ·{" "}
            Board {hostView.boardMode} ·{" "}
            {hostView.players.filter((p) => p.connected && p.ready).length} ready
            {hostView.canStart ? " — ready to start!" : ""}
          </p>
          <div className="mx-auto mt-10 max-w-md">
            <CrewList players={hostView.players} phase={hostView.phase} />
          </div>
        </div>
      ) : hostView.phase === "endgame" && hostView.gameOver ? (
        <div className="mt-10 flex justify-center">
          <Scorecard gameOver={hostView.gameOver} large />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {hostView.paused ? (
            <div className="flex items-center justify-center gap-3 rounded-3xl bg-warn/20 px-6 py-4 ring-1 ring-warn/40">
              <p className="font-display text-3xl font-bold text-warn sm:text-4xl">
                Paused{hostView.pausedByName ? ` by ${hostView.pausedByName}` : ""}
              </p>
            </div>
          ) : (
            <TurnBanner view={hostView} />
          )}
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <section>
              <HostBoard view={hostView} />
            </section>
            <SidePanel view={hostView} settleDice={settleDice} />
          </div>
        </div>
      )}
    </main>
  );
}
