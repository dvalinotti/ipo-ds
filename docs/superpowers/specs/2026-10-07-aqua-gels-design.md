# Ds Man — Aqua Gels

Date: 2026-10-07
Status: approved in brainstorming (sections 1–3); awaiting review of this document
Parent spec: `docs/superpowers/specs/2026-10-06-walkman-player-design.md` (the Aqua / iTunes 4 theme)
Reference: `~/Pictures/Screenshot 2026-10-06 at 4.25.53 PM.png` (a Mac OS X "default" push button, 274×150)

## 1. Outcome

Every gel control in the Aqua theme looks as close to the reference button as the 3DS renderer allows. This means a navy outline, a gloss band over the top, a body that is darkest under the gloss and glows toward the bottom edge, a soft drop shadow, and white bold labels with a faint shadow.

- **Blue gels:** play/pause, shuffle and repeat while on, the active tab, the primary legend badge, the seek knob, the scroll thumb and the scan progress fill.
- **Grey gels:** the same build in graphite: prev/next, shuffle and repeat while off, the inactive tabs, the other legend badges, and disabled transport buttons (at 45 % opacity, as today).

## 2. Decisions made in brainstorming

| Decision | Choice |
|---|---|
| Which controls | Blue **and** grey gels: one build, two colourings |
| How | **Layered boxes in the theme** (approach A): a body box plus an absolutely placed gloss box, with no fork changes. Baked images (B) and new renderer features (C) were not chosen. B stays an option for the 64 px play button alone if A falls short in the side-by-side check (§6.3). |
| Side glow | Not drawn (the reference's lighter left and right edges need a horizontal gradient under a vertical one) |
| Budget | Plan 5's frame budgets stay hard (§5) |

## 3. Anatomy and colours

A gel is a **body** with a **gloss** as its first child, then the control's content on top. Both are rounded where the control is. The blue values are sampled from the reference; grey is the same build in graphite.

| Layer | Blue | Grey |
|---|---|---|
| Outline, 1 px | `#2b4f8c` | `#6e6e6e` |
| Body gradient (top → middle → bottom) | `#4a80da` → `#4a80da` → `#c8daf6` | `#c4c4c4` → `#c4c4c4` → `#f4f4f4` |
| Gloss gradient (top → middle → bottom) | `#f5f8fe` → `#d3e1f8` → `#93b4eb` | `#fdfdfd` → `#ececec` → `#d6d6d6` |
| Label | white bold, plus a copy 1 px lower in `#1d3f8099` | dark ink (`#2b2b2b`), no shadow |
| Drop shadow (`shadow`) | play/pause, prev/next, shuffle/repeat, seek knob | same controls |

Facts about the renderer that shape the build (`runtime/docs/DESIGN.md`, styling reference):
- **Gradients have three stops, with the middle one fixed at 50 %.** The reference's sharp step from the gloss to the dark body is therefore the gloss box's bottom edge. The gloss's bottom colour (`#93b4eb`) is darkened so that the step is small. The reference softens the same step over about 5 px.
- **`overflow-hidden` is a rectangular scissor.** A gloss is never clipped to its round body, so its own geometry keeps it inside (§3.1).
- **Borders paint inside the box without insetting content**, so gloss offsets are measured from the body's outer edge.
- **Shadows are layered rounded alpha spans** (`shadow` is the smallest).

### 3.1 Gloss geometry (px, from the body's outer edge)

**Round gels.** These are the largest pills (fully rounded ends) whose every point lies at least 0.25 px inside the outline's inner edge (radius − 1). The height is about 45 % of the gel, and the gloss is centred horizontally:

| Gel | Body | Gloss: left, top, width, height, radius | Clearance from the outline |
|---|---|---|---|
| play/pause | 64×64 | 10, 3, 44, 30, 15 | 0.35 |
| prev/next | 42×42 | 6, 3, 30, 20, 10 | 0.57 |
| shuffle/repeat | 34×34 | 5, 3, 24, 16, 8 | 0.79 |
| seek knob | 18×18 | 2, 3, 14, 8, 4 | 0.39 |
| legend badge | 14×14 | 2, 3, 10, 6, 3 | 0.76 |

**Gels that change size.** Their gloss is pinned by edge offsets, so it follows the body:
- **Scroll thumb** (11 wide, variable height, radius 6): the gel turns sideways, as Aqua's vertical scroll bars do.
  - The body and gloss gradients run left → right instead of top → bottom.
  - Gloss: `left-[2] top-[3] bottom-[3] w-[4] rounded-[2]`.
- **Progress fill** (10 high, variable width, radius 5): gloss `left-[3] right-[3] top-[1] h-[4] rounded-[2]`. The fill keeps no outline of its own; the track's border is its outline.

**Tab segments** (18 high, square, inside the rounded group): gloss `left-[0] right-[0] top-[0] h-[9]`, square-cornered, so the segments still meet edge to edge.

The minimum clearance is checked by a test (§6.1), not trusted from this table.

## 4. Structure

- **`app/theme/theme.ts`:**
  - Adds `export interface GelClasses { body: string; gloss: string }`.
  - These slots return `GelClasses` instead of a class string: `tab(active)`, `badge(primary)`, `transport(kind, on, enabled)`, `seekKnob`, `scrollThumb` and `progressFill`.
  - Adds `labelShadow` slots for the blue labels: `tabTextShadow` and `badgeTextShadow`.
  - Every value stays a complete class literal (the build compiles literals).
- **`app/theme/aqua.ts`:** the gel classes from §3, chosen by the existing arguments: `active`, `primary`, `on`, `enabled`.
- **`app/theme/parts/gel.tsx` (new):**
  - `Gel(props: { classes: GelClasses; style?; ref?; children })` renders `<View class={body}><View class={gloss} />{children}</View>`. It passes `style` and `ref` through, so the knob's inset, the thumb's offset and height, the fill's width and the transport buttons' touch region keep working.
  - `GelLabel(props: { text; class; shadow?: string })` renders a `relative` wrapper holding the shadow copy (absolute, 1 px lower) and then the label. Without `shadow`, it renders the label alone.
- **Call sites:**
  - `parts/toolbar.tsx` (tab segments, the active label via `GelLabel`)
  - `parts/strips.tsx` (`KeyBadge`)
  - `parts/list.tsx` (scroll thumb)
  - `parts/panels.tsx` (progress fill)
  - `parts/deck.tsx` (seek knob, `TransportButton`)
- **Layout does not move:** every body keeps today's size, padding and alignment, and the gloss and the label shadow are absolutely positioned.

## 5. Cost and budget

Gels on screen in the measured scenes:
- **Top screen:** the active tab and two grey ones, the scroll thumb, four legend badges.
- **Bottom screen (Now Playing):** the seek knob and five transport buttons.

Each gel adds a gloss box. The rounded ones are drawn as per-row spans, and the shadows add two layers each. The expected cost is about 1–2 ms of drawing per frame on the Old 3DS; scroll there was 28.4 ms after Plan 5.

- **Budget (Plan 5, unchanged):** CPU work per frame in `idle`, `scroll` and `now-playing`: **≤ 14 ms on New, ≤ 30 ms on Old**. Checked with `bun run perf --check`.
- **Fallbacks, applied in order and re-measured after each, stopping at the first that passes:**
  1. Remove the seek knob's shadow.
  2. Remove the shadows of prev/next and shuffle/repeat. Play/pause keeps its own.
- Each fallback applied is recorded in `docs/perf.md`. If a scene is still over budget after both, stop and report the numbers to the user, who decides.

## 6. Testing and review

### 6.1 Tests (written failing first)

- **`tests/theme.test.ts`:** every gel slot's `body` and `gloss` (every argument combination) compiles; the label shadow slots compile.
- **Gloss geometry** (new, in `tests/theme.test.ts` or `tests/gels.test.ts`):
  - It parses `w`, `h`, `left`, `top`, `right`, `bottom` and `rounded` from each gel's class literals.
  - It checks every gloss lies inside its body, at least 0.25 px inside the outline's inner edge. Round gels are checked against the circle, not the bounding box.
  - Pinned glosses are checked at the smallest and largest sizes the app produces: thumb height 16 and the full track; progress width 0, 10 and the full track.
- **Sim test:** each gel control renders a body whose first child is its gloss, and a blue label renders exactly one shadow copy. Grey labels render none.
- **Existing tests stay green:** the design test in `tests/gallery.test.ts` (tabs form one segmented control, alignment) and `tests/app.test.ts`, including Task 11's op count. Gloss nodes are static and must add no ops to a focus move or a scroll.

### 6.2 Gallery

- A new gallery state, **`gels`** (`9-gels-top@2x.png`, `9-gels-bottom@2x.png`):
  - every gel in every state: blue, grey and disabled, at each size;
  - the tabs and badges in context;
  - the thumb at two heights;
  - the progress fill at 0, 10 % and 60 %;
  - and on the top screen, a **reference pill**: 115×44 with a `text-xl` bold "default" label, the reference button's size at the gallery's 2× scale.
- The 16 existing gallery images change on purpose. After the user's review (§6.3) they and the two new ones become the gallery baseline (`dist/gallery-baseline`).

### 6.3 Side-by-side with the reference

- **Comparison image:** one image with the reference on the left and the gallery's reference pill on the right, both at 2×. A table compares the colour down the centre column at matching heights (top of the outline, gloss top, gloss bottom, body under the gloss, bottom glow, shadow).
- **The 3DS draws the same:** the perf run's Azahar capture of Now Playing goes next to the sim's `1-main-bottom`.
- **The user reviews** the comparison, the 16 existing images and `9-gels` before merge.

## 7. Out of scope

- The OSK keyboard (the framework's, and not Aqua-blue).
- The flat blue selected row and the light-blue sorted column header (Aqua list styling, not gels).
- The side glow.
- A text shadow under grey labels.

## 8. Risks

- **The Old 3DS scroll budget:** §5's fallbacks; the user decides if they are not enough.
- **Small gels:** the 14 px badges and the 18 px knob have 6–8 px glosses. If the badge reads as noise at 1×, its gloss can shrink to a 2 px band in review, without a new spec.
- **Gradient banding:** the 3DS renders gradients per vertex (Gouraud) on square boxes and per row on rounded ones. If Azahar's capture differs visibly from the sim's (§6.3), the difference is reported to the user, not hidden.
