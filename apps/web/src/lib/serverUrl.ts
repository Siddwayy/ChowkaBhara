export function getServerHttpUrl(): string {
  const raw = import.meta.env.PUBLIC_GAME_SERVER_URL ?? "http://localhost:8787";
  return raw.replace(/\/$/, "");
}

export function getServerWsUrl(path: string, params: Record<string, string>): string {
  const http = getServerHttpUrl();
  const wsBase = http.replace(/^http/, "ws").replace(/\/$/, "");
  const u = new URL(`${wsBase}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

const PLAYER_ID_KEY = "chowka_player_id";

/** Per-tab identity so two tabs don't share the same seat. */
export function getOrCreatePlayerId(): string {
  if (typeof sessionStorage === "undefined") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  let id = sessionStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    sessionStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}
