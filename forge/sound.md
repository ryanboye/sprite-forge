# The sound forge — AI sound effects for games

The audio arm of the pipeline. Uses **ElevenLabs text-to-sound-effects** (`/v1/sound-generation`).

```
node generators/gen-sfx.mjs "<prompt>" out.mp3 [durationSeconds 0.5-22] [promptInfluence 0-1]
```

Key: `ELEVENLABS_API_KEY` via env (falls back to `~/.env`). Output is a 44.1kHz mp3.

## Prompt recipe (what makes game SFX land)

- **Name the material + action + character**: "heavy sci-fi scattergun blast, chunky and
  mechanical" beats "gun sound". Say punchy/crisp/wet/metallic/whiny explicitly.
- **For weapons, say "single shot"** or you may get a burst. Add a short tail descriptor
  ("with a short energy tail", "quick decay") so it doesn't ring too long.
- **Duration**: impacts/shots 0.4–1.2s, reloads 1.2–2s, ambience 5–10s. Omit the arg to
  let ElevenLabs auto-pick.
- **promptInfluence**: 0.5 default. Higher (0.6–0.8) hugs your words; lower (0.3–0.4) is
  more creative/organic — good for ambience, worse for a precise mechanical click.
- Generate 2–3 takes of a key sound and pick by ear — like sprite frames, audio needs a
  human listen (the generator can confirm it's valid audio, not that it *sounds* good).

## Game integration notes

- One-shots (fire/hit/reload/death) = short mp3s triggered on the matching gameplay
  event. Ambience = a longer clip you loop quietly.
- Normalize levels so nothing clips or buries the mix (a quick ffmpeg loudnorm pass).
- Preload and pool audio nodes; on rapid fire, clone/reset the buffer so shots overlap
  instead of cutting each other off.
- Keep the source prompts in a manifest next to the assets so a sound can be regenerated
  or re-tuned later (same discipline as sprite provenance).

## Starter STARFRAG pack (example prompts used)

- `plasma-fire` — "punchy sci-fi plasma rifle shot, single crisp blast with a short energy tail" (0.9s)
- `shotgun-fire` — "heavy sci-fi scattergun blast, chunky and loud, mechanical" (0.9s)
- `reload` — "sci-fi energy weapon reload, mechanical clunk, magazine snap, power-up whine" (1.6s)
- `hit-flesh` — "wet impact hit on armor, short punchy thud with a metallic ring" (0.6s)
- `death-explosion` — "sci-fi player death, gib splat with a short electronic power-down" (1.3s)
- `ambient-hum` — "derelict spaceship interior ambience, low ominous hum with distant creaks" (6s)
