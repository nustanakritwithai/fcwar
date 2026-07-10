# Mobile controls

## Movement

Start a drag anywhere inside the lower-left movement zone. The joystick origin
moves to that point. Releasing or cancelling the pointer always returns neutral.
A drag at least 86% of joystick radius whose direction is at least 72% forward
requests sprint. The server still verifies stance and stamina before applying a
sprint multiplier or drain.

## Actions

- **ยิง**: primary action of the held item—swing, bow shot, or build confirm.
- **เล็ง**: shield block, bow draw, or blueprint rotate.
- **โดด**: queues one explicit server input edge.
- **ใช้**: invokes the same contextual function as desktop E for gather/deposit.
- **ย่อ / หมอบ / ยืน**: cycles the authoritative stance state.

## 390 × 844 safe layout

Score, player status, resource status, capture status, stance, joystick, action
cluster, and hotbar use deterministic rectangles. The automated geometry check
requires zero pairwise overlap at 390 × 844. The joystick and action cluster end
above the bottom hotbar rather than sharing its vertical band.
