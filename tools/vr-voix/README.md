# vr-voix

Génère la voix off d'une vidéo Vice Radar avec ElevenLabs, directement depuis le `script.json` de `vr-video`. Écrit dans le dossier de la vidéo `voix.mp3` et `voix.alignement.json` (le minutage de chaque caractère), que `vr-video` utilise pour caler les scènes et les sous-titres mot par mot au centième de seconde.

TypeScript, aucune dépendance (fetch natif de Node).

## Installation

1. Clé API : elevenlabs.io > Profil > **API Keys** > Create.
2. Configuration :
   ```powershell
   Set-Location (Join-Path $HOME 'dev\automatisations\tools\vr-voix')
   Copy-Item .env.example .env
   notepad .env                  # colle ta clé dans ELEVENLABS_API_KEY
   .\voix.cmd --lister      # tes voix + crédits restants
   ```
3. Choisis une voix française : sur elevenlabs.io, **Voice Library** > filtre Français > « Add to my voices ». Relance `--lister`, copie son identifiant dans `ELEVENLABS_VOIX_ID`. Garde toujours la même voix : c'est l'identité sonore de la chaîne.

**Droits :** l'offre gratuite n'autorise pas l'usage commercial et demande de citer ElevenLabs (mets « Voix : ElevenLabs » en description). Pour une chaîne monétisée, il faut au moins l'offre Starter. L'outil le rappelle à chaque génération en offre gratuite.

## Utilisation

Dans PowerShell, passe par le lanceur `.\voix.cmd` : avec `npm run voix -- --dry-run`, PowerShell supprime le `--` et l'option partirait chez npm (l'outil la rattrape quand même, par sécurité).

```powershell
.\voix.cmd 05-nouvelle-video --dry-run   # texte lu + coût estimé, aucun crédit dépensé
.\voix.cmd 05-nouvelle-video             # génère voix.mp3 + voix.alignement.json
.\voix.cmd 05-nouvelle-video --forcer    # régénère (l'ancienne voix est gardée en voix.precedente.mp3)
npm test
```

Le nom suffit (`05-nouvelle-video`) : l'outil cherche dans `tools\vr-video\videos\`, puis dans les exemples. Un chemin complet marche aussi.

## Ce qui est lu

Les champs `voix` des scènes, mis bout à bout. Écris-les comme tu veux les entendre : chiffres en toutes lettres si la prononciation compte (« trois virgule soixante-dix-neuf milliards »), ponctuation pour les pauses.

## Économie de crédits

- Coût affiché avant chaque génération : 1 crédit par caractère en `multilingual_v2`, environ 300 à 500 pour un Short de 30 s.
- **Relancer ne coûte rien** si le texte, la voix et les réglages n'ont pas changé (empreinte dans `voix.meta.json`).
- Arrêt avant l'appel si les crédits restants ne suffisent pas.

## Suite

`vr-fonds` pour les clips de fond, puis `.\rendu.cmd videos\05-nouvelle-video` dans `vr-video`.
