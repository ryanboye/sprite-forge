# The animation forge — hero image → video → game-ready frames

The proven chain (first shipped: a carbine reload animation, July 3 2026):

```
1. HERO      lift the asset's canonical frame (or generate one with gen-image.mjs)
2. VIDEO     scenario-custom.mjs model_kling-v2-1 out.mp4 \
               --prompt "<motion prompt — see counter-prompt kit below>" \
               --image hero.png --duration 5
3. EXTRACT   ffmpeg -i out.mp4 -vf fps=8 frames/f%02d.png
4. PICK      choose 6–10 frames spanning the motion (contact-strip them, look)
5. REPAIR    per frame: composite onto fresh #FF00FF, then gpt-image-2 images/edits
               with image[]=[frame, hero] and a "match the reference exactly,
               background solid pure magenta, crisp edges" prompt   (see repair.sh)
6. KEY       chroma-key with the game's exact keyer math; normalize canvas size
7. RUNTIME   frames become an animation strip the engine cycles
```

## The motion counter-prompt kit (video models drift theatrical without it)

Include ALL of these in the video prompt:
- "The camera is completely static and locked."
- "The <asset> stays locked in exactly this position — it never rotates, never turns
  sideways, never lifts toward the camera."
- "Only small mechanical motions: <describe the specific motion beats>."
- "No muzzle flash, no energy beams, no light rays, no special effects."
- "The FIRST and LAST frames are identical to the starting image — a perfect loop."
- "The flat magenta background stays exactly the same, unchanged."

## repair.sh — the cleanup pass

Run frames through gpt-image-2 edits in batches of ≤4 (long curl loops in background
shells get killed; run foreground):

```bash
curl -s https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model=gpt-image-2 \
  -F image[]=@frame-on-magenta.png \
  -F image[]=@hero.png \
  -F 'prompt=Repaint the first image cleanly: keep the exact same pose and motion
      moment, but make every detail match the second reference image exactly. Crisp
      clean silhouette edges. The background must be solid pure magenta #FF00FF
      everywhere, perfectly flat.' \
  -F size=1024x1024
```

Fixes detail drift (the video model changed the gloves), kills key fringe at the source,
and re-crunchifies style to match the game. ~30s + ~$0.04 per frame.

## The chroma keyer (keep IDENTICAL in compiler and engine)

```
m = min(r, b) - g
m > 52        → transparent
18 < m ≤ 52   → despill: r -= (m-18)*0.8; b -= (m-18)*0.8
```

Survives video models re-lighting magenta toward pink (observed metric ~68 vs threshold
52 — thin margin; the repair pass restores full margin).
