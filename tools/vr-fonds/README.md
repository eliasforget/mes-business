# vr-fonds

Remplit la bibliothèque de clips de fond de `vr-video` avec des **vidéos Pixabay** (licence Pixabay : usage commercial autorisé, attribution non obligatoire), choisies d'après les `motsCles` de chaque scène du script. Les clips sont nommés avec leurs mots-clés (`miami-nuit-pixabay-123.mp4`) : `vr-video` les associe automatiquement aux bonnes scènes.

TypeScript, aucune dépendance (fetch natif de Node).

## Installation

```powershell
Set-Location (Join-Path $HOME 'dev\automatisations\tools\vr-fonds')
Copy-Item .env.example .env
notepad .env          # colle ta clé Pixabay (pixabay.com/api/docs, une fois connecté)
npm test
```

## Utilisation

Dans PowerShell, passe par le lanceur `.\fonds.cmd` : avec `npm run fonds -- --dry-run`, PowerShell supprime le `--` et l'option partirait chez npm (l'outil la rattrape quand même, par sécurité).

```powershell
.\fonds.cmd 05-nouvelle-video --dry-run        # ce qui serait téléchargé (recherches seulement)
.\fonds.cmd 05-nouvelle-video                  # 3 clips par scène
.\fonds.cmd 05-nouvelle-video --par-scene 5
.\fonds.cmd --requete "voiture de sport nuit" --nombre 8   # enrichir la bibliothèque librement
```

Les mots-clés sont cherchés en français (`lang=fr`, recherche filtrée `safesearch`). Si la requête complète (« miami nuit tour ») ne donne pas assez de clips, l'outil réessaie mot par mot. Thèmes qui marchent bien pour GTA 6 : miami, néons, nuit, ville, voiture de sport, police, palmiers, plage, floride, marais, hélicoptère, yacht, argent. Si une scène ressort vide, essaie le mot anglais (`neon city`, `sports car`) : la base Pixabay est surtout indexée en anglais.

## Ce qui est fait pour toi

- **Verticales d'abord.** Pixabay en a peu : avec `ACCEPTER_PAYSAGE=oui`, l'outil complète avec des vidéos horizontales **4K uniquement**, que `vr-video` recadre en 9:16 sans perte visible. Une horizontale en simple 1080p serait floue une fois recadrée : elle est ignorée.
- Choix du meilleur fichier : le plus léger qui reste net en 1080×1920 (pas de 4K inutile pour une verticale), sous `MAX_MO`.
- Clips trop courts ou trop longs ignorés.
- **Jamais deux fois la même vidéo** : l'`index.json` de la bibliothèque garde la trace de tout ce qui a été téléchargé.
- Téléchargement en `.part`, puis renommage : pas de clip à moitié écrit si tu coupes. Relançable à tout moment.
- **Cache de 24 h** des recherches (`.cache-pixabay.json`, exigé par Pixabay) : un `--dry-run` suivi du vrai lancement ne refait pas les recherches. C'est le seul fichier qu'un `--dry-run` écrit.
- Respect de la limite Pixabay (100 requêtes/minute) : l'outil attend la fin de la minute au lieu d'échouer.
- La clé n'apparaît jamais dans les logs, les erreurs ou le cache.
- `CREDITS.md` dans la bibliothèque : la liste des vidéastes. Pas obligatoire avec la licence Pixabay, mais « Vidéos : Pixabay » en description ne coûte rien.

Les personnes, marques ou lieux visibles dans une vidéo peuvent rester protégés (droit à l'image, marques) : évite d'utiliser un clip où une marque ou un visage est au centre de l'image pour illustrer une info qui n'a rien à voir.

## Suite

`.\rendu.cmd videos\05-nouvelle-video` dans `vr-video`.
