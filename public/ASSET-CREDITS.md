# Everwild asset credits

All runtime assets are bundled locally. No premium asset services or paid APIs are used. The licenses below apply to the respective third-party assets, not automatically to the entire project. No creator endorsement is implied.

## Textured animated deer

**Deer Female**, by **CDmir**, with **TinyWorlds**, created for Kelgar. **CC0 1.0**.

- Source: https://opengameart.org/content/deer-female
- Original: https://opengameart.org/sites/default/files/doe.blend
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Bundled file: `public/models/doe.glb`
- Changes: converted the legacy Blender materials to PBR materials using the packed body/head textures; removed scene lights/camera/plane; selected grazing, idle, alert and running animation clips; smoothed shading; exported glTF/GLB. Runtime scaling, placement and behavioral control added. Conversion recipe: `tools/export-deer.py` (requires Blender and the original downloaded into `.cache/assets/doe.blend`).

## Human head scan

**LPS Head / Lee Perry-Smith head scan — © I-R Entertainment Ltd.** Scan created by Infinite-Realities director **Lee Perry-Smith**. **CC BY 3.0**.

- License: https://creativecommons.org/licenses/by/3.0/
- Distribution source: https://threejs.org/examples/models/gltf/LeePerrySmith/
- License/attribution reference: Morgan McGuire, *Computer Graphics Archive*, July 2017, https://casual-effects.com/data/ (LPS Head entry). The archive credits Morgan McGuire and Guedis Cardenas at Williams College for conversion/map refinements.
- Files: `public/models/LeePerrySmith.glb`, `head-color.jpg`, `head-normal.jpg`.
- Changes: cropped lower bust; normalized scale and position; adjusted PBR materials; opened the original closed-eye geometry and added separately modeled eyes/lid rims with blink animation; attached to procedural dressed bodies, hat and glasses. These are not full facial-performance rigs or phoneme-synchronized characters.

## Recorded NPC dialogue

**Voice Pack | Casual Voice lines**, performed by **Alba MacKenna** (Alba_Mac). **CC BY 4.0**.

- Source: https://opengameart.org/content/voice-pack%E2%94%82casual-voice-lines
- License: https://creativecommons.org/licenses/by/4.0/
- Files: `public/audio/voices/*.mp3` (13 selected lines).
- Changes: selected appropriate friendly lines, transcoded WAV to mono 32 kHz MP3, and added runtime positional playback and captions. Original performance and pitch retained. Both neighbors share the same recorded actor; dialogue is a finite set of authored recordings, not AI-generated conversation.

## Recorded footsteps and nature sounds

| Bundled file | Recording / creator | Source | License |
|---|---|---|---|
| `step-grass.mp3` | Grass_Footsteps.wav — **D001447733** | https://freesound.org/people/D001447733/sounds/464609/ | CC BY 3.0 |
| `step-snow.mp3` | Footsteps, Snow, A.wav — **InspectorJ (Jonathan Shaw, www.jshaw.co.uk)** | https://freesound.org/people/InspectorJ/sounds/397946/ | CC BY 4.0 |
| `birds.mp3` | Bird chirping sounds — **syncopika** | https://opengameart.org/content/bird-chirping-sounds | CC0 1.0 |
| `wind.mp3` | Wind Through Trees — **Yoyodaman234** | https://freesound.org/people/Yoyodaman234/sounds/335889/ | CC0 1.0 |
| `fire-real.mp3` | Fire Crackle and Flames 002 — **TheWoodlandNomad**, formerly FractalStudios | https://freesound.org/people/FractalStudios/sounds/363092/ | CC0 1.0 |
| `river-real.mp3` | Stream, Water, C.wav — **InspectorJ (Jonathan Shaw)** | https://freesound.org/people/InspectorJ/sounds/339324/ | CC BY 4.0 |
| `splash.mp3` | Splash, Jumping, E.wav — **InspectorJ (Jonathan Shaw)** | https://freesound.org/people/InspectorJ/sounds/352105/ | CC BY 4.0 |
| `rain-real.mp3` | Rain, Moderate, A.wav — **InspectorJ (Jonathan Shaw)** | https://freesound.org/people/InspectorJ/sounds/401277/ | CC BY 4.0 |

License texts: https://creativecommons.org/licenses/by/3.0/ · https://creativecommons.org/licenses/by/4.0/ · https://creativecommons.org/publicdomain/zero/1.0/

Freesound recordings were obtained from the public audio previews associated with these licensed pages. Changes: selected excerpts, resampled to mono 32 kHz MP3, trimmed footsteps, added fades, adjusted playback gain and small footstep-rate variations. Bird chirping MP3 is the author's original OpenGameArt download. Ambient excerpts are at most 24 seconds. The original synthesized WAV ambience and oscillator-based footsteps/bird chirps are no longer used.

The bird recording is a mixed backyard recording, not a claim of a distinct authentic call for every modeled species. Deer and monkeys currently have no added vocal recordings. Dry-surface footsteps currently share the recorded grass sample; snow and water use separate recordings. Unsupported action sounds remain silent rather than using artificial substitutes.

## Environmental textures

**Poly Haven**, **CC0**: https://polyhaven.com/license

Locally bundled 1K textures from:
- https://polyhaven.com/a/forest_ground_04
- https://polyhaven.com/a/bark_brown_02
- https://polyhaven.com/a/mossy_rock
- https://polyhaven.com/a/wood_floor_deck
- https://polyhaven.com/a/brown_mud_leaves_01
- https://polyhaven.com/a/snow_02
- https://polyhaven.com/a/rock_boulder_dry

Maps are repeated, tinted and blended by the runtime materials. Other botanical, cloth, fur, fish-scale, ice and footprint textures are procedurally authored for this application.

## Simulation and libraries

The gameplay was adapted from the user's supplied `uploads/sim1.html`, preserved unchanged. Three.js, Vite and Tailwind are local open-source dependencies; their package license files accompany installed packages. Procedural birds, monkeys, fish, clothing, furnishings, vegetation and flame shaders are not photogrammetric assets.
