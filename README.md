# sprite-forge

**An AI asset pipeline for 2D/2.5D games**: generation (images, sprite sheets, POV
viewmodels), animation (hero image → video → extracted frames → repaired → game-ready),
and a browsable asset gallery with per-asset feedback.

Everything here shipped in production games first (a raycast FPS and a three.js arena
FPS, July 2026): weapons, enemy rotation sets, animated set pieces, a video-derived
reload animation, and a 30-asset library.

## Layout

- `generators/gen-image.mjs` — gpt-image-2 text→image (`node gen-image.mjs "<prompt>"
  out.png [aspect]`). The obedience workhorse: sheets, grids, POV compositions.
- `generators/scenario-gen.mjs` — Scenario.com flux txt2img (style/LoRA catalog).
- `generators/gen-sfx.mjs` — ElevenLabs text-to-sound-effects (see forge/sound.md). The audio arm.
- `generators/scenario-custom.mjs` — Scenario custom models: **video** (kling, veo3) and
  **3D** (hunyuan) via `/generate/custom/{modelId}`; handles asset upload + polling.
- `forge/animate.md` — the full animation pipeline doc (hero → video → frames → repair
  → key → runtime) with the motion counter-prompt kit and the repair pass recipe.
- `gallery/buildlibrary.mjs` + `gallery/viewer.html` — scan generated assets into a
  manifest; dark-room viewer that chroma-keys sheets onto checkerboard, PLAYS animation
  loops at game fps, labels cell layouts and provenance, and (optionally) offers
  per-asset feedback boxes wired to a relay (see the playtest-link repo).

Keys: `OPENAI_API_KEY`, `SCENARIO_API_KEY`/`SCENARIO_API_SECRET` via env (falls back to
`~/.env`).

## Model routing (measured, not vibes — see LEARNINGS.md)

| task | use | why |
|---|---|---|
| sprite sheets w/ choreography ("cell 5: lunging attack") | **gpt-image-2** | only model that follows per-cell instructions |
| POV weapon viewmodels | **gpt-image-2** | honors foreshortened first-person composition |
| new angles of an EXISTING sprite | **gpt-image-2 images/edits** (img2img) | won 4/4 vs scenario on identity |
| single sprites / style exploration / UI | **scenario flux LoRAs** | style consistency beats gpt-image-2 |
| motion (reloads, cycles) | **kling img2vid** + counter-prompt kit | temporal consistency beats any sheet prompt |
| frame cleanup / drift repair | **gpt-image-2 images/edits** w/ hero reference | fixes drift + fringe + style in one pass |
| ~~anything~~ | ~~Gemini image models~~ | ignores POV composition; writes JPEG data into .png |

## MGS / harness readiness

Usable as-is with two notes:

- The generators are stateless CLIs configured by env — drop into any pipeline. Budget
  guidance: images ~$0.04–0.07/gen, kling ~5s clip per animation, repairs ~$0.04/frame.
- The gallery builder currently carries the source game's manifest entries — for a new
  project, rewrite the `A.push(...)` inventory section (the viewer itself is generic).
- What MGS would add: a manifest-driven generator (declare the asset list, forge fills
  it), retry/validation gates (bbox/cell checks before accepting sheets), and per-project
  budget ledgers. The bones here support all three.
