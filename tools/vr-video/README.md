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
├── musique.mp3            facultatif (sinon un morceau du dossier musique\)
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

## Habillages (plusieurs chaînes)

`"theme"` dans le script.json choisit l'habillage (couleurs, logo) défini dans `src/themes.ts` :

| theme | Chaîne | Couleurs | Logo |
|---|---|---|---|
| `vice-radar` (défaut) | Vice Radar | nuit, menthe, orange, rose | VICE **RADAR** |
| `faits-animes` | Faits animés | bleu nuit, cyan, ambre | FAITS **ANIMÉS** |

`"marque": { "nom": "…", "accent": "…" }` remplace le logo pour une vidéo. Musique propre à une chaîne : mets les morceaux
dans `musique\<theme>\` (sinon `musique\`). Les vidéos Faits animés sont dans `videos\F01-…`.
Les gros chiffres (`"chiffre"`) se réduisent tout seuls pour rester dans l'image.

## Passage choisi tout seul (vidéos gameplay)

Sans `debut` ni `duree` dans la section `gameplay` du script, le rendu analyse la capture (son et mouvement, seconde
par seconde, avec le ffmpeg fourni par Remotion) et garde `GARDER_S` secondes autour du moment fort (choc, explosion,
sirène, action rapide), le pic aux 70 % du passage. Rien de net (son et image plats) : il garde la fin, comme avant.
`PASSAGE_AUTO=false` pour toujours garder la fin. Le journal indique le moment repéré et sa netteté.

## Compilation 16:9 pour YouTube

```powershell
.\compil.cmd liste.json --sortie C:\...\compilation.mp4      # --apercu 3 pour une image test
```
`liste.json` : `{ "theme": "vice-radar", "videos": [{ "fichier": "C:\\...\\08.mp4", "titre": "4 secrets de plus" }] }`.
Chaque Short au centre sur un fond flouté de lui-même, « Partie N » et son titre au début, logo de la chaîne.
Écrit aussi `<nom>.chapitres.json` pour la description. L'usine le lance tout seul le dimanche.

## Vidéos de gameplay

Un script avec une section `gameplay` donne une vidéo construite autour d'une capture de jeu (dossiers créés par [vr-clips](../vr-clips)) :

- la question de l'expérience reste affichée en haut pendant toute la vidéo ;
- l'image du jeu occupe le centre, entière sur un fond flouté (`"cadrage": "remplir"` pour la recadrer plein écran) ;
- la voix dit l'accroche au début, avec des sous-titres sous l'image. Le son du jeu reste bas pendant la voix (`VOLUME_JEU_SOUS_VOIX`), puis remonte ;
- l'appel à l'action (`fin`) apparaît sur les 3,5 dernières secondes. Pas de musique par défaut (`VOLUME_MUSIQUE_JEU`).

La vidéo dure le passage de jeu gardé : les `GARDER_S` dernières secondes de la capture (35 par défaut), ou `debut` et `duree` dans la section `gameplay`.

```json
{
  "titre": "E01 — Planté au milieu de la route",
  "gameplay": { "fichier": "gameplay.mp4", "duree": 35 },
  "scenes": [{ "tag": "EXPÉRIENCE GTA 6", "lignes": [{ "texte": "Planté au milieu" }, { "texte": "de la route", "style": "accent" }],
               "voix": "Que se passe-t-il si tu restes planté au milieu de la route dans GTA 6 ? Regarde bien la fin." }],
  "fin": "Je teste quoi ensuite ? Dis-le en commentaire"
}
```

## Vidéos de gameplay commentées (voix tout du long)

Une capture où seule l'accroche est dite ne retient personne. Le circuit :

1. `.\planche.cmd videos\<nom>` (lancé par l'usine) fige le passage gardé dans `script.json` (`gameplay.debut`, `gameplay.duree`), écrit `planche.jpg` (une image par seconde, légendée avec sa seconde dans la vidéo finale) et met `"commentaire": "a_ecrire"`.
2. L'Agent web regarde la planche et écrit dans le script les phrases calées sur le jeu :
   ```json
   "commentaires": [
     { "a": 6, "texte": "Le bus le frôle… et ne freine même pas.", "zoom": true },
     { "a": 19.5, "texte": "Et là, la police s'arrête juste à côté de lui…" }
   ],
   "gameplay": { "fichier": "gameplay.mp4", "debut": 0, "duree": 35, "chrono": "planté sur la route" },
   "commentaire": "fait"
   ```
   Deux réglages pour garder les gens jusqu'au bout : `"gameplay": { "teaser": { "a": 21, "duree": 1.2 } }` montre le moment fort (seconde 21 du passage) pendant 1,2 s au tout début, avec « TOUT À L'HEURE… », puis un flash et la vidéo reprend au début ; `"suite": "demain : la mamie braqueuse"` ajoute « Abonne-toi · demain : la mamie braqueuse » sous l'appel à commenter de la fin (marche aussi pour les vidéos en motion design).
3. vr-voix génère une voix par phrase (`voix-c1.mp3`, `voix-c2.mp3`…, seules les phrases modifiées sont refaites) ; le rendu place chaque phrase à sa seconde (jamais deux voix en même temps), avec ses sous-titres, baisse le son du jeu pendant la voix, zoome sur les phrases `"zoom": true`, affiche le chrono et met une musique légère (`VOLUME_MUSIQUE_COMMENTAIRES`, 0,06 par défaut).

## Clips de fond

Mets des MP4 verticaux dans `bibliotheque\` (ou le dossier `BIBLIOTHEQUE_FONDS`), nommés avec des mots-clés : `miami-nuit-neons-01.mp4`, `voiture-sport-route-02.mp4`, `marais-floride-03.mp4`. Utilise des vidéos libres de droits pour un usage commercial (Pixabay ou Pexels par exemple), **pas des extraits d'autres créateurs**. `vr-fonds` remplit ce dossier automatiquement depuis Pixabay.

## Musique

Dépose quelques morceaux instrumentaux dans `musique\` (mp3, wav, m4a). Chaque vidéo en prend un d'après son nom : elle garde toujours le même, et les vidéos suivantes varient. Un `musique.mp3` dans le dossier d'une vidéo passe avant. Le morceau tourne en boucle, avec un fondu au début et à la fin, au volume `VOLUME_MUSIQUE` (0,12 par défaut) sous la voix.

Source conseillée : **Eleven Music** (elevenlabs.io → Music), usage commercial inclus dès l'offre Starter, environ 900 crédits par minute. Génère 3 ou 4 morceaux d'une minute une fois pour toutes, en **instrumental**. Évite les musiques « libres de droits » marquées Content ID (icône bouclier sur Pixabay) : sur YouTube, un Short de plus d'une minute qui reçoit une réclamation Content ID est bloqué.

## Durée

Une vidéo plus courte que `DUREE_MIN_CIBLE` (30 s par défaut) déclenche un avertissement, avec le nombre de mots à ajouter. `vr-voix` fait la même estimation **avant** de générer, pour ne pas payer une voix trop courte. Repère : environ 2,8 mots par seconde, donc 30 s ≈ 85 mots de voix, 40 s ≈ 110 mots.

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
# 3. Clips de fond (Pixabay)
Set-Location (Join-Path $t 'vr-fonds'); .\fonds.cmd 05-nouvelle-video
# 4. Vérifier puis rendre
Set-Location (Join-Path $t 'vr-video'); .\rendu.cmd videos\05-nouvelle-video --apercu 0,1.5
.\rendu.cmd videos\05-nouvelle-video
```

Pas de tâche planifiée : on lance un rendu quand une vidéo est prête.
