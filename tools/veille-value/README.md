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
```

Le journal `data\journal.csv` s'ouvre directement dans Excel : une ligne par pari fictif, avec la cote prise, la cote juste de Pinnacle, l'avantage annoncé et le résultat.

## Lancement automatique (une fois par jour)

```powershell
$dossier = Join-Path $HOME 'dev\automatisations\tools\veille-value'
$action  = New-ScheduledTaskAction -Execute (Get-Command py).Source -Argument 'main.py tout' -WorkingDirectory $dossier
$trigger = New-ScheduledTaskTrigger -Daily -At 11:40am
Register-ScheduledTask -TaskName 'veille-value' -TaskPath '\Automatisations\' -Action $action -Trigger $trigger `
  -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Force
```

Si le PC est éteint à 11 h 40, la tâche se lance au démarrage suivant. Les logs sont dans `logs\veille-value\` à la racine du dépôt. Pour arrêter : `Unregister-ScheduledTask -TaskName 'veille-value' -Confirm:$false`.

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
