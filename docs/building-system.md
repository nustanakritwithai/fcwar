# Building system

## Requests and validation

A build request contains the equipped blueprint type, a world x/z position,
and rotation. The server checks Commander class, life state, matching blueprint,
9-unit player distance, cooldown, world bounds, faction stock, and overlap with
Central Fort, warehouses, resource nodes, and existing buildings. Common
rejections are `too_far`, `overlap`, `not_enough_resources`,
`commander_required`, `wrong_blueprint`, and `rally_already_exists`.

## Structures

- Wooden Wall: 20 wood, 180 HP, server collision radius 3.1.
- Rally Flag: 50 wood + 30 stone, 125 HP, one per faction.

Both structures are temporary and faction-owned. Friendly damage is blocked.
Destroying a Rally Flag atomically clears its faction's respawn reference.
Round reset removes every structure before respawning players at base.
