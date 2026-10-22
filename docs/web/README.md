# The browser build

The same port, compiled to WebAssembly: the game runs in a web page, on a computer and on a phone (iPhone and
Android), from **your own disc image**. Nothing of the game is in this repository; you build the page yourself
from your disc, and what you build is for you alone.

## What it adds

- Two builds of the same program, and the page picks one: `bt3-jspi` (Chrome, Edge: WebAssembly JSPI) and
  `bt3-async` (Safari and every iPhone browser: Asyncify).
- Phones: touch controls laid out for portrait and landscape (stick, D-pad, face buttons, shoulders, Start /
  Select, a Hide button), sound that starts on the first tap, saves kept in the browser (IndexedDB), and an
  icon for the home screen.
- Controllers through the browser (a PS5 or Xbox pad over Bluetooth or USB); two controllers play 1P vs 2P.
- Online play (Dragon Net Battle, on the main menu): Quick Match, or host a room and give its four-letter code to
  the other player. The game's own lockstep netplay (`port/src/gs/net.c`) runs over a WebRTC data channel, with
  a relay through the server when the two cannot reach each other directly. The screens are drawn in the look of
  the game's menus. Both players need a build from the same disc.
- One tap or Start skips all the boot logos; the opening movie is off unless the address has `?movie=1`.

## Building

You need Python 3, Node.js, and Emscripten (`emcc` on the path; built with 6.0), and the game's files extracted from
your disc by the normal setup:

```
python3 install.py --iso <your disc image>      # once: checks the disc, extracts what the build needs
python3 port/web/build.py                        # compiles to LLVM IR, rewrites it (port/web/irweb.py)
python3 port/web/link.py web                     # -> port/build/web/bt3-jspi.{js,wasm}
python3 port/web/link.py webasync                # -> port/build/web/bt3-async.{js,wasm}
```

**The result contains the game's code and data from your disc.** Unlike the desktop release, the browser build
takes the game's built-in data tables from the extracted files (`port/web/gen_data_web.py`), so
`port/build/web/` must never be published. It is ignored by git.

## Playing

On this computer:

```
node port/web/serve.mjs 4500 <your disc image>
```

and open http://127.0.0.1:4500. The page reads the disc image through the server with range requests; it is
never copied anywhere.

On your phone, on the same Wi-Fi:

```
node port/web/serve.mjs 4500 <your disc image> --lan
```

prints an address with a secret key (`?k=...`). Open it on the phone; requests without the key are refused.
Never forward this port to the internet.

## Your own copy on Cloudflare (optional)

`cloudflare/` deploys the page and your disc image to **your own** Cloudflare account as a Worker, behind a
secret key: anyone without the key gets 403, the disc included. It also runs the rooms for online play
(a Durable Object).

1. Put your account id in `cloudflare/wrangler.jsonc` (or a copy, `wrangler.local.jsonc`, which git ignores).
2. `bash cloudflare/build.sh` puts the build and your disc image (`disc/bt3-usa.iso`, in 1 MiB pieces) in
   `cloudflare/public/`, which git ignores.
3. From `cloudflare/`: `npx wrangler@latest secret put BT3_KEY` (a long random value), then
   `npx wrangler@latest deploy`.
4. Open `https://bt3.<your-subdomain>.workers.dev/?k=<key>` once; the page keeps a cookie.

The key is what keeps your copy of the game private: do not remove the check in `cloudflare/src/worker.js`, and
share the link only with people who own the game.

## Testing

### Z-counter coach

The Video settings (F1) include **Z-counter training hints**, enabled by default. For a single launch,
`?env=BT3_COUNTER_HINT=1` enables it and `?env=BT3_COUNTER_HINT=0` hides it. The saved setting is `counter_hint`.
Human-controlled fighters get a small cue under their health bar:

- **GET READY**: a nearby opponent's first animation hit is due within six combat updates (about 200 ms).
- **COUNTER NOW**: that hit-start event is estimated on the next update. Flick Up and tap Square together.
- **INPUT ACTIVE**: the game's one-update counter timer is open after a valid input.
- **Z-COUNTER!**: the game confirmed the counter; the confirmation remains visible for 650 ms.
- **TOO EARLY / TOO LATE**: a counter attempt before / after the estimated first-hit update. The message stays
  visible for **two real seconds**, unless a newer attempt or a confirmed success replaces it.
- **PRESS TOGETHER**: one input was already held; flick Up and tap Square together. **NOT READY** means the
  counter's retry cooldown prevented arming it. These also remain visible for two seconds.
- **COUNTER MISSED**: input arrived on the estimated update but no counter was confirmed; animation timing
  alone cannot explain this miss. Ordinary attacks and movement do not produce failure messages.

The countdown predicts **animation hit activation**, not exact hitbox contact. Range is estimated from model
size; movement, cancelled attacks, delayed contact and animation speed changes can make a cue early or make
the attack miss. Only the first hit is forecast, matching the counter branch's hit-index restriction. Pauses,
loading, cutscenes, CPU fighters and hit-stop suppress the forecast. Rendering interpolation does not advance
the countdown. This overlay reads game state and does not widen the counter window or press buttons.

Regression checks: `cc -std=c11 -Iinclude -Iport/include -Iport/src port/tests/counter_hint.c -o /tmp/bt3-counter-hint`
then `/tmp/bt3-counter-hint`.

- `node port/web/serve.mjs ...` with `?hud=1` shows frames per second and how busy the program is; with
  `?telemetry=1` the page reports both to the server (`port/build/telemetry.log`, read with
  `python3 port/web/telemetry.py`).
- `port/web/iostest.sh` opens the game in the iOS Simulator and prints the same report (the Simulator's GPU is
  much slower than a phone's: use it for layout, input and sound, not for speed).
- `?env=NAME=value,...` sets the port's switches (`BT3_HASH`, `BT3_SCALE`, ...), as the environment does on PC.

## Files

| Path | Contents |
|---|---|
| `port/web/build.py`, `irweb.py`, `link.py` | The build: compile, rewrite the IR (soft float, fixed PS2 address layout), link both targets |
| `port/web/player.html` | Framed player and fullscreen controls (`index.html` in the build) |
| `port/web/shell.html` | The game runtime (`game.html` in the build): loading, the disc reader, touch controls, sound, saves |
| `port/web/net.js`, `net.css` | Online play: the lobby screens, rooms, Quick Match, the WebRTC link |
| `port/web/src/`, `target/`, `include/` | The browser side of the port: touch input, waits, files from the disc |
| `port/web/serve.mjs` | The local test server |
| `cloudflare/` | The optional private deploy: the Worker (key check), the rooms and Quick Match |
