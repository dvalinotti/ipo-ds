# iPoDS

A PocketJS app for the Nintendo 3DS. The app owns the **400x240 top screen**
and the **320x240 bottom screen** (`surfaces.auxiliary`). PocketJS is a pinned
git submodule at `runtime/`. `scripts/setup.ts` links `@pocketjs/framework` to
that checkout and `solid-js` to its installed copy.

## Run

Prerequisites, from the pinned runtime's `hosts/3ds/README.md`:

- Docker, with the digest-pinned `devkitpro/devkitarm` image the build names.
- rustup. The build installs `nightly-2026-07-02` from
  `runtime/hosts/3ds/core/rust-toolchain.toml`.

```sh
git clone --recursive <this repo> ipo-ds
cd ipo-ds
bun install --cwd runtime --frozen-lockfile
bun scripts/setup.ts
bun run 3ds                # dist/ipo-ds-main.3dsx and dist/ipo-ds-main.pocket
bun run 3ds --cia          # also dist/ipo-ds-main.cia
bun run 3ds --pocket-only  # only the guest package; no Docker
```

Boot the `.3dsx` in Azahar with `open -a Azahar dist/ipo-ds-main.3dsx`, or
launch it from the Homebrew Launcher on a console.

## Check

```sh
bun run check
```

## Theme gallery

```sh
bun run gallery   # dist/gallery/<n>-<state>-{top,bottom}@2x.png
```

`gallery.pocket.json` builds `app/gallery.tsx`, which shows the approved Aqua
mockup states (`docs/design/aqua/`) built from `app/theme/parts`. L / R flip
states on a device or in the sim.

## Updating PocketJS

```sh
git -C runtime fetch origin
git -C runtime checkout <commit>
bun install --cwd runtime --frozen-lockfile
git add runtime
```
