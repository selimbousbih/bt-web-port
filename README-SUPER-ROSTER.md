# Tenkaichi 3 — Super Roster

Independent copy of the original project. Neither Tenkaichi3Decomp nor
Tenkaichi4Browser is changed by building or launching this folder.

## Play

- `./play.sh`: open http://localhost:4700 in Chrome.
- `./play-online.sh`: start the server, room service, and Cloudflare tunnel.
  Use its local link on the host Mac and share its public link with your friend.
  Keep the terminal open. Ctrl+C stops the processes the launcher started.
- `./build-super.sh`: regenerate the overlay and both browser builds.

This copy uses ports 4700–4702 and `game-super.iso`.

To use each player's local `game-super.iso`, append `&pick=1` to the online
link (or `?pick=1` to a URL with no query). Open the normal player page, then
choose the file once. The player keeps that file reference when the game frame
reloads to enter or leave an online match; no disc data is downloaded from the
server in this mode. Refreshing or closing the whole page requires selecting the
file again. Both players need the same ISO.

## Roster

The first row is Goku (End), Vegeta (End), Vegito, Gogeta, Goku Ultra Instinct,
Vegeta SS3, and Gogeta SS4. Goku (End) has base, SS1, SS2, SS3, God, and Blue.
Vegeta (End) has base, SS1, SS2, God, Blue, and Blue Evolved. Vegito has base, Super Vegito,
and Blue; Gogeta has base, Super Saiyan, and Blue. Ultra Instinct has Sign and
the silver-haired form. Vegeta SS3 has its own slot.

The second row is Goku Black (base/Rosé), Zamasu, Fused Zamasu, Dyspo,
Top (base/Destroyer), Jiren, and Beerus. Cell Max is not included.
Hit and Broly DBS (base/SS/Legendary SS) start the third row.
Golden Frieza is the sixth form in Frieza's existing slot. Android #17 uses the
BT4 donor resources: choose costume 4 for his Super outfit. Jiren's costume 2
is his shirtless Full Power appearance. These are alternate costumes in this
ISO, not separately named forms or separate stat sets. Whis and Champa are
absent from the donor ISO's named roster and are not included.

Remaining original characters follow. Replacement IDs and the resulting roster
are recorded in `mod/super-roster/generated/manifest.json`. Original characters
replaced include Kibitokai, Uub (base), Grandpa Gohan, Nam, Android 8, King Vegeta
and his Great Ape, Great Ape Bardock/Fasha/Raditz/Nappa/Turles, Cui, Frieza Soldier,
Pure Evil Buu, Z Broly, Hirudegarn, Cyborg Tao, General Blue, Devilman, Chi-Chi,
Spopovich, and Appule. Majuub remains selectable. The two old standalone SSB slots are
removed; God/Blue now live under their requested End slots.

## Implementation and limits

The original BT3 engine and stages are retained. Thirty-three donor forms supply
models, animations, attacks, portraits, icons, starting stats, sound banks, and
voice lines from the local BT4 ISO. Form IDs are remapped into the original
character range. Replaced characters are removed from unrelated form chains.
The Z-counter messages remain. The previous Super Vegito stat overrides and
two-stock SSB skill patches are not applied.

This is a character-resource port, not BT4's modified executable. Ultra Instinct
auto-dodging and other BT4-only engine mechanics are not implemented. Unsupported
BT4 transformation effect kinds use BT3's standard power-up effect. Not every
special attack, costume, transformation, story event, or multiplayer match has
been verified; replacement IDs can change story-mode character appearances.
Use Duel mode. Old saved customizations refer to different slots in this roster.

`game-super.iso` is a browser-only image: the original ISO is followed by a
versioned resource overlay that this build understands. Do not expect this image
to reproduce the roster in a PS2 emulator. Keep `game-ssb.iso` and `bt4.iso` as
read-only build inputs. The generated overlay is self-contained at play time;
launching does not need the BT4 image or a rebuild.

Both JSPI and Asyncify builds linked successfully. Browser selection displayed
the new God/Blue forms and the requested second row. An Ultra Instinct Goku
attract-mode battle completed without a reported browser error.

Online transport: the room WebSocket sends a heartbeat every 15 seconds even
when gameplay uses WebRTC. Losing the signalling socket alone does not end a
healthy direct match. Explicit departures still end it. Disconnect reasons are
retained in the match log. Refresh both browsers after updating net.js.

Imported attacks without a partner-loading step now use BT3's `-1` partner
sentinel. BT4's zero placeholders otherwise request Goku (Early) and leave both
players' input blocked after the cinematic, even while the timer continues.
Goku Blue's x10 Kaioken Kamehameha and UI Goku's ultimate were reproduced with
player-controlled sides: the shared loading lock stayed set before the resource
correction and cleared afterward. Reload the page to discard cached disc data.

The opt-in `BT3_TECH_TEST=2|3|4` diagnostic triggers one special in a demo and
logs actions, input locks, and the model-loading stop flag for 1,800 vblanks.
Use `BT3_TECH_TARGET=1,BT3_TECH_PLAYERS=1` for a stationary target in a versus
setup; `BT3_CHARA=122` / slot 3 and `BT3_CHARA=64` / slot 4 reproduce the two
reported attacks. These switches are inactive during normal play.
