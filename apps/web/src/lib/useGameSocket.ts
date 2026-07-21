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
}

export function useGameSocket({
  code,
  role,
  playerId,
  autoJoin = true,
  playerName,
}: Options) {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const [events, setEvents] = useState<ServerMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const joinedRef = useRef(false);

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
          const parsed = ServerMessageSchema.safeParse(raw);
          if (!parsed.success) {
            // Reject invalid payloads instead of casting partial state into React.
            return;
          }
          const msg = parsed.data;
          if (msg.type === "state") {
            setView(msg.view);
          } else if (msg.type === "event") {
            setEvents((prev) => [...prev.slice(-30), msg]);
            if (msg.event.kind === "error") {
              setLastError(msg.event.message);
              // Allow a fresh join attempt after a rejected name (or similar).
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
        retryTimer = setTimeout(connect, 1500);
      };

      ws.onerror = () => {
        ws.close();
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

  return { view, status, lastError, events, send, setLastError };
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
    // 1s is enough for a whole-second display and avoids thrashing the board.
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phaseEndsAt]);

  return remaining;
}
