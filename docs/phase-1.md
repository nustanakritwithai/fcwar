# Phase 1 — WebSocket foundation

- Express serves `/public` and `/healthz`.
- WebSocket upgrades are accepted only at `/ws`.
- The room owns positions and advances them at a fixed tick rate.
- Two browser tabs receive the same player snapshots.
- The client uses Three.js directly with no build pipeline.
