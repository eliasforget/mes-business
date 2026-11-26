# `script.json` fields

Taken from `scripts/src/plan.ts` (types `ScriptVideo`, `Scene`, `Ligne`, `Chiffre`) and the `verifierScript` function that checks them. A field not listed here is ignored. Field names are French: use them exactly.

## Video folder

```
videos/05-new-video/
├── script.json            required
├── voix.mp3               optional voiceover (also .wav or .m4a): without it, silent video at an estimated reading pace
├── voix.mots.json         optional timings [{ "mot": "VS", "debut": 0.12, "fin": 0.48 }, ...] in seconds (word, start, end)
│   or voix.alignement.json    or the raw ElevenLabs "with-timestamps" response (converted automatically)
├── musique.mp3            optional (also .wav, .m4a): music the user has rights to
└── fonds/*.mp4            optional vertical background clips the user has rights to; they take priority over the library
```

The folder name becomes the output file name (`sortie/<name>.mp4`). Convention: `NN-slug`.

## Root

| Field | Type | Required | Role |
|---|---|---|---|
| `scenes` | non-empty list | yes | the scenes, in order |
| `titre` | text | no | title, shown in the engine logs |
| `fin` | text | no | call to action shown at the end (e.g. "Follow for more") |
| `theme` | text | no | look: `defaut` (the only one); an unknown name falls back to `defaut` with a warning |
| `couleurs` | object | no | replaces theme colours, `#rrggbb`. Names: `nuit` (background), `marine` (second background), `bleu`, `blanc` (text), `menthe` (accent 1: captions, tags), `orange` (accent 2, start of the big-title gradient), `rose` (accent 3, end of the gradient) |
| `marque` | `{ "nom": "…", "accent": "…" }` | no | logo at the top: `nom` in white, `accent` in colour. Both are required if present |

## Scene (`scenes[i]`)

| Field | Type | Required | Role |
|---|---|---|---|
| `voix` | non-empty text | **yes** | what the voice says during the scene. All `voix` values joined give the text being read |
| `tag` | text | no | small label above the title (e.g. "TIP 1") |
| `lignes` | list of `{ "texte", "style"? }` | no | the scene title, one line per item |
| `chiffre` | `{ "valeur", "decimales"?, "prefixe"?, "suffixe"? }` | no | big animated counter above the lines. `valeur` is a number |
| `motsCles` | list of texts | no | 2 keywords used to pick library clips (matched against file names) |
| `fonds` | list of texts | no | clip names forced for this scene |
| `duree` | number > 0 | no | seconds, only used without audio timings |

Line styles: `normal` (white), `gros` (huge, gradient), `accent` (accent colour), `petit` (small, white). Without `style`, the line is `normal`.

## `verifierScript` checks

- `scenes`: non-empty list.
- `scenes[i].voix`: non-empty text (error otherwise).
- `scenes[i].lignes`: list of objects with `texte`; `style` is one of `normal`, `gros`, `accent`, `petit`.
- `scenes[i].chiffre.valeur`: number.
- `scenes[i].duree`: number greater than 0.
- `theme`: non-empty text; `marque`: `nom` and `accent` are texts; `couleurs`: known names, `#rrggbb` values.

Other render-time warnings (not errors): length under `DUREE_MIN_CIBLE` (30 s by default), no voice, no music, unknown theme.

## Full example

See [../scripts/exemples/demo-shortcuts/script.json](../scripts/exemples/demo-shortcuts/script.json) (English) and [../scripts/exemples/demo-raccourcis/script.json](../scripts/exemples/demo-raccourcis/script.json) (French).
