# Phase 10 — Commander construction

Blueprint selection is part of the hotbar. The client previews 6.5 units in
front of the player's current facing; it never projects an arbitrary distant
camera point. The server recalculates distance in world x/z and remains final
authority over role, equipped blueprint, stock, cooldown, bounds, overlaps,
ownership, and the one-Rally-per-faction rule.

Wooden Walls block movement and have faction-owned HP. Rally Flags replace the
base spawn while alive. Enemy attacks damage structures, same-faction attacks
reject, and destruction clears the Rally reference immediately.
