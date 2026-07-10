# Game design — Faction War Arena MVP

## Promise

Two original medieval-fantasy factions fight short, legible rounds over one
central objective. The project is inspired by the broad idea of faction warfare
but uses its own names, map, low-poly shapes, interface, rules, and code.

## Core loop

1. Join Ironhold (blue, left) or Verdant (green, right).
2. Pick Infantry, Archer, Worker, or Commander.
3. Fight for Central Fort. Its owner earns 10 points every 10 seconds.
4. Workers harvest server-backed North Forest/South Quarry nodes and deposit.
5. Commanders spend faction stock on walls and one Rally Flag.
6. Destroy enemy Rally Flags, hold the fort, and reach 1,000 first.
7. View the five-second victory result, then begin a clean round.

## Class readability

| Class | Purpose | Loadout |
|---|---|---|
| Infantry / ทหารราบ | Durable frontline | Sword, shield |
| Archer / พลธนู | Draw-validated ranged pressure | Bow |
| Worker / คนงาน | Resource acquisition and deposit | Axe, pickaxe |
| Commander / แม่ทัพ | Tactical construction | Sword, wall plan, Rally plan |

## World layout

Ironhold base is centered near x −80; Verdant base near x +80. Central Fort is
at origin. North Forest occupies negative z and South Quarry positive z.
Faction warehouses sit inward and south of each base. The compact 240 × 150
field keeps two-player traversal practical while leaving room for construction.

## MVP boundaries

There are no accounts, persistence, crafting, shops, Blacksmith, Doctor,
Merchant, Monarch, politics, monetization, or expanded class roster. NPC AI is
absent. Placeholder art stays low-poly so authority, combat feedback, mobile
control, and round stability receive the budget.
