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
  const [isRolling, setIsRolling] = useState(false);
  const [settleDice, setSettleDice] = useState(false);
  const threwSelf = useRef(false);

  usePhaseSound(playerView?.phase, play);

  useEffect(() => {
    if (!settleDice) return;
    const t = window.setTimeout(() => setSettleDice(false), 550);
    return () => window.clearTimeout(t);
  }, [settleDice]);

  // Clear tumble if we leave roll/move somehow.
  useEffect(() => {
    const phase = playerView?.phase;
    if (phase && phase !== "roll" && phase !== "move") {
      setIsRolling(false);
      threwSelf.current = false;
    }
  }, [playerView?.phase]);

  const processedEvents = useRef(0);
  useEffect(() => {
    for (let i = processedEvents.current; i < events.length; i++) {
      const msg = events[i];
      if (!msg || msg.type !== "event") continue;
      switch (msg.event.kind) {
        case "rolled":
          if (threwSelf.current) {
            threwSelf.current = false;
            setIsRolling(false);
            setSettleDice(true);
            play("rollLand");
          } else {
            play("roll");
            setSettleDice(true);
          }
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
    <main className="mx-auto flex h-dvh max-h-dvh max-w-md flex-col overflow-hidden px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:py-5">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-o2 sm:text-xs">Room</p>
          <p className="font-display text-xl font-bold tracking-wide text-surface sm:text-2xl">{code}</p>
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
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <RulesScreen onDone={acceptRules} onBack={rulesOk ? () => setShowRules(false) : undefined} />
        </div>
      ) : !playerView ? (
        <p className="mt-10 animate-pulseGlow text-center text-surface/70">Linking to room…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PlayerBody
          view={playerView}
          seconds={seconds}
          rulesOk={rulesOk}
          isRolling={isRolling}
          settleDice={settleDice}
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
            threwSelf.current = true;
            setIsRolling(true);
            setSettleDice(false);
            play("roll");
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
        </div>
      )}
    </main>
  );
}

function PlayerBody({
  view,
  seconds,
  rulesOk,
  isRolling,
  settleDice,
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
  isRolling: boolean;
  settleDice: boolean;
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
      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto animate-fadeIn">
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
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
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

  // In-game phases: roll / move / resolution — fit in one phone viewport.
  // Board takes leftover space; controls stay shrink-0 so shells aren't clipped
  // by overflow-hidden + justify-end packing.
  return (
    <div className="relative mt-2 flex min-h-0 flex-1 flex-col gap-2">
      <StatusStrip
        turnName={activeName}
        isMyTurn={view.isMyTurn}
        roll={view.phase === "move" ? view.currentRoll : null}
        seconds={view.isMyTurn && !view.paused && seconds > 0 ? seconds : null}
      />

      <div className="mx-auto grid min-h-0 w-full flex-1 place-items-center overflow-hidden">
        <div
          className="aspect-square"
          style={{
            width: "min(100%, 42dvh)",
            height: "min(100%, 42dvh)",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          <Board
            players={view.players}
            activePlayerId={view.activePlayerId}
            orientFor={view.myColor}
            className="!box-border !h-full !w-full !p-2 sm:!p-3"
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 overflow-visible">
        {view.phase === "roll" && (
          <div className="space-y-2 overflow-visible">
            {(isRolling || view.isMyTurn) && (
              <div className="flex justify-center overflow-visible py-1">
                <ShellDice
                  value={isRolling ? null : view.currentRoll}
                  size="sm"
                  rolling={isRolling}
                  animate={settleDice}
                />
              </div>
            )}
            {view.isMyTurn ? (
              isRolling ? (
                <Instruction compact title="Throwing…" subtitle="Shells are tumbling" />
              ) : (
                <>
                  <Instruction compact title="Your turn" subtitle="Throw the shells to roll." />
                  <PrimaryButton className="animate-pulseGlow !min-h-12 !py-2.5 !text-base" onClick={onThrow}>
                    Throw Shells
                  </PrimaryButton>
                </>
              )
            ) : (
              <Instruction compact title={`${activeName}'s turn`} subtitle="Waiting for their throw…" />
            )}
          </div>
        )}

        {view.phase === "move" && (
          <div className="space-y-2 overflow-visible">
            {view.isMyTurn ? (
              <>
                <div className="flex justify-center overflow-visible py-1">
                  <ShellDice
                    value={view.currentRoll}
                    size="sm"
                    rolling={false}
                    animate={settleDice}
                  />
                </div>
                {view.myValidMoves.length > 0 ? (
                  <>
                    <p className="text-center text-xs text-surface/70 sm:text-sm">Choose a pawn</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(me?.pawns ?? []).map((pos, i) => {
                        const valid = view.myValidMoves.includes(i);
                        const theme = me?.color ? COLOR_THEME[me.color] : null;
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={!valid}
                            onClick={() => onMove(i)}
                            className={`flex min-h-12 flex-col items-center justify-center rounded-xl border-2 px-2 py-2 font-display active:scale-[0.98] disabled:opacity-30 sm:min-h-14 sm:rounded-2xl sm:px-3 ${
                              valid
                                ? "border-surface/60 bg-surface/15 text-surface"
                                : "border-surface/20 bg-surface/5 text-surface/50"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 text-sm font-bold sm:text-base">
                              <span
                                className="inline-block h-3 w-3 rounded-full ring-2 ring-white/40"
                                style={{ background: theme?.hex ?? "#6B8499" }}
                              />
                              Pawn {i + 1}
                            </span>
                            <span className="text-[10px] opacity-75 sm:text-xs">{pawnLabel(pos)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <Instruction
                      compact
                      title="No valid moves"
                      subtitle="Nothing you can move with this roll."
                      tone="talk"
                    />
                    <PrimaryButton variant="ink" className="!min-h-12 !py-2.5 !text-base" onClick={onSkip}>
                      Skip Turn
                    </PrimaryButton>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-center overflow-visible py-1">
                  <ShellDice value={view.currentRoll} size="sm" animate={settleDice} />
                </div>
                <Instruction
                  compact
                  title={`${activeName} is moving`}
                  subtitle={`Rolled a ${view.currentRoll ?? "?"}.`}
                />
              </>
            )}
          </div>
        )}

        {view.phase === "resolution" && (
          <div className="space-y-2">
            <Instruction compact title="…" subtitle="Resolving move" />
            <Pockets players={view.players} />
          </div>
        )}

        {/* Global controls */}
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={view.paused ? onResume : onPause}
            className="flex-1 rounded-xl bg-surface/15 px-3 py-2 font-display text-xs font-semibold text-surface transition active:scale-[0.98] sm:rounded-2xl sm:py-2.5 sm:text-sm"
          >
            {view.paused ? "Resume" : "Pause"}
          </button>
          {confirmExit ? (
            <div className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={onExit}
                className="flex-1 rounded-xl bg-danger/80 px-3 py-2 font-display text-xs font-semibold text-white transition active:scale-[0.98] sm:rounded-2xl sm:py-2.5 sm:text-sm"
              >
                Leave for good
              </button>
              <button
                type="button"
                onClick={() => setConfirmExit(false)}
                className="rounded-xl bg-surface/15 px-3 py-2 font-display text-xs font-semibold text-surface sm:rounded-2xl sm:py-2.5 sm:text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmExit(true)}
              className="flex-1 rounded-xl bg-danger/20 px-3 py-2 font-display text-xs font-semibold text-danger-soft transition active:scale-[0.98] sm:rounded-2xl sm:py-2.5 sm:text-sm"
            >
              Exit Game
            </button>
          )}
        </div>
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
