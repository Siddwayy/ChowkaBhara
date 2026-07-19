import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLORS,
  CENTER_INDEX,
  POCKET,
  oppositeColor,
  type Color,
  type PlayerView,
} from "@chowka/shared";
import { getOrCreatePlayerId } from "../lib/serverUrl";
import { useCountdown, useGameSocket } from "../lib/useGameSocket";
import { useAudio, usePhaseSound } from "../lib/useAudio";
import { COLOR_THEME } from "../lib/colors";
import { Board, Pockets } from "./Board";
import { MuteButton } from "./MuteButton";
import { acknowledgeRules, hasAcknowledgedRules, RulesScreen } from "./RulesScreen";
import { Scorecard } from "./Scorecard";
import {
  CrewList,
  Instruction,
  PhaseShell,
  PrimaryButton,
  ShellDice,
  StatusStrip,
} from "./ui";

function pawnLabel(pos: number): string {
  if (pos === POCKET || pos === 0) return "at base";
  if (pos === CENTER_INDEX) return "home!";
  return `step ${pos}/${CENTER_INDEX}`;
}

export function PlayScreen({
  code,
  playerName,
  desiredMax,
}: {
  code: string;
  playerName: string;
  desiredMax: number | null;
}) {
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const [rulesOk, setRulesOk] = useState(() => hasAcknowledgedRules(code));
  const [showRules, setShowRules] = useState(() => !hasAcknowledgedRules(code));
  const maxSent = useRef(false);

  const { view, status, lastError, events, send, setLastError } = useGameSocket({
    code,
    role: "player",
    playerId,
    playerName,
  });

  const { muted, toggleMute, play } = useAudio();
  const playerView = view?.role === "player" ? view : null;
  const seconds = useCountdown(playerView?.phaseEndsAt ?? null);

  usePhaseSound(playerView?.phase, play);

  const processedEvents = useRef(0);
  useEffect(() => {
    for (let i = processedEvents.current; i < events.length; i++) {
      const msg = events[i];
      if (!msg || msg.type !== "event") continue;
      switch (msg.event.kind) {
        case "rolled":
          play("roll");
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
          play(msg.event.result.winnerId === playerId ? "victory" : "defeat");
          break;
        case "paused":
        case "resumed":
          play("tap");
          break;
        case "playerLeft":
          play("capture");
          break;
      }
    }
    processedEvents.current = events.length;
  }, [events, play, playerId]);

  useEffect(() => {
    if (desiredMax == null || maxSent.current) return;
    if (!playerView?.isHost || playerView.phase !== "lobby") return;
    if (playerView.expectedPlayerCount === desiredMax) {
      maxSent.current = true;
      return;
    }
    maxSent.current = true;
    send({ type: "setExpectedPlayers", count: desiredMax });
  }, [desiredMax, playerView?.isHost, playerView?.phase, playerView?.expectedPlayerCount, send]);

  function acceptRules() {
    acknowledgeRules(code);
    setRulesOk(true);
    setShowRules(false);
    play("tap");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-o2">Room</p>
          <p className="font-display text-2xl font-bold tracking-wide text-surface">{code}</p>
        </div>
        <div className="flex items-center gap-2">
          {playerView?.phase === "lobby" && rulesOk && (
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="rounded-full bg-surface/15 px-3 py-2 text-sm font-semibold text-surface"
            >
              Rules
            </button>
          )}
          <MuteButton muted={muted} onToggle={toggleMute} />
        </div>
      </header>

      {lastError && (
        <button
          type="button"
          className="mt-3 rounded-2xl bg-danger/20 px-3 py-2 text-left text-sm text-danger-soft"
          onClick={() => setLastError(null)}
        >
          {lastError}
        </button>
      )}

      {status !== "open" && !playerView && (
        <p className="mt-10 text-center text-surface/70">
          {status === "connecting" ? "Connecting…" : "Reconnecting…"}
        </p>
      )}

      {showRules ? (
        <div className="mt-6 flex flex-1 flex-col">
          <RulesScreen onDone={acceptRules} onBack={rulesOk ? () => setShowRules(false) : undefined} />
        </div>
      ) : !playerView ? (
        <p className="mt-10 animate-pulseGlow text-center text-surface/70">Linking to room…</p>
      ) : (
        <PlayerBody
          view={playerView}
          seconds={seconds}
          rulesOk={rulesOk}
          onSetColor={(c) => {
            play("tap");
            send({ type: "setColor", color: c });
          }}
          onReady={(ready) => {
            play(ready ? "ready" : "unready");
            send({ type: "setReady", ready });
          }}
          onStart={() => {
            play("start");
            send({ type: "startGame" });
          }}
          onThrow={() => {
            play("tap");
            send({ type: "throwShells" });
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
          }}
          onMove={(pawnIndex) => {
            play("tap");
            send({ type: "movePawn", pawnIndex });
          }}
          onSkip={() => {
            play("tap");
            send({ type: "skipTurn" });
          }}
          onRematch={() => {
            play("tap");
            send({ type: "rematch" });
          }}
          onPause={() => {
            play("tap");
            send({ type: "pauseGame" });
          }}
          onResume={() => {
            play("tap");
            send({ type: "resumeGame" });
          }}
          onExit={() => {
            play("tap");
            send({ type: "exitGame" });
            window.location.href = "/";
          }}
          onShowRules={() => setShowRules(true)}
        />
      )}
    </main>
  );
}

function PlayerBody({
  view,
  seconds,
  rulesOk,
  onSetColor,
  onReady,
  onStart,
  onThrow,
  onMove,
  onSkip,
  onRematch,
  onPause,
  onResume,
  onExit,
  onShowRules,
}: {
  view: PlayerView;
  seconds: number;
  rulesOk: boolean;
  onSetColor: (c: Color) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onThrow: () => void;
  onMove: (pawnIndex: number) => void;
  onSkip: () => void;
  onRematch: () => void;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
  onShowRules: () => void;
}) {
  const activeName = view.players.find((p) => p.id === view.activePlayerId)?.name ?? "…";
  const me = view.players.find((p) => p.id === view.myPlayerId);
  const [confirmExit, setConfirmExit] = useState(false);

  if (view.phase === "lobby") {
    const connected = view.players.filter((p) => p.connected).length;
    const expected = view.expectedPlayerCount;
    const hostUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/host?code=${encodeURIComponent(view.code)}`
        : `/host?code=${view.code}`;
    const otherColor = view.players.find(
      (p) => p.id !== view.myPlayerId && p.color,
    )?.color as Color | null | undefined;
    const twoPlayer = expected === 2;
    const allowedOpposite = otherColor ? oppositeColor(otherColor) : null;

    return (
      <div className="mt-6 animate-fadeIn space-y-5">
        <PhaseShell>
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-o2">
            Share this code
          </p>
          <p className="mt-2 text-center font-display text-5xl font-bold tracking-[0.2em] text-surface">
            {view.code}
          </p>
          <p className="mt-3 text-center text-surface/70">
            Players: {connected} / {expected ?? "…"}
          </p>
          <a
            href={hostUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block text-center text-sm font-semibold text-warn underline"
          >
            Open TV display
          </a>
        </PhaseShell>

        <div>
          <p className="mb-2 font-display text-sm font-semibold text-surface/70">
            Pick your color
            {twoPlayer ? " (face-to-face seats)" : ""}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {COLORS.map((c) => {
              const theme = COLOR_THEME[c];
              const taken = Boolean(otherColor && otherColor === c);
              // 2p: only the opposite of the other player (or any if alone).
              const blockedByFacing =
                twoPlayer && otherColor != null && allowedOpposite != null && c !== allowedOpposite && c !== me?.color;
              const disabled = taken || blockedByFacing;
              const mine = me?.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSetColor(c)}
                  className={`flex aspect-square items-center justify-center rounded-2xl border-2 transition active:scale-95 disabled:opacity-25 ${
                    mine ? "border-surface ring-2 ring-surface" : "border-transparent"
                  }`}
                  style={{ background: theme.hex }}
                  aria-label={`${theme.label}${disabled ? " (unavailable)" : ""}`}
                >
                  {mine && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 font-display text-sm font-semibold text-surface/70">Players</p>
          <CrewList players={view.players} phase={view.phase} myPlayerId={view.myPlayerId} />
        </div>

        {!rulesOk ? (
          <PrimaryButton onClick={onShowRules}>Read rules to continue</PrimaryButton>
        ) : (
          <>
            <PrimaryButton
              variant={view.myReady ? "ghost" : "primary"}
              disabled={!me?.color}
              onClick={() => onReady(!view.myReady)}
            >
              {!me?.color ? "Pick a color first" : view.myReady ? "Ready — tap to cancel" : "Ready Up"}
            </PrimaryButton>

            {view.isHost ? (
              <PrimaryButton
                variant={view.canStart ? "primary" : "ghost"}
                disabled={!view.canStart}
                onClick={onStart}
                className={view.canStart ? "animate-pulseGlow" : ""}
              >
                {view.canStart ? "Start Game" : "Waiting for everyone…"}
              </PrimaryButton>
            ) : (
              <p className="text-center text-sm text-surface/70">
                {view.canStart ? "Waiting for host to start…" : "Ready up and wait for the others."}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  if (view.phase === "endgame" && view.gameOver) {
    return (
      <div className="mt-6">
        <Scorecard
          gameOver={view.gameOver}
          myPlayerId={view.myPlayerId}
          isHost={view.isHost}
          onRematch={onRematch}
          onLeave={() => {
            window.location.href = "/";
          }}
        />
      </div>
    );
  }

  // In-game phases: roll / move / resolution
  return (
    <div className="relative mt-4 space-y-4">
      <StatusStrip
        turnName={activeName}
        isMyTurn={view.isMyTurn}
        roll={view.phase === "move" ? view.currentRoll : null}
        seconds={view.isMyTurn && !view.paused && seconds > 0 ? seconds : null}
      />

      <Board
        players={view.players}
        activePlayerId={view.activePlayerId}
        orientFor={view.myColor}
      />

      {view.phase === "roll" && (
        <div className="space-y-4">
          {view.isMyTurn ? (
            <>
              <Instruction title="Your turn" subtitle="Throw the shells to roll." />
              <PrimaryButton className="animate-pulseGlow" onClick={onThrow}>
                Throw Shells
              </PrimaryButton>
            </>
          ) : (
            <Instruction title={`${activeName}'s turn`} subtitle="Waiting for their throw…" />
          )}
        </div>
      )}

      {view.phase === "move" && (
        <div className="space-y-4">
          {view.isMyTurn ? (
            <>
              <PhaseShell>
                <ShellDice value={view.currentRoll} />
              </PhaseShell>
              {view.myValidMoves.length > 0 ? (
                <>
                  <p className="text-center text-sm text-surface/70">Choose a pawn to move</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(me?.pawns ?? []).map((pos, i) => {
                      const valid = view.myValidMoves.includes(i);
                      const theme = me?.color ? COLOR_THEME[me.color] : null;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={!valid}
                          onClick={() => onMove(i)}
                          className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 px-3 py-3 font-display active:scale-[0.98] disabled:opacity-30 ${
                            valid ? "border-surface/60 bg-surface/15 text-surface" : "border-surface/20 bg-surface/5 text-surface/50"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-base font-bold">
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white/40"
                              style={{ background: theme?.hex ?? "#6B8499" }}
                            />
                            Pawn {i + 1}
                          </span>
                          <span className="text-xs opacity-75">{pawnLabel(pos)}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <Instruction title="No valid moves" subtitle="Nothing you can move with this roll." tone="talk" />
                  <PrimaryButton variant="ink" onClick={onSkip}>
                    Skip Turn
                  </PrimaryButton>
                </>
              )}
            </>
          ) : (
            <Instruction title={`${activeName} is moving`} subtitle={`Rolled a ${view.currentRoll ?? "?"}.`} />
          )}
        </div>
      )}

      {view.phase === "resolution" && (
        <div className="space-y-3">
          <Instruction title="…" subtitle="Resolving move" />
          <Pockets players={view.players} />
        </div>
      )}

      {/* Global controls: pause the game for everyone or leave for good. */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={view.paused ? onResume : onPause}
          className="flex-1 rounded-2xl bg-surface/15 px-3 py-3 font-display text-sm font-semibold text-surface transition active:scale-[0.98]"
        >
          {view.paused ? "Resume" : "Pause"}
        </button>
        {confirmExit ? (
          <div className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={onExit}
              className="flex-1 rounded-2xl bg-danger/80 px-3 py-3 font-display text-sm font-semibold text-white transition active:scale-[0.98]"
            >
              Leave for good
            </button>
            <button
              type="button"
              onClick={() => setConfirmExit(false)}
              className="rounded-2xl bg-surface/15 px-3 py-3 font-display text-sm font-semibold text-surface"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            className="flex-1 rounded-2xl bg-danger/20 px-3 py-3 font-display text-sm font-semibold text-danger-soft transition active:scale-[0.98]"
          >
            Exit Game
          </button>
        )}
      </div>

      {view.paused && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 rounded-3xl bg-ink/85 p-6 text-center backdrop-blur-sm">
          <div>
            <p className="font-display text-3xl font-bold text-surface">Paused</p>
            <p className="mt-2 text-surface/70">
              {view.pausedByName ? `Paused by ${view.pausedByName}` : "Game paused"}
            </p>
          </div>
          <PrimaryButton className="animate-pulseGlow" onClick={onResume}>
            Resume Game
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
