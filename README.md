# duke3d-web

The shareware episode of Duke Nukem 3D (version 1.3D, unmodified), playable in the browser at
thegrandpricks.com/games/duke3d/. It is [eduke32-wasm](https://github.com/DigitalCyberSoft/eduke32-wasm)
v0.2.4 (EDuke32 compiled to WebAssembly) with a few changes so it fits a static site with a strict
Content-Security-Policy. Online play is left out.

## Build

```sh
tools/build-engine.sh   # engine -> build/engine/ (first run installs Emscripten 6.0.5 into build/emsdk, about 1 GB)
python3 tools/build.py  # build/engine/ + web/ -> dist/ (also writes dist/_headers with the CSP hashes)
```

`build-engine.sh` clones the v0.2.4 tag (and checks it is commit 37b56ee), applies `patches/`, and runs the
same make command as upstream's release CI with Emscripten 6.0.5, plus `engine/csp_run_script.js`.
Built without the patches, it reproduces the release's `eduke32.js` and `eduke32.data` byte for byte; the
wasm has the same functions and code size, with static data laid out in a different order.

`build.py` refuses to run on a stale engine build, a `eduke32.data` that isn't the stock shareware
`DUKE3D.GRP` (sha256 f943d0c2...), or an `eduke32.js` that still calls `eval`.

## Changes from eduke32-wasm v0.2.4

Engine (`patches/`, `engine/`):
- **0001**: no "Multiplayer" entry in the main menu or the in-game menu.
- **0002**: the Up and Down arrows move forward and back by default. EDuke32's modern defaults left them
  unbound (only W/S walk), so keyboard-only players couldn't move. They take the keypad 8/2 slots.
- `engine/csp_run_script.js` replaces Emscripten's `emscripten_run_script(_string)`, which `eval()` the
  string the engine passes. The engine sends its menu state that way every half second; under a CSP
  without `'unsafe-eval'` the eval throws and the engine freezes. The page's `Module.runScript` handles
  the string instead.

Page (`web/index.html`, from upstream's `platform/emscripten/index.html`):
- `eduke32-net.js` (WebRTC + Nostr online play) is not loaded, so nothing connects to the public Nostr
  relays or Google/Cloudflare STUN servers. The `?join=` flow and the GitHub Pages self-reload are gone.
- Saved games persist in IndexedDB (`eduke32-saves`). Upstream kept them only in memory, so a reload
  lost them.
- "Clear local data" clears only this game's storage. Upstream called `localStorage.clear()` and deleted
  every IndexedDB database, which would wipe the rest of the site's data on the same origin. It also no
  longer writes the settings straight back while unloading.
- Quit Game used to leave a black page; now it shows "You quit the game" with a Play again button.
- A refused pointer lock no longer lands in the crash log ("death certificate") or the console.
- The render-height cap defaults to 1080 (Settings can still pick Native).
- The loading screen lists the default keys, or says a keyboard is needed on touch-only devices.
- Credits and license links; the social-preview tags pointing at the upstream site are removed; own
  build tag `0.2.4-1` (cache-buster for `eduke32.js`/`.wasm`; bump it with every engine rebuild).
- A styled `#back` slot after `<!-- back link -->` for the host site's link back to its games page.

Also added: `credits.html`, `COPYING.TXT` (GPL-2.0), `BUILDLIC.TXT` (Build license), `LICENSE.TXT`
(3D Realms' shareware license, byte for byte) and `THIRD-PARTY.TXT` (libraries compiled into the engine).

## On the site

`thegrandpricks/tools/sync-games.py` can copy `dist/` like it does TEREP: compiled output
`eduke32.wasm`, sources `["engine", "patches", "tools"]`, page folder `web`, back-link marker
`<!-- back link -->\n`, link e.g. `<a id="back" href="/games/">&lt;&lt; Back to games</a>\n`.
The `/games/duke3d/*` rule for the site's `_headers` is in `dist/_headers` (detach the site CSP first
with `! Content-Security-Policy`, like TEREP). The hashes cover the two inline scripts and the canvas's
`oncontextmenu`; the back link doesn't change them. `eduke32.data` never changes (it is the pinned
shareware GRP), so it can be cached for a long time; `eduke32.js` and `.wasm` should revalidate.

## Licensing

- Duke Nukem 3D shareware: (c) 1996 3D Realms, `LICENSE.TXT`. It allows free websites to offer the game
  for download, unmodified. Note that its section 3C asks for all of the shareware release's files to be
  included; this build, like every browser port, ships only `DUKE3D.GRP` (plus `LICENSE.TXT`).
- EDuke32 and eduke32-wasm: GPL-2.0 (`COPYING.TXT`). Build engine: `BUILDLIC.TXT` (free, internet-only,
  non-commercial distribution, with Ken Silverman's notice; see `credits.html`).
- Distributing `dist/` means offering the complete corresponding source: this repo plus the eduke32-wasm
  v0.2.4 source it builds from.
