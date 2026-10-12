# Developing iPoDS

Building, testing and releasing iPoDS. [README.md](README.md) covers installing
and using the app; [AGENTS.md](AGENTS.md) covers code standards and
architecture.

Native playback (`media.local`: scanning, ID3 tags, MP3 decoding to NDSP, cover
art) lives in the [PocketJS](https://github.com/dvalinotti/pocketjs) fork, on its
`ipo-ds` branch, pinned here as the `runtime/` submodule.

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

## Release

`.github/workflows/build.yml` typechecks, tests and builds the `.3dsx` and
`.cia` for every pull request and push to `main`, and uploads them as the
`ipo-ds-3ds` workflow artifact. To release:

1. Set the same version in `package.json` and `pocket.json` and merge it.
2. Tag the merge commit and push the tag:
   `git tag v0.2.0 && git push origin v0.2.0`.
3. `.github/workflows/release.yml` runs `bun scripts/release-check.ts <tag>`,
   which fails unless the tag matches both files and is
   `v<major>.<minor>.<patch>[-<prerelease>]` with no build metadata. It also
   fails unless the pinned `runtime` commit is on the fork's `ipo-ds` branch,
   so every tag stays buildable. It then builds the tagged commit and creates a draft release holding `iPoDS-v0.2.0.3dsx`, `iPoDS-v0.2.0.cia`
   and `SHA256SUMS.txt`, with notes generated from the merged pull requests.
4. Install the draft's `.cia` on a console or in Azahar, then publish the draft.

A tag with a prerelease suffix (`v0.2.0-beta.1`) is marked as a prerelease.
Keep `id` in `pocket.json` fixed: the CIA's title id is derived from it, and a
changed id installs as a second title beside the old one.
