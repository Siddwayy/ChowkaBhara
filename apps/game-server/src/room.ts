import {
  COLORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PAWN_SHAPES,
  PAWNS_PER_PLAYER,
  RECONNECT_GRACE_MS,
  RESOLUTION_ALARM_SLACK_MS,
  TRAVEL_SETTLE_MS,
  resolutionMsForSteps,
  ROLL_TIMEOUT_MS,
  MOVE_TIMEOUT_MS,
  SKIP_TIMEOUT_MS,
  ClientMessageSchema,
  computeValidMoves,
  coordForMode,
  destForPawn,
  finishedCount,
  getBoardConfig,
  isBoardMode,
  isBonusRoll,
  isSafeCellMode,
  maxProgress,
  oppositeColor,
  rollShells,
  type BoardMode,
  type ClientMessage,
  type ClientRole,
  type Color,
  type GameOverResult,
  type HostView,
  type LastMove,
  type PawnShape,
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
  shape: PawnShape | null;
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
  boardMode: BoardMode;
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

function emptyRoom(
  code: string,
  opts?: { boardMode?: BoardMode; expectedPlayerCount?: number },
): RoomState {
  return {
    code,
    phase: "lobby",
    players: [],
    turnOrder: [],
    activePlayerId: null,
    currentRoll: null,
    bonusPending: false,
    lastMove: null,
    expectedPlayerCount: opts?.expectedPlayerCount ?? MIN_PLAYERS,
    boardMode: opts?.boardMode && isBoardMode(opts.boardMode) ? opts.boardMode : "7x7",
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
    shape: p.shape ?? null,
    pawns: Array.isArray(p.pawns) && p.pawns.length === PAWNS_PER_PLAYER ? p.pawns : freshPawns(),
    hasCaptured: p.hasCaptured ?? false,
    disconnectAt: p.disconnectAt ?? null,
    left: p.left ?? false,
  }));
  // Backfill shapes for rooms persisted before pawn shapes existed.
  for (const p of players) {
    if (p.shape) continue;
    const taken = new Set(
      players.map((x) => x.shape).filter(Boolean) as PawnShape[],
    );
    p.shape = PAWN_SHAPES.find((s) => !taken.has(s)) ?? "circle";
  }
  const hostPlayerId =
    stored.hostPlayerId ?? players.find((p) => p.isHost)?.id ?? players[0]?.id ?? null;
  return {
    ...base,
    ...stored,
    expectedPlayerCount: stored.expectedPlayerCount ?? MIN_PLAYERS,
    boardMode: isBoardMode(stored.boardMode) ? stored.boardMode : "7x7",
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
      await this.ensurePhaseAlarm();
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, this.room);
  }

  // ---------------------------------------------------------------- lobby ---

  private pruneStaleLobbyPlayers(): boolean {
    if (this.room.phase !== "lobby") return false;
    const now = Date.now();
    const before = this.room.players.length;
    this.room.players = this.room.players.filter((p) => {
      if (p.connected) return true;
      if (p.disconnectAt && now - p.disconnectAt < RECONNECT_GRACE_MS) return true;
      return false;
    });
    if (this.room.players.length !== before) {
      this.ensureHost();
      return true;
    }
    return false;
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

  /** Case-insensitive; ignores left players and optionally one seat (self). */
  private isNameTaken(name: string, exceptId?: string): boolean {
    const key = name.trim().toLowerCase();
    if (!key) return false;
    return this.room.players.some(
      (p) => !p.left && p.id !== exceptId && p.name.trim().toLowerCase() === key,
    );
  }

  private firstFreeColor(): Color | null {
    const taken = this.takenColors();
    // 2-player: always seat face-to-face opposites.
    if (this.room.expectedPlayerCount === 2) {
      const seated = this.room.players.find((p) => p.color);
      if (seated?.color) {
        const opp = oppositeColor(seated.color);
        return taken.has(opp) ? null : opp;
      }
      return taken.has("red") ? null : "red";
    }
    return COLORS.find((c) => !taken.has(c)) ?? null;
  }

  private takenShapes(exceptId?: string): Set<PawnShape> {
    const set = new Set<PawnShape>();
    for (const p of this.room.players) {
      if (p.id === exceptId) continue;
      if (p.shape) set.add(p.shape);
    }
    return set;
  }

  private firstFreeShape(): PawnShape | null {
    const taken = this.takenShapes();
    return PAWN_SHAPES.find((s) => !taken.has(s)) ?? null;
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
    const expected = this.room.expectedPlayerCount;
    if (this.room.phase !== "lobby" || expected === null) return false;
    const connected = this.room.players.filter((p) => p.connected);
    return (
      connected.length === expected &&
      connected.length >= MIN_PLAYERS &&
      connected.every((p) => p.ready && p.color !== null && p.shape !== null)
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
      this.room.boardMode,
    );
  }

  private toPublicPlayers(): PlayerPublic[] {
    const mode = this.room.boardMode;
    return this.room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
      color: p.color,
      shape: p.shape,
      ready: this.room.phase === "lobby" ? Boolean(p.ready) : false,
      pawns: [...p.pawns],
      hasCaptured: p.hasCaptured,
      finishedCount: finishedCount(p.pawns, mode),
      left: p.left,
    }));
  }

  private pausedByName(): string | null {
    if (!this.room.paused) return null;
    return this.getPlayer(this.room.pausedById)?.name ?? null;
  }

  private sharedViewFields(
    players: PlayerPublic[],
    canStart: boolean,
    pausedByName: string | null,
  ) {
    return {
      code: this.room.code,
      phase: this.room.phase,
      players,
      activePlayerId: this.room.activePlayerId,
      currentRoll: this.room.currentRoll,
      lastMove: this.room.lastMove,
      phaseEndsAt: this.room.phaseEndsAt,
      canStart,
      expectedPlayerCount: this.room.expectedPlayerCount,
      boardMode: this.room.boardMode,
      gameOver: this.room.gameOver,
      paused: this.room.paused,
      pausedByName,
    };
  }

  private buildHostView(): HostView {
    return {
      role: "host",
      ...this.sharedViewFields(
        this.toPublicPlayers(),
        this.canStart(),
        this.pausedByName(),
      ),
    };
  }

  private buildPlayerView(
    playerId: string,
    shared?: ReturnType<RoomDurableObject["sharedViewFields"]>,
  ): PlayerView | null {
    const me = this.getPlayer(playerId);
    if (!me) return null;
    const isMyTurn =
      this.room.activePlayerId === me.id &&
      (this.room.phase === "roll" || this.room.phase === "move");
    const base =
      shared ??
      this.sharedViewFields(this.toPublicPlayers(), this.canStart(), this.pausedByName());
    return {
      role: "player",
      ...base,
      myPlayerId: me.id,
      myColor: me.color,
      myShape: me.shape,
      isMyTurn,
      myValidMoves: this.validMovesFor(me),
      myReady: me.ready,
      isHost: me.isHost,
    };
  }

  private sendRaw(ws: WebSocket, raw: string): void {
    try {
      ws.send(raw);
    } catch {
      /* closed */
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private broadcastState(): void {
    this.pruneStaleLobbyPlayers();
    const players = this.toPublicPlayers();
    const canStart = this.canStart();
    const pausedByName = this.pausedByName();
    const shared = this.sharedViewFields(players, canStart, pausedByName);

    let hostRaw: string | null = null;
    const playerRaw = new Map<string, string>();

    for (const [ws, meta] of this.sessions) {
      if (meta.role === "host") {
        if (!hostRaw) {
          const view: HostView = { role: "host", ...shared };
          hostRaw = JSON.stringify({ type: "state", view } satisfies ServerMessage);
        }
        this.sendRaw(ws, hostRaw);
      } else if (meta.playerId) {
        let raw = playerRaw.get(meta.playerId);
        if (!raw) {
          const view = this.buildPlayerView(meta.playerId, shared);
          if (!view) continue;
          raw = JSON.stringify({ type: "state", view } satisfies ServerMessage);
          playerRaw.set(meta.playerId, raw);
        }
        this.sendRaw(ws, raw);
      }
    }
  }

  private broadcastEvent(
    event: Extract<ServerMessage, { type: "event" }>["event"],
  ): void {
    const raw = JSON.stringify({ type: "event", event } satisfies ServerMessage);
    for (const [ws] of this.sessions) this.sendRaw(ws, raw);
  }

  private async setPhase(phase: Phase, durationMs: number | null): Promise<void> {
    this.room.phase = phase;
    if (durationMs !== null) {
      this.room.phaseEndsAt = Date.now() + durationMs;
    } else {
      this.room.phaseEndsAt = null;
    }
    this.broadcastState();
    await Promise.all([
      durationMs !== null
        ? this.state.storage.setAlarm(this.room.phaseEndsAt!)
        : this.state.storage.deleteAlarm(),
      this.persist(),
    ]);
  }

  private resolutionDurationMs(): number {
    const lm = this.room.lastMove;
    if (!lm) return TRAVEL_SETTLE_MS + RESOLUTION_ALARM_SLACK_MS;
    return resolutionMsForSteps(Math.max(1, lm.to - Math.max(0, lm.from)));
  }

  /** Restart the timer for the current phase (used when resuming from pause). */
  private async restartPhaseTimer(): Promise<void> {
    let durationMs: number | null = null;
    if (this.room.phase === "roll") {
      durationMs = ROLL_TIMEOUT_MS;
    } else if (this.room.phase === "move") {
      durationMs = this.moveTimeoutMs();
    } else if (this.room.phase === "resolution") {
      durationMs = this.resolutionDurationMs();
    }
    if (durationMs !== null) {
      this.room.phaseEndsAt = Date.now() + durationMs;
      await this.state.storage.setAlarm(this.room.phaseEndsAt);
    } else {
      this.room.phaseEndsAt = null;
      await this.state.storage.deleteAlarm();
    }
  }

  /**
   * Heal a missing/expired phase alarm without resetting a still-valid timer.
   * No-op while paused (pause owns the timer lifecycle).
   */
  private async ensurePhaseAlarm(): Promise<void> {
    if (this.room.paused) return;
    const timed =
      this.room.phase === "roll" ||
      this.room.phase === "move" ||
      this.room.phase === "resolution";
    if (!timed) return;

    const now = Date.now();
    const existing = await this.state.storage.getAlarm();
    const endsAt = this.room.phaseEndsAt;

    if (endsAt != null && endsAt > now && existing != null) {
      return;
    }

    if (endsAt != null && endsAt > now) {
      await this.state.storage.setAlarm(endsAt);
      return;
    }

    // Missing or overdue — schedule ASAP (or a fresh full window if no end time).
    if (endsAt != null && endsAt <= now) {
      this.room.phaseEndsAt = now;
      await this.state.storage.setAlarm(now);
      return;
    }

    await this.restartPhaseTimer();
  }

  /** 45s when there are legal moves; 10s when the player can only skip. */
  private moveTimeoutMs(): number {
    const active = this.getPlayer(this.room.activePlayerId);
    if (!active || this.room.currentRoll === null) return MOVE_TIMEOUT_MS;
    const valid = computeValidMoves(
      active.pawns,
      this.room.currentRoll,
      active.hasCaptured,
      active.color ?? undefined,
      this.room.boardMode,
    );
    return valid.length > 0 ? MOVE_TIMEOUT_MS : SKIP_TIMEOUT_MS;
  }

  // ----------------------------------------------------------- game loop ---

  private async beginGame(): Promise<void> {
    const seated = this.room.players.filter(
      (p) => p.connected && p.ready && p.color && p.shape,
    );
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
    // No connected seated players — cancel timers instead of looping forever.
    if (!this.room.activePlayerId || !this.getPlayer(this.room.activePlayerId)?.connected) {
      const next = this.nextConnectedAfter(this.room.activePlayerId);
      this.room.activePlayerId = next;
      if (!next) {
        this.room.currentRoll = null;
        this.room.lastMove = null;
        this.room.bonusPending = false;
        this.room.phaseEndsAt = null;
        await this.state.storage.deleteAlarm();
        this.broadcastState();
        await this.persist();
        return;
      }
    }
    this.room.currentRoll = null;
    this.room.lastMove = null;
    this.room.bonusPending = false;
    await this.setPhase("roll", ROLL_TIMEOUT_MS);
  }

  private async doRoll(): Promise<void> {
    const active = this.getPlayer(this.room.activePlayerId);
    if (!active || active.left || !active.connected) {
      const next = this.nextConnectedAfter(this.room.activePlayerId);
      this.room.activePlayerId = next;
      if (next) await this.enterRoll();
      else {
        this.room.phaseEndsAt = null;
        await this.state.storage.deleteAlarm();
        await this.persist();
      }
      return;
    }
    this.room.currentRoll = rollShells();
    this.broadcastEvent({
      kind: "rolled",
      playerId: active.id,
      value: this.room.currentRoll,
    });
    await this.setPhase("move", this.moveTimeoutMs());
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
    const mode = this.room.boardMode;
    const center = getBoardConfig(mode).centerIndex;
    if (to === center) {
      this.broadcastEvent({ kind: "pawnHome", playerId: me.id, pawnIndex });
    } else {
      const coord = coordForMode(mode, me.color, to);
      if (coord && !isSafeCellMode(mode, coord)) {
        for (const op of this.room.players) {
          if (op.id === me.id || !op.color || op.left) continue;
          for (let j = 0; j < op.pawns.length; j++) {
            const opPos = op.pawns[j]!;
            if (opPos < 0 || opPos === center) continue;
            const opCoord = coordForMode(mode, op.color, opPos);
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

    const steps = Math.max(1, to - Math.max(0, from));
    await this.setPhase("resolution", resolutionMsForSteps(steps));
  }

  private async doSkip(playerId: string): Promise<void> {
    if (this.room.activePlayerId !== playerId) return;
    this.room.bonusPending = false;
    this.room.lastMove = null;
    await this.setPhase("resolution", TRAVEL_SETTLE_MS + RESOLUTION_ALARM_SLACK_MS);
  }

  private nextConnectedAfter(id: string | null): string | null {
    const order = this.room.turnOrder;
    if (order.length === 0) return null;
    const start = id ? order.indexOf(id) : -1;
    // If id is not in the order (already removed), start from the end so
    // step 1 yields order[0] — callers that need “after leaver” should pass
    // the previous neighbor or resolve next before removal.
    for (let step = 1; step <= order.length; step++) {
      const cand = order[(start + step + order.length) % order.length]!;
      const p = this.getPlayer(cand);
      if (p && p.connected && !p.left) return cand;
    }
    // Nobody connected — stop the auto-play loop.
    return null;
  }

  /** Next seated player after `id`, even if `id` is about to leave the order. */
  private nextAfterLeaving(id: string): string | null {
    const order = this.room.turnOrder;
    const start = order.indexOf(id);
    if (start === -1) return this.nextConnectedAfter(null);
    for (let step = 1; step <= order.length; step++) {
      const cand = order[(start + step) % order.length]!;
      if (cand === id) continue;
      const p = this.getPlayer(cand);
      if (p && p.connected && !p.left) return cand;
    }
    return null;
  }

  private async afterResolution(): Promise<void> {
    const active = this.getPlayer(this.room.activePlayerId);
    if (active && finishedCount(active.pawns, this.room.boardMode) === PAWNS_PER_PLAYER) {
      await this.endGame(active.id);
      return;
    }
    if (this.room.bonusPending) {
      await this.enterRoll();
      return;
    }
    const next = this.nextConnectedAfter(this.room.activePlayerId);
    this.room.activePlayerId = next;
    if (!next) {
      // Nobody left to take a turn — end rather than sit in resolution forever.
      await this.endGame(null);
      return;
    }
    this.broadcastEvent({ kind: "turnPassed", playerId: next });
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
        finishedCount: finishedCount(p.pawns, this.room.boardMode),
        maxProgress: maxProgress(p.pawns, this.room.boardMode),
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
        if (!active || active.left || !active.connected || this.room.currentRoll === null) {
          await this.enterRoll();
          break;
        }
        const valid = computeValidMoves(
          active.pawns,
          this.room.currentRoll,
          active.hasCaptured,
          active.color ?? undefined,
          this.room.boardMode,
        );
        if (valid.length > 0) {
          const pick = valid[Math.floor(Math.random() * valid.length)]!;
          await this.applyMove(active.id, pick);
        } else {
          await this.doSkip(active.id);
        }
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
      const body = (await request.json().catch(() => null)) as {
        code?: string;
        boardMode?: unknown;
        expectedPlayerCount?: unknown;
      } | null;
      const code = typeof body?.code === "string" ? body.code.toUpperCase().trim() : "";
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing code" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Only seed a brand-new DO; never wipe or reuse an occupied room.
      if (this.room.code) {
        return new Response(
          JSON.stringify({ ok: false, created: false, code: this.room.code }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const boardMode =
        body !== null && isBoardMode(body.boardMode) ? body.boardMode : "7x7";
      const rawCount = body?.expectedPlayerCount;
      const expectedPlayerCount =
        typeof rawCount === "number" &&
        Number.isInteger(rawCount) &&
        rawCount >= MIN_PLAYERS &&
        rawCount <= MAX_PLAYERS
          ? rawCount
          : MIN_PLAYERS;
      this.room = emptyRoom(code, { boardMode, expectedPlayerCount });
      await this.persist();
      return new Response(JSON.stringify({ ok: true, created: true, code }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const codeParam = url.searchParams.get("code")?.toUpperCase().trim();
      if (codeParam && !this.room.code) {
        this.room = emptyRoom(codeParam);
        await this.persist();
      }
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
      // Client sends join/reconnect immediately; avoid a duplicate snapshot fan-out.

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

    let stillConnected = false;
    for (const m of this.sessions.values()) {
      if (m.playerId === meta.playerId && m.role === "player") {
        stillConnected = true;
        break;
      }
    }
    if (stillConnected) return;

    const player = this.room.players.find((p) => p.id === meta.playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectAt = Date.now();
    if (this.room.phase !== "lobby" && player.isHost) {
      this.promoteHost();
    }

    // Pause holder dropped — auto-resume so the room can't soft-lock.
    if (this.room.paused && this.room.pausedById === player.id) {
      this.room.paused = false;
      this.room.pausedById = null;
      await this.restartPhaseTimer();
      this.broadcastEvent({ kind: "resumed" });
    }

    this.broadcastState();
    await this.persist();
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
            const nextName = msg.name.trim().slice(0, 16);
            if (this.isNameTaken(nextName, player.id)) {
              this.send(ws, {
                type: "event",
                event: {
                  kind: "error",
                  message: "That name is already taken in this lobby",
                },
              });
            } else {
              player.name = nextName;
            }
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
          const rawName =
            "name" in msg && typeof msg.name === "string" ? msg.name.trim().slice(0, 16) : "";
          const name = rawName || `Player ${this.room.players.length + 1}`;
          if (this.isNameTaken(name)) {
            this.send(ws, {
              type: "event",
              event: {
                kind: "error",
                message: "That name is already taken in this lobby",
              },
            });
            return;
          }
          player = {
            id: msg.playerId,
            name,
            isHost: isFirst,
            connected: true,
            color: this.firstFreeColor(),
            shape: this.firstFreeShape(),
            ready: false,
            pawns: freshPawns(),
            hasCaptured: false,
            disconnectAt: null,
            left: false,
          };
          this.room.players.push(player);
          if (isFirst) this.room.hostPlayerId = player.id;
          if (this.room.expectedPlayerCount === 2) this.seatTwoPlayerOpposites();
          this.syncHostFlags();
        }
        meta.playerId = player.id;
        meta.role = "player";
        ws.serializeAttachment(meta);
        this.sessions.set(ws, meta);
        this.ensureHost();
        this.broadcastState();
        await this.persist();
        break;
      }

      case "setName": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.phase !== "lobby") return;
        const nextName = msg.name.trim().slice(0, 16);
        if (!nextName) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Enter a name" },
          });
          return;
        }
        if (this.isNameTaken(nextName, me.id)) {
          this.send(ws, {
            type: "event",
            event: {
              kind: "error",
              message: "That name is already taken in this lobby",
            },
          });
          return;
        }
        me.name = nextName;
        this.broadcastState();
        await this.persist();
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
          this.broadcastState();
          await this.persist();
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
        me.ready = false;
        this.broadcastState();
        await this.persist();
        break;
      }

      case "setShape": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.phase !== "lobby") return;
        if (this.takenShapes(me.id).has(msg.shape)) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "That pawn shape is taken" },
          });
          return;
        }
        me.shape = msg.shape;
        me.ready = false;
        this.broadcastState();
        await this.persist();
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
        this.broadcastState();
        await this.persist();
        break;
      }

      case "setBoardMode": {
        const me = this.requirePlayer(ws, meta);
        const isHost =
          me != null &&
          this.room.hostPlayerId != null &&
          me.id === this.room.hostPlayerId;
        if (!me || !isHost) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Only the host can set board mode" },
          });
          return;
        }
        if (this.room.phase !== "lobby") return;
        if (this.room.players.length > 1) {
          this.send(ws, {
            type: "event",
            event: {
              kind: "error",
              message: "Board mode is locked after players join",
            },
          });
          return;
        }
        if (!isBoardMode(msg.mode)) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Invalid board mode" },
          });
          return;
        }
        if (this.room.boardMode !== msg.mode) {
          this.room.boardMode = msg.mode;
          this.clearAllReady();
        }
        this.broadcastState();
        await this.persist();
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
        if (!me.shape) {
          this.send(ws, {
            type: "event",
            event: { kind: "error", message: "Pick a pawn shape first" },
          });
          return;
        }
        me.ready = Boolean(msg.ready);
        this.broadcastState();
        await this.persist();
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
          this.room.boardMode,
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
          this.room.boardMode,
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

      case "advanceResolution": {
        const me = this.requirePlayer(ws, meta);
        if (!me) return;
        if (this.room.paused) return;
        if (this.room.phase !== "resolution") return;
        // Only the player whose turn is resolving may drive the advance; the
        // phase alarm remains as a fallback if their client never sends this.
        if (this.room.activePlayerId !== me.id) return;
        await this.afterResolution();
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
          this.broadcastState();
          await this.persist();
          break;
        }

        // Endgame: nothing to eliminate; just acknowledge.
        if (this.room.phase === "endgame") {
          this.broadcastEvent({ kind: "playerLeft", playerId: me.id, name: me.name });
          break;
        }

        // In-game: eliminate — remove pawns, drop from turn order, continue.
        const wasActive = this.room.activePlayerId === me.id;
        const nextIfActive = wasActive ? this.nextAfterLeaving(me.id) : null;
        me.left = true;
        me.pawns = me.pawns.map(() => -1); // off-board; clamped out of rankings
        me.ready = false;
        this.room.turnOrder = this.room.turnOrder.filter((id) => id !== me.id);
        if (me.isHost) this.promoteHost();
        this.broadcastEvent({ kind: "playerLeft", playerId: me.id, name: me.name });

        // If the pause holder left, clear the pause and restore the phase timer.
        let clearedPause = false;
        if (this.room.pausedById === me.id) {
          this.room.paused = false;
          this.room.pausedById = null;
          clearedPause = true;
        }

        const ended = await this.checkLastStanding();
        if (!ended) {
          if (wasActive) {
            this.room.activePlayerId = nextIfActive;
            if (this.room.paused) {
              this.broadcastState();
              await this.persist();
            } else if (nextIfActive) {
              this.broadcastEvent({ kind: "turnPassed", playerId: nextIfActive });
              await this.enterRoll();
            } else {
              await this.endGame(null);
            }
          } else {
            if (clearedPause) {
              await this.restartPhaseTimer();
            }
            this.broadcastState();
            await this.persist();
          }
        }
        break;
      }
    }
  }
}
