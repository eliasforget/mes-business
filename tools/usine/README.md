# usine

Fabrique toute seule, sur ton PC, les vidéos que les agents du tableau de bord poussent sur GitHub.
Toutes les 5 minutes : `git pull`, puis pour chaque nouvelle vidéo **voix ElevenLabs → clips Pixabay → rendu**,
et la range avec ses textes de publication dans `Vidéos\A publier\<chaîne>\<vidéo>\`. Toi, tu publies.

```
Agents (cloud) ──push──▶ GitHub (videos\<nom>\script.json + publication.txt)
                              │ git pull toutes les 5 min
                              ▼
                 usine (ton PC) : vr-voix → vr-fonds → vr-video
                              │
                              ▼
            Vidéos\A publier\Vice Radar\08-secrets-partie-4\08-secrets-partie-4.mp4
                                                           \publication.txt
            + tools\usine\rapport.json poussé sur GitHub (les agents voient ce qui est prêt)
```

## Installation (une fois)

```powershell
cd ~\dev\automatisations
git pull
cd tools\usine
Copy-Item .env.example .env      # facultatif : tout a une valeur par défaut
.\installer.ps1                  # tâche planifiée + premier passage à blanc
```

Prérequis déjà en place chez toi : clés dans `tools\vr-voix\.env` (ElevenLabs) et `tools\vr-fonds\.env` (Pixabay),
`git push` qui marche sans te demander de mot de passe (Gestionnaire d'identifiants Git).

## Avec Google Drive (conseillé : liens de téléchargement et dépôt depuis le téléphone)

1. Installe **Google Drive pour ordinateur** (même compte Google que celui relié à Claude). Il crée le lecteur `G:\Mon Drive`.
2. Dans `tools\usine\.env` :
   ```
   DOSSIER_A_PUBLIER=G:\Mon Drive\Mes business\A publier
   DOSSIER_CAPTURES=G:\Mon Drive\Mes business\Captures PS5
   ```
3. Les vidéos finies arrivent dans Drive : le tableau de bord affiche un bouton **Télécharger** par vidéo, et tu les récupères
   sur ton téléphone dans l'appli Drive (Enregistrer la vidéo → TikTok).
4. Tes captures PS5 (appli PS App → Télécharger → Partager → Drive, dossier « Captures PS5 ») deviennent toutes seules des
   vidéos gameplay au passage suivant (vr-clips, dans l'ordre de la liste de tournage, puis voix et rendu).

L'usine dépose aussi `usine-rapport.txt` dans « A publier » : le tableau de bord le lit pour passer les vidéos à « prête »
et cocher les expériences filmées.

## Configuration (`tools\usine\.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `USINE_ACTIVE` | `true` | `false` = l'usine ne fait plus rien |
| `DOSSIER_A_PUBLIER` | `Vidéos\A publier` | où ranger les vidéos finies |
| `MAX_PAR_PASSAGE` / `MAX_PAR_JOUR` | `3` / `4` | garde-fous sur les crédits ElevenLabs (~650 caractères par vidéo) |
| `GIT_AUTO` | `true` | `git pull` avant chaque passage |
| `POUSSER_RAPPORT` | `true` | pousse `rapport.json` (vidéos prêtes / en erreur) pour les agents |
| `DOSSIER_CAPTURES` | `tools\vr-clips\entree` | où tu déposes tes captures PS5 (importées par vr-clips) |

`ignorer.txt` : vidéos à ne jamais fabriquer (déjà publiées). Dans un `script.json`, `"auto": false` fait pareil.

## Compilation du dimanche

Chaque dimanche après 18 h, les vidéos de la semaine encore dans « A publier » (3 minimum) sont assemblées par chaîne
en une vidéo 16:9 pour YouTube (`A publier\<chaîne>\Compilation-AAAA-MM-JJ\`), avec titre, description et chapitres
dans `publication.txt`. Réglages : `COMPILATION_*` dans `.env`. Le tableau de bord la montre avec son bouton Télécharger.

## Utilisation à la main

```powershell
.\usine.cmd --dry-run              # ce qui serait fabriqué, sans rien dépenser
.\usine.cmd                        # un passage tout de suite
.\usine.cmd --video 08-secrets-partie-4   # refaire une vidéo précise
Start-ScheduledTask -TaskName 'Usine videos (automatisations)'   # réveiller la tâche
.\installer.ps1 -Desinstaller      # tout arrêter
```

## Comment elle décide

- Nouvelle vidéo ou `script.json` / `publication.txt` modifié par un agent → fabriquée (la voix n'est repayée que si le texte change).
- Vidéo gameplay (`"gameplay"` dans le script) → attend ta capture PS5 dans son dossier.
- Échec → réessayée au passage suivant, abandonnée après 3 échecs (voir `logs\usine\` et `rapport.json`).
- Ordre : Vice Radar d'abord (dossiers `07-…`), puis les autres chaînes (`F01-…` pour Faits animés).
- Un seul passage à la fois (verrou), état gardé dans `etat.local.json` (non versionné).

## Exemple

```
[INFO ] Récupéré depuis GitHub : 14 fichier(s) modifié(s) (f8a4a66 → 3c1e9b2).
[INFO ] 10 vidéo(s) à fabriquer, 3 maintenant (max 3 par passage, 4 par jour, 0 déjà faite(s) aujourd'hui).
[INFO ] ▶ 07-secrets-partie-3 (Vice Radar, nouvelle vidéo)
[INFO ] ✔ 07-secrets-partie-3 prête : C:\Users\elias\Videos\A publier\Vice Radar\07-secrets-partie-3\07-secrets-partie-3.mp4
```

Sécurité : l'usine exécute le code de la branche `main`. Les agents peuvent y pousser : garde le dépôt privé,
et coupe tout avec `USINE_ACTIVE=false` si un rendu part de travers.
