# Commandes exactes

Relevées dans `scripts/rendu.ts` (usage affiché par le moteur : `rendu <dossier-de-la-video> [--dry-run] [--apercu 0,3] [--sortie fichier.mp4]`). Tout se lance depuis le dossier du moteur (`scripts/`, à côté de ce `SKILL.md`). Le dossier d'une vidéo peut être n'importe où : le moteur ne lit que `script.json` et les fichiers à côté de lui.

## Installation (une fois)

```powershell
Set-Location skills\remotion-shorts\scripts   # adapte le chemin à l'endroit où la skill est installée
npm install
npm test        # tests du minutage, de la validation du script et du --dry-run
```

Exigence : Node 22.6 ou plus. Au premier rendu, Remotion télécharge un navigateur headless (environ 100 Mo). Licence Remotion : gratuite pour un particulier d'après le README du moteur ; vérifie les conditions de remotion.com si l'usage est professionnel.

## Les trois commandes

Windows (PowerShell) : le lanceur `rendu.cmd` évite que PowerShell avale les options.

```powershell
.\rendu.cmd videos\05-nouvelle-video --dry-run           # 1. valide le script et affiche le plan, sans rendu
.\rendu.cmd videos\05-nouvelle-video --apercu 0,1.5,6    # 2. images PNG à 0 s, 1,5 s et 6 s
.\rendu.cmd videos\05-nouvelle-video                     # 3. rendu complet -> sortie\05-nouvelle-video.mp4
```

macOS, Linux (ou tout système avec Node) : même commande sans le lanceur.

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning rendu.ts videos/05-nouvelle-video --dry-run
node --experimental-strip-types --no-warnings=ExperimentalWarning rendu.ts videos/05-nouvelle-video --apercu 0,1.5,6
node --experimental-strip-types --no-warnings=ExperimentalWarning rendu.ts videos/05-nouvelle-video
```

Sous Node 22.18 ou plus, `--experimental-strip-types` n'est plus nécessaire.

| Commande | Ce qu'elle fait | Ce qu'elle écrit |
|---|---|---|
| `--dry-run` | contrôle le script (`verifierScript`), calcule le plan, affiche durée, scènes et avertissements | `sortie/<nom>.plan.json` seulement ; aucun rendu, aucun navigateur ; s'exécute en moins d'une seconde |
| `--apercu 0,1.5,6` | rend des images fixes aux instants donnés (secondes, séparés par des virgules) | `sortie/<nom>-<instant>s.png` |
| (aucune option) | rend la vidéo H.264 1080x1920 à 30 i/s | `sortie/<nom>.mp4` (ou `--sortie chemin\fichier.mp4`) |

Le code de sortie est 0 si tout va bien, 1 sur une erreur de script (liste affichée) ou un fichier manquant (`script.json introuvable`).

## Ce que `--dry-run` ne vérifie pas

Il ne contrôle pas les noms des fichiers de fond, de musique ou de voix : le résumé indique seulement « voix aucune », « musique aucune » ou « Aucun clip trouvé ». Relis ces lignes.

## Réglages facultatifs (variables d'environnement ou `.env` du moteur)

Aucune n'est obligatoire. Le `.env` n'est jamais versionné et ne se lit pas dans la conversation.

| Variable | Défaut | Rôle |
|---|---|---|
| `DOSSIER_SORTIE` | `sortie\` du moteur | où écrire MP4, PNG et plans |
| `DUREE_MIN_CIBLE` | 30 | durée sous laquelle le moteur avertit (secondes) |
| `RYTHME_FONDS` | 2.2 | secondes entre deux changements de plan de fond (le premier plan dure 1,3 s) |
| `VOLUME_MUSIQUE` | 0.12 | volume de la musique sous la voix, de 0 à 1 |
| `BIBLIOTHEQUE_FONDS` | `bibliotheque\` du moteur | dossier de clips verticaux ; les mots-clés viennent du nom des fichiers (`ville-nuit-neons-01.mp4`) |
| `MUSIQUE` | `musique\` du moteur | fichier ou dossier de morceaux |
| `BARRE_PROGRESSION`, `BOUCLE` | true | barre en haut, fin qui reprend l'accroche |
| `CRF` | 18 | qualité H.264 (18 très bon, 23 plus léger) |
| `CONCURRENCE` | moitié des cœurs | rendus en parallèle |
| `NAVIGATEUR` | (téléchargé par Remotion) | chemin d'un Chrome/Chromium à utiliser |
