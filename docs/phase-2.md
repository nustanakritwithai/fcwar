# Phase 2 — Server authority hardening

Clients send movement intent, not trusted world transforms. The server clamps
axes, caps simulation time, owns gravity and ground height, rejects stale input,
teleport/flight position hints, blocks movement while dead, and limits packet
rate per player. Bounds are applied after every authoritative movement step.
