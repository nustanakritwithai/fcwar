# Phase 8 — Faction score and rounds

The Central Fort owner receives 10 points per authoritative 10-second interval.
The first faction to 1,000 enters a five-second victory state. Reset creates a
new neutral objective and zeroed score state, clears per-round player metrics,
restores class loadouts, and respawns players at their faction base. Later
temporary systems hook into the same reset transaction.
