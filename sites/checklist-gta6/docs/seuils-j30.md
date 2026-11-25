# Seuils de décision du jour 30

À figer **avant** la mise en ligne, à ne pas modifier après avoir vu les chiffres. J0 = jour de la mise en ligne ; bilan à J0 + 30 jours. Ce sont des paris de départ, pas des repères de marché.

## Mesures (Umami, liens UTM, Metricool)

Visites uniques, événement `secret_coche` (case cochée), visiteurs revenus sur 2 jours différents, inscriptions e-mail (si un formulaire existe un jour), clics UTM par réseau (`npm run utm`). Exporte les chiffres Metricool chaque dimanche : l'offre gratuite ne garde que 30 jours.

## Seuils

| # | Critère (30 jours) | Rouge | Orange | Vert |
|---|---|---|---|---|
| 1 | Visites uniques | < 300 | 300 à 1 499 | ≥ 1 500 |
| 2 | Cases cochées (`secret_coche`) | < 50 | 50 à 299 | ≥ 300 |
| 3 | Visiteurs revenus (% des uniques) | < 5 % | 5 à 14 % | ≥ 15 % |
| 4 | Inscriptions e-mail | < 15 | 15 à 74 | ≥ 75 |
| 5 | Clics UTM depuis TikTok + Instagram + YouTube | < 100 | 100 à 599 | ≥ 600 |
| 6 | Part du trafic hors Vice Radar (informatif) | < 10 % | 10 à 29 % | ≥ 30 % |

## Règle

- **Continuer et investir** : critère 1 vert, critère 2 au moins orange, au moins 3 verts sur les critères 1 à 5.
- **Arrêter ou mettre en pause** : critères 1 et 2 rouges. Le site reste en ligne (gratuit), on arrête d'y investir du temps.
- **Corriger puis retester 30 jours** : tous les autres cas ; on ne change qu'une variable, celle du critère le plus faible.

## Garde-fous

- Un pic d'un seul jour ne fait pas un vert : regarde la médiane hebdomadaire. Si une vidéo apporte plus de 50 % des visites, le critère est orange au plus.
- Exclus tes propres visites d'Umami (`localStorage.setItem('umami.disabled', 1)` ou le bouton des mentions légales) et note la date.
- Si Search Console n'affiche encore rien à J30, le critère 6 reste orange.
- Monétiser (pub, affiliation) change la situation : statut à trancher d'abord, règle Rockstar à clarifier, mentions légales complètes. Voir `docs/deploiement.md`.

## Relevé (à J7, J14, J21, J30)

Date | Visites uniques | Cases cochées | % revenus | Emails | Clics UTM TikTok | Instagram | YouTube | Vues TikTok (Metricool) | Part hors Vice Radar

Bilan J30 : critères 1 à 5 (vert/orange/rouge) · nombre de verts · décision · variable à changer.
