# Everwild — Living Woodland

**The gameplay of the supplied `sim1.html`, combined with the Rainy Woodland environment.**

The current application runs at port **5173**. Click **Step into the woods**. The original upload remains unchanged in `uploads/sim1.html`; the preceding woodland source is archived under `previous-woodland/`.

## Run / build

```sh
npm ci
npm run dev
npm run build
```

Vite binds to `0.0.0.0` and accepts the sandbox preview host. Deploy the contents of `dist/` to a static host. Three.js, Tailwind, texture maps and sounds are all local; no API keys, paid services, runtime CDNs or external sound requests are required.

## What was retained from sim1.html

All **68 named functions/classes** in the uploaded simulator remain in `app.js`. The original simulation is the gameplay source of truth, rather than a visual mock-up of its features.

| System | Included behavior |
|---|---|
| Movement | First-person mouse look, WASD, sprint, gravity, jumping, terrain height, water slowdown, obstacle collisions and map boundaries |
| Landscape | Blended biome terrain, rivers, stream, pond, mountains, seasonal foliage, winter snow |
| Sky and time | Sun, moon, stars, constellation lines, day/night, adjustable day duration, automatic/manual seasons, time pause |
| Cabins | Two furnished cabins, kitchen, bedroom, desk, sliding doors, interior lighting, upper floors, ramps and floor/wall collisions |
| Fishing | Near-water rod equip, directional casting, visible float, 1–3 second bite wait, 2 second reel window, lost bites, caught-fish display and fish bag |
| Cooking | Nighttime campfire grilling, up to six fish per batch, six-second cooking, cooked-color transition, shared meal and NPC thank-you behavior |
| Gardening | Gardener's pot offer, borrow/return, first-person pot, held-click pouring, ballistic water particles, flower growth on garden hits |
| NPCs | Gardener and desk worker, work animations, player greetings, dusk travel to campfire, chair ownership, sitting, conversation and eating |
| Wildlife | Six animated tree monkeys, perching, swinging and ground visits |
| Fire | Handheld torch, spot/point lighting, flame particles, campfire flicker, grill and chairs |
| Audio | Ambient loop plus positional river and fire loops, gesture activation, master volume and global mute |
| Navigation/UI | Compass POIs, biome label, clock, live map, fish bag, bite/pot/seating prompts, grid, random teleport and settings |

## Rainy Woodland visual layer

- Photographic CC0 albedo, normal and roughness maps for ground, bark, mossy rocks and cabin wood.
- Alpha-tested botanical leaf cards and ferns, fine grass blades, additional instanced trees and rocks.
- Spatial batches, frustum/distance culling, and near-player vegetation shadow culling.
- Overcast lighting, ACES Filmic tone mapping, Linear-sRGB lighting, sRGB output and PCF soft shadows.
- World-space rainfall, winter snow-like precipitation, drifting ground mist, wet water shading and environmental reflections.
- Original canvas tent, sleeping bag, backpack, guy ropes and warm lantern near the starting campsite.
- Cinematic welcome screen, restrained HUD, contextual instructions, quiet view and a detailed field guide.

The uploaded simulator's people, wildlife and cabin structures remain procedural models. The environmental upgrade does not claim scanned-character realism or photographic indistinguishability. Frame rate is hardware-dependent; software WebGL in the sandbox is not a 60 FPS performance benchmark.

## Controls

| Input | Action |
|---|---|
| WASD / mouse | Walk / look |
| Shift / Space | Sprint / jump |
| T | Toggle torch |
| N | Sit in a nearby empty chair, or stand |
| P | Borrow the nearby gardener's pot during daytime, or return it |
| Hold left click with pot | Pour toward the flower bed |
| O | Equip/stow fishing rod near pond or river |
| Left click with rod | Cast toward the water |
| I | Reel during the bite prompt |
| Shift + O | Grill fish within 3 m of the campfire at night |
| Tab | Settings / resume |
| Escape | Release pointer lock / pause at welcome screen |
| F | Random safe teleport |
| M | Mute/unmute all sound |
| G | Open field guide |
| H | Quiet view / restore HUD |

If embedded pointer lock is blocked, drag on the world to look while continuing to use the keyboard. This is a desktop keyboard-and-mouse application; a mobile touch joystick is not included.

**Settings also provide:** time-of-day control, rain/snow amount, fog, sensitivity, render quality, and destination shortcuts to the pond, garden, campfire, cabins and campsite. Click the minimap to enlarge it. Fish-bag progress is saved on this device via localStorage. The time-pause button intentionally pauses the day/season clock, not all movement and interaction.

## Integration fixes

- Replaced the removed Three.js `controls.getObject()` API with the actual camera reference.
- Fixed the source's uppercase/lowercase season-palette lookup.
- Replaced stepped cached ground samples with interpolation matching the terrain triangles.
- Ensured shadow maps are allocated on the first rendered frame; skipping the initial shadow update caused incomplete material rendering on current Three.js.
- Added resize support, keyboard clearing on blur, input focus guards and pointer-lock fallback.
- Random/destination travel checks registered colliders and releases the player's occupied chair.
- Fishing now requires a cast target on actual water instead of allowing a bite on dry land.
- Replaced external sound URLs with locally generated, looping rain, river and fire WAV files. Positional audio behavior remains.
- Global mute now uses the listener master gain so individual source levels are preserved.

## Files

- `index.html` / `styles.css` — Tailwind-assisted interface, settings, field guide and HUD
- `app.js` — adapted original simulator plus integration, controls and persistence
- `realism.js` — PBR materials, added vegetation, culling, weather and campsite placement
- `botanical.js` — shared procedural leaf and fern texture generator
- `forest.js` — Rainy Woodland geometry source; its campsite builder is reused by the combined world
- `public/textures/` — locally bundled CC0 photographic maps
- `public/audio/` — original locally synthesized ambient WAV loops
- `tests/forest.spec.js` — gameplay integration test
- `tests/inspect-sim.cjs` — visual smoke check and screenshot capture

## Validation

```sh
npx playwright install --with-deps chromium
# Keep npm run dev running in another process:
npm test
node --check app.js
node --check realism.js
npm run build
```

The Chromium test first exercises actual WebGL rendering, then suspends GPU rendering for deterministic gameplay checks while keeping the update loop active. The test-only `?test=1` harness can advance the original fishing, grilling and NPC functions without waiting for whole simulated days; it is not exposed in the normal preview.

Verified: startup button and pointer-lock/fallback, walking, jumping, a registered obstacle collision, torch, mute, grid, successful fishing, missed bites, night grilling, shared meals, NPC travel to fire and back to work, seating, pot borrow/return, garden-hit growth callback, manual winter selection, quality control, destination travel, time pause and quiet view. No uncaught JavaScript errors were reported. Visual inspection separately checks the full rendered scene. Cabin interior navigation and every possible NPC/path interaction have not been exhaustively automated.

A non-fatal production chunk-size advisory may appear for the bundled Three.js engine and simulator.

## Texture credits

Poly Haven assets are published under CC0. Bundled maps are 1K color, OpenGL normal and roughness textures:

- https://polyhaven.com/a/forest_ground_04
- https://polyhaven.com/a/bark_brown_02
- https://polyhaven.com/a/mossy_rock
- https://polyhaven.com/a/wood_floor_deck
- License: https://polyhaven.com/license

The simulation was adapted from the user's attached `sim1.html`. The uploaded file is preserved without alteration.
