# vr-clips

Transforme tes captures PS5 en vidéos Vice Radar. Tu joues avec la liste de tournage de la semaine, tu déposes tes captures dans un dossier, et une commande crée une vidéo par capture : accroche à la voix, question affichée en haut, image du jeu, son du jeu, appel à l'action à la fin, plus les textes à publier sur YouTube, TikTok et Instagram.

**Pourquoi TypeScript :** même langage que vr-video et vr-voix, que l'outil enchaîne.

## Le principe

1. `tournage.json` liste les expériences de la semaine (E01, E02…) : titre, phrase d'accroche et texte à l'écran.
2. Tu les tournes **dans l'ordre**, avec une capture par expérience (deux appuis sur la touche Créer).
3. `vr-clips` associe chaque capture par **son nom** : nomme-la comme dans la liste, ex. `E01 · Planté au milieu de la route.mp4` (seul « E01 » compte). Une capture sans identifiant dans son nom va à la 1re expérience pas encore tournée, dans l'ordre d'enregistrement (date dans le nom du fichier PS5, sinon date du fichier).
4. Pour chaque paire, il crée `tools\vr-video\videos\NN-eXX-titre\` avec `gameplay.mp4` (une copie), `script.json` et `publication.txt`.
5. `--produire` enchaîne la voix (vr-voix) et le rendu (vr-video) de chaque vidéo.

Par défaut, la vidéo garde les **35 dernières secondes** de la capture : avec la touche Créer, le moment intéressant est à la fin. Pour garder autre chose, modifie `gameplay` dans le `script.json` de la vidéo (voir plus bas).

## Installation

Rien à installer en plus de vr-video et vr-voix (déjà configurés, avec la clé ElevenLabs dans le `.env` de vr-voix).

```powershell
Set-Location (Join-Path $HOME 'dev\automatisations\tools\vr-clips')
Copy-Item .env.example .env      # facultatif
New-Item -ItemType Directory -Force entree | Out-Null
```

## Réglages PS5 (une fois)

- Paramètres > Captures et diffusions > Captures : **format vidéo 1080p**, **type de fichier MP4**, **téléversement automatique activé** (PS5 liée à l'appli PS App).
- Raccourcis de la touche Créer : **durée du gameplay récent : 1 minute**.
- Dans le jeu : **radio des voitures coupée** (les morceaux sont sous licence et déclenchent des réclamations Content ID). Pas de cinématiques ni de missions de l'histoire (Rockstar fait retirer les spoilers).

L'appli PS App garde les clips de moins de 3 minutes (pas en 4K) pendant 14 jours : télécharge-les sur ton téléphone puis mets-les dans `entree\` (ou le dossier de `CLIPS_ENTREE`).

## Utilisation

```powershell
.\clips.cmd --liste                 # où en est la liste de la semaine
.\clips.cmd --dry-run               # quelle capture va avec quelle expérience (rien n'est copié)
.\clips.cmd --dry-run --sauter E03  # E03 n'a pas été tournée : les captures suivantes se décalent
.\clips.cmd --sauter E03            # crée les dossiers de vidéo
.\clips.cmd --produire              # voix + rendu de toutes les vidéos importées pas encore rendues
```

Si l'ordre ne colle pas, force une association avec un morceau du nom du fichier :

```powershell
.\clips.cmd --dry-run --associer E05=204210 --associer E06=205530
```

Relançable sans risque : une capture déjà importée n'est jamais réimportée (suivi dans `.importes.json`), une vidéo déjà rendue n'est pas refaite, un `script.json` existant n'est jamais écrasé. Une expérience sautée reste « à tourner » : la prochaine capture lui sera donnée, sauf si tu la sautes encore.

Les vidéos rendues arrivent dans `tools\vr-video\sortie\`, et les textes à copier-coller dans le `publication.txt` de chaque dossier.

## Ajuster une vidéo

Dans `tools\vr-video\videos\NN-eXX-titre\script.json`, section `gameplay` :

| Clé | Effet |
|---|---|
| `"duree": 45` | garde les 45 dernières secondes |
| `"debut": 12, "duree": 30` | garde 30 s à partir de la 12e seconde |
| `"volume": 0.6` | son du jeu plus bas après l'accroche |
| `"cadrage": "remplir"` | image recadrée plein écran au lieu de l'image entière sur fond flou |

Puis `..\vr-video\rendu.cmd videos\NN-eXX-titre --apercu 0,5,20` pour vérifier avant le rendu complet. Si tu modifies l'accroche (`voix`), relance `..\vr-voix\voix.cmd NN-eXX-titre`.

## Nouvelle liste de tournage

Remplace les expériences de `tournage.json` (de nouveaux identifiants, par exemple E11 à E20, pour ne pas les confondre avec celles déjà faites). Une bonne accroche pose une question sans donner la réponse : on ne connaît pas le résultat avant de jouer, et c'est ce qui fait regarder jusqu'au bout.

## Exemple

```
PS> .\clips.cmd --sauter E02
[INFO ] 3 nouvelle(s) capture(s) dans ...\entree, 10 expérience(s) encore à tourner.
  E01   Planté au milieu de la route  ← Grand Theft Auto VI_20261123203015.mp4 (2026-11-23 20:30, 41.2 Mo)
  E03   Klaxonner sans arrêt          ← Grand Theft Auto VI_20261123204210.mp4 (2026-11-23 20:42, 39.8 Mo)
  E04   Foncer dans une vitrine       ← Grand Theft Auto VI_20261123205530.mp4 (2026-11-23 20:55, 40.5 Mo)
[INFO ] E01 → ...\vr-video\videos\07-e01-plante-au-milieu-de-la-route
...
PS> .\clips.cmd --produire
```

## Tests

```powershell
npm test
```
