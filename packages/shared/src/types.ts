import { z } from "zod";
import { COLORS, PAWN_SHAPES } from "./constants.js";

export const PhaseSchema = z.enum([
  "lobby",
  "roll",
  "move",
  "resolution",
  "endgame",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const ClientRoleSchema = z.enum(["host", "player"]);
export type ClientRole = z.infer<typeof ClientRoleSchema>;

export const ColorSchema = z.enum(COLORS);
export type Color = z.infer<typeof ColorSchema>;

export const PawnShapeSchema = z.enum(PAWN_SHAPES);
export type PawnShape = z.infer<typeof PawnShapeSchema>;

export const PlayerPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  isHost: z.boolean(),
  connected: z.boolean(),
  color: ColorSchema.nullable(),
  shape: PawnShapeSchema.nullable().optional().default(null),
  ready: z.boolean().optional().default(false),
  /** Pawn track positions, length 4: -1 pocket .. 24 center. */
  pawns: z.array(z.number()),
  hasCaptured: z.boolean().optional().default(false),
  finishedCount: z.number().optional().default(0),
  /** Player quit the game — pawns removed, skipped in turn order. */
  left: z.boolean().optional().default(false),
});
export type PlayerPublic = z.infer<typeof PlayerPublicSchema>;

export const StandingSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: ColorSchema.nullable(),
  finishedCount: z.number(),
  maxProgress: z.number(),
  left: z.boolean().optional().default(false),
});
export type Standing = z.infer<typeof StandingSchema>;

export const GameOverResultSchema = z.object({
  winnerId: z.string().nullable(),
  winnerName: z.string().nullable(),
  standings: z.array(StandingSchema).optional().default([]),
});
export type GameOverResult = z.infer<typeof GameOverResultSchema>;

export const LastMoveSchema = z.object({
  playerId: z.string(),
  pawnIndex: z.number(),
  from: z.number(),
  to: z.number(),
});
export type LastMove = z.infer<typeof LastMoveSchema>;

const sharedViewFields = {
  code: z.string(),
  phase: PhaseSchema,
  players: z.array(PlayerPublicSchema),
  activePlayerId: z.string().nullable(),
  currentRoll: z.number().nullable(),
  lastMove: LastMoveSchema.nullable().optional().default(null),
  phaseEndsAt: z.number().nullable(),
  canStart: z.boolean().optional().default(false),
  expectedPlayerCount: z.number().nullable().optional().default(null),
  gameOver: GameOverResultSchema.nullable().optional().default(null),
  paused: z.boolean().optional().default(false),
  pausedByName: z.string().nullable().optional().default(null),
};

/** Host TV snapshot — full, public board (perfect-information game). */
export const HostViewSchema = z.object({
  role: z.literal("host"),
  ...sharedViewFields,
});
export type HostView = z.infer<typeof HostViewSchema>;

/** Phone controller snapshot — full board plus this player's controls. */
export const PlayerViewSchema = z.object({
  role: z.literal("player"),
  ...sharedViewFields,
  myPlayerId: z.string(),
  myColor: ColorSchema.nullable(),
  myShape: PawnShapeSchema.nullable().optional().default(null),
  isMyTurn: z.boolean(),
  myValidMoves: z.array(z.number()).optional().default([]),
  myReady: z.boolean().optional().default(false),
  isHost: z.boolean(),
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

export const RoomViewSchema = z.discriminatedUnion("role", [
  HostViewSchema,
  PlayerViewSchema,
]);
export type RoomView = z.infer<typeof RoomViewSchema>;
