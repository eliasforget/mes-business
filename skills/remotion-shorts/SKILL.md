---
name: remotion-shorts
description: Produit une vidéo verticale 1080x1920 (Short, TikTok, Reel) animée avec Remotion à partir d'un script.json — accroche présente dès l'image 0, premier changement de plan à 1,3 s, sous-titres karaoké mot par mot, titres et compteurs animés, barre de progression, fin en boucle. À utiliser quand l'utilisateur veut écrire, valider (--dry-run), prévisualiser (images PNG) ou rendre en MP4 une vidéo courte verticale à partir d'un texte, avec Node 22 et le moteur vr-video. Pas pour une vidéo horizontale ou longue, ni pour du montage image par image.
---

# remotion-shorts

Tu transformes un sujet en vidéo verticale courte (30 à 45 s) : tu écris `script.json`, tu le valides, tu montres des aperçus, puis tu lances le rendu. Le moteur est `vr-video` (TypeScript + Remotion) ; les commandes exactes sont dans `references/commandes.md` et les champs du script dans `references/script-schema.md`. Ne les invente pas : lis-les.

## Quand l'utiliser

- « Fais-moi un Short / TikTok / Reel sur … », « transforme ce texte en vidéo avec sous-titres animés ».
- « Montre-moi un aperçu », « rends la vidéo » dans un projet qui contient un dossier de vidéo avec un `script.json`.

## Quand ne pas l'utiliser

- Vidéo horizontale, de plus de 3 minutes, ou retouche d'une vidéo filmée.
- Utilisateur qui ne veut pas installer Node 22.6 ou plus.

## Avant de commencer

1. `node -v` : version 22.6 ou plus (le moteur exécute le TypeScript directement).
2. Le moteur est installé (`npm install` dans son dossier, voir `references/commandes.md`). Au premier rendu, Remotion télécharge un navigateur headless (environ 100 Mo).
3. Les fichiers de l'utilisateur : voix off (`voix.mp3`), musique, clips de fond. Utilise uniquement ce qui existe dans le dossier : liste-le, n'invente aucun nom de fichier. Ne demande jamais une clé d'API dans la conversation et ne lis pas son `.env`.
4. Sans voix, la vidéo est muette et le rythme est estimé (environ 2,8 mots par seconde) : suffisant pour valider le texte et les aperçus, pas pour publier.

## Étapes

### 1. Cadrer

Une seule question groupée, seulement si une info manque : sujet, durée visée, langue, ton. Si le sujet est donné, propose directement un script.

### 2. Écrire `script.json`

Crée un dossier de vidéo (ex. `videos/05-raccourcis-vscode/`) avec `script.json` selon `references/script-schema.md`.

- 85 mots de voix donnent environ 30 s, 110 mots environ 40 s. Le moteur avertit sous 30 s (`DUREE_MIN_CIBLE`) et dit combien de mots ajouter.
- Première scène : l'accroche. Elle doit se comprendre seule, sans « salut » ni présentation, car elle est à l'écran dès l'image 0.
- `voix` : le texte lu, phrases courtes. Mises bout à bout, les `voix` de toutes les scènes doivent donner exactement le texte de la voix off (elles servent à caler les scènes sur le minutage).
- `lignes` : 2 à 3 lignes courtes par scène (styles `normal`, `gros`, `accent`, `petit`) ; un seul `gros` par scène.
- N'invente aucun chiffre, date ni nom vérifiable. En cas de doute, écris la phrase sans le chiffre ou demande la source à l'utilisateur.
- Marque : mets toujours `"marque": { "nom": "…", "accent": "…" }` avec le nom de la chaîne de l'utilisateur. Sans ce champ, le logo par défaut est celui de l'auteur du moteur.
- Pas de contenu d'autrui : ni extraits de vidéos d'autres créateurs, ni musique sous licence que l'utilisateur ne possède pas.

### 3. Valider : `--dry-run`

Lance la commande `--dry-run`. Elle vérifie le script (`verifierScript` : scènes, voix non vides, styles connus, chiffres numériques, durées), calcule le plan (durée, scènes, sous-titres, plans de fond), écrit `sortie/<nom>.plan.json` et ne rend rien. Lis le résumé : durée totale, minutes des scènes, avertissements (durée trop courte, pas de voix, pas de musique, thème inconnu).

Elle **ne vérifie pas** que les fichiers de voix, de musique ou de fonds ont de bons noms : un fichier mal nommé est simplement ignoré (« Aucun clip trouvé » ou « Pas de musique » dans le résumé). Corrige `script.json` ou les noms de fichiers, puis relance. Ne supprime jamais un champ obligatoire pour faire taire une erreur.

### 4. Aperçus

Lance `--apercu 0,1.5,6` : des images PNG à 0 s, 1,5 s et 6 s dans `sortie/`. Demande à l'utilisateur de vérifier : accroche lisible à 0 s, sous-titres hors de la zone cachée par l'interface de l'appli, titres qui ne débordent pas. Applique ses retours dans `script.json`, puis reprends l'étape 3.

### 5. Rendu

Seulement après un « ok » explicite sur les aperçus : lance le rendu. Sortie : `sortie/<nom>.mp4` en 1080x1920, 30 images par seconde. Donne le chemin et la durée. Compte 1 à 3 minutes pour 30 s de vidéo sur un PC récent, davantage sur une petite machine.

### 6. Texte de publication (facultatif)

Titre, légende courte, hashtags. Si la voix est synthétique, rappelle d'activer l'étiquette « contenu généré par l'IA » à la publication (TikTok l'exige pour les voix réalistes générées par IA).

## Exemple

Entrée : « Fais un Short de 35 s : 3 raccourcis VS Code que personne n'utilise. »

1. `videos/05-raccourcis-vscode/script.json` : 4 scènes (accroche + 3 raccourcis), environ 100 mots de voix, `marque` de l'utilisateur.
2. `--dry-run` : « 4 scènes, durée estimée 37 s », aucune erreur.
3. Trois images PNG, puis la demande de validation.
4. Après « ok » : `sortie/05-raccourcis-vscode.mp4`.

## Limites connues

- Format vertical uniquement (1080x1920).
- La skill ne génère pas la voix : elle utilise `voix.mp3` fourni, avec son minutage (`voix.mots.json` ou réponse ElevenLabs `voix.alignement.json`). Sans minutage, les sous-titres sont calés approximativement sur la durée de l'audio.
- Les couleurs viennent d'un habillage fourni avec le moteur (`vice-radar` par défaut, `faits-animes`) : tu changes le logo avec `marque`, pas la palette.
- Une réclamation Content ID sur un Short de plus d'une minute le bloque sur YouTube : évite les musiques « libres de droits » marquées Content ID.
- Aucune promesse de performance sur les plateformes : la rétention se lit dans les statistiques de l'utilisateur.

## Erreurs fréquentes

- `script.json introuvable` : le dossier passé à la commande n'est pas celui de la vidéo.
- `scenes[i].voix : texte obligatoire` : une scène sans texte de voix.
- Vidéo sous 30 s : ajoute des mots dans les `voix` (le moteur donne le nombre), puis régénère la voix.
- Sous-titres décalés : fournis `voix.mots.json` ou l'alignement ElevenLabs au lieu de laisser l'estimation.
- Sous PowerShell, `npm run … -- --dry-run` perd les options : utilise la commande directe de `references/commandes.md`.
