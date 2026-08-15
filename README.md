<div align="center">

# CHOWKA BHARA

<p>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Astro-5-FF5D01?style=for-the-badge&logo=astro&logoColor=white" alt="Astro 5" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Cloudflare_Durable_Objects-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Durable Objects" />
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
</p>

### Real-time multiplayer Indian race game — phones as controllers, TV as the shared board.

[**Play live »**](https://chowkabhara.vercel.app/)

<br />

> A browser-first take on the classic Chowka Bhara / Pachisi family of board games. Create a room, share a four-letter code, throw cowrie shells, race your pawns home, capture opponents, and fight for bonus rolls — all with a server that owns the rules.

<br />

<a href="YOUR_VERCEL_URL">
  <img
    width="692"
    height="745"
    alt="Chowka Bhara game preview"
    src="https://github.com/user-attachments/assets/6be2e07c-0f9b-4cc4-af6f-f31fcedd5c6d"
  />
</a>

</div>

---

## Overview

**Chowka Bhara** is a real-time multiplayer party game inspired by the classic Indian cross-and-circle race game. It brings the social feeling of a physical tabletop board game to the browser with phone-first controls and an optional shared display.

Create a lobby, share a four-letter code, throw cowrie shells, race four pawns toward the center, capture opponents outside safe houses, and compete for bonus rolls.

The project uses a **server-authoritative** architecture. Every roll, move, capture, turn transition, timeout, and win condition is validated by the game server. Clients send intents; the room decides the outcome.

## Game at a Glance

| Category | Details |
|---|---|
| **Type** | Real-time multiplayer web party game |
| **Players** | 2–4 players |
| **Match length** | Approximately 15–30 minutes |
| **Game family** | Chowka Bhara / Pachisi-inspired race and capture game |
| **Board modes** | 7×7 classic — 49 steps · 5×5 classic — 25 steps |
| **Input** | Phone-first touch controls |
| **Shared display** | Optional shared board display |
| **Room system** | Four-letter lobby codes |
| **Status** | Playable — Vercel frontend + Cloudflare game server |
| **Role** | Solo full-stack: game rules, realtime backend, phone UI, shared board UI, and deployment |

## How to Play

### Start a Match

1. Open the game on a phone.
2. Choose **Create Lobby** to host, or **Join Lobby** and enter a four-letter room code.
3. Select a player color: Red, Blue, Green, or Yellow.
4. Choose a pawn shape, read the mode-specific rules, and press **Ready**.
5. Once enough players are ready, the host starts the game.
6. Optionally open the shared display on a TV or desktop screen for everyone to follow the board.

### Take Your Turn

1. Throw four cowrie shells.
2. Count the shells that land mouth-up to get the roll value.
3. If zero shells land mouth-up, the roll is **8**.
4. Select a highlighted pawn with a legal move.
5. Confirm its destination and watch the move synchronize across every connected device.

### Win the Game

Move all four pawns from home, around the board, and into the center with exact rolls. The first player to bring all four pawns home wins the match.

## Gameplay Rules

| Rule | Behavior |
|---|---|
| **Cowrie roll** | Four shells are thrown. Mouth-up count produces `1`, `2`, `3`, or `4`; zero mouth-up shells produces `8`. |
| **Legal moves** | Only pawns with a valid destination for the current roll are selectable. |
| **Captures** | Landing on an opponent outside a safe house sends that opponent pawn back home. |
| **Safe houses** | Pawns on safe-house cells cannot be captured. |
| **Bonus rolls** | A roll of `4`, a roll of `8`, or a capture earns another roll. |
| **Exact finish** | A pawn must receive the exact roll required to enter the center. |
| **Winner** | The first player to bring all four pawns to the center wins. |
| **AFK protection** | Inactive turns can auto-roll, auto-move, or auto-skip so a party game does not stall indefinitely. |

## Features

### Party and Lobby Flow

- Create and join rooms with memorable four-letter codes.
- Configure a two-, three-, or four-player party.
- Choose between compact 5×5 and classic 7×7 board modes.
- Enforce unique player names within each room.
- Select a color and pawn shape before readying up.
- Let the host start, pause, resume, end, or rematch a match.
- Reconnect during a grace period without losing your seat.

### Realtime Game Experience

- Server-validated rolls, movement, captures, bonus turns, and endgame conditions.
- Cowrie-shell roll animation and clear turn-state feedback.
- Legal-move highlighting to prevent invalid input.
- Tap a pawn, then confirm its landing cell on mobile.
- Step-by-step pawn travel synchronized across phones and the shared display.
- Resolution states for capture, home, bonus turn, next turn, and game completion.
- Pause and resume support for real-world party interruptions.
- AFK timeouts to keep sessions moving.

### Phone and Shared Display UX

- Jackbox-inspired setup: personal phones for input and a shared screen for the board.
- Mobile safe-area support for modern phone screens.
- Built-in mute control.
- Web Audio sound effects for rolls, movement, captures, and wins.
- No external audio assets required.

## Architecture

### Server-Authoritative Rooms

The frontend never decides whether an action is valid. A phone or shared-display client sends a small JSON intent such as `throwShells` or `movePawn`. The room's Durable Object validates that action against authoritative state and broadcasts an updated snapshot.

Each room code maps to one Cloudflare Durable Object. That object owns the room state and manages persistence, turn transitions, disconnects, WebSocket fan-out, and phase timeouts.

```text
Phone Controllers                 Optional Shared Display
       │                                      │
       └────────────── WSS / JSON ────────────┘
                              │
                              ▼
                    Cloudflare Worker
                              │
                              ▼
          RoomDurableObject — One Per Room Code
              ├── Authoritative room state
              ├── SQLite persistence
              ├── WebSocket connection fan-out
              ├── Reconnect and disconnect handling
              └── Timer fallback via Durable Object alarms

      @chowka/shared
      ├── Zod schemas
      ├── Board configuration
      ├── Movement helpers
      └── Shared game types

Astro islands + React UI on Vercel
```

### Match Phase Machine

```text
Lobby
  ↓
Roll
  ↓
Move
  ↓
Resolution
  ├── Bonus → Roll
  ├── Next Turn → Roll
  └── Endgame
```

### Shared Game Logic

`@chowka/shared` is imported by both the Astro application and the Cloudflare Worker. It contains shared Zod schemas, board definitions, path math, and helpers so clients can render valid options while the server remains the final authority.

The board system starts from one Red spiral path and rotates it 90° for each player color. This supports four seats and both board sizes without duplicating movement logic. Captures resolve against absolute board cells rather than color-relative positions.

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Monorepo | pnpm 9 + Turborepo | Shared packages and coordinated builds |
| Language | TypeScript | Typed game state, contracts, and UI |
| Shared rules | `@chowka/shared` + Zod | Schemas, board data, validation, and helpers |
| Web UI | Astro 5 + React 19 | Fast pages with interactive islands |
| Styling | Tailwind CSS 3 | Responsive game UI and design tokens |
| Realtime server | Cloudflare Workers + Durable Objects | Authoritative room state and WebSocket sessions |
| Data | Durable Object SQLite | Persistent room and match state |
| Protocol | WebSockets + JSON | Client intents and room snapshots |
| Web deployment | Vercel static output | Fast global frontend delivery |
| Font | Fredoka | Friendly, readable party-game type |

### Visual System

| Token | Value | Use |
|---|---:|---|
| Sky | `#0B1F3A` | Main dark background |
| Teal | `#2EC4B6` | Primary action and active UI |
| Cream | `#FFF8F0` | Light surfaces and readable contrast |
| Coral | `#FF6B4A` | Captures, warnings, and emphasis |
| Gold | `#FFB020` | Cowrie rolls, rewards, and winning states |

## Project Structure

```text
chowka-bhara/
├── apps/
│   ├── web/                    # Astro + React application
│   │   ├── src/pages/          # Main pages and routes
│   │   ├── src/layouts/        # Shared page layouts
│   │   ├── src/components/     # Board, screen, and UI components
│   │   └── src/lib/            # WebSocket client and UI utilities
│   │
│   └── game-server/            # Worker + RoomDurableObject
│
├── packages/
│   └── shared/                 # Board rules, configs, Zod schemas, helpers
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## What I Solved

### Authoritative Realtime Rooms

Built multiplayer rooms on Durable Objects with persistence, reconnection handling, pause and resume behavior, phase timers, and alarms that prevent disconnected or idle players from soft-locking a match.

### Board as Data

Designed one reusable spiral path with four color rotations and support for both 7×7 and 5×5 boards without forking the core movement logic.

### Animation and Turn Timing

Coordinated pawn travel animations with the server's resolution window so every screen agrees about when a move has landed. Short Durable Object alarms act as a fallback transition when a client does not advance the visual completion state.

### Jackbox-Style Party UX

Separated private phone controls from the shared board display, added safe-area support and AFK handling, and ensured an absent player cannot stall the entire party session.

### Zero-Asset Sound Effects

Created lightweight Web Audio oscillator effects, keeping the bundle free from audio files while still providing feedback for rolls, captures, movement, and wins.

### Split Deployment

Configured the static Astro frontend for Vercel and the realtime game server for Cloudflare Workers, including cross-origin handling through `ALLOWED_ORIGINS`.

## Run Locally

### Requirements

- Node.js 20 or later
- pnpm 9 or later
- Cloudflare Wrangler for local Worker development

### Install and Start

```bash
pnpm install
pnpm build
pnpm dev
```

The local services run at:

| Service | Local Address |
|---|---|
| Web application | `http://localhost:4321` |
| Game Worker | `http://localhost:8787` |

Configure the following values for local or production deployments:

```env
PUBLIC_GAME_SERVER_URL=your_worker_url
ALLOWED_ORIGINS=your_vercel_url
```

`PUBLIC_GAME_SERVER_URL` connects the web application to the game server. `ALLOWED_ORIGINS` restricts Worker access to approved frontend origins.

## Roadmap

- [ ] Improve shared-display and spectator presentation modes.
- [ ] Add richer capture, bonus-roll, and victory feedback.
- [ ] Add accessibility preferences for color, motion, and audio.
- [ ] Support private room links alongside four-letter room codes.
- [ ] Add optional match history and lightweight statistics.
- [ ] Add automated rule and reconnect-flow test coverage.

## Usage and License

This repository is provided for **reference, learning, portfolio demonstration, and personal demo purposes only**.

You may inspect the code and use this project to understand its architecture, realtime multiplayer systems, game rules, and implementation techniques.

You may **not** copy, reproduce, republish, redistribute, resell, rebrand, or deploy this project—or substantial portions of its source code—as your own public or commercial product without written permission from the author.

The project name, branding, visual design, game-specific content, source code, and original assets remain the property of the author. The live demo is intended only to demonstrate the project and does not grant permission to replicate or publish it.

For permission to use, modify, publish, or redistribute this project, contact the author first.
