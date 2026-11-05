# veille-value

Teste « à blanc », **sans miser d'argent**, si les bookmakers agréés en France (Betclic, Winamax, Unibet, PMU, Parions Sport, NetBet) proposent parfois des cotes plus généreuses que la cote « juste » de Pinnacle, le bookmaker le plus précis du marché. C'est la suite logique de `backtest-paris` : au tennis, la value existait sur les meilleures cotes du marché mais pas sur bet365, et l'historique ne contient aucune cote de bookmaker français. Seul un test sur les matchs à venir peut répondre.

Chaque jour :
1. **scanner** : récupère les cotes 1N2 des prochains matchs ; si la meilleure cote française dépasse la cote juste de Pinnacle d'au moins 3 %, l'outil note un **pari fictif** dans un journal ;
2. **regler** : quand le match est fini, récupère le score et marque le pari gagné ou perdu ;
3. **bilan** : ROI, fourchette de confiance à 95 %, détail par bookmaker, verdict.

Python 3.13, aucune dépendance. Données : [The Odds API](https://the-odds-api.com), plan gratuit.

## Installation

1. Crée une clé gratuite sur [the-odds-api.com](https://the-odds-api.com) (plan Starter, juste un e-mail, sans carte).
2. Configure :
   ```powershell
   Set-Location (Join-Path $HOME 'dev\automatisations\tools\veille-value')
   Copy-Item .env.example .env
   notepad .env        # colle ta clé dans ODDS_API_KEY=
   py main.py sports   # vérifie la clé (gratuit) et liste les compétitions disponibles
   ```

## Utilisation

```powershell
py main.py scanner --dry-run   # voir ce qui serait noté, sans rien écrire
py main.py tout                # scanner + regler + bilan
py main.py bilan               # gratuit : relit seulement le journal
py main.py bilan --markdown suivi\BILAN.md
```

Dans `suivi\` :
- `journal.csv` : une ligne par pari fictif (cote prise, cote juste de Pinnacle, avantage annoncé, résultat), s'ouvre dans Excel ;
- `scans.csv` : une ligne par compétition et par scan, avec le **meilleur écart** observé entre la meilleure cote française et la cote juste de Pinnacle. Même sans aucun pari, ça montre si les bookmakers français s'en approchent ou restent loin ;
- `BILAN.md` : le bilan lisible.

## Lancement automatique dans le cloud (recommandé : PC éteint)

Le workflow `.github/workflows/veille-value.yml` lance `tout` chaque jour à 11 h 40 (heure de Paris en hiver) sur les serveurs de GitHub, puis enregistre le journal et le bilan dans le dépôt. Pour un dépôt privé, ça consomme environ 1 minute par jour sur les 2 000 minutes gratuites mensuelles de GitHub.

1. Sur GitHub, ouvre ton dépôt > **Settings** > **Secrets and variables** > **Actions** > **New repository secret** : nom `ODDS_API_KEY`, valeur = ta clé.
2. Onglet **Actions** > **veille-value** > **Run workflow** pour un premier passage immédiat.
3. Le bilan est dans **`tools/veille-value/suivi/BILAN.md`** (lisible directement sur github.com ou dans l'appli GitHub), et dans le résumé de chaque exécution de l'onglet Actions.

Le dossier `suivi/` (journal, historique des scans, bilan) est versionné : fais un `git pull` avant de travailler en local, sinon ton `git push` sera refusé.

N'utilise pas en même temps la tâche planifiée Windows : les crédits seraient consommés deux fois et le journal se dédoublerait. Pour la supprimer :

```powershell
Unregister-ScheduledTask -TaskName 'veille-value' -TaskPath '\Automatisations\' -Confirm:$false
```

## Lire le résultat honnêtement

- **Il faut plusieurs centaines de paris réglés** avant de conclure. Avec 5 championnats, compte plusieurs semaines, voire quelques mois. Avant ça, le résultat est surtout du hasard.
- **Compare le ROI réel à l'« avantage moyen annoncé »** : si l'outil annonce +5 % et que le ROI tourne autour de -5 %, la value détectée est du bruit.
- **Les cotes Pinnacle de l'API viennent de son site public, avec un léger retard** : une partie de la « value » peut venir d'une cote Pinnacle en retard sur le marché. Le filtre `AGE_MAX_MINUTES` limite ce problème sans le supprimer.
- **Même si le test est positif**, en vrai : les bookmakers limitent vite les comptes qui gagnent, et le gain est proportionnel aux mises (à 10 € par pari, un avantage de 3 % rapporte environ 0,30 € par pari en moyenne).

## Crédits API (plan gratuit : 500 / mois)

| Appel | Coût |
|---|---|
| `scanner` | 1 crédit par compétition |
| `regler` | 2 crédits par compétition qui a un pari à régler |
| `bilan`, `sports` | gratuit |

L'outil lit le solde restant après chaque appel et s'arrête de lui-même avant de descendre sous `CREDITS_RESERVE`. La clé n'apparaît jamais dans les logs.

## Tennis

Possible en ajoutant des codes `tennis_...` dans `SPORTS` (voir `py main.py sports`), mais l'API ne fournit les scores que pour quelques tournois : les autres paris passeront en « sans résultat » au bout de 3 jours. La saison s'arrête mi-novembre et reprend en janvier.

## Tests

```powershell
py -m unittest discover -s tests -v
```

Aucun appel réseau : les réponses de l'API sont simulées. Les tests couvrent la détection (meilleure cote FR, cotes périmées, matchs commencés, marchés différents), le règlement, le journal, la réserve de crédits et l'absence de la clé dans les logs.
