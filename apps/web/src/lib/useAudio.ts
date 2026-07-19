import { useCallback, useEffect, useRef, useState } from "react";
import type { Phase } from "@chowka/shared";
import { isMuted, playSound, setMuted, unlockAudio, type SoundName } from "./sound";

/** Sound played when the room enters each phase (null = silent). */
const PHASE_ENTER_SOUND: Partial<Record<Phase, SoundName>> = {
  roll: "turn",
};

export function useAudio() {
  const [muted, setMutedState] = useState<boolean>(() => isMuted());

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const play = useCallback((name: SoundName) => {
    playSound(name);
  }, []);

  const toggleMute = useCallback(() => {
    setMutedState((prev) => setMuted(!prev));
  }, []);

  return { muted, toggleMute, play, unlockAudio };
}

/**
 * Fires a sound whenever `phase` transitions to a new value. Skips the very
 * first render so loading into an in-progress room stays quiet.
 */
export function usePhaseSound(
  phase: Phase | null | undefined,
  play: (name: SoundName) => void,
) {
  const prev = useRef<Phase | null>(null);
  useEffect(() => {
    if (!phase) return;
    if (prev.current === phase) return;
    const first = prev.current === null;
    prev.current = phase;
    if (first) return;
    const sound = PHASE_ENTER_SOUND[phase];
    if (sound) play(sound);
  }, [phase, play]);
}
