import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  TRAVEL_STEP_MS,
  type Color,
  type LastMove,
  type Phase,
  type PlayerPublic,
} from "@chowka/shared";

export type TravelAnim = {
  playerId: string;
  pawnIndex: number;
  color: Color;
  from: number;
  to: number;
  /** Path index the pawn is currently displayed on (steps from→to). */
  stepPos: number;
  /** How many path steps have been revealed (1..N). */
  revealedSteps: number;
  /** True after the pawn has landed on the destination. */
  landed: boolean;
};

function travelKey(m: LastMove): string {
  return `${m.playerId}:${m.pawnIndex}:${m.from}:${m.to}`;
}

/**
 * Drives the shared pawn walk + cell highlight during resolution.
 * All clients (phone + TV) run this so everyone sees the same travel.
 */
export function useTravelAnimation(
  lastMove: LastMove | null | undefined,
  players: PlayerPublic[],
  phase: Phase | null | undefined,
): TravelAnim | null {
  const [travel, setTravel] = useState<TravelAnim | null>(null);
  const seenKey = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const moveKey = lastMove ? travelKey(lastMove) : null;

  const moverColor = useMemo(() => {
    if (!lastMove) return null;
    return players.find((p) => p.id === lastMove.playerId)?.color ?? null;
  }, [lastMove?.playerId, players]);

  useEffect(() => {
    if (!phase) return;
    if (phase !== "resolution" && phase !== "move") {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTravel(null);
      seenKey.current = null;
    }
  }, [phase]);

  useLayoutEffect(() => {
    if (!lastMove || !moverColor || !moveKey) return;
    if (phase !== "resolution") return;

    // Same move already animating — keep the interval alive across state
    // rebroadcasts (pause/resume, reconnect) that recreate lastMove objects.
    if (seenKey.current === moveKey) return;
    seenKey.current = moveKey;

    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const from = Math.max(0, lastMove.from);
    const to = lastMove.to;
    const steps = Math.max(1, to - from);
    const stepMs = TRAVEL_STEP_MS;

    const playerId = lastMove.playerId;
    const pawnIndex = lastMove.pawnIndex;
    const color = moverColor;

    // First cell immediately — don't wait a full step before anything moves.
    setTravel({
      playerId,
      pawnIndex,
      color,
      from,
      to,
      stepPos: from + 1,
      revealedSteps: 1,
      landed: steps === 1,
    });

    if (steps <= 1) {
      return;
    }

    let step = 1;
    intervalRef.current = window.setInterval(() => {
      step += 1;
      if (step <= steps) {
        setTravel({
          playerId,
          pawnIndex,
          color,
          from,
          to,
          stepPos: from + step,
          revealedSteps: step,
          landed: step === steps,
        });
      }
      if (step >= steps && intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, stepMs);

    // Do not clear the interval on dep churn — only on unmount or new move key.
    return () => {
      /* kept alive intentionally; cleared when moveKey changes or phase exits */
    };
  }, [moveKey, moverColor, phase, lastMove]);

  useEffect(() => {
    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return travel;
}
