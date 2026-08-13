import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClientMessage,
  ServerMessage,
  ServerMessageSchema,
  type RoomView,
} from "@chowka/shared";
import { getServerWsUrl } from "./serverUrl";

type Role = "host" | "player";

interface Options {
  code: string;
  role: Role;
  playerId?: string;
  autoJoin?: boolean;
  playerName?: string;
  onEvent?: (msg: Extract<ServerMessage, { type: "event" }>) => void;
}

function parseServerMessage(raw: unknown): ServerMessage | null {
  if (import.meta.env.DEV) {
    const parsed = ServerMessageSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
  if (!raw || typeof raw !== "object" || !("type" in raw)) return null;
  return raw as ServerMessage;
}

export function useGameSocket({
  code,
  role,
  playerId,
  autoJoin = true,
  playerName,
  onEvent,
}: Options) {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const joinedRef = useRef(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    setLastError("Not connected — try again in a moment");
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1500;
    joinedRef.current = false;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const params: Record<string, string> = {
        code: code.toUpperCase(),
        role,
      };
      if (playerId) params.playerId = playerId;

      const url = getServerWsUrl("/ws", params);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        retryDelay = 1500;
        setStatus("open");
        if (autoJoin && role === "player" && playerId && !joinedRef.current) {
          joinedRef.current = true;
          ws.send(
            JSON.stringify({
              type: "join",
              playerId,
              role: "player",
              name: playerName,
            } satisfies ClientMessage),
          );
        } else if (role === "host") {
          ws.send(
            JSON.stringify({
              type: "join",
              playerId: playerId ?? "host",
              role: "host",
            } satisfies ClientMessage),
          );
        }
      };

      ws.onmessage = (ev) => {
        try {
          const raw = JSON.parse(String(ev.data));
          const msg = parseServerMessage(raw);
          if (!msg) return;
          if (msg.type === "state") {
            setView(msg.view);
          } else if (msg.type === "event") {
            onEventRef.current?.(msg);
            if (msg.event.kind === "error") {
              setLastError(msg.event.message);
              if (/already taken|Room is full|already in progress/i.test(msg.event.message)) {
                joinedRef.current = false;
              }
            }
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        joinedRef.current = false;
        const jitter = Math.random() * 300;
        const wait = retryDelay + jitter;
        retryDelay = Math.min(retryDelay * 2, 12_000);
        retryTimer = setTimeout(connect, wait);
      };

      ws.onerror = () => {
        // onclose already reconnects; avoid a double-close storm.
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [code, role, playerId, autoJoin, playerName]);

  return { view, status, lastError, send, setLastError };
}

export function useCountdown(phaseEndsAt: number | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!phaseEndsAt) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const next = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
      setRemaining((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phaseEndsAt]);

  return remaining;
}
