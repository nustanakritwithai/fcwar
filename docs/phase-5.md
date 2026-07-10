# Phase 5 — Equipment and hotbar

Each class receives an immutable server-side loadout. Player snapshots expose
`loadout`, `equippedSlot`, and `equippedItem`. A `selectItem` request can
only select a slot present in that class loadout; invalid slots return a
`selectReject` without mutating state. Desktop numbers/wheel and touch taps
share the same request. The low-poly held item changes optimistically, then is
reconciled by the next server snapshot.
