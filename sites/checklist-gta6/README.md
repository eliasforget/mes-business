# checklist-gta6

Site statique (sans dépendance, Node 22 pour les outils) : une checklist française des secrets de GTA 6 à cocher. Chaque secret indique son statut (« Vu en jeu » ou « Recoupé par plusieurs sites »), sa date de vérification et ses sources ; la progression reste dans le navigateur du visiteur. Rien n'est publié tant qu'il n'est pas recoupé par au moins 2 sources indépendantes ou vu en jeu avec capture, et aucun secret lié à l'histoire n'y figure.

Pourquoi du JavaScript sans framework : une seule page, aucune dépendance à maintenir, hébergement gratuit statique.

## Arborescence

```
sites/checklist-gta6/
├── index.html, style.css, app.js     la page (lit secrets.json, filtre, compteur, cases)
├── regles.js                         règles communes : « affichable », sources indépendantes, validation
├── secrets.json                      les données (brouillons a_verifier inclus, jamais publiés tels quels)
├── mentions-legales.html, optout.js  mentions légales et désactivation de la mesure d'audience
├── scripts/  valider-secrets.mjs, construire.mjs, liens-utm.mjs, serveur.mjs
├── tests/    20 tests (node:test)
├── docs/     verification.md, seuils-j30.md, deploiement.md
└── .env.example
```

## Installation

Rien à installer. Dans PowerShell :

```powershell
Set-Location (Join-Path $HOME 'dev\automatisations\sites\checklist-gta6')
Copy-Item .env.example .env      # facultatif
npm test
```

## Configuration (`.env`, voir `.env.example`)

| Variable | Rôle |
|---|---|
| `SITE_URL` | adresse du site en ligne (liens UTM, domaine surveillé par Umami) |
| `CONTACT_EMAIL` | adresse affichée en pied de page et dans les mentions légales |
| `UMAMI_WEBSITE_ID` | active la mesure d'audience Umami ; vide = aucun script, aucun traceur |
| `UMAMI_SCRIPT_URL` | URL du script donnée par Umami (défaut : cloud.umami.is) |

## Utilisation

```powershell
npm run valider                 # contrôle secrets.json (code 1 si une erreur)
npm run build                   # écrit dist\ : seuls les secrets affichables, notes internes retirées
npm run build -- --dry-run      # montre ce qui serait construit, sans rien écrire
npm run serve                   # http://localhost:8080 (page lue en direct)
npm run serve -- dist           # tester le dossier construit
npm run utm                     # liens UTM par réseau ; npm run utm -- --video v08 pour une vidéo
```

Ajouter un secret : une entrée `a_verifier` dans `secrets.json`, puis la procédure de `docs/verification.md`. Il n'apparaît sur le site qu'au statut `recoupe` (2 sources indépendantes) ou `verifie_en_jeu` (capture à toi dans `captures/`, date et version du jeu).

Exemple de sortie de `npm run valider` :

```
secrets.json : 16 secret(s), 9 affichable(s) sur la page.
  Recoupé par plusieurs sites : 9
  À vérifier : 7
OK : secrets.json est publiable.
```

## Mise en ligne automatique

Le workflow `.github/workflows/checklist-gta6.yml` teste, construit et déploie sur Cloudflare Pages à chaque push sur `main` qui touche le site. Sans les secrets Cloudflare il s'arrête après la construction, sans erreur. Pas-à-pas (2 minutes de ta part) : `docs/deploiement.md`.

## Limites connues

- `gta6wiki.eu` cite Beebom : les deux comptent pour une seule source indépendante (liste `SITES_LIES` dans `regles.js`).
- Aucun secret n'est confirmé par Rockstar ; la page le dit. Aucune image du jeu n'est affichée sauf tes propres captures.
