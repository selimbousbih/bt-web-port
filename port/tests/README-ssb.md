# Local SSB browser adapter

`game-ssb.iso` adds Goku (165) and Vegeta (166). Its PS2 MOD.BIN code is not
executed by the recompiled port. The browser recognizes the supplied DLC.AFS
SHA-256, indexes its assets as virtual partition-2 files 100000..100051, and
installs the two parameter records in common file 2. The C adapter keeps the
new character IDs while remapping assets and voices. Original discs leave it
disabled. This adapter supports this specific two-character mod, not arbitrary
MOD.BIN programs or DLC archives.

Build using the normal web build/data/link steps. Launch:

```sh
node port/web/serve.mjs 4500 game-ssb.iso
```

In Duel, the standalone Blue entries are near the end of the roster, before
Random and Custom. They each have one costume and no transformations.

The browser adapter copies Super Vegito's base health/ki/stock limits and numerical
combat stats to both Blue characters: charge/recovery rates, damage, movement
speeds and costs. Their moves, animations, appearance and transformation restrictions
remain their own. Both first Blast 1 skills cost two stocks, including the skill-list
text. These overrides apply to normal and damaged models; the ISO is unchanged.

Mapping checks (run from the repository root):

```sh
cc -DPORT -Iinclude port/tests/ssb_mapping.c -o /tmp/ssb_mapping
/tmp/ssb_mapping
node port/tests/ssb_disc.mjs game-ssb.iso
```

Browser smoke test: `/?telemetry=1&env=BT3_DEMO=1,BT3_CHARA=165` (then 166).
Add `BT3_VARIANT=1` to check the damaged model. The demo test must finalize its
setup after changing the member; otherwise the start-form model remains the
original fighter and the test does not exercise the requested character.

Verified locally: both browser targets linked; archive and C mapping checks passed;
Chrome rendered both Blue models in combat, including Vegeta in the forced Asyncify fallback. Normal Duel selection launched Goku
SSB versus Vegeta SSB with blue HUD portraits, responsive player controls, and the
modded Goku skill list. This is a gameplay smoke test, not an exhaustive test of
every move, costume-damage transition, or other game mode.

Observed limitation: closing the in-battle skill-list overlay produced a black
rendered frame while telemetry continued. Reloading restored the game. Its cause
has not been isolated; avoid that overlay during play for now.
