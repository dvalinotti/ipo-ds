# iPoDS

A walkman-style MP3 player for the Nintendo 3DS, dressed in the Aqua / iTunes 4
look. The top screen browses your library (Songs, Artists, Albums, with search);
the bottom screen is Now Playing, with cover art, a seek capsule and a touch
transport row, or DJ Mode, a record you can scratch. It plays the `.mp3` files
in `sdmc:/music/`.

iPoDS is built on [PocketJS](https://github.com/dvalinotti/pocketjs) (SolidJS
apps on a Rust core). Native playback (`media.local`: scanning, ID3 tags,
MP3 decoding to NDSP, cover art) lives in that fork, on its `ipo-ds` branch,
pinned here as the `runtime/` submodule.

iPoDS is a fan-made homebrew app. It is not affiliated with or endorsed by
Apple or Nintendo.

## Controls

| Button | Top screen (library) |
|---|---|
| D-pad | Move; left/right page |
| A | Play the song, or open the artist or album |
| B | Back; clear the search |
| X | Search; hold to scan the card again |
| Y | Jump to the song that is playing |
| L / R | Switch tabs |
| Y + L / R | Previous / next song |
| ZL / ZR | Previous / next song |
| START | Play / pause |
| SELECT | DJ Mode on / off |
| L + R (hold) | Diagnostics in the Now Playing LCD |

The bottom screen is touch: shuffle, previous, play/pause, next, repeat, DJ
Mode, and a drag-to-seek capsule. In DJ Mode the record spins while the song
plays; drag it clockwise to play forward at your finger's speed, counter-
clockwise to play backwards, and hold it still for silence. Lifting your
finger lets the song play on from there.

## Music

Copy `.mp3` files to `sdmc:/music/` on the SD card. The first scan reads every
file; later launches show the saved list at once and confirm it in the
background (`sdmc:/pocketjs/localmedia/library.cache`). Holding X scans the
folder again.

## Build

Prerequisites, from the pinned runtime's `hosts/3ds/README.md`:

- [Bun](https://bun.sh).
- Docker, with the digest-pinned `devkitpro/devkitarm` image the build names.
- rustup. The build installs `nightly-2026-07-02` from
  `runtime/hosts/3ds/core/rust-toolchain.toml`.

```sh
git clone --recursive https://github.com/dvalinotti/ipo-ds
cd ipo-ds
bun install --cwd runtime --frozen-lockfile
bun scripts/setup.ts
bun run 3ds                # dist/ipo-ds-main.3dsx and dist/ipo-ds-main.pocket
bun run 3ds --cia          # also dist/ipo-ds-main.cia
bun run 3ds --pocket-only  # only the guest package; no Docker
```

Boot the `.3dsx` in [Azahar](https://azahar-emu.org) with
`open -a Azahar dist/ipo-ds-main.3dsx`, or launch it from the Homebrew Launcher
on a console.

## Develop

```sh
bun run check          # TypeScript
bun run test           # unit and sim tests
bun run gallery        # dist/gallery/<n>-<state>-{top,bottom}@2x.png
bun run test-library   # dist/test-music/: 324 tagged MP3s for a device or Azahar
bun run perf           # frame and scan timings in Azahar (docs/perf.md)
```

`gallery.pocket.json` builds `app/gallery.tsx`, a storyboard of the theme's
states built from `app/theme/parts`. L / R flip states on a device or in the
sim. Design notes, specs and plans live in `docs/`.

## Updating PocketJS

```sh
git -C runtime fetch origin
git -C runtime checkout <commit>
bun install --cwd runtime --frozen-lockfile
git add runtime
```

## License

[MIT](LICENSE). PocketJS is MIT-licensed; the runtime vendors
[minimp3](https://github.com/lieff/minimp3) (CC0) and
[stb_image](https://github.com/nothings/stb) (public domain / MIT).
