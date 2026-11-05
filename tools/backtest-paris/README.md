# backtest-paris

Rejoue des stratégies de paris (**foot** 1X2 et **tennis** ATP/WTA) sur plusieurs saisons passées, **avec de l'argent fictif**, et dit honnêtement si une stratégie gagne, perd, ou si le résultat ne se distingue pas du hasard. Les données (résultats + cotes de plusieurs bookmakers) viennent gratuitement de [football-data.co.uk](https://www.football-data.co.uk) et [tennis-data.co.uk](https://www.tennis-data.co.uk) : **usage privé uniquement**, comme le demandent ces sites.

Python 3.13, **aucune dépendance** (bibliothèque standard uniquement).

## Installation

```powershell
Set-Location (Join-Path $HOME 'dev\automatisations\tools\backtest-paris')
Copy-Item .env.example .env      # facultatif : tout a une valeur par défaut
py main.py telecharger           # ~25 fichiers CSV, quelques Mo
```

## Tennis

Le site demande de ne pas aspirer ses fichiers automatiquement : on les télécharge à la main, l'outil s'occupe du reste.

1. Sur [tennis-data.co.uk/alldata.php](https://www.tennis-data.co.uk/alldata.php), télécharge les années voulues pour l'ATP et/ou la WTA (un fichier Excel par année, ex. 2021 à 2025). Ne t'occupe pas des noms : Windows appellera le second `2024 (1).xlsx`, ce n'est pas grave.
2. Range-les automatiquement :
   ```powershell
   py main.py importer-tennis              # cherche dans Téléchargements, copie vers data\tennis\ATP_2024.xlsx...
   py main.py importer-tennis --dry-run    # pour voir avant
   ```
   L'outil reconnaît tout seul ATP/WTA et l'année, ignore les autres fichiers Excel, ne supprime rien, et remplace un fichier par sa version plus récente (la saison en cours est mise à jour chaque semaine).
3. Lance : `py main.py lancer --sport tennis --ouvrir`

Particularités : les abandons et forfaits sont exclus (chaque bookmaker les règle différemment) ; les joueurs sont rangés par ordre alphabétique pour que le vainqueur ne soit jamais « le joueur 1 » ; il n'y a pas de cotes de clôture séparées, donc pas de CLV au tennis.

## Utilisation

```powershell
py main.py lancer --ouvrir                          # réglages du .env, ouvre le rapport HTML
py main.py lancer --cotes max                       # « si j'avais toujours la meilleure cote du marché »
py main.py lancer --cotes avg --decote 0.05         # plus proche d'un bookmaker français
py main.py lancer --strategies poisson --mise kelly
py main.py lancer --ligues F1 --saisons 2324,2425
py main.py lancer --sport tennis --ligues ATP --saisons 2024,2025
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
| `elo` (tennis) | Classement Elo de chaque joueur, général et par surface, mis à jour après chaque match | Le modèle de référence au tennis : simple, mais déjà assez bon. |
| `mixte` | Probabilités Pinnacle corrigées à 30 % par le modèle maison (`tirs` au foot, `elo` au tennis) | L'approche des parieurs qui ont un modèle : s'en servir pour ajuster le marché, pas pour s'y opposer. |

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
py tests\simul.py data_demo        # génère des saisons de foot fictives pour tester hors ligne
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
