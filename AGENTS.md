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

## Code standards

### PocketJS guest code (`app/`)

- `app/` runs in the 3DS guest on QuickJS: no DOM, Node or Bun APIs (those stay in `scripts/` and `tests/`) and no event loop. `setTimeout` runs on the next microtask whatever its delay, `clearTimeout` does nothing, and there is no `performance`. Time in frames: `onFrame`, or `virtualFrame()` / `after()` from `@pocketjs/framework/clock`.
- The PocketJS Solid build rejects `createResource`, `useTransition` and `startTransition`.
- Reach the framework only through `@pocketjs/framework/*`. An `app/` import of a `runtime/` path pulls compiler or tool code into the bundle.
- A class literal compiles only if every token is a supported utility. Otherwise the whole literal is dropped, and the 3DS build prints `class "…" does not compile` as a warning and still succeeds; treat that warning as a failure. Choose between complete literals with a ternary: `classList` and template literals in `class` fail the build, and a concatenated string matches no compiled style.
- `style={{ … }}` keys are PocketJS prop names (`translateX`, `insetT`, `rotate`) with numeric values, not CSS. An unknown key throws, and dropping a key does not reset the prop: write its resting value.
- Prefer motion the core runs (`<Sprite>` atlases such as the cover spinner, `animate()`) to per-frame signal writes. A value JS must change every frame is written only when it changes (`theme/parts/marquee.tsx`, `dj/scratch.ts`). Changes on a frame path keep `docs/perf.md`'s budgets (14 ms of CPU per frame on New 3DS, 30 ms on Old) and the op-count test "a focus move touches only the selection" in `tests/app.test.ts`.

### Solid

- Components run once. Read props where they are used (`props.x` in JSX or an accessor) and never destructure them. Read on purpose once with `untrack()`; the session and the Explorer store live as long as the app, so `untrack(() => props.session)` is the way to hold one.
- Render lists and conditionals with `Show`, `Switch`/`Match`, `For` (keyed by item) and `Index` (fixed slots whose values change), not `.map()` or `&&`. A lone reactive child of `<AuxiliarySurface>` needs a wrapping `View`.
- Derive with plain accessors. Use `createMemo` when a value is shared or costly, `settled()` (`app/reactive.ts`) for a value derived from a source written every frame, and a custom `equals` to keep a signal quiet when a write changes nothing (`samePlayer` in `session.ts`). Effects do work outside the tree; react to a change with `on(…, { defer: true })`.
- `onFrame`, `onButtonPress` and `createGesture` are disposed with their owner. Gate input hooks with an `active` accessor: the search keyboard blocks `onButtonPress` while it is open, but `onFrame` still sees every button.
- A gesture that changes what is drawn resets it in `onCancel`.
- Import `onMount` and `onCleanup` from `solid-js`.

### TypeScript

- `strict`, no `any`. Host replies and parsed JSON are `unknown` until a type guard narrows them (`now-playing/frame-time.ts`).
- An index read can be out of range: handle `undefined`, or assert with `!` only where the index is known to be in range.
- Type-only imports carry `type` (`import { type X }` or `import type`). Relative imports carry their `.ts` / `.tsx` extension.
- State changes are discriminated unions (`{ type }` actions and commands, `{ kind }` rows and views) handled by `switch`es in pure reducers.
- Inputs and shared tables are `readonly` arrays and `Readonly<Record<…>>`; module-level objects that are handed out are frozen (`IDLE_STATUS`).
- No classes or `this`: a `createX()` factory returns an interface of closures, so callers pass methods unbound (`onUp: grab.release`).
- Named exports only, except where an entry point expects a default (`App` for `main.tsx`, `pocket.config.ts`).

### Naming and comments

- Units go in names (`positionMs`, `bodyPx`, `ROW_PX`, `HOUR_MS`); module constants are `UPPER_SNAKE_CASE`.
- An `app/` module opens with a `//` header stating what it owns and how it connects to its neighbours. Exported interface fields carry a `/** */` line when the name does not give the meaning or unit.
- Comments state the mechanism or the reason (frame order, why a read is fresh, why a cast is safe) in the present tense. No TODOs in code; open work goes in a plan. Prose in `docs/` follows `runtime/AGENTS.md`: concrete facts, no slogans, intensifiers or filler adverbs.

### Tests

- Test names state the behaviour as a sentence; no `describe` blocks. Fixtures live in `tests/fixtures/`, shared rigs in `tests/support/`.
- A bug fix lands with a test that fails without it.
- Sim tests call `afterAll(disposeGuest)` and take a `120_000` ms timeout.
- Type-level guarantees use `expectTypeOf` from `bun:test` or `// @ts-expect-error`.

## Docs

Feature work follows a design spec in `docs/superpowers/specs/` and numbered implementation plans in `docs/superpowers/plans/` (Plans 1-6: the player; 7-8: DJ Mode; 9: lint and format). Read the relevant spec before changing a feature's behaviour.
