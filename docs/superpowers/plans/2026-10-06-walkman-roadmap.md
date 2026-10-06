# Ds Man Walkman — Staged Roadmap

**Spec:** `docs/superpowers/specs/2026-10-06-walkman-player-design.md`

The spec spans five subsystems (fork tooling, the `media.local` contract and
sim fake, the app core, the UI, and native 3DS code). Each group of stages
gets its own detailed implementation plan, written when the previous plan
lands, because each depends on what the previous one fixes in place: the
contract shape, the chosen visual direction, the parts kit's class strings.

| Plan | Stages | File | Depends on | Delivers |
|---|---|---|---|---|
| 1 | 0, 1, 2 | `2026-10-06-walkman-01-foundations-core.md` | — | Fork pin, font flags, `bootBundle` globals, `media.local` contract + SDK + sim fake, headless harness, library model, player reducer + controller, scanning app shell |
| 2 | 3 | `2026-10-06-walkman-02-aqua-theme.md` | Plan 1 | 2–3 Superdesign directions at 400×240 + 320×240 → user choice → `app/theme/` tokens, parts kit, pixel font, `app/fonts.json` |
| 3 | 4, 5 | `walkman-03-screens.md` (to write) | Plans 1, 2 | Explorer (tabs, VirtualList, drill-down, OSK search, held-D-pad repeat, ♪ marker) and Now Playing (transport, scrubber gesture, marquee, placeholder art), all driven by headless tests |
| 4 | 6, 7 | `walkman-04-native-localmedia.md` (to write) | Plan 1 (contract only) — can run in parallel with Plans 2–3 | `hosts/3ds/src/localmedia.c`: scan, ID3v2/v1, duration, minimp3 → NDSP, seek, snapshot rule; APIC → stb_image → RGB565 texture; `media.local` in the 3DS profile (hostAbi 12); `POCKETJS_LOCALMEDIA` build flag; host-compiled C tests for the tag/frame parsers |
| 5 | 8 | `walkman-05-hardening.md` (to write) | Plans 3, 4 | Device checklist on New 3DS + Azahar, scan-time/CPU/memory/underrun budgets, corrupt-file corpus, Azahar e2e capture |
| — | v2 | — | Plan 5 | Lid-closed playback, resume-on-launch, theme switching |

## Ordering

```
Plan 1 ──┬─► Plan 2 ──► Plan 3 ──┐
         └─► Plan 4 ─────────────┴─► Plan 5
```

Plan 4 needs only the contract from Plan 1, so native work can proceed
alongside the design and screen work. Until Plan 4 lands, ds-man declares
`media.local` as an **enhancement**: the 3DS build boots and reports
"Music playback is unavailable on this build", and every behaviour is
exercised headlessly against the sim fake. Plan 4 moves it to `requires`.

## Per-plan exit gates (from the spec)

- **Plan 1:** `bun run check`, `bun run test`, `bun run 3ds --pocket-only`
  green in ds-man on the fork pin; the fork's new tests green.
- **Plan 2:** an approved mockup; the parts kit renders in the sim.
- **Plan 3:** headless tests drive tabs, search, drill-down, seek drag and
  transport taps through `bootBundle`.
- **Plan 4:** a real MP3 library plays, seeks and auto-advances in Azahar and
  on a New 3DS; covers display; no texture leaks over 50+ track changes.
- **Plan 5:** the device checklist passes.
