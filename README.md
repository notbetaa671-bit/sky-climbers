# SKY CLIMBERS

Sky Climbers is a pixel-art tower-climbing game for the browser. Race upward through a hazard-filled cloudline, hit checkpoints, and reach the summit with the other climbers in your route.

## What is included

- Authoritative Node.js + WebSocket server with 30 Hz physics and 10 Hz snapshots.
- Room lobby with three selectable routes and a 50-player cap per route.
- Player names, real-time movement, jumping, hazards, falls, checkpoints, respawns, summit finish state, and a live leaderboard.
- Pixel-art canvas renderer with camera follow, stars, clouds, route HUD, leaderboard, touch controls, and responsive lobby.
- Static client build compatible with GitHub Pages, while the WebSocket server runs on a separate host.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite client points to the game server at `http://localhost:3001` during local development.

To run only the server (it serves the built client when `dist/` exists):

```bash
npm run dev:server
```

Open `http://localhost:3001`.

## Verify the build and multiplayer path

```bash
npm run build
npm test
npm run dev:server
# in another terminal:
npm run test:capacity
```

The capacity smoke test opens 50 WebSocket clients in one route and verifies that all 50 receive a welcome and snapshots. This is a local protocol/room test, not a production load certification; run a soak test on the chosen host before advertising a guaranteed 50-player deployment.

Set `LOAD_TEST_ROOM=storm` or `LOAD_TEST_ROOM=sunset` when another local client is already using the default Aurora route.

## Deployment

### Option A: one hosted web service

Deploy the repository to Render, Railway, Fly.io, or another Node host with a persistent WebSocket process.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment: `PORT` is supplied by most hosts; optionally set `MAX_PLAYERS_PER_ROOM=50`.
- Health check: `/api/health`
- WebSocket endpoint: `wss://YOUR_HOST/ws`

The server serves `dist/` after the build, so one service is enough for a first deployment.

### Option B: GitHub Pages client + separate server

GitHub Pages can host the static client but cannot keep the authoritative WebSocket process alive. Build the client with the public URL of the separately hosted server:

```bash
VITE_SERVER_URL=https://YOUR_GAME_SERVER.example VITE_BASE=/YOUR_REPOSITORY_NAME/ npm run build
```

Publish the resulting `dist/` directory to GitHub Pages. The browser will use `wss://YOUR_GAME_SERVER.example/ws` automatically. If the Pages site is hosted under a project subpath, configure the Vite `base` in `vite.config.js` before publishing.

The included `.github/workflows/deploy-pages.yml` can publish the client automatically. Add a repository variable named `VITE_SERVER_URL` with the HTTPS origin of the game server, enable GitHub Pages with **GitHub Actions** as its source, and push to `main`.

When the client and server are on different origins, the server does not need a special CORS setting for WebSockets, but the server host must accept WebSocket upgrades and should use TLS (`wss://`) in production.

## Architecture notes

The server owns player positions, collision resolution, jumps, hazard checks, checkpoint state, respawns, and finish ordering. Clients send only input state; they render the latest authoritative snapshot and interpolate between updates. This prevents a client from choosing its own position or leaderboard progress.

The current level is deterministic and stored in `server/world.js`, making it easy to add routes, moving platforms, or seasonal variants without changing the network protocol. Room state is in memory; add a shared presence/store layer before running multiple server instances behind a load balancer.

## Controls

- Move: `A/D` or left/right arrows
- Jump: `W`, up arrow, or `Space`
- Leaderboard: hold `Tab`
- Leave route: `Esc`
- Touch controls appear on narrow screens

