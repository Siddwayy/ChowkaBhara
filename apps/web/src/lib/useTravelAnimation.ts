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
  const rafRef = useRef<number | null>(null);

  const moveKey = lastMove ? travelKey(lastMove) : null;
  const moverId = lastMove?.playerId ?? null;

  const moverColor = useMemo(() => {
    if (!moverId) return null;
    return players.find((p) => p.id === moverId)?.color ?? null;
  }, [moverId, players]);

  useEffect(() => {
    if (!phase) return;
    if (phase !== "resolution" && phase !== "move") {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setTravel(null);
      seenKey.current = null;
    }
  }, [phase]);

  useLayoutEffect(() => {
    if (!lastMove || !moverColor || !moveKey) return;
    if (phase !== "resolution") return;
    if (seenKey.current === moveKey) return;
    seenKey.current = moveKey;

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const from = Math.max(0, lastMove.from);
    const to = lastMove.to;
    const steps = Math.max(1, to - from);
    const playerId = lastMove.playerId;
    const pawnIndex = lastMove.pawnIndex;
    const color = moverColor;

    const applyStep = (step: number) => {
      setTravel({
        playerId,
        pawnIndex,
        color,
        from,
        to,
        stepPos: from + step,
        revealedSteps: step,
        landed: step >= steps,
      });
    };

    // First cell immediately — don't wait a full step before anything moves.
    applyStep(1);

    if (steps <= 1) return;

    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const step = Math.min(steps, 1 + Math.floor(elapsed / TRAVEL_STEP_MS));
      applyStep(step);
      if (step < steps) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // lastMove is identified by moveKey; omitting the object avoids restarting on rebroadcasts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey, moverColor, phase]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return travel;
}
