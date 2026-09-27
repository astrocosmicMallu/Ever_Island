# EverWood — Crash Diagnosis & Fix Log (2026-09-27)

## Symptom
Opening the app in Chrome showed a plain white screen with vertical, unstyled
text instead of the WebGL forest.

## Root causes found
1. **Missing entry script (fatal).** `index.html` referenced
   `<script type="module" src="/app.js">`, but no `app.js` existed at the repo
   root → 404 → no renderer, no scene, nothing executed.
2. **Missing styles (the "vertical unstyled text").** There was no
   `<link rel="stylesheet">` and no `styles.css` at root. Styling only existed
   as `import './styles.css'` inside JS (a Vite-only construct), so with JS
   dead there was zero CSS and every stacked `<div>` rendered as a vertical
   strip of plain text.
3. **No module resolution for Three.js.** The `previous-*` sources use bare
   imports (`from 'three'`, `from 'three/addons/...'`) which only resolve
   under a bundler, but the repo has no `package.json`, no `vite.config.js`,
   no `node_modules`, and no `<script type="importmap">` — so even a copied
   `app.js` would still crash in a plain browser.
4. **Absolute asset paths.** `/app.js` and `/textures/*.jpg` break on any
   sub-path hosting (GitHub Pages project site, preview proxies) and there is
   no `textures/` dir at root (assets live under `public/`).
5. **`previous-living/` and `previous-four-seasons/` are unrunnable archives.**
   They import modules that were never committed (`navigation.js`,
   `botanical.js`, `forest.js`, `ecology.js`) → instant import-time crash.
   Left untouched; see note below.
6. **Tailwind build step with no builder.** `styles.css` started with
   `@import "tailwindcss"`, which browsers cannot resolve.

Note: the entry file is at the repo **root** (`./index.html`), not inside
`public/` — `public/` only holds audio/models/textures.

## Fixes applied (repo root)
| File | Change |
|---|---|
| `index.html` | Added `<link rel="stylesheet" href="./styles.css">`, added an import map (`three` → `./vendor/...`), changed `/app.js` → `./app.js`, added a boot-error overlay so future failures show a message instead of a white screen. |
| `app.js` | Restored from last-known-good `previous-woodland/app.js`: removed the Vite-only CSS import, wired the asset engine, added `G` grid toggle, extended `window.forestDiagnostics()` with `mode`/`grid`/`model`. |
| `forest.js` | Restored from `previous-woodland/forest.js`: texture base `/textures/` → `./public/textures/` + procedural fallback pixel if any texture 404s (materials can never render black). |
| `styles.css` | Woodland CSS minus Tailwind directives, plus a hand-written subset of the utilities the markup uses (`flex`, `gap-*`, `hidden`, `sm:*`, `md:*`, …). Fully self-contained, no CDN needed. |
| `assets.js` | **New.** Hero-model loader with automatic placeholder fallback (see below). |
| `vendor/` | **New.** Pinned local copy of Three.js r160 (`three.module.js` + `PointerLockControls`, `GLTFLoader`, `BufferGeometryUtils`). The app now runs fully offline. |

## Placeholder-asset engine (`assets.js`)
Because the 36 MB hero model can't live on GitHub:
- On boot it tries `./public/models/main-world.glb` (override: `?model=<url>`).
- **On success:** the model is placed in-world with shadows; grid hides (press `G` to show).
- **On failure:** it builds a stylized proving ground automatically —
  survey-grid floor on its own pad (immune to uneven terrain), equipment
  crates, barrels, workbench, signpost, lantern poles, a watchtower, a shelter
  frame (all boxes/cylinders), plus a wireframe "MAIN MODEL PENDING" ghost
  marker. Every solid piece registers a collider, so walking/collision
  mechanics are fully testable.
- `?placeholder=1` skips the download and goes straight to placeholders.
- `window.everwood` exposes `{ state, toggleGrid }` for testing.

## How to run
Any static server from the repo root, e.g.:
`python3 -m http.server 8000` → open `http://localhost:8000/`
Controls: click **Leave the campsite**, `WASD` + mouse, `Shift` run, `G` grid,
`H` quiet view, `M` map, `Esc` pause.

## Verification (headless Chromium + software WebGL, 2026-09-27)
`SMOKE_RESULT: PASS` — page loads with **zero JS errors** and **zero failed
requests** (except the designed hero-model 404 that triggers fallback mode):
- `mode: "placeholder"`, survey grids: 2, placeholder meshes: 924 total,
  ghost marker: 1, lamp lights: 4, placeholder colliders: 14
- Forest: 1900 trees, 210 draw calls, ~255K triangles
- Walk test: `playing: true`, camera moved 0.42 m on `W` (software GL runs
  ~1 fps so movement is slow there; real GPUs run full speed)
- `G` grid toggle: off → on confirmed
- Screenshot: `smoke-preview.png` (world + UI rendering correctly)

## Restoration 2 — full EverWood at root (2026-09-27)

The rainy-woodland build above was only a subset. The repo root now runs the
**complete four-seasons world**: 2 furnished cabins with stairs + upper floors,
2 scanned-head NPCs with day/night routines, 6 monkeys, spring/summer/autumn/
winter + snow/leaves/blossoms, dynamic weather (clear/overcast/mist/showers/
storm), day/night sun + moon/stars, fishing, grilling, garden watering, torch,
campfire gatherings, pond reflection, river, minimap + compass + POIs, field
guide, settings (day length, season, weather, mist, volume, quality, travel).

### Grid-line complaint — solved
The visible grid was the woodland placeholder survey pad (bright mint lines,
on by default). The full build has **no grid visible by default**. The app's
own subtle terrain grid exists only as an opt-in: the **Grid** button (#tg)
or `window.forestDiagnostics().grid` confirms `false` on boot.

### Four missing modules reconstructed
`previous-four-seasons/` imported 4 files that were never committed; they were
rebuilt from call-site analysis (every signature verified against usage,
collider math, the cabin builder, and the Playwright specs):
- `navigation.js` — cabin local/world transforms (rotation convention matches
  the builder's chair math AND the wall-collider math exactly), walkable
  surfaces (ground floor, 20-tread stair run, upper slab with stairwell hole,
  porch ramp), plus NPC routes: `workerInteriorRoute` (2nd-floor desk → stairs
  → doorway → porch, true floor heights) and collision/water-aware
  `outdoorPath` steering around trunks, rocks and furniture.
- `botanical.js` — procedural leaf/fern atlas painter (`createBotanical`).
- `forest.js` — trailhead campsite (`makeCamp`, position/rotation parameterized).
- `ecology.js` — birch bark, spring blossom canopy, instanced toadstools
  (`birchBark`, `blossoms`, `createFungi`; hidden under winter snow).
- `styles.css` — the living stylesheet (four-seasons shipped none) minus the
  Tailwind build directives, plus the `flex/gap` utilities and `season-switch`
  rules the markup needs. No CDN, fully offline.

### Portability fixes (same no-build recipe)
Relative paths everywhere (`./app.js`, import map → `./vendor/…`,
`./public/textures|models|audio/…`); 3 missing sounds remapped to the real
field recordings (`fire/rain/river.wav` → `fire-real/rain-real/river-real.mp3`,
all 19 recordings now load with zero failures); 3 more Three.js r160 addons
vendored (`Sky`, `Water`, `RoundedBoxGeometry`); boot-error overlay kept.

### Verification (headless Chromium + software WebGL)
`SMOKE_RESULT: PASS` — **18/18 checks, 0 JS errors, 0 failed requests**:
boot (1381 trees, 2 cabins, 6 monkeys), grid off, scanned heads, 19/19 audio,
WASD walk 5 m, **stair climb +3.3 m**, winter snow / autumn leaves / spring
flowers (72), full fishing catch cycle, night grilling, NPC fire seating,
**worker route with 0 wall clips**, worker back at 2nd-floor desk, solid
mountains, torch + viewmodel layer. Screenshots: `tests/shot-day.png`,
`tests/shot-cabin.png`, `tests/shot-night.png`, `tests/shot-landing.png`.

### Performance & workspace budget ("no lag", 128 MB / 10k files)
Kept every original optimization: GPU instancing + 45 m spatial batches with
distance culling (190 m visible / 85 m shadows), pond-reflection throttling,
quality selector (Balanced default, pixel ratio ≤ 1.25), zero per-frame
allocations in the new code (route planning runs once per NPC trip only).
Footprint: **~75 MB of 128 MB** (41 MB files + 34 MB git), **~115 of 10,000
files**. No `node_modules`, no build step, no new large assets.

### Honest scope note
`tests/living.spec.js` describes systems that exist in **no** committed file
(deer herd, songbirds, forage/basket, NPC "minds" AI, footprints, pond ice,
fire relight). They were part of the author's uncommitted local version and
cannot be restored from this repo — everything above covers all features
actually present in the committed code. Those extra systems can be built fresh
as a follow-up if wanted.

## Still open (optional follow-ups)
- `previous-living/` remains an unrunnable archive (same 2 missing modules it
  always lacked; four-seasons at root supersedes it).
- The extra living-spec-only systems (deer/birds/forage/minds) could be
  authored from scratch on request.

## 2026-09-27 — Wildlife systems built fresh (deer + birds + foraging)
- New `wildlife.js`: 5-deer herd (doe.glb, SkeletonUtils clones, Idle/Graze/Alert/Run,
  walk=Run@0.42, wary<6.5m or <14m if player>4.5m/s, flee 6.2m/s, drink near pond),
  12-bird flock (3 species, instanced, flap-glide + banking, positional calls),
  46 forageables (chanterelle/bolete/berries, E to pick, basket HUD, 150s regrow).
- Vendored `vendor/addons/utils/SkeletonUtils.js` (r160).
- `soundscape.js`: +`call(pos)` (positional birds.mp3), +`rustle()` (grass.mp3).
- `app.js`: wildlife import/init (after sounds — TDZ fix)/update/E-key/diagnostics/simTest.
- Fixes found by smoke: missing `herd.update` export, `forage()` rich result for HUD toast,
  berry bush/dots placement (dots were buried inside bush mesh).
- Verified: `smoke/wild.mjs` 5/5 PASS (flee 24.4m, basket 1, 0 errors), shots
  `tests/shot-deer.png` + `tests/shot-forage.png`. Base intact (cabins/monkeys/trees).

## 2026-09-27 — Living Realism batch (water, grass, NPCs, fish, fire, snow)
- Water: pond+river freeze in winter (ice sheet, still normals, hidden reflector);
  pond dressed (mud bank, 14 lily pads, blooms, 18 instanced reed/cattail pairs).
- Grassland: crossed-plane painted tufts (~100k instanced, wind sway shader, meadow
  clustering, riverbank growth); replaces invisible micro-blades.
- Leaves/petals: autumn leaves + spring sakura petals fall from canopy height with
  flutter/sway/tumble (were: camera-box sky fall); per-instance autumn tints.
- Mountains: terrain-shader snowpack above treeline in winter; far silhouette ring
  (12 merged peaks + snow caps) for a vaster horizon.
- Fire: campfire embers + rising smoke + night fireflies (spring/summer).
- Fish: 9 pond+river fish (dart, wiggle, bed-aware depth, hidden under ice); curious
  fish swims to bobber, bite ripple ring, scatter on catch/miss; bite alert moved to
  minimalist side card with slide transition.
- Swim/dive: buoyancy float, wade-to-swim depth logic, splash, underwater tint overlay.
- NPCs: hair (gardener bun, worker crop), brows, collar + trapezius neck blend,
  calmer skin shading; behavior minds (tend/stretch/look/hum/type), greetings and
  farewells using recorded voice barks, breathing.
- Monkeys: grooming, leap/land rustle + thud sounds, one clinging baby.
- UI: minimalist side bite card, smaller softer minimap, dive tint overlay.
- Verified: quick PASS, wild 5/5 PASS, real 8/8 PASS (ice/petals/leaves/fish/
  fireflies/NPC/swim/dive), shots pond+npc+ice+grass. Zero errors. Perf: no
  regression (SwiftShader 0.2fps before and after; real GPUs unaffected).

## 2026-09-27 — Water/leaf corrections (freeze look, touch waves, leaf direction)
- Fixed inverted canopy cycle: leaves + sakura petals now FALL (hgt follows cyc
  downward); were rising due to flipped mapping.
- Ice v2: canvas texture (cracks, air bubbles, snow-dust patches, depth blotches),
  pale blue tint; reflector lowered to +.008 (less hover-layer look); river map
  scroll now halts when frozen (was visibly flowing under the ice tint).
- Touch waves: pooled ripple rings spawn where the player enters/moves/swims.
- Fish: 40% bigger, koi-orange + silver-blue variants, swim just under the surface
  (were hidden deep under the reflector), livelier wiggle and bob.
- Verified: quick PASS, fresh shot-ice.png. Zero errors.

## 2026-09-27 — More animals: fox + rabbit + squirrel + frog (+163KB only)
- Fox (2): real rigged Khronos Fox.glb (163KB, Survey/Walk/Run), auto-scaled,
  stalk/trot/flee/sit behaviors, warier than deer. Same clone pipeline as deer.
- Rabbit (4): procedural hop physics (arcs, squash, ear flop), freeze-flat when
  watched, zigzag bolt when rushed, nibbling idle. Meadow anchors.
- Squirrel (3): ground scamper, spiral trunk climbs, branch sits with tail flicks.
- Frog (3): pond-edge sits with throat-bob, hop arcs, plop-escape into water with
  real splash sound, pond drift + hop-out.
- simTest.rabbitSpot() for camera tests; wild.mjs now 6 checks incl. new animals.
- Verified: wild 6/6 PASS, shot-rabbit.png, zero errors. +163KB, ~84 draws.

## Survival overhaul (2026-09-27)
- Fox resized to life-size: scale 0.55→0.65 (body ~1.27m long, ~0.65m at ear).
- New `survival.js`: vitals HUD (health/hunger/thirst/temp + decay/starvation/
  poison/cold), backpack (11 items, click-to-eat), 82 harvest nodes (sharp
  stone/stone/vine/mushroom/branch, 150s respawn), workshop (spear + axe),
  campfire cooking (E, 5s), shovel tilling + berry seeds (30% drop) + 30s
  bushes, horse mount (F, 2x), spear (Key5 + right-click throw, recoverable),
  crossbow turrets (Key6, auto-fire wolves), wood walls (Key4 + ghost, 3+
  nearby = shelter), 3-challenge quest log, 4 job NPCs (Eldrin/Brakka/Maris/
  Serath, IDLE/WORKING/RETURNING/RESTING + labels + stockpile), red wolves
  (chase <15m, 10dps, guard/turrets fight back, +2 raw meat), hit particles,
  WebAudio synth sfx (blip/thud/splash/click, M-muted), localStorage autosave
  30s + Load Game (?load=1). No merchant/currency by design.
- `app.js`: E-chain (survival.use → forage + seed hook), F-chain (survival.chop
  → teleport fallback), KeyI catch → backpack raw_fish, ride 2x boost,
  survival.update in loop, forestDiagnostics.surv, simTest
  surv/svgive/svpos/svcraft/svchop/svuse.
- `wildlife.js`: added killDeer(maxDist) hunt API (spear F within 12m).
- `index.html`/`styles.css`: vitals bars, backpack sidebar (B), challenges,
  workshop dialog, damage vignette, Load button.
- Keys verified free: B/4/5/6/7 (only KeyM taken).
- Tests: `smoke/surv.mjs` 7/7 PASS (boot/craft/decay/night/turret/wall/
  F-chain), `quick.mjs` PASS, zero pageerrors. Note: synthetic key events in
  tests must use bubbles:true + body target (app movement handler reads
  e.target.matches).
- Screenshot: `tests/shot-surv.png` (vitals + backpack + challenges + NPC labels).
