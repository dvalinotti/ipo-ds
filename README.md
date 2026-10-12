# iPoDS

A walkman-style MP3 player for the Nintendo 3DS, dressed in the Aqua / iTunes 4
look. The top screen browses your library (Songs, Artists, Albums, with search);
the bottom screen is Now Playing, with cover art, a seek capsule and a touch
transport row, or DJ Mode, a record you can scratch. It plays the `.mp3` files
in `sdmc:/music/`.

iPoDS is built on [PocketJS](https://github.com/dvalinotti/pocketjs) (SolidJS
apps on a Rust core).

iPoDS is a fan-made homebrew app. It is not affiliated with or endorsed by
Apple or Nintendo.

## Install

Download the latest `iPoDS-v<version>.3dsx` or `iPoDS-v<version>.cia` from the
[Releases page](https://github.com/dvalinotti/ipo-ds/releases).
`SHA256SUMS.txt` beside them lists each file's checksum.

- **`.3dsx`** (Homebrew Launcher): copy it to `sdmc:/3ds/` on the SD card and
  start it from the Homebrew Launcher.
- **`.cia`** (HOME Menu): on a console with custom firmware, copy it to the SD
  card and install it with a CIA installer such as FBI. iPoDS then appears on
  the HOME Menu. Installing a newer `.cia` replaces the old one.
- **Emulator**: open the `.3dsx` or install the `.cia` in
  [Azahar](https://azahar-emu.org).

## Music

Copy `.mp3` files to `sdmc:/music/` on the SD card. The first scan reads every
file; later launches show the saved list at once and confirm it in the
background (`sdmc:/pocketjs/localmedia/library.cache`). Holding X scans the
folder again.

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

## Building from source

Build, test and release steps are in [DEVELOPING.md](DEVELOPING.md).

## License

[MIT](LICENSE). PocketJS is MIT-licensed; the runtime vendors
[minimp3](https://github.com/lieff/minimp3) (CC0) and
[stb_image](https://github.com/nothings/stb) (public domain / MIT).
