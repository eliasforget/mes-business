---
name: remotion-shorts
description: Create a 1080x1920 vertical video (YouTube Short, TikTok, Reel) with Remotion from a script.json - hook visible from frame 0, first background cut at 1.3 s, word-by-word karaoke captions, animated titles and counters, progress bar, looping ending. Use when the user wants to write, validate (--dry-run), preview (PNG frames) or render to MP4 a short vertical video from a text or a topic, with Node 22 and the engine shipped in `scripts/`. Not for horizontal or long videos, nor for editing filmed footage.
---

# remotion-shorts

You turn a topic into a short vertical video (30 to 45 s): write `script.json`, validate it, show preview frames, then render. The engine ships with the skill in `scripts/` (TypeScript + Remotion, self-contained: nothing else to copy). Exact commands are in [references/commandes.md](references/commandes.md) and every script field is in [references/script-schema.md](references/script-schema.md). Read them, do not guess.

The JSON field names and style values are French words (`scenes`, `lignes`, `texte`, `voix`, `marque`, `couleurs`; styles `normal`, `gros`, `accent`, `petit`). Use them exactly as written. The engine's console messages are in French too: translate them for the user. The video text can be in any language written in the Latin alphabet.

## Remotion license (tell the user)

This skill is MIT, but it renders with Remotion, which has its own license: free for individuals and for organisations of up to 3 people (see the license for the other free cases), paid company license beyond that, with a separate plan for automated rendering. If the user works for a company, ask them to check https://www.remotion.dev/docs/license before rendering.

## When to use it

- "Make me a Short / TikTok / Reel about ...", "turn this text into a video with animated captions".
- "Show me a preview", "render the video" in a project that has a video folder with a `script.json`.

## When not to use it

- Horizontal video, video longer than 3 minutes, or editing of filmed footage.
- The user does not want to install Node 22.6 or later.

## Before you start

1. `node -v` must be 22.6 or later (the engine runs TypeScript directly).
2. Install the engine (`npm install` in `scripts/`, see the commands reference). On the first render, Remotion downloads a headless browser (about 100 MB).
3. User files: voiceover (`voix.mp3`), music, background clips. Use only what is in the folder: list it, never invent a file name. Never ask for an API key in the conversation and never read the user's `.env`.
4. Without a voiceover the video is silent and the pace is estimated (about 2.8 words per second): good enough to check text and previews, not to publish.

## Steps

### 1. Frame the video

Ask one grouped question, only if something is missing: topic, length, language, tone. If the topic is given, propose a script right away.

### 2. Write `script.json`

Create a video folder in the user's project (for example `videos/05-vscode-shortcuts/`) with a `script.json` that follows the script schema reference. Never put it inside the skill folder: updating or reinstalling the skill deletes that folder, with everything added to it. Pass the engine the full path of the video folder, and set the `DOSSIER_SORTIE` environment variable to a folder of the user's project so that renders and previews (`sortie/` in the steps below) are written there.

- About 85 spoken words give 30 s, about 110 words give 40 s. The engine warns under 30 s (`DUREE_MIN_CIBLE`) and says how many words to add.
- First scene: the hook. It must make sense on its own, with no "hi" or introduction, because it is on screen from frame 0.
- `voix`: the spoken text, in short sentences. All `voix` values joined together must be exactly the voiceover text (they are used to align scenes with the word timings).
- `lignes`: 2 or 3 short lines per scene; only one `gros` line per scene.
- Never invent a checkable number, date or name. If in doubt, write the sentence without it or ask the user for a source.
- Brand: always set `"marque": { "nom": "...", "accent": "..." }` with the user's channel name. Without it the logo shows the placeholder "MA CHAINE" (also settable with `MARQUE_NOM` and `MARQUE_ACCENT` in the engine's `.env`).
- Colours are optional: `"couleurs": { "menthe": "#38bdf8" }` replaces one theme colour (`#rrggbb`, names in the script schema).
- No third-party content: no clips from other creators, no music the user has no rights to.

### 3. Validate: `--dry-run`

Run the `--dry-run` command. It checks the script (`verifierScript`: scenes, non-empty voice text, known styles, numeric values, durations), computes the plan (length, scenes, captions, background shots), writes `sortie/<name>.plan.json` and renders nothing. Read the summary: total length, scene timings, warnings (too short, no voice, no music, unknown theme).

It does **not** check voice, music or background file names: a misnamed file is silently ignored (the summary says no clip or no music was found). Fix `script.json` or the file names and run it again. Never delete a required field to silence an error.

### 4. Preview frames

Run `--apercu 0,1.5,6`: PNG frames at 0 s, 1.5 s and 6 s in `sortie/`. Ask the user to check that the hook is readable at 0 s, captions stay clear of the app's interface and titles do not overflow. Apply the feedback in `script.json`, then go back to step 3.

### 5. Render

Only after the user explicitly approves the previews. Output: `sortie/<name>.mp4`, 1080x1920, 30 fps. Give the path and the length. Expect 1 to 3 minutes for 30 s of video on a recent PC, more on a small machine.

### 6. Posting text (optional)

Title, short caption, hashtags. If the voice is synthetic, remind the user to turn on the platform's AI-generated content label when posting (TikTok requires it for realistic AI-generated voices).

## Example

Request: "Make a 35 s Short: 3 VS Code shortcuts nobody uses."

1. `videos/05-vscode-shortcuts/script.json`: 4 scenes (hook + 3 shortcuts), about 100 spoken words, the user's `marque`.
2. `--dry-run`: scene count and estimated length, no error.
3. Three PNG frames, then ask for approval.
4. After approval: `05-vscode-shortcuts.mp4` in the output folder.

A working example is in [scripts/exemples/demo-shortcuts/script.json](scripts/exemples/demo-shortcuts/script.json).

## Known limits

- Vertical format only (1080x1920).
- The skill does not generate the voice: it uses the `voix.mp3` you provide, with its timings (`voix.mots.json`, or the ElevenLabs response saved as `voix.alignement.json`). Without timings, captions are only roughly aligned on the audio length.
- One look is provided (`defaut`): you can change the logo with `marque` and the colours with `couleurs`, not the layout or the fonts.
- A Content ID claim on a Short longer than one minute blocks it on YouTube: avoid "royalty-free" music that is registered with Content ID.
- No promise about performance on any platform: retention is read in the user's own analytics.

## Common errors

- `script.json introuvable` (not found): the folder passed to the command is not the video folder.
- `scenes[i].voix : texte obligatoire` (text required): a scene has no voice text.
- Video under 30 s: add words to the `voix` values (the engine gives the number), then regenerate the voice.
- Captions out of sync: provide `voix.mots.json` or the ElevenLabs alignment instead of relying on the estimate.
- In PowerShell, `npm run ... -- --dry-run` drops the options: use the direct command from the commands reference.
