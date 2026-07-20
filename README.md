# CHOWKA BHARA

Multiplayer party version of the classic Indian cross-and-circle race game — Jackbox-style TV host screen + phone controllers. 2–4 players, ~15–30 min.

**Stack:** pnpm + Turborepo · `@chowka/shared` · Astro + React (Vercel) · Cloudflare Workers + Durable Objects

## Packages

| Path | Package | Role |
|------|---------|------|
| `packages/shared` | `@chowka/shared` | Zod schemas, board paths, capture/roll logic, constants |
| `apps/web` | `@chowka/web` | Host TV + phone UI (Astro islands) |
| `apps/game-server` | `@chowka/game-server` | Authoritative room state (Worker + one Durable Object per room) |

## Prerequisites

- Node 20+
- pnpm 9+

## Local development

```bash
pnpm install
pnpm build          # builds shared first (Turbo)
pnpm dev            # Worker :8787 + web :4321 (+ shared watch)
```

Or run packages separately:

```bash
pnpm --filter @chowka/shared build
pnpm --filter @chowka/game-server dev   # http://localhost:8787
pnpm --filter @chowka/web dev           # http://localhost:4321
```

### Env

`apps/web/.env` (copy from `.env.example`):

```
PUBLIC_GAME_SERVER_URL=http://localhost:8787
```

`apps/game-server/wrangler.toml` `[vars]`:

```
ALLOWED_ORIGINS = "http://localhost:4321"
```

## Routes (web)

| Path | Purpose |
|------|---------|
| `/` | Create / join lobby |
| `/host?code=ABCD` | TV / PC host display (read-only board) |
| `/play?code=ABCD` | Phone controller |

## How to play

1. Open the site on a phone → **Create Lobby** (you become host) or **Join Lobby** with a 4-letter code.
2. Everyone picks a color (Red, Blue, Green, Yellow), reads the rules, and taps **Ready**.
3. Host taps **Start**. On your turn: **Throw Shells**, then tap a pawn to move it.
4. Land on an opponent (off a starred safe square) to send it home and earn a bonus roll. Roll a 4 or 8 for a bonus roll too.
5. An exact roll lands the center. First to bring all 4 pawns home wins.

## Deploy checklist (both done in-browser)

1. `pnpm build`
2. **Cloudflare** — deploy the Worker (`apps/game-server`) via Workers Builds (Git) or CLI.
   - **Workers Builds (dashboard)** — use these exact commands (do **not** omit `run`; bare `pnpm … deploy` is a different pnpm command and fails with `ERR_PNPM_INVALID_DEPLOY_TARGET`):
     - Build command: `pnpm --filter @chowka/shared build`
     - Deploy command: `pnpm --filter @chowka/game-server run deploy`
   - **CLI:** `pnpm deploy:server` (builds shared, then `wrangler deploy`).
   - Note the URL, e.g. `https://chowka-bhara.<subdomain>.workers.dev`.
3. **Vercel** — deploy `apps/web`:
   - Root Directory: `apps/web`
   - Install Command: `cd ../.. && pnpm install --frozen-lockfile`
   - Build Command: `pnpm vercel-build` (builds `@chowka/shared`, then Astro)
   - Output Directory: leave default (do not override)
   - Env: `PUBLIC_GAME_SERVER_URL` = Worker origin (HTTPS), e.g. `https://chowka-bhara.<subdomain>.workers.dev`
   - Redeploy after setting env.
4. Set the Worker `ALLOWED_ORIGINS` var to your exact Vercel origin(s), comma-separated, e.g. `https://your-app.vercel.app`.

## Game model (server-authoritative)

- One Durable Object per room code; all rules run there. Clients only send intents.
- Board is a 7×7 grid. Each pawn's position is an integer: `-1` = base pocket, `0..48` = track index, `48` = center. Movement is `newPos = pos + roll`.
- `packages/shared/src/paths.ts` holds the canonical spiral for Red and rotates it 90° per color, so all four share one track and captures resolve by absolute cell.
- Safe squares (edge homes, inner-corner Xs, and center) can never be captured on and allow stacking.
- Phases: `lobby → roll → move → resolution → (roll | next turn) → … → endgame`, driven by Durable Object alarms with a per-turn timeout that auto-acts so an idle player never stalls the table.
