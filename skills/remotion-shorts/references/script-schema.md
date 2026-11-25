# Champs de script.json

Relevés dans `scripts/src/plan.ts` (types `ScriptVideo`, `Scene`, `Ligne`, `Chiffre`) et dans la fonction `verifierScript` qui les contrôle. Un champ non listé ici est ignoré.

## Dossier d'une vidéo

```
videos/05-nouvelle-video/
├── script.json            obligatoire
├── voix.mp3               facultatif (aussi .wav ou .m4a) : sans voix, vidéo muette au rythme de lecture estimé
├── voix.mots.json         facultatif : minutage [{ "mot": "VS", "debut": 0.12, "fin": 0.48 }, ...] en secondes
│   ou voix.alignement.json    ou réponse brute ElevenLabs « with-timestamps » (convertie automatiquement)
├── musique.mp3            facultatif (aussi .wav, .m4a) : musique dont l'utilisateur a les droits
└── fonds/*.mp4            facultatif : clips verticaux libres de droits, prioritaires sur la bibliothèque
```

Le nom du dossier devient le nom du fichier de sortie (`sortie/<nom>.mp4`). Convention : `NN-slug`.

## Racine

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `scenes` | liste non vide | oui | les scènes, dans l'ordre |
| `titre` | texte | non | affiché dans les journaux du moteur |
| `fin` | texte | non | appel à l'action affiché sur la fin (ex. « Abonne-toi pour la suite ») |
| `theme` | texte | non | habillage : `defaut` (seul fourni) ; un nom inconnu retombe sur `defaut` avec un avertissement |
| `couleurs` | objet | non | remplace des couleurs du thème, format `#rrggbb`. Noms : `nuit` (fond), `marine` (fond secondaire), `bleu`, `blanc` (texte), `menthe` (accent 1 : sous-titres, étiquettes), `orange` (accent 2, début du dégradé des gros titres), `rose` (accent 3, fin du dégradé) |
| `marque` | `{ "nom": "…", "accent": "…" }` | non | logo en haut de l'image : `nom` en blanc, `accent` en couleur. Les deux textes sont obligatoires s'il est présent |

## Scène (`scenes[i]`)

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `voix` | texte non vide | **oui** | ce que dit la voix pendant la scène. Mises bout à bout, les `voix` de toutes les scènes donnent le texte lu |
| `tag` | texte | non | petite étiquette au-dessus du titre (ex. « ASTUCE N°1 ») |
| `lignes` | liste de `{ "texte", "style"? }` | non | le titre de la scène, une ligne par élément |
| `chiffre` | `{ "valeur", "decimales"?, "prefixe"?, "suffixe"? }` | non | grand compteur animé au-dessus des lignes. `valeur` : nombre |
| `motsCles` | liste de textes | non | 2 mots pour choisir des clips de la bibliothèque (comparés au nom des fichiers) |
| `fonds` | liste de textes | non | noms de clips imposés pour cette scène |
| `duree` | nombre > 0 | non | secondes, utilisé seulement sans minutage audio |

Styles de ligne : `normal` (blanc), `gros` (énorme, dégradé), `accent` (couleur d'accent), `petit` (blanc, petit). Sans `style`, la ligne est `normal`.

## Contrôles de `verifierScript`

- `scenes` : liste non vide.
- `scenes[i].voix` : texte non vide (erreur sinon).
- `scenes[i].lignes` : liste d'objets avec `texte` ; `style` parmi `normal`, `gros`, `accent`, `petit`.
- `scenes[i].chiffre.valeur` : nombre.
- `scenes[i].duree` : nombre supérieur à 0.
- `theme` : texte non vide ; `marque` : `nom` et `accent` textes ; `couleurs` : noms connus, valeurs `#rrggbb`.

Autres contrôles du rendu (avertissements, pas des erreurs) : durée sous `DUREE_MIN_CIBLE` (30 s par défaut), absence de voix, absence de musique, thème inconnu.

## Exemple complet (4 scènes, 106 mots de voix : environ 40 s)

```json
{
  "titre": "3 raccourcis VS Code",
  "fin": "Lequel tu testes en premier ?",
  "marque": { "nom": "CODE", "accent": "ASTUCES" },
  "scenes": [
    {
      "tag": "VS CODE",
      "lignes": [
        { "texte": "Ce raccourci", "style": "petit" },
        { "texte": "10 MINUTES", "style": "gros" },
        { "texte": "gagnées par jour", "style": "accent" }
      ],
      "voix": "Ce raccourci VS Code te fait gagner dix minutes par jour, et presque personne ne le connaît. Voici les trois que j'utilise sans arrêt.",
      "motsCles": ["code", "clavier"]
    },
    {
      "tag": "ASTUCE N°1",
      "lignes": [{ "texte": "Ctrl + D", "style": "gros" }, { "texte": "sélectionne l'occurrence suivante", "style": "accent" }],
      "voix": "Numéro un : Contrôle D. Il sélectionne l'occurrence suivante du mot sous le curseur. Tu renommes plusieurs variables d'un seul coup, sans chercher et remplacer."
    },
    {
      "tag": "ASTUCE N°2",
      "chiffre": { "valeur": 2, "suffixe": " CURSEURS" },
      "lignes": [{ "texte": "Alt + clic", "style": "accent" }],
      "voix": "Numéro deux : Alt et clic. Tu poses un curseur supplémentaire où tu veux, et tu écris à plusieurs endroits en même temps."
    },
    {
      "tag": "ASTUCE N°3",
      "lignes": [{ "texte": "Ctrl + P", "style": "gros" }, { "texte": "ouvre n'importe quel fichier", "style": "accent" }],
      "voix": "Numéro trois : Contrôle P. Tape quelques lettres du nom d'un fichier et il s'ouvre aussitôt. Plus besoin de parcourir l'arborescence à la souris. Essaie les trois aujourd'hui, tu ne reviendras pas en arrière."
    }
  ]
}
```
