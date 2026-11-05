"""Stratégies de paris 1X2.

Contrat : `choisir()` ne voit QUE le match à venir (équipes, cotes d'avant-match) et ce que la
stratégie a appris des matchs PRÉCÉDENTS. Le résultat et les statistiques du match (tirs...) ne
sont révélés qu'ensuite, via `apprendre()`. Les stratégies qui estiment des probabilités exposent
aussi `probas(match)`, utilisé pour mesurer la qualité de leurs prédictions face au marché.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from donnees import Cotes, ISSUES, Match

Probas = tuple[float, ...]  # 3 issues au foot, 2 au tennis


@dataclass
class Pari:
    issue: int                  # foot : 0 = domicile, 1 = nul, 2 = extérieur ; tennis : 0 / 1 = joueur 1 / 2
    proba: float | None = None  # probabilité estimée par la stratégie (None si elle n'en a pas)


def probas_sans_marge(cotes: Cotes) -> Probas:
    """Probabilités implicites, marge du bookmaker retirée (méthode proportionnelle)."""
    inv = [1 / c for c in cotes]
    total = sum(inv)
    return tuple(x / total for x in inv)


def marge(cotes: Cotes) -> float:
    """Marge du bookmaker : 0.05 = 5 % prélevés en moyenne sur chaque euro misé."""
    return sum(1 / c for c in cotes) - 1


def probas_score(lam_dom: float, lam_ext: float, rho: float = 0.0, max_buts: int = 10) -> Probas:
    """Probabilités 1/N/2 à partir des buts attendus (loi de Poisson).

    `rho` < 0 applique la correction de Dixon-Coles : Poisson pur sous-estime les 0-0 et 1-1,
    donc les nuls ; la correction redistribue un peu de probabilité vers ces petits scores.
    """
    pd = [math.exp(-lam_dom) * lam_dom ** k / math.factorial(k) for k in range(max_buts + 1)]
    pe = [math.exp(-lam_ext) * lam_ext ** k / math.factorial(k) for k in range(max_buts + 1)]
    h = d = a = 0.0
    for i, x in enumerate(pd):
        for j, y in enumerate(pe):
            p = x * y
            if i <= 1 and j <= 1 and rho:
                if i == 0 and j == 0:
                    p *= 1 - lam_dom * lam_ext * rho
                elif i == 0 and j == 1:
                    p *= 1 + lam_dom * rho
                elif i == 1 and j == 0:
                    p *= 1 + lam_ext * rho
                else:
                    p *= 1 - rho
            if i > j:
                h += p
            elif i == j:
                d += p
            else:
                a += p
    total = h + d + a
    return (h / total, d / total, a / total)


def _meilleur_avantage(probas: Probas, cotes: Cotes, seuil: float) -> Pari | None:
    avantages = [p * c - 1 for p, c in zip(probas, cotes)]
    i = max(range(len(avantages)), key=lambda k: avantages[k])
    return Pari(i, probas[i]) if avantages[i] > seuil else None


class Strategie:
    nom = "base"
    description = ""

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:  # pragma: no cover
        raise NotImplementedError

    def apprendre(self, match: Match) -> None:
        """Appelé APRÈS le match, avec le résultat. Par défaut : rien à apprendre."""


class Favori(Strategie):
    nom = "favori"
    description = "Mise toujours sur l'issue la moins cotée. C'est la règle de mesure, pas une stratégie à suivre."

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:
        i = min(range(len(cotes)), key=lambda k: cotes[k])
        return Pari(i, None)


class ValuePinnacle(Strategie):
    nom = "value_pinnacle"
    description = ("Utilise les cotes Pinnacle (bookmaker « sharp ») comme vraies probabilités et mise "
                   "quand une cote disponible les dépasse d'au moins le seuil.")

    def __init__(self, seuil: float = 0.03):
        self.seuil = seuil

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:
        pinnacle = match.cotes.get("ps")
        if pinnacle is None:
            return None
        return _meilleur_avantage(probas_sans_marge(pinnacle), cotes, self.seuil)


# ── Modèles « maison » qui apprennent en continu ────────────────────────────

@dataclass
class _Equipe:
    attaque: float = 1.0   # production offensive / moyenne de la ligue (1 = moyen)
    defense: float = 1.0   # production concédée / moyenne de la ligue (1 = moyen, >1 = passoire)
    matchs: int = 0


@dataclass
class _Ligue:
    buts_dom: float = 1.5   # buts moyens à domicile (échelle des buts attendus)
    buts_ext: float = 1.2
    mes_dom: float = 1.5    # moyenne de la mesure utilisée (buts, ou mélange tirs cadrés/buts)
    mes_ext: float = 1.2
    buts_total: float = 2.7  # pour estimer la conversion buts / tir cadré
    cadres_total: float = 9.0
    matchs: int = 0

    @property
    def conversion(self) -> float:
        return self.buts_total / self.cadres_total if self.cadres_total > 0 else 0.3


class ModeleForces(Strategie):
    """Force d'attaque et de défense de chaque équipe, mise à jour après CHAQUE match
    (moyennes pondérées : les matchs récents comptent plus), puis loi de Poisson corrigée."""

    utilise_tirs = False

    def __init__(self, seuil: float = 0.05, demi_vie: float = 20, min_matchs: int = 8,
                 min_matchs_ligue: int = 60, rho: float = -0.10, poids_tirs: float = 0.7):
        self.seuil = seuil
        self.alpha = 1 - 0.5 ** (1 / demi_vie)
        self.alpha_ligue = 0.01
        self.min_matchs = min_matchs
        self.min_matchs_ligue = min_matchs_ligue
        self.rho = rho
        self.poids_tirs = poids_tirs
        self.ligues: dict[str, _Ligue] = {}
        self.equipes: dict[tuple[str, str], _Equipe] = {}

    def _mesures(self, match: Match, lg: _Ligue) -> tuple[float, float]:
        """Production offensive de chaque équipe sur ce match, en « équivalent buts »."""
        if not self.utilise_tirs or not match.stats:
            return float(match.buts_dom), float(match.buts_ext)
        # Les tirs cadrés reflètent mieux la qualité de jeu que les buts (beaucoup plus de hasard).
        xg_dom = match.stats["cadres_dom"] * lg.conversion
        xg_ext = match.stats["cadres_ext"] * lg.conversion
        w = self.poids_tirs
        return w * xg_dom + (1 - w) * match.buts_dom, w * xg_ext + (1 - w) * match.buts_ext

    def probas(self, match: Match) -> Probas | None:
        if match.sport != "foot":
            return None
        lg = self.ligues.get(match.ligue)
        dom = self.equipes.get((match.ligue, match.domicile))
        ext = self.equipes.get((match.ligue, match.exterieur))
        if lg is None or dom is None or ext is None:
            return None
        if lg.matchs < self.min_matchs_ligue or dom.matchs < self.min_matchs or ext.matchs < self.min_matchs:
            return None
        lam_dom = lg.buts_dom * dom.attaque * ext.defense
        lam_ext = lg.buts_ext * ext.attaque * dom.defense
        return probas_score(lam_dom, lam_ext, self.rho)

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:
        p = self.probas(match)
        return None if p is None else _meilleur_avantage(p, cotes, self.seuil)

    def apprendre(self, match: Match) -> None:
        if match.sport != "foot":
            return
        lg = self.ligues.setdefault(match.ligue, _Ligue())
        dom = self.equipes.setdefault((match.ligue, match.domicile), _Equipe())
        ext = self.equipes.setdefault((match.ligue, match.exterieur), _Equipe())
        md, me = self._mesures(match, lg)
        a = self.alpha
        # Ratios calculés avec les moyennes de ligue AVANT mise à jour.
        dom.attaque += a * (md / lg.mes_dom - dom.attaque)
        dom.defense += a * (me / lg.mes_ext - dom.defense)
        ext.attaque += a * (me / lg.mes_ext - ext.attaque)
        ext.defense += a * (md / lg.mes_dom - ext.defense)
        dom.matchs += 1
        ext.matchs += 1

        al = self.alpha_ligue
        lg.buts_dom += al * (match.buts_dom - lg.buts_dom)
        lg.buts_ext += al * (match.buts_ext - lg.buts_ext)
        lg.mes_dom += al * (md - lg.mes_dom)
        lg.mes_ext += al * (me - lg.mes_ext)
        if match.stats:
            lg.buts_total += al * (match.buts_dom + match.buts_ext - lg.buts_total)
            lg.cadres_total += al * (match.stats["cadres_dom"] + match.stats["cadres_ext"] - lg.cadres_total)
        lg.matchs += 1


class Poisson(ModeleForces):
    nom = "poisson"
    description = ("Modèle maison sur les BUTS : force d'attaque/défense de chaque équipe, recalculée après "
                   "chaque match, puis loi de Poisson (avec correction des nuls). Mise si l'avantage estimé "
                   "dépasse le seuil.")
    utilise_tirs = False


class Tirs(ModeleForces):
    nom = "tirs"
    description = ("Même modèle, mais la forme des équipes est mesurée surtout par les TIRS CADRÉS "
                   "(70 %) plutôt que par les buts, qui dépendent beaucoup de la chance.")
    utilise_tirs = True


class Elo(Strategie):
    nom = "elo"
    description = ("Tennis : classement Elo de chaque joueur, général et par surface (terre, dur, gazon), mis à "
                   "jour après chaque match ; un joueur qui bat un mieux classé gagne beaucoup de points. "
                   "Mise si l'avantage estimé dépasse le seuil.")

    def __init__(self, seuil: float = 0.05, min_matchs: int = 10, poids_surface: float = 0.5,
                 min_matchs_surface: int = 5):
        self.seuil = seuil
        self.min_matchs = min_matchs
        self.poids_surface = poids_surface
        self.min_matchs_surface = min_matchs_surface
        self.general: dict[tuple[str, str], list[float]] = {}   # (circuit, joueur) -> [elo, nb matchs]
        self.surface: dict[tuple[str, str, str], list[float]] = {}

    @staticmethod
    def _k(n: float) -> float:
        # Gros ajustements pour les nouveaux joueurs, plus stables ensuite (méthode FiveThirtyEight).
        return 250 / (n + 5) ** 0.4

    def _note(self, m: Match, joueur: str) -> float | None:
        g = self.general.get((m.ligue, joueur))
        if g is None or g[1] < self.min_matchs:
            return None
        s = self.surface.get((m.ligue, m.contexte.get("surface", ""), joueur))
        if s is None or s[1] < self.min_matchs_surface:
            return g[0]
        return (1 - self.poids_surface) * g[0] + self.poids_surface * s[0]

    def probas(self, match: Match) -> Probas | None:
        if match.sport != "tennis":
            return None
        ra, rb = self._note(match, match.domicile), self._note(match, match.exterieur)
        if ra is None or rb is None:
            return None
        p = 1 / (1 + 10 ** ((rb - ra) / 400))
        return (p, 1 - p)

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:
        p = self.probas(match)
        return None if p is None else _meilleur_avantage(p, cotes, self.seuil)

    def _maj(self, table: dict, cle_a: tuple, cle_b: tuple, a_gagne: bool) -> None:
        a = table.setdefault(cle_a, [1500.0, 0])
        b = table.setdefault(cle_b, [1500.0, 0])
        attendu = 1 / (1 + 10 ** ((b[0] - a[0]) / 400))
        score = 1.0 if a_gagne else 0.0
        a[0] += self._k(a[1]) * (score - attendu)
        b[0] -= self._k(b[1]) * (score - attendu)
        a[1] += 1
        b[1] += 1

    def apprendre(self, match: Match) -> None:
        if match.sport != "tennis":
            return
        a_gagne = match.resultat == "1"
        c, surf = match.ligue, match.contexte.get("surface", "")
        self._maj(self.general, (c, match.domicile), (c, match.exterieur), a_gagne)
        self._maj(self.surface, (c, surf, match.domicile), (c, surf, match.exterieur), a_gagne)


class Mixte(Strategie):
    nom = "mixte"
    description = ("Part des probabilités de Pinnacle (le marché le plus précis) et les corrige un peu avec un "
                   "modèle maison (« tirs » au foot, « elo » au tennis). Mise si l'avantage dépasse le seuil. "
                   "C'est l'approche des parieurs qui utilisent un modèle : s'en servir pour ajuster le marché, "
                   "pas pour s'y opposer.")

    def __init__(self, seuil: float = 0.03, poids_modele: float = 0.3):
        self.seuil = seuil
        self.poids = poids_modele
        self.modeles: dict[str, Strategie] = {"foot": Tirs(seuil=0), "tennis": Elo(seuil=0)}

    def probas(self, match: Match) -> Probas | None:
        pinnacle = match.cotes.get("ps")
        modele = self.modeles.get(match.sport)
        pm = modele.probas(match) if modele is not None else None  # type: ignore[attr-defined]
        if pinnacle is None or pm is None:
            return None
        marche = probas_sans_marge(pinnacle)
        w = self.poids
        return tuple(w * a + (1 - w) * b for a, b in zip(pm, marche))

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:
        p = self.probas(match)
        return None if p is None else _meilleur_avantage(p, cotes, self.seuil)

    def apprendre(self, match: Match) -> None:
        for modele in self.modeles.values():
            modele.apprendre(match)


DISPONIBLES = {cls.nom: cls for cls in (Favori, ValuePinnacle, Poisson, Tirs, Elo, Mixte)}
PAR_DEFAUT = {"foot": "favori,value_pinnacle,poisson,tirs,mixte", "tennis": "favori,value_pinnacle,elo,mixte"}


@dataclass
class Reglages:
    seuil_value: float = 0.03
    seuil_modele: float = 0.05
    seuil_mixte: float = 0.03
    poids_modele: float = 0.3


def construire(noms: list[str], r: Reglages | None = None) -> list[Strategie]:
    r = r or Reglages()
    inconnues = [n for n in noms if n not in DISPONIBLES]
    if inconnues:
        raise ValueError(f"Stratégie(s) inconnue(s) : {', '.join(inconnues)}. "
                         f"Disponibles : {', '.join(DISPONIBLES)}")
    fabriques = {
        "favori": Favori,
        "value_pinnacle": lambda: ValuePinnacle(r.seuil_value),
        "poisson": lambda: Poisson(r.seuil_modele),
        "tirs": lambda: Tirs(r.seuil_modele),
        "elo": lambda: Elo(r.seuil_modele),
        "mixte": lambda: Mixte(r.seuil_mixte, r.poids_modele),
    }
    return [fabriques[n]() for n in noms]


__all__ = ["Pari", "Strategie", "Favori", "ValuePinnacle", "Poisson", "Tirs", "Elo", "Mixte", "DISPONIBLES",
           "PAR_DEFAUT",
           "Reglages", "construire", "probas_sans_marge", "probas_score", "marge", "ISSUES"]
