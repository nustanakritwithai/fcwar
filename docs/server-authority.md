# Server authority

## Trust boundary

The browser sends intent: movement axes, facing, stance, jump edge, item slot,
primary/secondary action, resource/building target id, and a nearby build
proposal. It never supplies accepted damage, HP, stamina, inventory, faction
stock, capture ownership, score, or respawn result.

The room owns:

- faction, class, loadout, equipped item, HP, stamina, stance, kills/deaths;
- fixed-step movement, gravity, bounds, speed, sprint drain, collision;
- attack phase, range, cone, draw time, block direction, damage, death;
- resource node position/amount/regen, inventory, warehouse deposits;
- construction cost/range/overlap/HP, Rally references and respawn;
- capture counts/progress/ownership, faction score, victory and reset.

## Movement defenses

Inputs are capped at 45 per player per second. Sequence numbers must increase.
Axes are clamped and normalized. Optional client position hints more than eight
horizontal units from server state reject as teleport attempts; vertical error
over three rejects as flight. The server ignores hints for simulation even
when they pass. Tick time is capped at 100 ms, dead movement is blocked, class
and stance speed multipliers are server values, and final positions remain in
the 240 × 150 bounds.

## Action validation

| Request | Principal checks |
|---|---|
| `selectFaction` | known faction |
| `selectClass` | faction selected; invalid id safely falls back to Infantry |
| `selectItem` | slot exists in authoritative class loadout |
| `primary` | alive, held item action, timing, stamina, target range/cone/faction |
| `secondary` | alive, held shield/bow state and stamina |
| `gather` | Worker, tool, exact node/distance, cooldown, capacity, amount |
| `deposit` | own warehouse, exact distance, non-empty inventory |
| `build` | Commander, blueprint, 9-unit distance, stock, cooldown, bounds, overlaps |

Malformed or unknown messages receive a reject and cannot crash the socket.
Snapshots copy nested state so browser code never receives live server objects.

## Reset transaction

Victory freezes its winner and reset timestamp. At five seconds the room
recreates objective, score, resource nodes, and faction stock; clears buildings
and Rally references; clears inventories and per-round metrics; restores
loadouts; and respawns selected players at base. This happens before the reset
snapshot is broadcast.
