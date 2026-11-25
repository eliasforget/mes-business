# Moteur de la skill remotion-shorts

Moteur autonome (TypeScript + [Remotion](https://www.remotion.dev)) : transforme un `script.json` en vidéo verticale 1080x1920, 30 images par seconde. Accroche à l'image 0, premier changement de plan à 1,3 s, sous-titres karaoké, titres et compteurs animés, barre de progression, fin en boucle. Sans clip ni voix, un fond animé sert de décor et la vidéo est muette (utile pour valider et prévisualiser).

Aucun logo, couleur ni fichier d'une chaîne existante : le logo vient de `marque` dans le script (ou de `MARQUE_NOM` / `MARQUE_ACCENT` dans `.env`), les couleurs de `couleurs`.

## Installation

Node 22.6 ou plus.

```powershell
Set-Location <dossier>\skills\remotion-shorts\scripts
npm install
Copy-Item .env.example .env     # facultatif
npm test
```

Au premier rendu, Remotion télécharge un navigateur headless (environ 100 Mo). Pour en utiliser un déjà installé : `NAVIGATEUR=<chemin de Chrome>` dans `.env`.

## Utilisation

```powershell
.\rendu.cmd exemples\demo-raccourcis --dry-run          # valide, affiche le plan, ne rend rien
.\rendu.cmd exemples\demo-raccourcis --apercu 0,1.5,6   # images PNG dans sortie\
.\rendu.cmd exemples\demo-raccourcis                    # sortie\demo-raccourcis.mp4
npm run studio                                         # éditeur visuel Remotion (exemple)
```

Sous macOS ou Linux : `node --experimental-strip-types rendu.ts exemples/demo-raccourcis --dry-run`.

## Dossier d'une vidéo

```
ma-video\
├── script.json         obligatoire (voir ..\references\script-schema.md)
├── voix.mp3            voix off que tu fournis (sinon vidéo muette)
├── voix.mots.json      minutage [{ "mot", "debut", "fin" }] (ou voix.alignement.json ElevenLabs)
├── musique.mp3         facultatif, dont tu as les droits
└── fonds\*.mp4         facultatif, clips verticaux dont tu as les droits
```

Le moteur ne génère pas la voix, ne télécharge aucun clip ni aucune musique, n'envoie rien sur internet et ne publie rien.

## Réglages

Voir `.env.example` : tous facultatifs, aucun secret. Le fichier `.env` n'est pas versionné.

## Tests

`npm test` : minutage, sous-titres, plans de fond, validation du script (dont `couleurs`), thème, et deux lancements de `rendu.ts --dry-run` (script valide et script invalide). `npx tsc --noEmit` : typecheck.
