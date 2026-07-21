import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLORS,
  PAWN_SHAPES,
  TRAVEL_SETTLE_MS,
  TRAVEL_STEP_MS,
  coordForMode,
  destForPawn,
  oppositeColor,
  type BoardMode,
  type Color,
  type Coord,
  type PawnShape,
  type PlayerView,
} from "@chowka/shared";
import { getOrCreatePlayerId } from "../lib/serverUrl";
import { useCountdown, useGameSocket } from "../lib/useGameSocket";
import { useAudio, usePhaseSound } from "../lib/useAudio";
import { useTravelAnimation } from "../lib/useTravelAnimation";
import { COLOR_THEME } from "../lib/colors";
import { Board } from "./Board";
import { MuteButton } from "./MuteButton";
import { acknowledgeRules, hasAcknowledgedRules, RulesScreen } from "./RulesScreen";
import { Scorecard } from "./Scorecard";
import {
  CrewList,
  PhaseShell,
  PrimaryButton,
  ShellDice,
  StatusStrip,
} from "./ui";

export function PlayScreen({
  code,
  playerName,
  desiredMax,
  desiredBoardMode,
}: {
  code: string;
  playerName: string;
  desiredMax: number | null;
  desiredBoardMode: BoardMode | null;
}) {
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const [rulesOk, setRulesOk] = useState(() => hasAcknowledgedRules(code));
  const [showRules, setShowRules] = useState(() => !hasAcknowledgedRules(code));
  const maxSent = useRef(false);
  const modeSent = useRef(false);

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

  // Clear tumble once we've left the throw-in-progress window.
  useEffect(() => {
    const phase = playerView?.phase;
    if (phase === "move" || phase === "resolution" || phase === "endgame" || phase === "lobby") {
      setIsRolling(false);
    }
    if (phase && phase !== "roll") {
      threwSelf.current = false;
    }
  }, [playerView?.phase]);

  const processedEvents = useRef(0);
  useEffect(() => {
    for (let i = processedEvents.current; i < events.length; i++) {
      const msg = events[i];
      if (!msg || msg.type !== "event") continue;
      switch (msg.event.kind) {
        case "rolled": {
          const selfThrow = threwSelf.current;
          threwSelf.current = false;
          setIsRolling(false);
          setSettleDice(true);
          play(selfThrow ? "rollLand" : "roll");
          break;
        }
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

  // Drive the resolution phase from the active player's client once the pawn
  // travel animation has finished. The server keeps a phase alarm as a
  // fallback, but relying on that alarm alone caused intermittent stalls on the
  // "Watch the path" screen (short Durable Object alarms can fire late).
  const advanceSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!playerView) return;
    if (playerView.phase !== "resolution" || playerView.paused) {
      advanceSentRef.current = null;
      return;
    }
    if (playerView.activePlayerId !== playerView.myPlayerId) return;
    const lm = playerView.lastMove;
    const steps = lm ? Math.max(1, lm.to - Math.max(0, lm.from)) : 1;
    const key = lm
      ? `${lm.playerId}:${lm.pawnIndex}:${lm.from}:${lm.to}`
      : `skip:${playerView.currentRoll}:${playerView.activePlayerId}`;
    if (advanceSentRef.current === key) return;
    advanceSentRef.current = key;
    const delay = steps * TRAVEL_STEP_MS + TRAVEL_SETTLE_MS;
    const timer = window.setTimeout(() => {
      send({ type: "advanceResolution" });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    playerView?.phase,
    playerView?.paused,
    playerView?.activePlayerId,
    playerView?.myPlayerId,
    playerView?.lastMove,
    playerView?.currentRoll,
    send,
  ]);

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

  useEffect(() => {
    if (desiredBoardMode == null || modeSent.current) return;
    if (!playerView?.isHost || playerView.phase !== "lobby") return;
    if (playerView.boardMode === desiredBoardMode) {
      modeSent.current = true;
      return;
    }
    modeSent.current = true;
    send({ type: "setBoardMode", mode: desiredBoardMode });
  }, [
    desiredBoardMode,
    playerView?.isHost,
    playerView?.phase,
    playerView?.boardMode,
    send,
  ]);

  function acceptRules() {
    acknowledgeRules(code);
    setRulesOk(true);
    setShowRules(false);
    play("tap");
  }

  return (
    <main className="mx-auto flex h-dvh max-h-dvh max-w-md flex-col overflow-hidden px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:py-5">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-o2 sm:text-xs">Room</p>
          <p className="truncate font-display text-xl font-bold tracking-wide text-surface sm:text-2xl">{code}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {playerView?.phase === "lobby" && rulesOk && (
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="min-h-11 rounded-full bg-surface/15 px-4 py-2.5 text-sm font-semibold text-surface"
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

      {lastError && /already taken/i.test(lastError) && !playerView && (
        <p className="mt-6 text-center text-sm text-surface/80">
          Pick a different name and join again.{" "}
          <a href="/" className="font-semibold text-o2 underline">
            Back to lobby
          </a>
        </p>
      )}

      {status !== "open" && !playerView && (
        <p className="mt-10 text-center text-surface/70">
          {status === "connecting" ? "Connecting…" : "Reconnecting…"}
        </p>
      )}

      {showRules ? (
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <RulesScreen
            boardMode={playerView?.boardMode ?? "7x7"}
            onDone={acceptRules}
            onBack={rulesOk ? () => setShowRules(false) : undefined}
          />
        </div>
      ) : !playerView ? (
        lastError && /already taken/i.test(lastError) ? null : (
          <p className="mt-10 animate-pulseGlow text-center text-surface/70">Linking to room…</p>
        )
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
          onSetShape={(s) => {
            play("tap");
            send({ type: "setShape", shape: s });
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
            if (!send({ type: "throwShells" })) {
              threwSelf.current = false;
              return;
            }
            setIsRolling(true);
            setSettleDice(false);
            play("roll");
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
  onSetShape,
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
  onSetShape: (s: PawnShape) => void;
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
  const [pendingPawn, setPendingPawn] = useState<number | null>(null);
  const travel = useTravelAnimation(view.lastMove, view.players, view.phase);

  const selectable =
    view.phase === "move" && view.isMyTurn && view.myValidMoves.length > 0
      ? { playerId: view.myPlayerId, pawnIndexes: view.myValidMoves }
      : null;

  // Clear pending selection when the move context changes.
  useEffect(() => {
    setPendingPawn(null);
  }, [view.phase, view.isMyTurn, view.currentRoll, view.myValidMoves.join(",")]);

  const previewDest: Coord | null = (() => {
    if (
      pendingPawn == null ||
      !me?.color ||
      view.currentRoll == null ||
      view.phase !== "move" ||
      !view.isMyTurn
    ) {
      return null;
    }
    const pos = me.pawns[pendingPawn];
    if (pos == null) return null;
    const dest = destForPawn(pos, view.currentRoll);
    return coordForMode(view.boardMode, me.color, dest);
  })();

  const selectedPawn =
    pendingPawn != null && selectable
      ? { playerId: view.myPlayerId, pawnIndex: pendingPawn }
      : null;

  const handlePawnClick = (pawnIndex: number) => {
    setPendingPawn((prev) => (prev === pawnIndex ? null : pawnIndex));
  };

  const handleDestClick = () => {
    if (pendingPawn == null) return;
    const idx = pendingPawn;
    setPendingPawn(null);
    onMove(idx);
  };

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
    const takenColors = new Set(
      view.players
        .filter((p) => p.id !== view.myPlayerId && p.color)
        .map((p) => p.color as Color),
    );
    const twoPlayer = expected === 2;
    const allowedOpposite = otherColor ? oppositeColor(otherColor) : null;

    return (
      <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain animate-fadeIn sm:mt-4 sm:space-y-5">
        <PhaseShell>
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-o2">
            Share this code
          </p>
          <p className="mt-2 text-center font-display text-4xl font-bold tracking-[0.2em] text-surface sm:text-5xl">
            {view.code}
          </p>
          <p className="mt-3 text-center text-surface/70">
            Players: {connected} / {expected ?? "…"} · Board: {view.boardMode}
          </p>
          <a
            href={hostUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block min-h-11 py-2 text-center text-sm font-semibold text-warn underline"
          >
            Open TV display
          </a>
        </PhaseShell>

        <div>
          <p className="mb-2 font-display text-sm font-semibold text-surface/70">
            Pick your color
            {twoPlayer ? " (face-to-face seats)" : ""}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {COLORS.map((c) => {
              const theme = COLOR_THEME[c];
              const taken = takenColors.has(c);
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
                  className={`flex min-h-14 aspect-square items-center justify-center rounded-2xl border-2 transition active:scale-95 disabled:opacity-25 ${
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
          <p className="mb-2 font-display text-sm font-semibold text-surface/70">
            Pick your pawn
          </p>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {PAWN_SHAPES.map((s) => {
              const taken = view.players.some(
                (p) => p.id !== view.myPlayerId && p.shape === s,
              );
              const mine = me?.shape === s;
              const previewColor = (me?.color ?? "red") as Color;
              const theme = COLOR_THEME[previewColor];
              return (
                <button
                  key={s}
                  type="button"
                  disabled={taken}
                  onClick={() => onSetShape(s)}
                  className={`flex min-h-14 aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl border-2 bg-surface/10 transition active:scale-95 disabled:opacity-25 ${
                    mine ? "border-surface ring-2 ring-surface" : "border-surface/20"
                  }`}
                  aria-label={`${s}${taken ? " (taken)" : ""}`}
                >
                  <ShapePreview shape={s} fill={theme.hex} edge={theme.edge} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-surface/70">
                    {s}
                  </span>
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
              disabled={!me?.color || !me?.shape}
              onClick={() => onReady(!view.myReady)}
            >
              {!me?.color
                ? "Pick a color first"
                : !me?.shape
                  ? "Pick a pawn first"
                  : view.myReady
                    ? "Ready — tap to cancel"
                    : "Ready Up"}
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
  // Board fills leftover space; bottom dock keeps fixed slots so the board
  // doesn't jump when dice / copy / buttons swap.
  const showDice =
    view.phase === "move" ||
    view.phase === "resolution" ||
    isRolling ||
    (view.phase === "roll" && view.isMyTurn);
  // Only tumble during the roll phase; once we have a result / move phase, show the number.
  const diceRolling = isRolling && view.phase === "roll";
  const diceValue = diceRolling ? null : view.currentRoll;

  let dockTitle = "";
  let dockSubtitle = "";
  let dockTone: "calm" | "talk" | "danger" | "success" = "calm";
  let dockAction: { label: string; onClick: () => void; variant?: "primary" | "ink" } | null =
    null;

  if (view.phase === "roll") {
    if (view.isMyTurn) {
      if (isRolling) {
        dockTitle = "Throwing…";
        dockSubtitle = "Shells are tumbling";
      } else {
        dockTitle = "Your turn";
        dockSubtitle = "Throw the shells to roll.";
        dockAction = { label: "Throw Shells", onClick: onThrow };
      }
    } else {
      dockTitle = `${activeName}'s turn`;
      dockSubtitle = "Waiting for their throw…";
    }
  } else if (view.phase === "move") {
    if (view.isMyTurn) {
      if (view.myValidMoves.length > 0) {
        dockTitle =
          pendingPawn != null ? "Confirm move" : "Your move";
        dockSubtitle =
          pendingPawn != null
            ? "Tap the highlighted square to move"
            : "Tap your pawn to preview the landing square";
      } else {
        dockTitle = "No valid moves";
        dockSubtitle = "Nothing you can move with this roll.";
        dockTone = "talk";
        dockAction = { label: "Skip Turn", onClick: onSkip, variant: "ink" };
      }
    } else {
      dockTitle = `${activeName} is moving`;
      dockSubtitle = `Rolled a ${view.currentRoll ?? "?"}.`;
    }
  } else if (view.phase === "resolution") {
    dockTitle = travel
      ? `${travel.to - travel.from} space${travel.to - travel.from === 1 ? "" : "s"}`
      : "…";
    dockSubtitle = "Watch the path";
  }

  return (
    <div className="relative mt-1 flex min-h-0 flex-1 flex-col gap-1.5 sm:mt-2 sm:gap-2">
      <StatusStrip
        turnName={activeName}
        isMyTurn={view.isMyTurn}
        roll={view.phase === "move" || view.phase === "resolution" ? view.currentRoll : null}
        seconds={view.isMyTurn && !view.paused && seconds > 0 ? seconds : null}
      />

      <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden [container-type:size]">
        <div
          className="aspect-square shrink-0"
          style={{
            width: "min(100cqw, 100cqh)",
            height: "min(100cqw, 100cqh)",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          <Board
            players={view.players}
            activePlayerId={view.activePlayerId}
            orientFor={view.myColor}
            boardMode={view.boardMode}
            className="!box-border !h-full !w-full !p-1.5 sm:!p-3"
            selectable={selectable}
            onPawnClick={handlePawnClick}
            previewDest={previewDest}
            selectedPawn={selectedPawn}
            onDestClick={handleDestClick}
            travel={travel}
          />
        </div>
      </div>

      {/* Fixed dock: dice / message / action always occupy the same space */}
      <div className="flex shrink-0 flex-col gap-1.5 sm:gap-2">
        <div className="flex h-10 items-center justify-center overflow-visible sm:h-11">
          <div className={showDice ? "" : "invisible"} aria-hidden={!showDice}>
            <ShellDice
              value={diceValue}
              size="sm"
              rolling={diceRolling}
              animate={settleDice}
            />
          </div>
        </div>

        <div className="flex min-h-[3.25rem] flex-col items-center justify-center px-1 text-center sm:min-h-[3.75rem]">
          <p className="font-display text-lg font-bold leading-tight text-surface sm:text-xl">
            {dockTitle || "\u00A0"}
          </p>
          <p className={`mt-0.5 text-sm leading-snug sm:text-base ${
            dockTone === "talk" ? "text-warn" : "text-surface/70"
          }`}>
            {dockSubtitle || "\u00A0"}
          </p>
        </div>

        <div className="min-h-12">
          {dockAction ? (
            <PrimaryButton
              variant={dockAction.variant === "ink" ? "ink" : "primary"}
              className={`!min-h-12 !w-full !py-2.5 !text-base ${
                dockAction.label === "Throw Shells" ? "animate-pulseGlow" : ""
              }`}
              onClick={dockAction.onClick}
            >
              {dockAction.label}
            </PrimaryButton>
          ) : (
            <div className="min-h-12" aria-hidden="true" />
          )}
        </div>

        {/* Global controls — ≥44px touch targets */}
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={view.paused ? onResume : onPause}
            className="min-h-11 flex-1 rounded-xl bg-surface/15 px-3 py-2.5 font-display text-sm font-semibold text-surface transition active:scale-[0.98]"
          >
            {view.paused ? "Resume" : "Pause"}
          </button>
          {confirmExit ? (
            <div className="flex min-w-0 flex-[1.4] items-center gap-2">
              <button
                type="button"
                onClick={onExit}
                className="min-h-11 min-w-0 flex-1 rounded-xl bg-danger/80 px-2 py-2.5 font-display text-sm font-semibold text-white transition active:scale-[0.98]"
              >
                Leave
              </button>
              <button
                type="button"
                onClick={() => setConfirmExit(false)}
                className="min-h-11 shrink-0 rounded-xl bg-surface/15 px-3 py-2.5 font-display text-sm font-semibold text-surface"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmExit(true)}
              className="min-h-11 flex-1 rounded-xl bg-danger/20 px-3 py-2.5 font-display text-sm font-semibold text-danger-soft transition active:scale-[0.98]"
            >
              Exit
            </button>
          )}
        </div>
      </div>

      {view.paused && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 rounded-3xl bg-ink/85 p-5 text-center backdrop-blur-sm sm:p-6">
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

function ShapePreview({
  shape,
  fill,
}: {
  shape: PawnShape;
  fill: string;
  edge: string;
}) {
  const OUTLINE = "#000000";
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true">
      {shape === "circle" && (
        <circle
          cx="20"
          cy="20"
          r="12"
          fill={fill}
          stroke={OUTLINE}
          strokeWidth="2.5"
        />
      )}
      {shape === "square" && (
        <rect
          x="8"
          y="8"
          width="24"
          height="24"
          rx="3.5"
          fill={fill}
          stroke={OUTLINE}
          strokeWidth="2.5"
        />
      )}
      {shape === "triangle" && (
        <path
          d="M20 8 L32 33 L8 33 Z"
          fill={fill}
          stroke={OUTLINE}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {shape === "star" && (
        <path
          d="M20 4 L24.2 15 L36 15.3 L26.5 22.5 L29.8 34 L20 27.5 L10.2 34 L13.5 22.5 L4 15.3 L15.8 15 Z"
          fill={fill}
          stroke={OUTLINE}
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
