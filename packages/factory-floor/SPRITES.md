# Factory Floor Sprite Pipeline

This file is the source of truth for the game-style sprite system used by
`@openreactor/factory-floor`.

The goal is a coherent video-game UI, not a collection of unrelated generated
images. Consistency, runtime fit, transparent exports, and live-renderer review
matter more than producing many assets quickly.

## Operating Rules

- Use Codex-native image generation for generated bitmap sprites.
- Do not use ChatGPT Mac app automation, AppleScript, Quick Look, Preview, or
  the historical `sprites:chatgpt` helper as the recommended workflow.
- Generate one style reference first, then generate production assets in small
  batches.
- For every generated sprite that is not an overlay, start from the runtime
  tile footprint as a composition grid. The grid is a scaffold for object
  placement and edge alignment, not visible final artwork.
- Inspect every meaningful batch in the live renderer before moving on.
- Keep only package-ready sprites in `src/assets/sprites/`; do not ship raw
  1024px generation outputs.
- Apply every accepted project-bound generated image to the package asset path
  before moving on; do not leave generated images as previews only.
- Use transparent PNGs for generated assets.
- Import shipped PNGs with `?no-inline` in TypeScript so Vite library mode emits
  separate image assets instead of inlining them into JavaScript.
- Stop and switch to SVG or renderer-built symbols when generation is the wrong
  tool for a tiny or precision-sensitive asset.
- Treat tiny role overlays as precision-sensitive. Controlled simple symbols
  are preferred over generated overlays if generation introduces text-like or
  numeral-like marks.

Historical ChatGPT automation may be useful only as context for why older
assets look the way they do. It is not part of the current pipeline.

## Renderer Constraints

The renderer is built on a 25px grid.

| Runtime object | Grid footprint | Runtime size | Package target |
|---|---:|---:|---:|
| Source node | 3x3 cells | 75x75px | 192x192 or 256x256 max |
| Sink node | 3x3 cells | 75x75px | 192x192 or 256x256 max |
| Processor station | 7x3 cells | 175x75px | about 448x192, preserving a 7:3 footprint |
| Watchdog | 3x3 planning grid | about 75-96px visual envelope | about 192x192 |
| Drone assembly | 3x3 planning grid | about 32x32px | 128x128, or 192x192 if detail requires it |
| Status badge | token overlay | about 12x12px | 32x32, or 64x64 only if needed |

Station sprites are fitted exactly to their node footprint with
`object-fit: contain`. Source and sink art must read clearly at 75px. Processor
station art must not bleed outside a 175x75px runtime footprint.

## What To Generate

Generate production PNGs for:

- `station-intake.png`
- `station-triage.png`
- `station-execution.png`
- `pile-merged.png`
- `pile-rejected.png`
- `watchdog-idle.png`
- `watchdog-spraying.png` only if the procedural spray plus idle body is not
  enough in context
- `drone-base-neutral.png`
- `drone-rotor-left.png`
- `drone-rotor-right.png`
- `overlay-role-general.png`
- `overlay-role-planner.png`
- `overlay-role-triage.png`
- `overlay-role-ui.png`

Status badge PNGs are not current production generation targets. The renderer
uses code-built status symbols because they stay clearer at about 12x12px.

## What Stays Renderer-Built Or Controlled

Do not generate production assets for:

- conveyor belts, corners, or conveyor animation frames
- moving issue tokens
- moving pull-request tokens
- provider logos

Conveyors are code-built and code-animated so they can tile exactly on the 25px
grid, rotate cleanly, and support arbitrary routed loops.

Issue and pull-request tokens are renderer-built glyphs. They stay crisp under
runtime tinting and are more readable at conveyor scale than generated art.

Provider marks are controlled SVG assets:

- `packages/factory-floor/src/assets/logos/codex.svg`
- `packages/factory-floor/src/assets/logos/claude.svg`

Do not regenerate those provider logos as PNGs.

## Current Runtime Inventory

Production sprite assets live in:

`packages/factory-floor/src/assets/sprites/`

Controlled SVG logo assets live in:

`packages/factory-floor/src/assets/logos/`

The runtime resolver is:

`packages/factory-floor/src/assets/sprite-theme.ts`

Update the resolver only when filenames, asset categories, or renderer-built
fallbacks change.

## Tile-Grid Style Reference

Before production asset generation, create one non-shipped style reference that
establishes the visual language.

Recommended location:

`packages/factory-floor/src/assets/sprites/_style-reference.png`

This file is a documented production reference, not a runtime import. If it
becomes undesirable to keep a non-shipped image under the package, store the
reference outside the package and keep the prompt below in this document.

Style reference prompt:

```text
Use case: stylized-concept
Asset type: non-shipped style board for a tiny factory-floor game UI sprite set
Primary request: Create one cohesive brighter style reference board showing the material treatment for factory stations, compact output piles, a watchdog factory robot, and small drone parts. Each object should be composed against a faint tile grid scaffold sized to its runtime footprint, but the objects themselves must be clean standalone sprites.
Scene/backdrop: transparent background or a plain neutral canvas, no UI frame.
Style/medium: top-down orthographic game-object sprites, clean vector-like outlines, vibrant readable industrial palette, compact soft shadows, cheerful factory-game item language, polished 2D game art.
Composition/framing: arrange a few isolated example objects on one board: one long 7x3-cell workbench station, one compact 3x3-cell intake hopper, one 3x3-cell tidy merged pile, one 3x3-cell rejected scrap pile, one 3x3-cell watchdog tread robot, and one small 3x3-planned drone chassis. Keep each object separated and centered in its grid footprint.
Lighting/mood: bright soft directional shading, subtle ambient occlusion, compact shadows directly under each object.
Color palette: light warm grey metal, vivid rust orange, clear sky/slate blue, fresh green, clean safety yellow, dark accents used sparingly only for outlines and depth.
Materials/textures: painted metal, rubber tread, clean safety trim, readable bright industrial surfaces.
Constraints: top-down orthographic camera only; no perspective view; no text; no letters; no numerals; no labels; no UI chrome; no watermarks; no random extra objects; keep shadows compact; do not use a dark or photographic background.
Avoid: isometric view, front view, character portrait, labels, signage, oversized effects, decorative clutter, dark gritty Factorio-like rendering.
```

Do not import the style reference from TypeScript. Production sprites should
match it, but it is not part of the runtime asset set.

## Generation Order

Work in this order:

1. Generate and review the style reference.
2. Regenerate world sprites:
   - `station-intake.png`
   - `station-triage.png`
   - `station-execution.png`
   - `pile-merged.png`
   - `pile-rejected.png`
   - `watchdog-idle.png`
   - `watchdog-spraying.png`, only if needed
3. Build and inspect the live renderer.
4. Regenerate drone system sprites only after world sprites are coherent:
   - `drone-base-neutral.png`
   - `drone-rotor-left.png`
   - `drone-rotor-right.png`
   - `overlay-role-general.png`
   - `overlay-role-planner.png`
   - `overlay-role-triage.png`
   - `overlay-role-ui.png`
5. Build and inspect the live renderer again.
6. Evaluate tiny badge assets skeptically only if a future need appears:
   - `badge-ci-failure.png`
   - `badge-merge-conflict.png`
   - `badge-stalled.png`
   - `badge-maintainer.png`
   - `badge-rate-limit.png`

The current accepted implementation keeps these as renderer-built symbols, not
generated PNGs.

Do not batch blindly. Generate, inspect, integrate, build, review in context,
then continue.

## Prompting Rules

Every production prompt must include:

- top-down orthographic camera language
- the asset's tile-grid scaffold: 3x3 for sources, sinks, piles, watchdog, and
  drone parts; 7x3 for processor stations
- a clear instruction that the final PNG must not include visible grid lines
- transparent background request
- no text, letters, numerals, labels, UI chrome, watermarks, or random extra
  objects
- compact soft shadow
- the same bright industrial palette and vector-like line treatment
- the intended runtime footprint and package target size

Station prompts must ask for game-object sprites with clear footprint edges,
not floating sticker art. The visible bench or machine edge should meet
conveyors cleanly.

Pile prompts must ask for compact piles that read at 75px runtime.

Drone part prompts must ask for isolated components only. Rotor assets must not
include full drone body geometry. Role overlays must not include provider marks
or drone chassis geometry.

If a generation drifts away from the style reference, stop and tighten the next
prompt before generating additional assets.

Non-overlay assets should be prompted as tile-aware sprites. Good phrasing:

```text
Use an invisible tile-grid scaffold for composition: <N>x<M> cells matching the
runtime footprint. Align major edges, exits, and visual mass to that grid. Do
not draw grid lines in the final sprite.
```

Overlay assets do not need the tile-grid scaffold because they are composited as
small symbols over another sprite.

## Export And Post-Processing

- Remove plain backgrounds and preserve transparency.
- Trim transparent outer padding on station sprites so conveyors meet the
  visible station edge.
- Do not crop functional art or compact shadows.
- Do not let station art bleed outside its assigned tile footprint.
- Keep sprites visually centered according to their runtime anchor.
- Downscale final project assets to package-ready sizes before importing them.
- Optimize or resize assets after choosing a final generation; do not upscale
  tiny assets after export.

Target package sizes:

- 3x3 node sprites: 192x192 or 256x256 maximum
- 7x3 station sprites: about 448x192, preserving a 7:3 visual footprint
- watchdog sprites: about 192x192
- drone base, rotors, and role overlays: 128x128, or 192x192 if detail requires
  it
- badges: 32x32, or 64x64 only if needed

## Live Review Loop

Before accepting each meaningful batch:

```bash
cd /Users/ray/Projects/openreactor/packages/factory-floor
bun run build
```

Then run the demo in the background and inspect:

```bash
cd /Users/ray/Projects/openreactor/packages/factory-floor
bun run dev --host 127.0.0.1 > /tmp/openreactor-factory-floor.log 2>&1 &
```

Open the demo at:

`http://127.0.0.1:5180`

Capture at least one desktop screenshot and one narrow/mobile screenshot for
each meaningful batch. Review whether:

- stations line up with belts
- the waiting zone still sits correctly in the execution loop
- merged and rejected sinks read as distinct outputs
- drones are not oversized, blurry, or visually incoherent
- provider logos sit on the drone's dedicated logo plate and are not obscured
  by role overlays or text labels
- sink piles show at most the latest three tokens in the scene, with older pile
  contents available through the sink tooltip
- badges do not obscure issue or pull-request tokens
- bundle JavaScript remains reasonable and image assets are emitted separately

Every generated asset must be reviewed in the live renderer before moving to
the next category.

## Acceptance Criteria

### Style reference

- Establishes one coherent top-down orthographic language.
- Uses warm industrial colors without becoming a one-note palette.
- Shows station, pile, watchdog, and drone material treatments.
- Contains no text, letters, numerals, labels, UI chrome, or watermarks.
- Reads as game-object art rather than a presentation board or UI mockup.

### Stations

- Fit the exact runtime footprint: intake at 75x75px, processors at 175x75px.
- Have clear object edges that can meet conveyor belts.
- Stay top-down and centered in their footprint.
- Do not keep visible plain backgrounds or excessive transparent padding.
- Use consistent line weight, palette, shadows, and material treatment.
- Remain readable at runtime size without labels.

### Piles

- Fit a 75x75px sink footprint.
- `pile-merged.png` reads as orderly completed pull-request output.
- `pile-rejected.png` reads as rejected or scrap output.
- No text, numerals, or document labels.
- Compact shadow stays inside the asset bounds.

### Watchdog

- Reads as a top-down industrial watchdog/service robot, not a front-view
  character portrait.
- Fits visually near the factory without dominating stations.
- `watchdog-idle.png` works with the renderer's procedural spray.
- `watchdog-spraying.png` is only kept if it improves the live response state.
- Status materials and shadows match the world sprites.

### Drone base and rotors

- Base reads clearly at about 32x32px runtime.
- Rotors align to the existing CSS mount points and include no full-body
  geometry.
- Base has no role tool or provider identity baked in.
- Rotor parts remain useful when code-rotated.
- Chassis, rotor, and shadow treatments match the world sprite palette.

### Role overlays

- Read as small role symbols at about 5-9px runtime.
- Include no provider marks and no drone chassis geometry.
- Do not dominate the base drone silhouette.
- Can be layered without per-asset manual nudging.
- If generation cannot produce crisp overlays quickly, replace them with
  controlled SVG, renderer-built symbols, or deterministic PNG symbols.

Current production role overlays are controlled simple PNG symbols, not
freeform generated art, because generated tiny overlays drifted into
number-badge shapes.

### Badges

- Current production badges are renderer-built symbols, not generated PNGs.
- They must read at about 12x12px runtime.
- They must not obscure issue or pull-request token glyphs.
- If generated badge exploration is attempted later, keep it only if it beats
  the code-built symbol in live renderer review.

## Production Prompts

Use the tile-grid style reference as the visual anchor for all production
prompts. For non-overlay sprites, include the invisible grid-scaffold line.

### `station-intake.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite for @openreactor/factory-floor
Primary request: Generate a compact factory intake pipe or pneumatic task tube where new work items emerge into the factory.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, bright vibrant industrial palette, cheerful factory-game machinery, compact soft shadow.
Composition/framing: centered 1:1 object with clear footprint edges, designed for a 75x75px runtime footprint and a 192x192 or 256x256 package asset. Use an invisible 3x3 tile-grid scaffold for composition; align the central pipe opening and right-side transfer lip to the grid; do not draw grid lines in the final sprite.
Materials/textures: teal-blue painted metal pipe, light warm grey bolted base, vivid safety-orange clamps, yellow hazard trim, dark inner tube, blank task cards/items emerging from the opening.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no logos; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera; keep shadow compact; visible output lip should reach the right-side footprint edge for conveyor connection; no character or face.
Avoid: Mario-like green pipe, recognizable game-IP styling, floating sticker art, white background, oversized empty padding, front-view pipe, dark gritty rendering.
```

### `station-triage.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite for @openreactor/factory-floor
Primary request: Generate a long horizontal triage and planning workbench station.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, bright vibrant industrial palette, cheerful factory-game machinery, compact soft shadow.
Composition/framing: centered wide object with clear footprint edges, designed for a 175x75px runtime footprint and about a 448x192 package asset. Use an invisible 7x3 tile-grid scaffold for composition; align the bench perimeter, side belt contact points, and work bays to the grid; do not draw grid lines in the final sprite.
Materials/textures: light composite tabletop, bright brushed metal trim, clear blue recessed work pads, fresh green approval accents, vivid rust-orange small controls.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera; station edges should meet belts cleanly; do not bleed outside the long 7x3-cell footprint.
Avoid: poster-like layout, floating sticker art, large screens with text, excessive transparent padding, dark gritty rendering.
```

### `station-execution.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite for @openreactor/factory-floor
Primary request: Generate a long horizontal execution/build workbench station.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, bright vibrant industrial palette, cheerful factory-game machinery, compact soft shadow.
Composition/framing: centered wide object with clear footprint edges, designed for a 175x75px runtime footprint and about a 448x192 package asset. Use an invisible 7x3 tile-grid scaffold for composition; align the bench perimeter, side belt contact points, and three work bays to the grid; do not draw grid lines in the final sprite.
Materials/textures: light brushed steel tabletop, vivid rust-orange trim, clean cable channels, compact tools, clear blue work pads, small fresh green status accents.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera; station edges should meet belts cleanly; do not bleed outside the long 7x3-cell footprint.
Avoid: front-view console, oversized monitors, UI screenshots, floating sticker art, excessive transparent padding, dark gritty rendering.
```

### `pile-merged.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite for @openreactor/factory-floor
Primary request: Generate a compact pile of orderly completed pull-request output.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, bright readable industrial palette, compact soft shadow.
Composition/framing: centered 1:1 compact pile, designed for a 75x75px runtime footprint and a 192x192 or 256x256 package asset. Use an invisible 3x3 tile-grid scaffold for composition; keep the pile centered inside the middle cells and readable at runtime size; do not draw grid lines in the final sprite.
Materials/textures: stacked paper-white and light warm-grey sheets, fresh green abstract approval stamp shapes, small green ribbon accent.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera; keep silhouette tidy and readable at 75px.
Avoid: readable document text, huge paperwork spread, loose scene props, white matte, dark gritty rendering.
```

### `pile-rejected.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite for @openreactor/factory-floor
Primary request: Generate a compact rejected-output scrap pile.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, bright readable industrial palette, compact soft shadow.
Composition/framing: centered 1:1 compact pile, designed for a 75x75px runtime footprint and a 192x192 or 256x256 package asset. Use an invisible 3x3 tile-grid scaffold for composition; keep the pile centered and compact; do not draw grid lines in the final sprite.
Materials/textures: crumpled light warm-grey papers, vivid red-orange abstract rejection marks, a few slate-blue and yellow scrap accents, clear readable scrap-bin energy without gore or mess.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera; keep silhouette compact and readable at 75px.
Avoid: readable document text, oversized trash heap, white matte, scene background, dark gritty rendering.
```

### `watchdog-idle.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite for @openreactor/factory-floor
Primary request: Generate an idle industrial watchdog/service robot.
Style/medium: strict top-down orthographic 2D game-object sprite, clean vector-like outlines, bright vibrant industrial palette, readable service robot, compact soft shadow.
Composition/framing: centered 1:1 robot, designed for about a 75-96px runtime visual envelope and about a 192x192 package asset. Use an invisible 3x3 tile-grid scaffold for composition; align treads and body to the grid so the robot reads instantly; do not draw grid lines in the final sprite.
Materials/textures: charcoal rubber parallel treads, light warm grey metal body, clean safety yellow panels, vivid rust-orange emergency details, small fresh green healthy light.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; no perspective; no isometric camera; robot must read from directly above; keep shadow compact.
Avoid: character portrait, front-facing robot, mascot proportions, oversized spray effects in idle state, dark gritty rendering.
```

### `watchdog-spraying.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite for @openreactor/factory-floor
Primary request: Generate the same industrial watchdog/service robot in an active response pose with compact foam spray.
Style/medium: strict top-down orthographic 2D game-object sprite, clean vector-like outlines, bright vibrant industrial palette, compact soft shadow.
Composition/framing: centered 1:1 robot, designed for about a 75-96px runtime visual envelope and about a 192x192 package asset. Use an invisible 3x3 tile-grid scaffold for composition; align treads and body to the grid and keep spray inside bounds; do not draw grid lines in the final sprite.
Materials/textures: same charcoal rubber treads, light warm grey metal, clean safety yellow panels, vivid rust-orange emergency details, small amber response light, compact pale foam cone.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; no perspective; no isometric camera; keep spray compact and inside bounds.
Avoid: huge particle cloud, front-facing character, scene background, dark gritty rendering.
```

### `drone-base-neutral.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite component for @openreactor/factory-floor
Primary request: Generate a neutral autonomous worker drone base without rotor blades.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, bright vibrant industrial palette matching the factory stations, compact soft shadow.
Composition/framing: centered 1:1 isolated component, designed for about 32x32px runtime and a 128x128 or 192x192 package asset. Use an invisible 3x3 tile-grid scaffold for composition; align the chassis center and rotor mounts to the grid; do not draw grid lines in the final sprite.
Materials/textures: light warm grey metal chassis, clear slate-blue top plate, vivid rust-orange front indicator, fresh green status light.
Constraints: transparent background; no visible grid; no text; no letters; no numerals; no provider logo; no role icon; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera; include fixed left and right rotor mount points but no rotor blades.
Avoid: full aircraft silhouette, baked role tools, baked provider marks, oversized shadow, dark gritty rendering.
```

### `drone-rotor-left.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite component for @openreactor/factory-floor
Primary request: Generate only the left rotor component for the neutral drone.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, same bright palette and line treatment as the drone base, no motion blur.
Composition/framing: centered 1:1 isolated component, designed for code rotation at about 17x17px runtime and a 128x128 package asset. Use an invisible 3x3 tile-grid scaffold for composition; center the rotor hub on the middle cell; do not draw grid lines in the final sprite.
Materials/textures: compact light metal hub, short charcoal rotor blades, vivid rust-orange center accent.
Constraints: transparent background; no visible grid; no drone body; no text; no letters; no numerals; no provider logo; no role icon; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera.
Avoid: full drone geometry, motion blur, propeller spanning the entire canvas, dark gritty rendering.
```

### `drone-rotor-right.png`

```text
Use case: stylized-concept
Asset type: transparent PNG game sprite component for @openreactor/factory-floor
Primary request: Generate only the right rotor component for the neutral drone.
Style/medium: top-down orthographic 2D game-object sprite, clean vector-like outlines, same bright palette and line treatment as the drone base, no motion blur.
Composition/framing: centered 1:1 isolated component, designed for code rotation at about 14x14px runtime and a 128x128 package asset. Use an invisible 3x3 tile-grid scaffold for composition; center the rotor hub on the middle cell; do not draw grid lines in the final sprite.
Materials/textures: compact light metal hub, short charcoal rotor blades, vivid rust-orange center accent.
Constraints: transparent background; no visible grid; no drone body; no text; no letters; no numerals; no provider logo; no role icon; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera.
Avoid: full drone geometry, motion blur, propeller spanning the entire canvas, dark gritty rendering.
```

### Role overlays

Use this shared structure and change only the role subject:

```text
Use case: stylized-concept
Asset type: transparent PNG drone role overlay for @openreactor/factory-floor
Primary request: Generate a tiny isolated role symbol: <role subject>.
Style/medium: top-down orthographic 2D game overlay symbol, clean vector-like outlines, same warm industrial palette as the drone base.
Composition/framing: centered 1:1 isolated overlay, designed for about 9x9px runtime and a 128x128 package asset.
Constraints: transparent background; no drone body; no provider logo; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; no perspective or isometric camera; keep the symbol bold and readable when scaled very small.
Avoid: full drone geometry, detailed illustration, thin lines, oversized background shape.
```

Role subjects:

- `overlay-role-general.png`: compact wrench-and-gear service emblem.
- `overlay-role-planner.png`: compact blueprint or route-plan tile with simple
  abstract circuit lines.
- `overlay-role-triage.png`: compact inspection lens or magnifying-glass
  emblem.
- `overlay-role-ui.png`: compact display panel with abstract rectangles only.

### Optional badge prompts

Only attempt generated badges after the world and drone sprites work in the live
renderer. Use this shared structure:

```text
Use case: stylized-concept
Asset type: transparent PNG token status badge for @openreactor/factory-floor
Primary request: Generate a tiny badge symbol for <status>.
Style/medium: top-down orthographic flat game badge, clean vector-like outline, warm industrial palette, high contrast at tiny size.
Composition/framing: centered 1:1 compact symbol, designed for about 12x12px runtime and a 32x32 package asset.
Constraints: transparent background; no text; no letters; no numerals; no labels; no UI chrome; no watermark; no random extra objects; keep it readable at 12px.
Avoid: complex detail, thin strokes, full document icons, white matte.
```

Statuses:

- `badge-ci-failure.png`: compact broken build or red failure mark.
- `badge-merge-conflict.png`: compact diverging branch conflict symbol.
- `badge-stalled.png`: compact warning/clock symbol.
- `badge-maintainer.png`: compact handoff/person-required symbol.
- `badge-rate-limit.png`: compact throttled/fallback signal symbol.
