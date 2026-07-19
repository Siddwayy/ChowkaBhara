import { z } from "zod";
import { MAX_PLAYERS, MIN_PLAYERS, PAWNS_PER_PLAYER } from "./constants.js";
import {
  ClientRoleSchema,
  ColorSchema,
  GameOverResultSchema,
  RoomViewSchema,
} from "./types.js";

/** Client → server intents. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    playerId: z.string().min(1),
    name: z.string().min(1).max(16).optional(),
    role: ClientRoleSchema,
  }),
  z.object({
    type: z.literal("setName"),
    name: z.string().min(1).max(16),
  }),
  z.object({
    type: z.literal("setColor"),
    color: ColorSchema,
  }),
  z.object({
    type: z.literal("setExpectedPlayers"),
    count: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  }),
  z.object({
    type: z.literal("setReady"),
    ready: z.boolean(),
  }),
  z.object({ type: z.literal("startGame") }),
  z.object({ type: z.literal("rematch") }),
  z.object({ type: z.literal("throwShells") }),
  z.object({
    type: z.literal("movePawn"),
    pawnIndex: z.number().int().min(0).max(PAWNS_PER_PLAYER - 1),
  }),
  z.object({ type: z.literal("skipTurn") }),
  z.object({ type: z.literal("pauseGame") }),
  z.object({ type: z.literal("resumeGame") }),
  z.object({ type: z.literal("exitGame") }),
  z.object({
    type: z.literal("reconnect"),
    playerId: z.string().min(1),
    role: ClientRoleSchema,
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Server → client. */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("state"),
    view: RoomViewSchema,
  }),
  z.object({
    type: z.literal("event"),
    event: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("phaseChanged"), phase: z.string() }),
      z.object({
        kind: z.literal("rolled"),
        playerId: z.string(),
        value: z.number(),
      }),
      z.object({
        kind: z.literal("moved"),
        playerId: z.string(),
        pawnIndex: z.number(),
        from: z.number(),
        to: z.number(),
      }),
      z.object({
        kind: z.literal("captured"),
        byPlayerId: z.string(),
        victimPlayerId: z.string(),
        coord: z.tuple([z.number(), z.number()]),
      }),
      z.object({
        kind: z.literal("pawnHome"),
        playerId: z.string(),
        pawnIndex: z.number(),
      }),
      z.object({ kind: z.literal("turnPassed"), playerId: z.string() }),
      z.object({ kind: z.literal("gameOver"), result: GameOverResultSchema }),
      z.object({ kind: z.literal("paused"), byName: z.string() }),
      z.object({ kind: z.literal("resumed") }),
      z.object({
        kind: z.literal("playerLeft"),
        playerId: z.string(),
        name: z.string(),
      }),
      z.object({ kind: z.literal("error"), message: z.string() }),
    ]),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const CreateLobbyResponseSchema = z.object({
  code: z.string(),
});
export type CreateLobbyResponse = z.infer<typeof CreateLobbyResponseSchema>;
