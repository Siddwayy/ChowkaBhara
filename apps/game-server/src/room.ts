import {
  CENTER_INDEX,
  COLORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PAWNS_PER_PLAYER,
  RECONNECT_GRACE_MS,
  RESOLUTION_MS,
  TURN_TIMEOUT_MS,
  ClientMessageSchema,
  coordFor,
  computeValidMoves,
  destForPawn,
  finishedCount,
  isBonusRoll,
  isSafeCell,
  maxProgress,
  oppositeColor,
  rollShells,
  type ClientMessage,
  type ClientRole,
  type Color,
  type GameOverResult,
  type HostView,
  type LastMove,
  type Phase,
  type PlayerPublic,
  type PlayerView,
  type ServerMessage,
} from "@chowka/shared";

interface PlayerSecret {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  color: Color | null;
  ready: boolean;
  pawns: number[];
  hasCaptured: boolean;
  disconnectAt: number | null;
  /** Player quit mid-game — pawns removed, skipped in turn order. */
  left: boolean;
}

interface SessionMeta {
  playerId: string | null;
  role: ClientRole;
}

interface RoomState {
  code: string;
  phase: Phase;
  players: PlayerSecret[];
  turnOrder: string[];
  activePlayerId: string | null;
  currentRoll: number | null;
  bonusPending: boolean;
  lastMove: LastMove | null;
  expectedPlayerCount: number | null;
  hostPlayerId: string | null;
  phaseEndsAt: number | null;
  gameOver: GameOverResult | null;
  paused: boolean;
  pausedById: string | null;
}

const STORAGE_KEY = "room";

/** All pawns start (and return after capture) on home index 0. */
function freshPawns(): number[] {
  return Array.from({ length: PAWNS_PER_PLAYER }, () => 0);
}

function emptyRoom(code: string): RoomState {
  return {
    code,
    phase: "lobby",
    players: [],
    turnOrder: [],
    activePlayerId: null,
    currentRoll: null,
    bonusPending: false,
    lastMove: null,
    expectedPlayerCount: MIN_PLAYERS,
    hostPlayerId: null,
    phaseEndsAt: null,
    gameOver: null,
    paused: false,
    pausedById: null,
  };
}

function normalizeRoom(stored: RoomState): RoomState {
  const base = emptyRoom(stored.code || "");
  const players = (stored.players ?? []).map((p) => ({
    ...p,
    ready: p.ready ?? false,
    color: p.color ?? null,
    pawns: Array.isArray(p.pawns) && p.pawns.length === PAWNS_PER_PLAYER ? p.pawns : freshPawns(),
    hasCaptured: p.hasCaptured ?? false,
    disconnectAt: p.disconnectAt ?? null,
    left: p.left ?? false,
  }));
  const hostPlayerId =
    stored.hostPlayerId ?? players.find((p) => p.isHost)?.id ?? players[0]?.id ?? null;
  return {
    ...base,
    ...stored,
    expectedPlayerCount: stored.expectedPlayerCount ?? MIN_PLAYERS,
    paused: stored.paused ?? false,
    pausedById: stored.pausedById ?? null,
    hostPlayerId,
    turnOrder: stored.turnOrder ?? [],
    players: players.map((p) => ({
      ...p,
      isHost: hostPlayerId != null && p.id === hostPlayerId,
    })),
  };
}

export class RoomDurableObject implements DurableObject {
  private state: DurableObjectState;
  private room: RoomState;
  private sessions = new Map<WebSocket, SessionMeta>();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.room = emptyRoom("");
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<RoomState>(STORAGE_KEY);
      if (stored) this.room = normalizeRoom(stored);
      const sockets = this.state.getWebSockets();
      for (const ws of sockets) {
        const meta = ws.deserializeAttachment() as SessionMeta | null;
        this.sessions.set(ws, meta ?? { playerId: null, role: "player" });
      }
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, this.room);
  }

  // ---------------------------------------------------------------- lobby ---

  private pruneStaleLobbyPlayers(): void {
    if (this.room.phase !== "lobby") return;
    const now = Date.now();
    const before = this.room.players.length;
    this.room.players = this.room.players.filter((p) => {
      if (p.connected) return true;
      if (p.disconnectAt && now - p.disconnectAt < RECONNECT_GRACE_MS) return true;
      return false;
    });
    if (this.room.players.length !== before) this.ensureHost();
  }

  private lobbyCapacity(): number {
    return this.room.expectedPlayerCount ?? MAX_PLAYERS;
  }

  private takenColors(exceptId?: string): Set<Color> {
    const set = new Set<Color>();
    for (const p of this.room.players) {
      if (p.id === exceptId) continue;
      if (p.color) set.add(p.color);
    }
    return set;
  }

  private firstFreeColor(): Color | null {
    const taken = this.takenColors();
    // 2-player: seat face-to-face (red bottom, then green top).
    if (this.room.expectedPlayerCount === 2) {
      if (!taken.has("red")) return "red";
      if (!taken.has("green")) return "green";
      // Fallback if someone picked blue/yellow already.
      const seated = this.room.players.find((p) => p.color);
      if (seated?.color) {
        const opp = oppositeColor(seated.color);
        if (!taken.has(opp)) return opp;
      }
      return COLORS.find((c) => !taken.has(c)) ?? null;
    }
    return COLORS.find((c) => !taken.has(c)) ?? null;
  }

  /** When party size is 2, force seated players onto a facing pair. */
  private seatTwoPlayerOpposites(): void {
    if (this.room.expectedPlayerCount !== 2) return;
    const [a, b] = this.room.players;
    if (!a) return;
    if (!a.color) a.color = "red";
    if (b) b.color = oppositeColor(a.color);
  }

  private canStart(): boolean {
    this.pruneStaleLobbyPlayers();
    const expected = this.room.expectedPlayerCount;
    if (this.room.phase !== "lobby" || expected === null) return false;
    const connected = this.room.players.filter((p) => p.connected);
    return (
      connected.length === expected &&
      connected.length >= MIN_PLAYERS &&
      connected.every((p) => p.ready && p.color !== null)
    );
  }

  private clearAllReady(): void {
    for (const p of this.room.players) p.ready = false;
  }

  private syncHostFlags(): void {
    const hostId = this.room.hostPlayerId;
    for (const p of this.room.players) {
      p.isHost = hostId != null && p.id === hostId;
    }
  }

  private promoteHost(): void {
    const next =
      this.room.players.find((p) => p.connected) ??
      this.room.players[0];
    this.room.hostPlayerId = next?.id ?? null;
    this.syncHostFlags();
  }

  private ensureHost(): void {
    if (
      !this.room.hostPlayerId ||
      !this.room.players.some((p) => p.id === this.room.hostPlayerId)
    ) {
      this.promoteHost();
      return;
    }
    this.syncHostFlags();
  }

  // ------------------------------------------------------------- views ---

  private getPlayer(id: string | null): PlayerSecret | undefined {
    if (!id) return undefined;
    return this.room.players.find((p) => p.id === id);
  }

  private validMovesFor(p: PlayerSecret): number[] {
    if (this.room.phase !== "move" || this.room.currentRoll === null) return [];
    if (this.room.activePlayerId !== p.id) return [];
    return computeValidMoves(
      p.pawns,
      this.room.currentRoll,
      p.hasCaptured,
      p.color ?? undefined,
    );
  }

  private toPublicPlayers(): PlayerPublic[] {
    return this.room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
      color: p.color,
      ready: this.room.phase === "lobby" ? Boolean(p.ready) : false,
      pawns: [...p.pawns],
      hasCaptured: p.hasCaptured,
      finishedCount: finishedCount(p.pawns),
      left: p.left,
    }));
  }

  private pausedByName(): string | null {
    if (!this.room.paused) return null;
    return this.getPlayer(this.room.pausedById)?.name ?? null;
  }

  private buildHostView(): HostView {
    return {
      role: "host",
      code: this.room.code,
      phase: this.room.phase,
      players: this.toPublicPlayers(),
      activePlayerId: this.room.activePlayerId,
      currentRoll: this.room.currentRoll,
      lastMove: this.room.lastMove,
      phaseEndsAt: this.room.phaseEndsAt,
      canStart: this.canStart(),
      expectedPlayerCount: this.room.expectedPlayerCount,
      gameOver: this.room.gameOver,
      paused: this.room.paused,
      pausedByName: this.pausedByName(),
    };
  }

  private buildPlayerView(playerId: string): PlayerView | null {
    const me = this.getPlayer(playerId);
    if (!me) return null;
    const isMyTurn =
      this.room.activePlayerId === me.id &&
      (this.room.phase === "roll" || this.room.phase === "move");
    return {
      role: "player",
      code: this.room.code,
      phase: this.room.phase,
      players: this.toPublicPlayers(),
      activePlayerId: this.room.activePlayerId,
      currentRoll: this.room.currentRoll,
      lastMove: this.room.lastMove,
      phaseEndsAt: this.room.phaseEndsAt,
      canStart: this.canStart(),
      expectedPlayerCount: this.room.expectedPlayerCount,
      gameOver: this.room.gameOver,
      paused: this.room.paused,
      pausedByName: this.pausedByName(),
      myPlayerId: me.id,
      myColor: me.color,
      isMyTurn,
      myValidMoves: this.validMovesFor(me),
      myReady: me.ready,
      isHost: me.isHost,
    };
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closed */
    }
  }

  private broadcastState(): void {
    this.pruneStaleLobbyPlayers();
    for (const [ws, meta] of this.sessions) {
      if (meta.role === "host") {
        this.send(ws, { type: "state", view: this.buildHostView() });
      } else if (meta.playerId) {
        const view = this.buildPlayerView(meta.playerId);
        if (view) this.send(ws, { type: "state", view });
      }
    }
  }

  private broadcastEvent(
    event: Extract<ServerMessage, { type: "event" }>["event"],
  ): void {
    const msg: ServerMessage = { type: "event", event };
    for (const [ws] of this.sessions) this.send(ws, msg);
  }

  private async setPhase(phase: Phase, durationMs: number | null): Promise<void> {
    this.room.phase = phase;
    if (durationMs !== null) {
      this.room.phaseEndsAt = Date.now() + durationMs;
      await this.state.storage.setAlarm(this.room.phaseEndsAt);
    } else {
      this.room.phaseEndsAt = null;
      await this.state.storage.deleteAlarm();
    }
    this.broadcastEvent({ kind: "phaseChanged", phase });
    this.broadcastState();
    await this.persist();
  }

  /** Restart the timer for the current phase (used when resuming from pause). */
  private async restartPhaseTimer(): Promise<void> {
    let durationMs: number | null = null;
    if (this.room.phase === "roll" || this.room.phase === "move") {
      durationMs = TURN_TIMEOUT_MS;
    } else if (this.room.phase === "resolution") {
      durationMs = RESOLUTION_MS;
    }
    if (durationMs !== null) {
      this.room.phaseEndsAt = Date.now() + durationMs;
      await this.state.storage.setAlarm(this.room.phaseEndsAt);
    } else {
      this.room.phaseEndsAt = null;
      await this.state.storage.deleteAlarm();
    }
  }

  // ----------------------------------------------------------- game loop ---

  private async beginGame(): Promise<void> {
    const seated = this.room.players.filter((p) => p.connected && p.ready && p.color);
    this.room.turnOrder = seated.map((p) => p.id);
    for (const p of this.room.players) {
      p.pawns = freshPawns();
      p.hasCaptured = false;
      p.ready = false;
      p.left = false;
    }
    this.room.gameOver = null;
    this.room.lastMove = null;
    this.room.bonusPending = false;
    this.room.paused = false;
    this.room.pausedById = null;
    this.room.activePlayerId = this.room.turnOrder[0] ?? null;
    await this.enterRoll();
  }

  private async enterRoll(): Promise<void> {
    this.room.currentRoll = null;
    this.room.lastMove = null;
    this.room.bonusPending = false;
    await this.setPhase("roll", TURN_TIMEOUT_MS);
  }

  private async doRoll(): Promise<void> {
    const active = this.getPlayer(this.room.activePlayerId);
    if (!active) return;
    this.room.currentRoll = rollShells();
    this.broadcastEvent({
      kind: "rolled",
      playerId: active.id,
      value: this.room.currentRoll,
    });
    await this.setPhase("move", TURN_TIMEOUT_MS);
  }

  private async applyMove(playerId: string, pawnIndex: number): Promise<void> {
    const me = this.getPlayer(playerId);
    const roll = this.room.currentRoll;
    if (!me || !me.color || roll === null) return;

    const from = me.pawns[pawnIndex]!;
    const to = destForPawn(from, roll);
    me.pawns[pawnIndex] = to;
    this.room.lastMove = { playerId: me.id, pawnIndex, from, to };

    let captured = false;
    if (to === CENTER_INDEX) {
      this.broadcastEvent({ kind: "pawnHome", playerId: me.id, pawnIndex });
    } else {
      const coord = coordFor(me.color, to);
      if (coord && !isSafeCell(coord)) {
        for (const op of this.room.players) {
          if (op.id === me.id || !op.color || op.left) continue;
          for (let j = 0; j < op.pawns.length; j++) {
            const opPos = op.pawns[j]!;
            if (opPos < 0 || opPos === CENTER_INDEX) continue;
            const opCoord = coordFor(op.color, opPos);
            if (opCoord && opCoord[0] === coord[0] && opCoord[1] === coord[1]) {
              op.pawns[j] = 0; // send home
              captured = true;
              this.broadcastEvent({
                kind: "captured",
                byPlayerId: me.id,
                victimPlayerId: op.id,
                coord: [coord[0], coord[1]],
              });
            }
          }
        }
      }
    }

    if (captured) me.hasCaptured = true;
    this.room.bonusPending = isBonusRoll(roll) || captured;

    this.broadcastEvent({
      kind: "moved",
      playerId: me.id,
      pawnIndex,
      from,
      to,
    });

    await this.setPhase("resolution", RESOLUTION_MS);
  }

  private async doSkip(playerId: string): Promise<void> {
    if (this.room.activePlayerId !== playerId) return;
    this.room.bonusPending = false;
    this.room.lastMove = null;
    await this.setPhase("resolution", RESOLUTION_MS);
  }

  private nextConnectedAfter(id: string | null): string | null {
    const order = this.room.turnOrder;
    if (order.length === 0) return null;
    const start = id ? order.indexOf(id) : -1;
    for (let step = 1; step <= order.length; step++) {
      const cand = order[(start + step + order.length) % order.length]!;
      const p = this.getPlayer(cand);
      if (p && p.connected && !p.left) return cand;
    }
    // No one connected — keep the current active player.
    return id;
  }

  private async afterResolution(): Promise<void> {
    const active = this.getPlayer(this.room.activePlayerId);
    if (active && finishedCount(active.pawns) === PAWNS_PER_PLAYER) {
      await this.endGame(active.id);
      return;
    }
    if (this.room.bonusPending) {
      await this.enterRoll();
      return;
    }
    const next = this.nextConnectedAfter(this.room.activePlayerId);
    this.room.activePlayerId = next;
    if (next) this.broadcastEvent({ kind: "turnPassed", playerId: next });
    await this.enterRoll();
  }

  /** Players still in the game: were dealt a color and have not left. */
  private seatedPlayers(): PlayerSecret[] {
    return this.room.turnOrder
      .map((id) => this.getPlayer(id))
      .filter((p): p is PlayerSecret => Boolean(p) && !p!.left);
  }

  /** End the game when 0 or 1 seated players remain (after an exit). */
  private async checkLastStanding(): Promise<boolean> {
    if (this.room.phase === "lobby" || this.room.phase === "endgame") return false;
    const seated = this.seatedPlayers();
    if (seated.length <= 1) {
      await this.endGame(seated[0]?.id ?? null);
      return true;
    }
    return false;
  }

  private buildGameOver(winnerId: string | null): GameOverResult {
    const standings = [...this.room.players]
      .filter((p) => this.room.turnOrder.includes(p.id) || (p.left && p.color))
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        finishedCount: finishedCount(p.pawns),
        maxProgress: maxProgress(p.pawns),
        left: p.left,
      }))
      .sort((a, b) => {
        // Non-left players rank above those who quit.
        if (a.left !== b.left) return a.left ? 1 : -1;
        return b.finishedCount - a.finishedCount || b.maxProgress - a.maxProgress;
      });
    const winner = winnerId ? this.getPlayer(winnerId) : undefined;
    return {
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      standings,
    };
  }

  private async endGame(winnerId: string | null): Promise<void> {
    const result = this.buildGameOver(winnerId);
    this.room.gameOver = result;
    this.room.activePlayerId = null;
    this.room.currentRoll = null;
    await this.setPhase("endgame", null);
    this.broadcastEvent({ kind: "gameOver", result });
  }

  private async returnToLobby(): Promise<void> {
    this.room.turnOrder = [];
    this.room.activePlayerId = null;
    this.room.currentRoll = null;
    this.room.bonusPending = false;
    this.room.lastMove = null;
    this.room.gameOver = null;
    this.room.paused = false;
    this.room.pausedById = null;
    for (const p of this.room.players) {
      p.pawns = freshPawns();
      p.hasCaptured = false;
      p.ready = false;
      p.left = false;
    }
    await this.setPhase("lobby", null);
  }

  async alarm(): Promise<void> {
    if (this.room.paused) return;
    switch (this.room.phase) {
      case "roll":
        await this.doRoll();
        break;
      case "move": {
        const active = this.getPlayer(this.room.activePlayerId);
        if (!active || this.room.currentRoll === null) break;
        const valid = computeValidMoves(
          active.pawns,
          this.room.currentRoll,
          active.hasCaptured,
          active.color ?? undefined,
        );
        if (valid.length > 0) await this.applyMove(active.id, valid[0]!);
        else await this.doSkip(active.id);
        break;
      }
      case "resolution":
        await this.afterResolution();
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------- socket ---

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/internal/init" && request.method === "POST") {
      const body = (await request.json()) as { code: string };
      if (!this.room.code) {
        this.room = emptyRoom(body.code.toUpperCase());
        await this.persist();
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server);

      const roleParam = url.searchParams.get("role");
      const role: ClientRole = roleParam === "host" ? "host" : "player";
      const playerId = url.searchParams.get("playerId");

      const meta: SessionMeta = {
        playerId: playerId && playerId.length > 0 ? playerId : null,
        role,
      };
      server.serializeAttachment(meta);
      this.sessions.set(server, meta);

      if (role === "host") {
        this.send(server, { type: "state", view: this.buildHostView() });
      } else if (meta.playerId) {
        const existing = this.room.players.find((p) => p.id === meta.playerId);
        if (existing) {
          existing.connected = true;
          existing.disconnectAt = null;
          this.send(server, {
            type: "state",
            view: this.buildPlayerView(existing.id)!,
          });
          this.broadcastState();
          await this.persist();
        }
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.send(ws, {
        type: "event",
        event: { kind: "error", message: "Invalid JSON" },
      });
      return;
    }

    const result = ClientMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.send(ws, {
        type: "event",
        event: { kind: "error", message: "Invalid message" },
      });
      return;
    }

    await this.handleMessage(ws, result.data);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (!meta?.playerId || meta.role === "host") return;

    const stillConnected = [...this.sessions.values()].some(
      (m) => m.playerId === meta.playerId && m.role === "player",
    );
    if (stillConnected) return;

    const player = this.room.players.find((p) => p.id === meta.playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectAt = Date.now();
    if (this.room.phase !== "lobby" && player.isHost) {
      this.promoteHost();
    }
    await this.persist();
    this.broadcastState();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private requirePlayer(ws: WebSocket, meta: SessionMeta): PlayerSecret | null {
    if (!meta.playerId) {
      this.send(ws, {
        type: "event",
        event: { kind: "error", message: "Not joined" },
      });
      return null;
    }
    const me = this.room.players.find((p) => p.id === meta.playerId);
    if (!me) {
      this.send(ws, {
        type: "event",
        event: { kind: "error", message: "Player not found" },
      });
      return null;
    }
    return me;
  }

  private async handleMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
    const meta = this.sessions.get(ws) ?? { playerId: null, role: "player" as const };

    switch (msg.type) {
      case "join":
      case "reconnect": {
        if (meta.role === "host" || msg.role === "host") {
          meta.role = "host";
          meta.playerId = null;
          ws.serializeAttachment(meta);
          this.sessions.set(ws, meta);
          this.send(ws, { type: "state", view: this.buildHostView() });
          return;
        }

        let player = this.room.players.find((p) => p.id === msg.playerId);
        if (player) {
          player.connected = true;
          player.disconnectAt = null;
          if (
            this.room.phase === "lobby" &&
            "name" in msg &&
            typeof msg.name === "string" &&
            msg.name.trim()
          ) {
            player.name = msg.name.trim().slice(0, 16);
          }
        } else {
          if (this.room.phase !== "lobby") {
            this.send(ws, {
              type: "event",
              event: { kind: "error", message: "Game already in progress" },
            });
            return;
          }
          if (this.room.players.length >= this.lobbyCapacity()) {
            this.send(ws, {
              type: "event",
              event: { kind: "error", message: "Room is full" },
            });
            return;
          }
          const isFirst = this.room.players.length === 0;
          player = {
            id: msg.playerId,
            name:
              ("name" in msg && msg.name) ||
              `Player ${this.room.players.length + 1}`,
            isHost: isFirst,
            connected: true,
            color: this.firstFreeColor(),
            ready: false,
            pawns: freshPawns(),
            hasCaptured: false,
            disconnectAt: null,
            left: false,
          };
          this.room.players.push(player);
          if (isFirst) this.room.hostPlayerId = player.id;
          this.syncHostFlags();
        }
        meta.playerId = player.id;
        meta.role = "player";
        ws.serializeAttachment(meta);
        this.sessions.set(ws, meta);
        this.ensureHost();
        await this.persist();
        this.broadcastState();
        break;
      }

      case "setName": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.phase !== "lobby") return;
        me.name = msg.name.trim().slice(0, 16);
        await this.persist();
        this.broadcastState();
        break;
      }

      case "setColor": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.phase !== "lobby") return;

        if (this.room.expectedPlayerCount === 2) {
          const other = this.room.players.find((p) => p.id !== me.id);
          // In 2p, any pick is allowed; the other seat is forced opposite.
          me.color = msg.color;
          if (other) other.color = oppositeColor(msg.color);
          me.ready = false;
          if (other) other.ready = false;
          await this.persist();
          this.broadcastState();
          break;
        }

        if (this.takenColors(me.id).has(msg.color)) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "That color is taken" },
          });
          return;
        }
        me.color = msg.color;
        await this.persist();
        this.broadcastState();
        break;
      }

      case "setExpectedPlayers": {
        const me = this.requirePlayer(ws, meta);
        const isHost =
          me != null &&
          this.room.hostPlayerId != null &&
          me.id === this.room.hostPlayerId;
        if (!me || !isHost) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Only the host can set party size" },
          });
          return;
        }
        if (this.room.phase !== "lobby") return;
        if (this.room.players.length > 1) {
          this.send(ws, {
            type: "event",
            event: {
              kind: "error",
              message: "Party size is locked after players join",
            },
          });
          return;
        }
        const count = msg.count;
        if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
          this.send(ws, {
            type: "event",
            event: {
              kind: "error",
              message: `Party size must be ${MIN_PLAYERS}-${MAX_PLAYERS}`,
            },
          });
          return;
        }
        const prev = this.room.expectedPlayerCount;
        this.room.expectedPlayerCount = count;
        if (prev !== count) {
          this.clearAllReady();
          if (count === 2) this.seatTwoPlayerOpposites();
        }
        await this.persist();
        this.broadcastState();
        break;
      }

      case "setReady": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.phase !== "lobby") return;
        if (!me.color) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Pick a color first" },
          });
          return;
        }
        me.ready = Boolean(msg.ready);
        await this.persist();
        this.broadcastState();
        break;
      }

      case "startGame": {
        const me = this.requirePlayer(ws, meta);
        if (!me || !me.isHost) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Only the host can start" },
          });
          return;
        }
        if (!this.canStart()) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Waiting for everyone to pick a color and ready up" },
          });
          return;
        }
        await this.beginGame();
        break;
      }

      case "rematch": {
        const me = this.requirePlayer(ws, meta);
        if (!me || !me.isHost) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Only the host can rematch" },
          });
          return;
        }
        if (this.room.phase !== "endgame") return;
        await this.returnToLobby();
        break;
      }

      case "throwShells": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.paused) return;
        if (this.room.phase !== "roll" || this.room.activePlayerId !== me.id) return;
        await this.doRoll();
        break;
      }

      case "movePawn": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.paused) return;
        if (this.room.phase !== "move" || this.room.activePlayerId !== me.id) return;
        if (this.room.currentRoll === null) return;
        const valid = computeValidMoves(
          me.pawns,
          this.room.currentRoll,
          me.hasCaptured,
          me.color ?? undefined,
        );
        if (!valid.includes(msg.pawnIndex)) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "That pawn can't move" },
          });
          return;
        }
        await this.applyMove(me.id, msg.pawnIndex);
        break;
      }

      case "skipTurn": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.paused) return;
        if (this.room.phase !== "move" || this.room.activePlayerId !== me.id) return;
        if (this.room.currentRoll === null) return;
        const valid = computeValidMoves(
          me.pawns,
          this.room.currentRoll,
          me.hasCaptured,
          me.color ?? undefined,
        );
        if (valid.length > 0) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "You still have a valid move" },
          });
          return;
        }
        await this.doSkip(me.id);
        break;
      }

      case "pauseGame": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        const inPlay =
          this.room.phase === "roll" ||
          this.room.phase === "move" ||
          this.room.phase === "resolution";
        if (!inPlay || this.room.paused) return;
        this.room.paused = true;
        this.room.pausedById = me.id;
        this.room.phaseEndsAt = null;
        await this.state.storage.deleteAlarm();
        this.broadcastEvent({ kind: "paused", byName: me.name });
        this.broadcastState();
        await this.persist();
        break;
      }

      case "resumeGame": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (!this.room.paused) return;
        this.room.paused = false;
        this.room.pausedById = null;
        await this.restartPhaseTimer();
        this.broadcastEvent({ kind: "resumed" });
        this.broadcastState();
        await this.persist();
        break;
      }

      case "exitGame": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;

        // Lobby: drop the player entirely, like a disconnect prune.
        if (this.room.phase === "lobby") {
          this.room.players = this.room.players.filter((p) => p.id !== me.id);
          if (this.room.expectedPlayerCount === 2) this.seatTwoPlayerOpposites();
          this.ensureHost();
          this.broadcastEvent({ kind: "playerLeft", playerId: me.id, name: me.name });
          await this.persist();
          this.broadcastState();
          break;
        }

        // Endgame: nothing to eliminate; just acknowledge.
        if (this.room.phase === "endgame") {
          this.broadcastEvent({ kind: "playerLeft", playerId: me.id, name: me.name });
          break;
        }

        // In-game: eliminate — remove pawns, drop from turn order, continue.
        const wasActive = this.room.activePlayerId === me.id;
        me.left = true;
        me.pawns = me.pawns.map(() => CENTER_INDEX + 1); // off-board sentinel
        me.ready = false;
        this.room.turnOrder = this.room.turnOrder.filter((id) => id !== me.id);
        if (me.isHost) this.promoteHost();
        this.broadcastEvent({ kind: "playerLeft", playerId: me.id, name: me.name });

        // If the pause holder left, clear the pause.
        if (this.room.pausedById === me.id) {
          this.room.paused = false;
          this.room.pausedById = null;
        }

        const ended = await this.checkLastStanding();
        if (!ended) {
          if (this.room.paused) {
            // Stay paused; just refresh state so the seat vanishes.
            this.broadcastState();
            await this.persist();
          } else if (wasActive) {
            const next = this.nextConnectedAfter(me.id);
            this.room.activePlayerId = next;
            if (next) this.broadcastEvent({ kind: "turnPassed", playerId: next });
            await this.enterRoll();
          } else {
            this.broadcastState();
            await this.persist();
          }
        }
        break;
      }
    }
  }
}
