# Manual test checklist

## Start and two-tab baseline

- [ ] Run `npm install`, then `npm start`; `/healthz` returns `{ ok: true }`.
- [ ] Open two tabs. Join Ironhold in one and Verdant in the other.
- [ ] Select different classes; both characters, faction-colored labels, and
      minimap dots appear in both tabs.
- [ ] Move/rotate/jump in each tab for two minutes; no disconnect or server log
      exception occurs.
- [ ] Kill one player; the death countdown names base or Rally Flag and the
      player respawns there after three seconds.

## Equipment and combat

- [ ] Number keys, wheel, and hotbar taps select only valid class slots and
      immediately change the held placeholder.
- [ ] Infantry sword shows wind-up before damage; out-of-range/rear targets miss.
- [ ] Shield reduces a frontal sword hit but not a hit from behind; held block
      drains stamina.
- [ ] Archer snap shot rejects; holding Aim at least 650 ms then Fire shows a
      tracer and damages an enemy.
- [ ] Friendly player and friendly structure damage never changes HP.

## Objective and round

- [ ] One faction alone in Central Fort advances progress; equal presence turns
      the ring orange and pauses it.
- [ ] Ownership recolors ring/flag and adds 10 points after 10 seconds.
- [ ] At 1,000, victory overlay appears for five seconds.
- [ ] Reset clears score, Fort owner, inventories, temporary structures and
      Rally markers; nodes and faction stock return to starting values.

## Worker

- [ ] Every visible North Forest tree accepts axe gather at its exact mesh.
- [ ] Every visible South Quarry rock accepts pickaxe gather at its exact mesh.
- [ ] Wrong tool gives the Thai tool prompt; a near visible node never reports
      false `too_far`.
- [ ] Capacity stops at 30 combined; node mesh visibly depletes and later regens.
- [ ] Action/E deposits only at own warehouse and updates faction wood/stone.

## Commander

- [ ] Wall and Rally previews stay 6.5 units in front of the player, turn
      red/green, and rotate with Aim/right click.
- [ ] A valid nearby placement does not produce false `too_far`.
- [ ] Overlap, insufficient stock, wrong blueprint, and second Rally show clear
      rejection text.
- [ ] Walls block movement. Enemy sword/bow damages and destroys both types.
- [ ] Living Rally Flag becomes spawn; destroying it returns future spawn to base.

## Phone 390 × 844

- [ ] Score, player, resources, capture, objective, minimap, stance, joystick,
      action cluster, and hotbar have no visible overlap.
- [ ] Touch can begin anywhere in the lower-left zone; release returns neutral.
- [ ] Strong forward drag sprints and drains stamina; there is no sprint button.
- [ ] Fire/Aim/Jump/Action work while moving; Action gathers and deposits through
      the same flow as E.
- [ ] Stance cycles ย่อ → หมอบ → ยืน; hotbar remains tappable.

## Development diagnostics

- [ ] With `DEV_MODE=1`, nearest node id/type/distance and last reject appear.
- [ ] Without `DEV_MODE=1`, no debug panel is visible.
