"""Stratégies de paris 1X2.

Contrat : `choisir()` ne voit QUE le match à venir (équipes, cotes d'avant-match) et ce que la
stratégie a appris des matchs PRÉCÉDENTS. Le résultat n'est révélé qu'ensuite via `apprendre()`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from donnees import Cotes, ISSUES, Match


@dataclass
class Pari:
    issue: int                 # 0 = domicile, 1 = nul, 2 = extérieur
    proba: float | None = None  # probabilité estimée par la stratégie (None si elle n'en a pas)


def probas_sans_marge(cotes: Cotes) -> tuple[float, float, float]:
    """Probabilités implicites, marge du bookmaker retirée (méthode proportionnelle)."""
    inv = [1 / c for c in cotes]
    total = sum(inv)
    return (inv[0] / total, inv[1] / total, inv[2] / total)


def marge(cotes: Cotes) -> float:
    """Marge du bookmaker : 0.05 = 5 % prélevés en moyenne sur chaque euro misé."""
    return sum(1 / c for c in cotes) - 1


def _meilleur_avantage(probas: tuple[float, ...], cotes: Cotes, seuil: float) -> Pari | None:
    avantages = [p * c - 1 for p, c in zip(probas, cotes)]
    i = max(range(3), key=lambda k: avantages[k])
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
    description = "Mise toujours sur l'issue la moins cotée (référence naïve)."

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:
        i = min(range(3), key=lambda k: cotes[k])
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


@dataclass
class _Equipe:
    attaque: float = 1.0   # buts marqués / moyenne de la ligue (1 = moyen)
    defense: float = 1.0   # buts encaissés / moyenne de la ligue (1 = moyen, >1 = passoire)
    matchs: int = 0


@dataclass
class _Ligue:
    buts_dom: float = 1.5
    buts_ext: float = 1.2
    matchs: int = 0


class Poisson(Strategie):
    nom = "poisson"
    description = ("Modèle statistique maison : force d'attaque/défense de chaque équipe (moyennes "
                   "pondérées des matchs passés) -> loi de Poisson -> probabilités 1/N/2. Mise si "
                   "l'avantage estimé dépasse le seuil.")

    def __init__(self, seuil: float = 0.05, demi_vie: float = 20, min_matchs: int = 8,
                 min_matchs_ligue: int = 60, max_buts: int = 10):
        self.seuil = seuil
        self.alpha = 1 - 0.5 ** (1 / demi_vie)
        self.alpha_ligue = 0.01
        self.min_matchs = min_matchs
        self.min_matchs_ligue = min_matchs_ligue
        self.max_buts = max_buts
        self.ligues: dict[str, _Ligue] = {}
        self.equipes: dict[tuple[str, str], _Equipe] = {}

    def _equipe(self, ligue: str, nom: str) -> _Equipe:
        return self.equipes.setdefault((ligue, nom), _Equipe())

    def probas(self, match: Match) -> tuple[float, float, float] | None:
        lg = self.ligues.get(match.ligue)
        dom = self.equipes.get((match.ligue, match.domicile))
        ext = self.equipes.get((match.ligue, match.exterieur))
        if lg is None or dom is None or ext is None:
            return None
        if lg.matchs < self.min_matchs_ligue or dom.matchs < self.min_matchs or ext.matchs < self.min_matchs:
            return None

        lam_dom = lg.buts_dom * dom.attaque * ext.defense
        lam_ext = lg.buts_ext * ext.attaque * dom.defense
        pd = [math.exp(-lam_dom) * lam_dom ** k / math.factorial(k) for k in range(self.max_buts + 1)]
        pe = [math.exp(-lam_ext) * lam_ext ** k / math.factorial(k) for k in range(self.max_buts + 1)]
        h = d = a = 0.0
        for i, x in enumerate(pd):
            for j, y in enumerate(pe):
                if i > j:
                    h += x * y
                elif i == j:
                    d += x * y
                else:
                    a += x * y
        total = h + d + a
        return (h / total, d / total, a / total)

    def choisir(self, match: Match, cotes: Cotes) -> Pari | None:
        p = self.probas(match)
        return None if p is None else _meilleur_avantage(p, cotes, self.seuil)

    def apprendre(self, match: Match) -> None:
        lg = self.ligues.setdefault(match.ligue, _Ligue())
        dom = self._equipe(match.ligue, match.domicile)
        ext = self._equipe(match.ligue, match.exterieur)
        a = self.alpha
        # Ratios calculés avec les moyennes de ligue AVANT mise à jour.
        dom.attaque += a * (match.buts_dom / lg.buts_dom - dom.attaque)
        dom.defense += a * (match.buts_ext / lg.buts_ext - dom.defense)
        ext.attaque += a * (match.buts_ext / lg.buts_ext - ext.attaque)
        ext.defense += a * (match.buts_dom / lg.buts_dom - ext.defense)
        dom.matchs += 1
        ext.matchs += 1
        al = self.alpha_ligue
        lg.buts_dom += al * (match.buts_dom - lg.buts_dom)
        lg.buts_ext += al * (match.buts_ext - lg.buts_ext)
        lg.matchs += 1


DISPONIBLES = {cls.nom: cls for cls in (Favori, ValuePinnacle, Poisson)}


def construire(noms: list[str], seuil_value: float, seuil_poisson: float) -> list[Strategie]:
    inconnues = [n for n in noms if n not in DISPONIBLES]
    if inconnues:
        raise ValueError(f"Stratégie(s) inconnue(s) : {', '.join(inconnues)}. "
                         f"Disponibles : {', '.join(DISPONIBLES)}")
    res: list[Strategie] = []
    for n in noms:
        if n == "value_pinnacle":
            res.append(ValuePinnacle(seuil_value))
        elif n == "poisson":
            res.append(Poisson(seuil_poisson))
        else:
            res.append(DISPONIBLES[n]())
    return res


__all__ = ["Pari", "Strategie", "Favori", "ValuePinnacle", "Poisson", "DISPONIBLES", "construire",
           "probas_sans_marge", "marge", "ISSUES"]
