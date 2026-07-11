# Faction War Arena

> **Side project:** โปรเจกต์เรียนรู้ Mobile Realistic PBR แยกต่างหากอยู่ที่
> [`abandoned-mine/`](abandoned-mine/README.md) — รันด้วย `npm run mine`

An original, low-poly medieval/fantasy browser game built with Node.js,
Express, WebSocket, Three.js, and plain JavaScript. The simulation is
server-authoritative: clients send controls and action requests, while the
server owns movement, combat, factions, classes, objectives, resources,
buildings, scoring, death, respawn, and round resets.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser tabs. Health check:
`http://localhost:3000/healthz`; WebSocket endpoint: `/ws`.

## Controls

Desktop: WASD, mouse look, left click primary, right click secondary, E interact,
Space jump, C stance, V first/third person, 1–5 or wheel hotbar. On phones, drag
inside the lower-left zone; a strong forward drag sprints. Fire, Aim, Jump,
contextual Action, stance, and hotbar are touch controls.

## Match loop

Join blue Ironhold at x −80 or green Verdant at x +80. Hold Central Fort for
10 points every 10 seconds. Workers cut visible North Forest trees and mine
visible South Quarry rocks, then deposit at their own warehouse. Commanders
spend faction stock on Wooden Walls and one Rally Flag. Rally Flags become the
faction spawn until destroyed. First to 1,000 wins; five seconds later the
server resets the complete round.

## Development

```bash
npm run check
npm test
```

Useful focused gates: `npm run test:smoke`, `npm run test:http`, and
`npm run test:authority`. Set `DEV_MODE=1` to show nearest resource id/type,
server distance, and the latest reject reason.

## Structure

```text
server/index.js       HTTP + WebSocket lifecycle
server/room.js        authoritative simulation and round state
server/classes.js     factions, classes, items, tuning, world constants
server/protocol.js    accepted messages and safe parsing
public/index.html     responsive game shell and HUD
public/game.js        Three.js rendering, controls, prediction/UX only
public/net.js         browser WebSocket wrapper
docs/                 design, authority, tuning, systems, manual checks
tests/                direct authority, WS, HTTP, and mobile geometry tests
```

The MVP deliberately excludes accounts, persistence, shops, politics,
monetization, crafting, and expanded class rosters so the faction-war loop
stays readable and testable.

## Deploy on Render

The included `render.yaml` defines a Node web service with `/healthz`, `npm ci`,
and `npm start`. Push this repository to a GitHub repository that Render can
access, then create a new Render Blueprint from that repository. Render is used
instead of static/edge-only hosting because the game requires a persistent Node
process and WebSocket endpoint.
