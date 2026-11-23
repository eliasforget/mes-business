# automatisations

Petits outils d'automatisation pour mon PC perso (Windows 11). Chaque outil est autonome, fait une seule chose, se configure par `.env` et propose un `--dry-run` dès qu'il supprime, déplace ou envoie quelque chose.

## Catalogue des outils

| Outil | Ce qu'il fait | Langage | Lancement | Statut |
|-------|---------------|---------|-----------|--------|
| [backtest-paris](tools/backtest-paris) | Teste des stratégies de paris (foot, tennis) sur l'historique, en argent fictif | Python | Manuel (+ données foot le lundi) | ✅ |
| [veille-value](tools/veille-value) | Test à blanc : repère les cotes FR plus généreuses que Pinnacle sur les prochains matchs, règle les paris fictifs | Python | GitHub Actions quotidien (PC éteint) | 🧪 |
| [vr-video](tools/vr-video) | Vice Radar : Short 9:16 animé (accroche dès l'image 0, sous-titres karaoké, fonds qui changent) à partir d'un script JSON | TypeScript (Remotion) | Manuel (`.\rendu.cmd`) | 🧪 |
| [vr-voix](tools/vr-voix) | Vice Radar : voix off ElevenLabs + minutage par mot depuis le script de vr-video (sans redépense si rien n'a changé) | TypeScript | Manuel (`.\voix.cmd`) | 🧪 |
| [vr-fonds](tools/vr-fonds) | Vice Radar : clips Pixabay (verticaux, sinon 4K recadrés) choisis d'après les mots-clés des scènes, avec crédits | TypeScript | Manuel (`.\fonds.cmd`) | 🧪 |

Statuts : 🧪 en test · ✅ en service · 💤 en pause · 🗄️ archivé

## Structure

```
automatisations/
├── tools/              # un dossier par outil (README, .env.example, code)
│   └── <nom-outil>/
├── shared/             # utilitaires communs
│   ├── env.ts          # chargement .env + variables obligatoires
│   ├── logger.ts       # logs console + fichier
│   ├── index.ts
│   └── python/autoshared/   # mêmes utilitaires pour les outils Python (stdlib)
├── logs/               # créé automatiquement, non versionné
├── .env.example        # réglages communs (copier en .env)
├── package.json        # outillage TS (typecheck uniquement)
└── tsconfig.json
```

## Installation sur le PC

Prérequis : Node.js ≥ 22.6, Python 3.13 (pour les outils Python), Git.

```powershell
$dev = Join-Path $HOME 'dev'
New-Item -ItemType Directory -Force -Path $dev | Out-Null
Set-Location $dev
git clone https://github.com/eliasforget/automatisations.git
Set-Location automatisations

npm install                       # typescript + @types/node (dev uniquement)
Copy-Item .env.example .env       # puis ajuster si besoin
npm run typecheck                 # vérifie que tout compile
```

## Exécuter un outil TypeScript

Pas d'étape de build : Node exécute directement les `.ts` (type stripping).

```powershell
# Node 22.6 → 22.17 : flag nécessaire
node --experimental-strip-types --no-warnings=ExperimentalWarning tools\<nom-outil>\index.ts --dry-run

# Node ≥ 22.18 : plus besoin du flag
node tools\<nom-outil>\index.ts --dry-run
```

Contraintes du type stripping (vérifiées par `tsconfig.json`) : imports relatifs **avec l'extension `.ts`**, `import type` pour les types, pas d'`enum` ni de `namespace` ni de propriétés de paramètres dans les constructeurs.

## Exécuter un outil Python

Chaque outil Python a son propre environnement virtuel :

```powershell
Set-Location tools\<nom-outil>
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py --dry-run
```

## Utilitaires partagés

### `shared/env.ts`

Charge, dans cet ordre de priorité : variables déjà définies (session, Planificateur de tâches) > `.env` de l'outil > `.env` racine. Lève une erreur claire si une variable obligatoire manque.

```ts
import { loadEnv, envBool } from '../../shared/index.ts';

const env = loadEnv({
  toolDir: import.meta.dirname,
  required: ['SOURCE_DIR'],
  defaults: { MAX_FILES: '500' },
});
const dryRun = process.argv.includes('--dry-run') || envBool('DRY_RUN');
```

Sous Windows, mets les chemins entre guillemets doubles dans le `.env` : `SOURCE_DIR="C:\Users\moi\Downloads"`.

### `shared/logger.ts`

Console colorée + fichier `logs/<outil>/AAAA-MM-JJ.log`. Niveau via `LOG_LEVEL`, dossier via `LOG_DIR`.

```ts
import { createLogger } from '../../shared/index.ts';

const log = createLogger('mon-outil');   // appeler APRÈS loadEnv() pour prendre LOG_LEVEL en compte
log.info('Démarrage', { dryRun });
log.error('Échec', err);
```

### Côté Python : `shared/python/autoshared`

Même comportement (priorité des .env, format et dossier des logs), sans dépendance :

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared" / "python"))
from autoshared import load_env, get_logger, env_float

load_env(tool_dir=Path(__file__).parent, required=["SOURCE_DIR"], defaults={"MAX": "500"})
log = get_logger("mon-outil")
```

## Ajouter un outil

1. Créer `tools/<nom-outil>/` avec `index.ts` (ou `main.py`), `README.md`, `.env.example`.
2. Conventions : `--dry-run` pour toute action destructive, logs via `shared/logger.ts`, relançable sans casser (idempotent), aucun chemin ni secret en dur.
3. Ajouter une ligne au catalogue ci-dessus.
4. Si l'outil tourne tout seul : documenter la commande `schtasks` / `Register-ScheduledTask` dans son README.
