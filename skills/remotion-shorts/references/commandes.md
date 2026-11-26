# Exact commands

Taken from `scripts/rendu.ts` (engine usage: `rendu <video-folder> [--dry-run] [--apercu 0,3] [--sortie file.mp4]`). Everything runs from the engine folder (`scripts/`, next to `SKILL.md`). A video folder can live anywhere: the engine only reads `script.json` and the files next to it.

## Install (once)

```powershell
Set-Location skills\remotion-shorts\scripts   # adjust to where the skill is installed
npm install
npm test        # timings, script validation, --dry-run and package checks
```

Requires Node 22.6 or later. On the first render, Remotion downloads a headless browser (about 100 MB).

**Remotion license**: free for individuals and for organisations of up to 3 people (other free cases are listed in the license); beyond that a paid company license is required, with a separate plan for automated rendering. Check https://www.remotion.dev/docs/license for your case.

## Keep your files outside the skill folder

With the skills CLI, reinstalling or updating a skill deletes the installed folder and copies it again. Video folders, renders, clips, music and the engine's `.env` stored inside it are lost. Keep video folders in your own project and send the output there with an environment variable (it wins over `.env` and survives an update). The variable below lasts for the current terminal session:

```powershell
$env:DOSSIER_SORTIE = "$env:USERPROFILE\videos\sortie"
```

```bash
export DOSSIER_SORTIE="$HOME/videos/sortie"
```

## The three commands

Windows (PowerShell): the `rendu.cmd` launcher stops PowerShell from swallowing the options.

```powershell
.\rendu.cmd "$env:USERPROFILE\videos\05-new-video" --dry-run           # 1. validate the script and print the plan, no render
.\rendu.cmd "$env:USERPROFILE\videos\05-new-video" --apercu 0,1.5,6    # 2. PNG frames at 0 s, 1.5 s and 6 s
.\rendu.cmd "$env:USERPROFILE\videos\05-new-video"                     # 3. full render
```

macOS, Linux (or any system with Node): same command without the launcher.

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning rendu.ts "$HOME/videos/05-new-video" --dry-run
node --experimental-strip-types --no-warnings=ExperimentalWarning rendu.ts "$HOME/videos/05-new-video" --apercu 0,1.5,6
node --experimental-strip-types --no-warnings=ExperimentalWarning rendu.ts "$HOME/videos/05-new-video"
```

On Node 22.18 or later, `--experimental-strip-types` is no longer needed.

| Command | What it does | What it writes |
|---|---|---|
| `--dry-run` | checks the script (`verifierScript`), computes the plan, prints length, scenes and warnings | only `sortie/<name>.plan.json`; no render, no browser; takes under a second |
| `--apercu 0,1.5,6` | renders still frames at the given times (seconds, comma-separated) | `sortie/<name>-<time>s.png` |
| (no option) | renders the H.264 1080x1920 video at 30 fps | `sortie/<name>.mp4` (or `--sortie path\file.mp4`) |

Exit code is 0 on success, 1 on a script error (list printed) or a missing file (`script.json introuvable`).

## What `--dry-run` does not check

It does not check background, music or voice file names: the summary just says there is no voice, no music or no clip. Read those lines.

## Optional settings (environment variables or the engine's `.env`)

None is required. `.env` is never committed and must not be read in the conversation.

| Variable | Default | Role |
|---|---|---|
| `MARQUE_NOM`, `MARQUE_ACCENT` | `MA`, `CHAINE` | logo text when the script has no `marque` |
| `DOSSIER_SORTIE` | engine's `sortie\` | where MP4, PNG and plans are written |
| `DUREE_MIN_CIBLE` | 30 | the engine warns under this length (seconds) |
| `RYTHME_FONDS` | 2.2 | seconds between two background cuts (the first shot lasts 1.3 s) |
| `VOLUME_MUSIQUE` | 0.12 | music volume under the voice, 0 to 1 |
| `BIBLIOTHEQUE_FONDS` | none | folder of vertical clips; keywords come from file names (`city-night-neon-01.mp4`) |
| `MUSIQUE` | none | a track or a folder of tracks |
| `BARRE_PROGRESSION`, `BOUCLE` | true | top progress bar, ending that loops back to the hook |
| `CRF` | 18 | H.264 quality (18 very good, 23 lighter) |
| `CONCURRENCE` | half the cores | parallel rendering |
| `NAVIGATEUR` | (downloaded by Remotion) | path to a Chrome/Chromium to use |
