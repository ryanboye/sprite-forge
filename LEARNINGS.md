# Field notes — asset generation for games, measured

Everything below was learned on production builds (June–July 2026), most of it the hard
way. Model claims are from head-to-head tests on identical prompts, not vibes.

## Model behavior

- **Gemini image models are banned from this pipeline** (owner rule, earned twice): they
  ignore POV/foreshortening composition language (product-catalog angles at giant scale
  where gpt-image-2 renders a perfect first-person viewmodel from the same prompt) and
  they write JPEG data into `.png` files, which shreds chroma-key edges.
- **gpt-image-2 = the obedience model.** Follows per-cell sheet choreography ("cell 5:
  lunging attack"), POV composition, and edit instructions. Use for anything where the
  prompt is a spec.
- **Scenario/flux = the style model.** Better cell-to-cell style consistency than
  gpt-image-2, deep game-art LoRA catalog — but ignores choreography (9 near-identical
  poses from a 9-pose spec), bakes forbidden shadows, drifts magenta→pink. Singles and
  UI, not sheets.
- **img2img identity derivation (new angles of an existing sprite): gpt-image-2 edits won
  4/4** enemies vs scenario img2img (off-model every time; its kontext endpoint 500'd).
- **Video models (kling-v2-1) have identity nailed and choreography feral**: first take
  turned a "reload" into a cinematic weapon-showcase flip with unrequested energy beams —
  but the SAME carbine, perfectly preserved. The counter-prompt kit (locked camera,
  never rotates, no VFX, "first and last frames identical to the starting image") tamed
  take two into a real POV reload. Motion-from-video beats choreography-in-prompts.
- **Scenario's public API ≠ its web app**: video (veo3/kling) and 3D (hunyuan) exist but
  via `POST /generate/custom/{modelId}` — probing guessed REST paths returns gateway
  errors that LOOK like "endpoint doesn't exist". Read the docs page before declaring an
  API surface. Asset uploads require a `name`; video takes `startImage`, not `image`.

## The viewmodel recipe (why AI gun sprites usually fail)

Doom-style guns are drawn FROM BEHIND: hands entering from the bottom edge, barrel
foreshortened INTO the screen toward the crosshair, weapon in the bottom third. Image
models default to product-shot side angles unless the prompt forces all of that
explicitly. Fire = 2–4 recoil frames as ONE sheet (same weapon, consistent cells).
Muzzle flash = a SEPARATE overlay asset, never baked in. Idle bob and recoil are code.

## Sheets

- Generate each character's full frame set as ONE image (grid) — separate generations
  drift anatomy/style. Specify: same figure every cell, identical scale, feet on a
  shared baseline, flat magenta everywhere, no grid lines/labels.
- Expect ~70% choreography compliance from gpt-image-2; validate cells (bbox, silhouette
  variance) and re-roll once before falling back to fewer frames.
- **Slicing must tolerate misalignment**: crop an inset margin per cell, chroma-key,
  bbox, then re-center/baseline-align. Never trust exact grid lines.

## Chroma pipeline

- Solid `#FF00FF` background, key on `min(r,b) - g > 52`, despill the 18–52 band. Keep
  the compiler's keyer IDENTICAL to the engine's.
- Anti-fringe: the repair pass (composite onto FRESH magenta → gpt-image-2 edit →
  re-key) eliminates fringe at the source. Cheaper than post-processing fights.
- A real alternative for alpha: background-removal APIs (scenario has `remove-background`)
  produce true-alpha sprites — untested in production here, promising.

## Process

- **Look at every generated asset before building on it** — liveness checks pass on
  garbage. An asset-destructure/load-order mismatch once shipped husks rendering as
  conduit boxes with ALL tests green: counts don't see art. Eyeballing is a build step.
- Batch API loops (repairs) run FOREGROUND in ≤4-item chunks — long background curl
  loops get reaped.
- Keep a per-asset provenance note (model, pass, prompt family) — it's what makes a
  30-asset library auditable later (see the gallery).
