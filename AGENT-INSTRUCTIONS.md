# Agent instructions — generating game assets with sprite-forge

Hand this to any agent generating art for a game. Outcome bars, not recipes — but the
model routing table is measured fact, follow it.

## Routing (do not improvise here)

- Sheets, grids, POV viewmodels, anything with per-cell instructions → **gpt-image-2**
  (`generators/gen-image.mjs`).
- New angles/variants of an EXISTING asset → **gpt-image-2 `images/edits`** with the
  canonical frame as reference. Never regenerate from scratch what the player has
  already seen — derive from the canon.
- Style-first singles and UI art → **scenario flux** (`generators/scenario-gen.mjs`),
  audition against gpt-image-2 and judge with your own eyes.
- Animation (reload, cycles, set-piece loops) → **kling image-to-video**
  (`generators/scenario-custom.mjs`) from a hero frame, then the extract→repair→key
  chain in `forge/animate.md`. Use the motion counter-prompt kit verbatim.
- **Never route game art through Gemini image models.**

## Bars for every asset

1. Sprites/sheets generate on solid `#FF00FF`; keyer math must match the engine exactly.
2. One character's frames = one generation (a sheet), never frame-by-frame gens.
3. Viewmodels follow the POV recipe (hands from bottom edge, barrel foreshortened to
   screen center, bottom third). Muzzle flash is a separate asset. Bob/recoil are code.
4. LOOK at every asset with your own eyes before wiring it (open the file — liveness
   and tests cannot see wrong art). Contact-sheet animation frames and check the loop
   reads before slicing.
5. Validate sheet cells (bbox present, silhouettes differ across walk frames); one
   re-roll max, then degrade to fewer frames gracefully.
6. Record provenance per asset (model, prompt family, pass) in the manifest — the
   gallery (`gallery/`) turns that into a browsable, review-able library.
7. Respect the budget stated in your brief; log a running gen count.
