# vr-video

Génère un Short / TikTok Vice Radar (MP4 vertical 1080×1920, 30 i/s) à partir d'un script JSON, d'une voix off et de clips de fond. Le modèle reprend l'identité Vice Radar (bleu nuit, dégradé orange-rose, étiquettes menthe, soleil synthwave) et il est pensé pour **réduire le décrochage des premières secondes** :

- l'accroche (titre + premiers sous-titres) est déjà à l'écran **dès l'image 0** ;
- **premier changement de plan à 1,3 s**, puis toutes les ~2,2 s, avec zoom continu et flash à chaque coupe ;
- sous-titres « karaoké » mot par mot, le mot prononcé est coloré ;
- titres qui arrivent en rebond, chiffres qui défilent (compteur), petite secousse sur le mot fort ;
- barre de progression en haut, appel à l'action en fin, **fin en boucle** (les dernières images reprennent l'accroche).

Sans clip, le fond est un décor synthwave animé (étoiles, soleil rayé, ville, sol quadrillé qui défile) : la vidéo n'est jamais figée.

TypeScript + [Remotion](https://www.remotion.dev) (vidéos écrites en React), polices embarquées : le rendu marche hors ligne.

## Installation

```powershell
Set-Location (Join-Path $HOME 'dev\automatisations\tools\vr-video')
npm install
Copy-Item .env.example .env      # facultatif
npm test                          # 9 tests de la logique de minutage
```

Au premier rendu, Remotion télécharge son propre navigateur (Chrome Headless Shell, ~100 Mo). Licence Remotion : gratuite pour un particulier.

## Utilisation

Dans PowerShell, passe par le lanceur `.\rendu.cmd` (PowerShell déforme les options de `npm run ... -- --option`).

```powershell
.\rendu.cmd exemples\04-easter-eggs --dry-run        # vérifie le script, affiche le plan (gratuit, instantané)
.\rendu.cmd exemples\04-easter-eggs --apercu 0,1.5,6  # images PNG à 0 s, 1,5 s et 6 s (quelques secondes)
.\rendu.cmd videos\05-nouvelle-video                   # vidéo complète -> sortie\05-nouvelle-video.mp4
npm run studio                                              # éditeur visuel Remotion dans le navigateur (exemple)
```

## Dossier d'une vidéo

```
videos\05-nouvelle-video\
├── script.json            obligatoire
├── voix.mp3               voix off (sans voix : vidéo muette, pour les aperçus)
├── voix.mots.json         minutage de chaque mot  [{ "mot": "Rockstar", "debut": 0.12, "fin": 0.48 }, ...]
│   ou voix.alignement.json   réponse brute ElevenLabs « with-timestamps » (convertie automatiquement)
├── musique.mp3            facultatif (sinon MUSIQUE du .env)
└── fonds\*.mp4            facultatif : clips propres à cette vidéo (prioritaires)
```

Sans fichier de minutage, les sous-titres sont calés approximativement sur la durée de la voix.

## script.json

```json
{
  "titre": "Rockstar a caché un vrai œuf de Pâques dans GTA 6",
  "fin": "Abonne-toi pour le secret n°5",
  "scenes": [
    {
      "tag": "SECRET N°1",
      "lignes": [
        { "texte": "Un vrai", "style": "normal" },
        { "texte": "Œuf", "style": "gros" },
        { "texte": "tout en haut de GTA 6.", "style": "accent" }
      ],
      "voix": "Rockstar a caché un vrai œuf de Pâques tout en haut de GTA 6.",
      "motsCles": ["miami", "nuit"]
    },
    {
      "tag": "COMMENT",
      "chiffre": { "valeur": 6, "suffixe": "MIN" },
      "lignes": [{ "texte": "d'escalade jusqu'au sommet.", "style": "petit" }],
      "voix": "Six minutes d'escalade, et l'œuf t'attend là-haut."
    }
  ]
}
```

| Champ de scène | Rôle |
|---|---|
| `voix` | **obligatoire** : ce que dit la voix pendant la scène. Sert à caler la scène sur le minutage : mets bout à bout les `voix` de toutes les scènes, ça doit donner le texte lu par la voix off. |
| `tag` | étiquette menthe au-dessus du titre |
| `lignes` | titre ; styles `normal` (blanc), `gros` (énorme, dégradé), `accent` (menthe), `petit` (blanc) |
| `chiffre` | grand compteur animé : `valeur`, `decimales`, `prefixe`, `suffixe` (ex. `3.79` + `MDS`) |
| `motsCles` | pour choisir les clips de la bibliothèque (comparés au nom des fichiers) |
| `fonds` | noms de clips imposés pour cette scène |
| `duree` | secondes, seulement sans voix |

## Clips de fond

Mets des MP4 verticaux dans `bibliotheque\` (ou le dossier `BIBLIOTHEQUE_FONDS`), nommés avec des mots-clés : `miami-nuit-neons-01.mp4`, `voiture-sport-route-02.mp4`, `marais-floride-03.mp4`. Utilise des vidéos libres de droits pour un usage commercial (Pexels par exemple), **pas des extraits d'autres créateurs**. `vr-fonds` remplit ce dossier automatiquement depuis Pexels.

## Temps de rendu

Environ 1 à 3 minutes pour un Short de 30 s sur un PC récent (5 minutes sur une petite machine). `--apercu` et `--dry-run` permettent de vérifier avant.

## Fabriquer une vidéo de A à Z

```powershell
$t = Join-Path $HOME 'dev\automatisations\tools'
# 1. Créer le dossier et écrire le script (copier l'exemple puis l'adapter)
Copy-Item (Join-Path $t 'vr-video\exemples\04-easter-eggs') (Join-Path $t 'vr-video\videos\05-nouvelle-video') -Recurse
notepad (Join-Path $t 'vr-video\videos\05-nouvelle-video\script.json')
# 2. Voix off + minutage (ElevenLabs)
Set-Location (Join-Path $t 'vr-voix');  .\voix.cmd 05-nouvelle-video
# 3. Clips de fond (Pexels)
Set-Location (Join-Path $t 'vr-fonds'); .\fonds.cmd 05-nouvelle-video
# 4. Vérifier puis rendre
Set-Location (Join-Path $t 'vr-video'); .\rendu.cmd videos\05-nouvelle-video --apercu 0,1.5
.\rendu.cmd videos\05-nouvelle-video
```

Pas de tâche planifiée : on lance un rendu quand une vidéo est prête.
