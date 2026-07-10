# Combat tuning

| Item | Damage | Range | Wind-up / draw | Cooldown | Stamina |
|---|---:|---:|---:|---:|---:|
| Infantry sword | 34 | 3.15 | 210 ms | 780 ms | 19 |
| Commander sword | 23 | 2.90 | 240 ms | 850 ms | 20 |
| Worker axe | 11 | 2.55 | 290 ms | 920 ms | 15 |
| Worker pickaxe | 9 | 2.45 | 320 ms | 980 ms | 16 |
| Archer bow | 28 | 58 | 650 ms draw | 980 ms | 17 |

Sword/tool active windows last 140–150 ms and are followed by 420–500 ms
recovery animation. Facing dot thresholds are intentionally generous for melee
and narrow for the bow. A frontal shield reduces 76% of incoming damage and
costs 9 stamina per hit in addition to 13 stamina/second held drain.

Stamina regenerates at 18/second after 450 ms without spending. Sprint drains
22/second and only applies while standing, moving, and above zero stamina.
Infantry has the strongest melee by design; the Commander sword is protection,
not a replacement frontline role.

These values are server constants in `server/classes.js`. Tune them there and
rerun `tests/combat.test.js`; do not compensate with client-only animation or
damage numbers.
