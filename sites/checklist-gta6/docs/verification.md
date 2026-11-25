# Procédure de vérification d'un secret (10 minutes)

But : un secret n'apparaît sur le site que s'il est réel, daté et sourcé. Les sites existants se contredisent (flamants 125 contre 22) : la valeur du site, c'est la fiabilité.

## Les statuts (champ `statut`)

| statut | sens | affiché |
|---|---|---|
| `verifie_en_jeu` | vu sur ta PS5, avec capture à toi, date et version du jeu | oui (pastille « Vu en jeu ») |
| `recoupe` | décrit par au moins 2 sources **indépendantes**, avec le même lieu | oui |
| `a_verifier` | une seule source, ou lieux qui se contredisent | non |
| `retire` | démenti, introuvable ou lié à l'histoire (on garde la raison dans `notes`) | non |

## Sources indépendantes

- Deux pages qui se recopient comptent pour une. `gta6wiki.eu` cite Beebom : ensemble, une seule source (liste `SITES_LIES` dans `regles.js`).
- Si les lieux diffèrent, le secret reste `a_verifier`. Aucun chiffre, prix ou montant dans `description` s'il n'est pas identique dans les sources.
- Sources acceptées : ta partie ; support Rockstar (patchs seulement) ; guides détaillés qui séparent le vérifié du non vérifié (GTASide, LeonidaVerse, Beebom, gta6wiki.eu, PowerPyx, Kotaku…). Refusées : fuites, datamining, forums sans preuve, vidéos d'autres créateurs.
- Reformule toujours, ne recopie pas.

## Étapes

1. Ajoute l'entrée dans `secrets.json` en `a_verifier` (id `categorie-NNN`, jamais réutilisé).
2. Trouve la 2e source indépendante, note l'URL et la date de consultation dans `sources`.
3. Spoiler : si la description révèle l'histoire (Mr. Mangrove, alien, bar du mont Chiliad, Little Sam, Niko Bellic, Jimmy De Santa, bunker Russo, bateau fantôme, Red Hulk…), statut `retire`. Un doute = `a_verifier`.
4. Test en jeu quand tu es dans la zone : capture dans `captures/<id>.jpg`, `date_verification`, `version_jeu`, statut `verifie_en_jeu`.
5. `npm run valider` : le contrôle refuse tout ce qui ne respecte pas ces règles.
6. À chaque patch officiel (ou chaque semaine), repasse les secrets publiés : un doute = retour en `a_verifier` avec nouvelle date.

## Catégories

`secrets_radio`, `objets_caches`, `rencontres`, `references`, `lieux_insolites`, `animaux`, `vehicules`, `mises_a_jour`. Évite `collectibles` au lancement : les totaux se contredisent et personne ne peut les compter sans avoir fini le jeu.
