# backtest-paris

Rejoue des stratégies de paris foot 1X2 sur plusieurs saisons passées, **avec de l'argent fictif**, et dit honnêtement si une stratégie gagne, perd, ou si le résultat ne se distingue pas du hasard. Les données (résultats + cotes de plusieurs bookmakers) viennent gratuitement de [football-data.co.uk](https://www.football-data.co.uk).

Python 3.13, **aucune dépendance** (bibliothèque standard uniquement).

## Installation

```powershell
Set-Location (Join-Path $HOME 'dev\automatisations\tools\backtest-paris')
Copy-Item .env.example .env      # facultatif : tout a une valeur par défaut
py main.py telecharger           # ~25 fichiers CSV, quelques Mo
```

## Utilisation

```powershell
py main.py lancer --ouvrir                          # réglages du .env, ouvre le rapport HTML
py main.py lancer --cotes max                       # « si j'avais toujours la meilleure cote du marché »
py main.py lancer --cotes avg --decote 0.05         # plus proche d'un bookmaker français
py main.py lancer --strategies poisson --mise kelly
py main.py lancer --ligues F1 --saisons 2324,2425
py main.py telecharger --ligues F2 --saisons 2425 --dry-run
```

Chaque lancement crée `resultats\AAAA-MM-JJ_HHMMSS\` avec :
- `rapport.html` : courbe de bankroll, tableau des résultats, ROI par saison, verdict ;
- `paris_<stratégie>.csv` : chaque pari (s'ouvre directement dans Excel).

## Les stratégies

| Nom | Idée | Ce qu'elle t'apprend |
|---|---|---|
| `favori` | Toujours parier l'issue la moins cotée | La règle de mesure : on perd à peu près la marge du bookmaker. |
| `value_pinnacle` | Pinnacle (bookmaker « sharp ») donne les vraies probabilités ; on parie quand une autre cote les dépasse | La seule approche avec un avantage documenté, à condition d'avoir accès aux meilleures cotes. |
| `poisson` | Modèle maison sur les **buts** : force d'attaque/défense par équipe, recalculée après chaque match, loi de Poisson corrigée pour les nuls (Dixon-Coles) | Battre le marché avec son propre modèle est très difficile. |
| `tirs` | Même modèle, mais la forme est mesurée surtout par les **tirs cadrés** (70 %), moins soumis à la chance que les buts | Une meilleure donnée améliore les prédictions… suffit-il pour battre le marché ? |
| `mixte` | Probabilités Pinnacle corrigées à 30 % par le modèle `tirs` | L'approche des parieurs qui ont un modèle : s'en servir pour ajuster le marché, pas pour s'y opposer. |

Les modèles **apprennent en continu** : après chaque journée, ils intègrent les résultats et les stats des matchs joués, et les matchs récents comptent plus que les anciens. Ils ne voient jamais le résultat d'un match avant d'avoir décidé.

Pour ajouter une stratégie : une classe dans `strategies.py` avec `choisir(match, cotes)` (ne voit que l'avant-match), éventuellement `apprendre(match)` (résultat et stats révélés après) et `probas(match)` (pour la mesure de qualité), puis l'enregistrer dans `DISPONIBLES` et `construire()`.

## Lire le rapport

- **ROI** = profit / total misé. Un ROI de +3 % veut dire 3 € gagnés pour 100 € misés au total.
- **IC 95 %** : fourchette plausible du « vrai » ROI. **S'il contient 0, tu ne peux pas distinguer la stratégie de la chance**, même si la courbe monte.
- **CLV** (closing line value) : ta cote comparée à la cote « juste » de clôture de Pinnacle. Un CLV positif et régulier est le meilleur signe d'un avantage réel. C'est l'indicateur que suivent les parieurs professionnels.
- **Drawdown** : plus forte chute depuis un sommet. Ça donne une idée de ce que tu devrais encaisser psychologiquement.
- **Qualité des prédictions (log-loss)** : compare les probabilités de chaque modèle à celles de Pinnacle, sur exactement les mêmes matchs. Plus c'est bas, mieux c'est. **C'est la question de fond** : un modèle qui prédit moins bien que le marché ne peut pas gagner sur la durée, quelle que soit la courbe.

## Limites (à garder en tête)

- Les cotes `avg` et `max` sont **meilleures** que celles des bookmakers français, dont le taux de retour aux joueurs est plafonné à 85 % en moyenne par l'ANJ. Utilise `--decote` pour t'en rapprocher.
- `max` = la meilleure cote parmi des dizaines de bookmakers, dont beaucoup ne sont pas accessibles en France.
- Les cotes « avant-match » sont relevées le vendredi (week-end) ou le mardi (semaine) : pas forcément celles que tu aurais eues au moment de parier.
- Un compte qui gagne régulièrement se fait limiter par les bookmakers.

## Tests

```powershell
py -m unittest discover -s tests -v
py tests\simul.py data_demo        # génère des saisons fictives pour tester hors ligne
```

Les tests vérifient notamment qu'**aucune stratégie ne voit le résultat d'un match du jour avant de décider** (pas de fuite du futur), les calculs (ROI, drawdown, Kelly, ruine, log-loss), la lecture des tirs, la correction des nuls, et que le modèle `tirs` prédit mieux que `poisson` quand les tirs portent de l'information.

## Mise à jour automatique des données (facultatif)

Rafraîchit les données de la saison en cours chaque lundi à 8 h (sans parier ni lancer de backtest) :

```powershell
$dossier = Join-Path $HOME 'dev\automatisations\tools\backtest-paris'
$action  = New-ScheduledTaskAction -Execute (Get-Command py).Source -Argument 'main.py telecharger' -WorkingDirectory $dossier
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 8am
Register-ScheduledTask -TaskName 'backtest-paris-donnees' -TaskPath '\Automatisations\' `
  -Action $action -Trigger $trigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Force
```

Pour suivre la saison en cours, ajoute-la à `SAISONS` (ex. `...,2526,2627`).
