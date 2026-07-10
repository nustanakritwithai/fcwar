# Resource system

## Nodes

North Forest contains ten `tree` nodes yielding `wood`; South Quarry contains
ten `rock` nodes yielding `stone`. Nodes expose stable ids, exact positions,
amount/max amount, interaction radius, required tool, and regeneration timing.
Depleted objects remain visibly depleted instead of being replaced by a fake
decorative prop.

## Gather validation

The room checks, in order: living player, Worker class, known node, equipped
matching tool, exact server distance, cooldown, remaining node amount, and
combined carry capacity. Axe/pickaxe primary attacks have their own combat
timing and do not consume or bypass gather state.

## Deposit and reset

Warehouses have faction ownership and exact server positions. A player must be
alive, at the matching faction warehouse, and carrying resources. A successful
deposit moves both resource types atomically. Round reset creates fresh nodes,
restores starting faction stock, and clears player inventory.
