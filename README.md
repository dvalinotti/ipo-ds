# iPoDS

A walkman-style MP3 player for the Nintendo 3DS, dressed in the Aqua / iTunes 4
look. By default the top screen browses your library (Songs, Artists, Albums, with search);
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

Hold SELECT for a second to swap the screens: Now Playing moves to the top
screen, the library moves to the touch screen, and the buttons drive playback.
Hold SELECT again to swap back. The setting lasts until the app closes.

| Button | Normal | Swapped |
|---|---|---|
| D-pad up / down | Move | — |
| Circle pad | Move | — |
| D-pad left / right | Page | Seek back / forward: 5 s, then 2 s while held |
| A | Play the song, or open the artist or album | Play / pause |
| B | Back; clear the search | Back; clear the search |
| X | Search; hold to scan the card again | Shuffle on / off; hold to scan the card again |
| Y | Jump to the song that is playing | Repeat off / all / one |
| L / R | Switch tabs | Switch tabs |
| Y + L / R | Previous / next song | Previous / next song |
| ZL / ZR | Previous / next song | Previous / next song |
| START | Play / pause | Play / pause |
| SELECT | DJ Mode on / off; hold to swap the screens | DJ Mode on / off; hold to swap the screens |
| L + R (hold) | Diagnostics in the Now Playing LCD | Diagnostics in the Now Playing LCD |

The bottom screen is touch. In normal mode it is Now Playing: shuffle,
previous, play/pause, next, repeat, DJ Mode, and a drag-to-seek capsule. In DJ
Mode the record spins while the song plays; drag it clockwise to play forward
at your finger's speed, counter-clockwise to play backwards, and hold it still
for silence. Lifting your finger lets the song play on from there. Swapped, the
bottom screen is the library: drag the list to scroll it and flick it to fling,
drag the scrollbar's thumb or tap its track to page, tap a tab to switch, tap a
song to play it or an album to open it, tap the footer's Search, Back or Scan
again gels, tap the breadcrumb to go up, and tap the iPoDS LCD to jump to the
playing song. DJ Mode takes the bottom screen in either mode, so while it is
open in swapped mode the library and its buttons (B, X, Y, L, R) wait until you
leave it.

## Building from source

Build, test and release steps are in [DEVELOPING.md](DEVELOPING.md).

## License

[MIT](LICENSE). PocketJS is MIT-licensed; the runtime vendors
[minimp3](https://github.com/lieff/minimp3) (CC0) and
[stb_image](https://github.com/nothings/stb) (public domain / MIT).
