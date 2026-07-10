# Phase 7 — Central Fort

`central_fort` is a server-owned objective at world origin with radius 15.
Every tick counts living players by faction. A numerical advantage advances
that faction; equal presence pauses as contested. A completed capture changes
ownership and clears transient progress cleanly. The client flag, ring, status,
and occupant count all render the same snapshot object.
