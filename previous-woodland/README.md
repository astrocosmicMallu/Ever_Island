# Everwild — Rainy Woodland

A complete client-side Three.js + Tailwind CSS first-person forest. No keys, backend, or paid dependencies. Photographic PBR textures are bundled locally; foliage atlases are generated in the browser. The running Vite preview is on port 5173.

## Run

```sh
npm ci
npm run dev        # 0.0.0.0:5173
npm run build      # static production output in dist/
```

Serve the application over HTTP; opening index.html as a file will not resolve its ES modules. Deploy the contents of `dist/` to any static host. Three.js and Tailwind are bundled locally, not loaded from a CDN.

## Controls

Click **Leave the campsite** to start. WASD or arrows walk, mouse looks, Shift runs, Escape pauses, H toggles the interface, M expands the map. If an embedded browser disallows pointer lock, hold and drag on the forest to look; keyboard movement still works. Intended for desktop keyboard and mouse; the interface scales to smaller windows but does not provide a touch joystick.

The gear opens sensitivity, volume, quality, and return-to-trailhead controls. The footer provides sound, quiet view, and fullscreen. Fullscreen depends on embedding permissions. Walk within nine metres of each numbered landmark to save its field note to localStorage.

## Implementation

- Seeded, 620 m terrain mesh with continuous analytic height sampling, photographic forest-floor textures, green-gray exponential fog, ACES filmic tonemapping, Linear-sRGB lighting and sRGB display output.
- Overcast hemisphere lighting, filtered directional shadows and a warm campsite lantern. PBR materials include albedo, tangent-space normal and roughness maps, plus an approximate sky environment for wet-surface reflections.
- 1,900 textured trees (trunks, branching limbs and 28,500 alpha-tested foliage cards), 700 rock instances, crossed fern cards and 22,000 grass tufts. Vegetation is divided into 45 m spatial batches for frustum and distance culling; this intentionally uses more than one draw call to avoid processing the whole forest every frame.
- Canvas tent with open doorway, guy lines, poles, sleeping bag, backpack and lantern; fallen log, irregular wet depressions, moving world-space rain and layered ground mist.
- Spatial-hash circle collisions, independent axis sliding, terrain-following eye height, normalized diagonal movement, bounded frame deltas, and a 590 m walkable region.
- Live compass, canvas map, three landmarks and persistent discoveries.
- Gesture-activated procedural rainfall and Web Audio with a looping HTMLAudioElement stream routed through a master gain. Procedural filtered wind and bird chirps work independently of external availability. Sound starts only on user action; no microphone access.
- Balanced, high and performance resolution settings. Optimized for GPU rendering; 60 FPS is a target, not a guarantee on every browser or device. The sandbox tests use much slower software WebGL and are not a hardware performance benchmark.

## Audio credit

**Morasko nature reserve — autumn in the forest ambience**, by **maciej janasik**, contributed by **radio aporee**. Source metadata identifies it with **Public Domain Mark 1.0**.

- Item: https://archive.org/details/aporee_41252_47068
- Stream: https://archive.org/download/aporee_41252_47068/branchcrush.mp3
- Rights mark: https://creativecommons.org/publicdomain/mark/1.0/

The recording is streamed, not redistributed in the project. The network stream may be unavailable due to connectivity or cross-origin restrictions; the sound button's tooltip reports whether the recording or local fallback is active. Weather and time in the interface describe the designed scene, not live weather data.

## Files

- `index.html` — accessible overlay and dialogs
- `styles.css` — Tailwind import and custom responsive visual styling
- `app.js` — controls, collisions, map, audio, persistence
- `forest.js` — procedural geometry, botanical textures, PBR materials, campsite, rain and spatial batches
- `public/textures/` — locally bundled photographic texture maps
- `vite.config.js` — locally bundled Tailwind and preview-host support
- `tests/forest.spec.js` — Chromium WebGL smoke test
- `playwright.config.js` — software-WebGL browser test configuration

## Validation

```sh
npx playwright install --with-deps chromium
# With the Vite server running:
npm test
node --check app.js
npm run build
```

The browser smoke test checks actual WebGL initialization, tree population, settings, quality selection, map expansion, field notes, keyboard movement, quiet view and uncaught JavaScript errors. The build may report a non-fatal chunk-size advisory for the bundled Three.js library.

## Photographic texture credits

The following **Poly Haven CC0** texture sets are bundled at 1K resolution (color, OpenGL normal and roughness). No texture API is called at runtime.

- Forest Ground 04 — https://polyhaven.com/a/forest_ground_04
- Bark Brown 02 — https://polyhaven.com/a/bark_brown_02
- Mossy Rock — https://polyhaven.com/a/mossy_rock
- License information — https://polyhaven.com/license

Leaves and fern atlases are drawn locally with Canvas 2D. The tent and scenery geometry are original procedural meshes, not scanned models. This revision targets a more naturalistic rainy woodland; it is not a claim of photographic indistinguishability or parity with the reference game's production assets.
