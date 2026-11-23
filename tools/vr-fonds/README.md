# vr-fonds

Remplit la bibliothèque de clips de fond de `vr-video` avec des **vidéos verticales Pexels** (licence gratuite, usage commercial autorisé, sans attribution obligatoire), choisies d'après les `motsCles` de chaque scène du script. Les clips sont nommés avec leurs mots-clés (`miami-nuit-pexels-123.mp4`) : `vr-video` les associe automatiquement aux bonnes scènes.

TypeScript, aucune dépendance (fetch natif de Node).

## Installation

```powershell
Set-Location (Join-Path $HOME 'dev\automatisations\tools\vr-fonds')
Copy-Item .env.example .env
notepad .env          # colle ta clé Pexels (gratuite : pexels.com/api)
npm test
```

## Utilisation

Dans PowerShell, passe par le lanceur `.\fonds.cmd` : avec `npm run fonds -- --dry-run`, PowerShell supprime le `--` et l'option partirait chez npm (l'outil la rattrape quand même, par sécurité).

```powershell
.\fonds.cmd 05-nouvelle-video --dry-run        # ce qui serait téléchargé (requêtes API seulement)
.\fonds.cmd 05-nouvelle-video                  # 3 clips par scène
.\fonds.cmd 05-nouvelle-video --par-scene 5
.\fonds.cmd --requete "voiture de sport nuit" --nombre 8   # enrichir la bibliothèque librement
```

Les mots-clés sont cherchés en français (`locale fr-FR`). Si la requête complète (« miami nuit tour ») ne donne pas assez de clips, l'outil réessaie mot par mot. Thèmes qui marchent bien pour GTA 6 : miami, néons, nuit, ville, voiture de sport, police, palmiers, plage, floride, marais, hélicoptère, yacht, argent.

## Ce qui est fait pour toi

- Choix du meilleur fichier : MP4 vertical d'au moins 1080 px de large, le plus léger (pas de 4K inutile).
- Clips trop courts, horizontaux ou trop lourds ignorés.
- **Jamais deux fois la même vidéo** : l'`index.json` de la bibliothèque garde la trace de tout ce qui a été téléchargé.
- Téléchargement en `.part`, puis renommage : pas de clip à moitié écrit si tu coupes. Relançable à tout moment.
- `CREDITS.md` dans la bibliothèque : la liste des vidéastes. Pexels demande de les créditer quand c'est possible : ajoute « Vidéos : Pexels » en description.
- Arrêt automatique avant d'épuiser le quota Pexels (20 000 requêtes/mois, 200/heure).

## Suite

`.\rendu.cmd videos\05-nouvelle-video` dans `vr-video`.
