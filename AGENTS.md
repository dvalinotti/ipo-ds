# iPoDS

A walkman-style MP3 player for the Nintendo 3DS in the Aqua / iTunes 4 look: a SolidJS guest on PocketJS. `README.md` covers the controls, build prerequisites and device workflow.

- Framework code belongs in the PocketJS repository; update the `runtime` submodule pin here.
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives and control flow from `solid-js`.
- The 3DS host drives both screens: `pocket.json` declares the 400x240 top viewport and the 320x240 `surfaces.auxiliary` together with `display.auxiliary`.
- Name commits and pull requests in Conventional Commits format (`feat: …`, `fix(scope): …`).
- Do not recursively discover tests or sources through the runtime submodule.
- Keep build products, logs and captures out of Git.

## Setup

```sh
git submodule update --init runtime
bun install --cwd runtime --frozen-lockfile
bun scripts/setup.ts          # symlinks @pocketjs/framework, solid-js, @types, bun-types in node_modules/ to runtime/
bun run --cwd runtime wasm    # runtime/hosts/web/pocketjs.wasm for the sim tests; needs `rustup target add wasm32-unknown-unknown`
```

`node_modules/` holds only those symlinks; there is no root lockfile. Re-run `bun scripts/setup.ts` (and the wasm build) after moving the submodule pin.

## Commands

```sh
bun run check                                          # tsc --noEmit
bun run test                                           # every test under tests/
bun test --conditions=browser tests/player.test.ts     # one file
bun test --conditions=browser tests/app.test.ts -t "search"   # tests whose name matches
bun run 3ds --pocket-only                              # guest package only, no Docker
bun run gallery                                        # theme states as PNGs in dist/gallery/
```

- Pass `--conditions=browser` to every `bun test`: without it `solid-js` resolves to its server build, which does not react. Pass a path under `tests/` so Bun does not walk `runtime/`.
- `bun run 3ds` (`.3dsx`, `--cia`) needs Docker with devkitARM. `bun run perf` also needs Azahar and `dist/test-music` (`bun run test-library`, which needs ffmpeg, lame and ImageMagick); budgets and results are in `docs/perf.md`.

## Tests

- **Unit tests** import the pure modules directly (reducers, models, platter math, input steppers, library building).
- **Sim tests** (`app`, `dj`, `gallery`, `build`) build a `--pocket-only` bundle once per test process (`scripts/sim.ts`) and boot it on the PocketJS WASM core with both screens. `tests/support/app-world.ts` boots it and reads text, colours (0xAABBGGRR) and node paths off a surface. App tests pass a fake media host from `runtime/hosts/sim/localmedia.ts` (`createSimLocalMedia`) as the `localmedia` global and advance its clock with each frame.
- 3DS face buttons map by position: A = `BTN.CIRCLE`, B = `BTN.CROSS`, X = `BTN.TRIANGLE`, Y = `BTN.SQUARE`.
- `tests/fonts.test.ts` fails when any non-ASCII character in `app/` source (outside comments) is not baked by `app/fonts.json`; add new symbols there.

## Architecture

- **Screens** (`app/app.tsx`): the top screen is the Explorer (`app/explorer/`: Songs / Artists / Albums tabs, drill-downs, search). The bottom screen, inside `<AuxiliarySurface>`, switches between Now Playing (`app/now-playing/`), DJ Mode (`app/dj/`) and the search keyboard (`app/search.tsx`) while it is open.
- **Session** (`app/session.ts`) is the only connection to the host's `media.local` module (`@pocketjs/framework/localmedia`). It scans at launch, polls status in `onFrame` (every `POLL_EVERY` frames; every frame while loading, scratching or after a command), rebuilds the `Library` when `scanGeneration` changes, manages cover-art texture handles, and exposes everything as Solid signals. On a build without `media.local` it is inert (`available: false`).
- **A frame that throws tears the guest down on the 3DS.** Host calls go through `try`/`catch` in the session and surface as `readFailed`; keep that for new host calls.
- **Pure core, thin binding.** State logic is pure and unit-tested; a small file binds it to Solid, frames and the host:
  - `player/reducer.ts` returns `(state, commands)`; `player/controller.ts` runs the commands against `media.local` and feeds each status back as a `hostStatus` action.
  - `explorer/model.ts` (reducer and selectors) → `explorer/explorer.tsx`.
  - `dj/platter.ts` (math) and `dj/grab.ts` (grab machine) → `dj/scratch.ts` (gesture, session, frame) → `dj/dj-mode.tsx` (presentation only).
  - `input-timing.ts` (steppers) → `input.ts` (frame-driven repeat, tap-or-hold, analog).
- **Library** (`app/library/`): `buildLibrary` adds tag fallbacks, folded sort and search keys (`normalize.ts`), and artist and album indexes. Tag text is first passed through `composeMarks`, because the baked font draws only precomposed letters.
- **Hot paths:** the per-frame status is kept out of the `player` signal (`samePlayer` equality) so queue readers do not re-run during playback; `reactive.ts`'s `settled()` puts a frequently written source behind a signal. `explorer/recycled-list.tsx` keeps a fixed pool of row slots and rebinds them while scrolling instead of creating or destroying rows.

## Theme and gallery

- `app/theme/theme.ts` defines the `Theme` slots; `aqua.ts` fills them; `app/theme/parts/` components read only from a `Theme`. **The build compiles only literal class strings**: every slot is a complete class literal, and variants are functions that choose between literals. Do not build class names by concatenation.
- `app/theme/fonts.ts` holds baked font-slot numbers as literals (compiler code stays out of the app's import graph); `tests/marquee.test.ts` checks them against the build.
- Assets are declared in `app/fonts.json` (baked glyph ranges), `app/images.json` (linear sampling for the rotating platter art) and `app/sprites.json` (the spinner atlas).
- Generated files, rewritten by their scripts (tests check the outputs):
  - `app/library/compose-table.ts` ← `bun scripts/gen-compose-table.ts`
  - `app/theme/icons/spinner-atlas.svg` ← `bun scripts/spinner-atlas.ts`
  - `app/theme/vinyl.png`, `label.png` ← `bun scripts/vinyl-png.ts`
- `gallery.pocket.json` builds `app/gallery.tsx`, a storyboard of theme states from fixture data; L / R cycle them. A new state needs its name in `app/gallery/names.ts` (cycle order) and a builder in `app/gallery/states.tsx`; `tests/gallery.test.ts` visits states in that order. Compare `bun run gallery` output with the approved mockups in `docs/design/aqua/`.

## Docs

Feature work follows a design spec in `docs/superpowers/specs/` and numbered implementation plans in `docs/superpowers/plans/` (Plans 1-6: the player; 7-8: DJ Mode). Read the relevant spec before changing a feature's behaviour.
