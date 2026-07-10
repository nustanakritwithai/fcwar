# Phase 6 — Medieval combat and stamina

The client requests actions; it never declares damage. Sword/tool attacks pass
through wind-up, active, and recovery timing on the room clock. A hit requires
an alive enemy in server range and facing cone. Bow shots require a recorded
draw start and minimum draw time. Shield blocking only reduces damage from the
defender's frontal arc. Attacks, sprinting, and blocking drain authoritative
stamina; idle players regenerate it. Friendly fire is rejected on both layers.
