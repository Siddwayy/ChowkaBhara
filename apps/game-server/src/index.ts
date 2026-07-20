import { generateRoomCode } from "@chowka/shared";
import { RoomDurableObject } from "./room";

export { RoomDurableObject };

export interface Env {
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return ["http://localhost:4321", "http://127.0.0.1:4321"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Exact match, `*`, or patterns like `https://*.vercel.app`. */
function originAllowed(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  for (const pattern of allowed) {
    if (pattern === "*" || pattern === origin) return true;
    const star = pattern.indexOf("://*.");
    if (star !== -1) {
      const prefix = pattern.slice(0, star + 3); // e.g. https://
      const hostSuffix = pattern.slice(star + 4); // e.g. vercel.app
      if (!origin.startsWith(prefix)) continue;
      const host = origin.slice(prefix.length);
      if (host === hostSuffix || host.endsWith(`.${hostSuffix}`)) return true;
    }
  }
  return false;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const ok = originAllowed(origin, allowed);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ok) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(data: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname === "/api/lobby" && request.method === "POST") {
      const code = generateRoomCode();
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      const initRes = await stub.fetch(
        new Request("https://room/internal/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }),
      );
      if (!initRes.ok) {
        return json({ error: "Failed to create lobby" }, 500, cors);
      }
      return json({ code }, 200, cors);
    }

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const code = url.searchParams.get("code")?.toUpperCase();
      if (!code || code.length < 3) {
        return json({ error: "Missing room code" }, 400, cors);
      }
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    return json({ error: "Not found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
