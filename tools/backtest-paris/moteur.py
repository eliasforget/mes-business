"""Simulation chronologique des paris et statistiques (aucun argent réel)."""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from datetime import datetime
from itertools import groupby

from donnees import ISSUES, Cotes, Match
from strategies import Strategie, marge, probas_sans_marge


@dataclass
class ParamsMise:
    mode: str = "fixe"            # "fixe" ou "kelly"
    mise: float = 10.0            # mise fixe en euros (mode fixe)
    fraction_kelly: float = 0.25  # Kelly fractionnel (mode kelly)
    mise_max_pct: float = 0.05    # plafond : jamais plus de 5 % de la bankroll sur un pari
    bankroll: float = 1000.0


@dataclass
class PariJoue:
    date: datetime
    ligue: str
    saison: str
    match: str
    issue: str
    cote: float
    proba: float | None
    mise: float
    gain: float          # gain NET (négatif si perdu)
    bankroll: float      # bankroll après le pari
    clv: float | None    # cote prise / cote « juste » de clôture - 1


@dataclass
class Qualite:
    """Qualité des probabilités d'un modèle, comparée au marché sur les MÊMES matchs (log-loss :
    plus c'est bas, meilleure est la prédiction)."""
    n: int = 0
    ll_modele: float = 0.0
    ll_pinnacle: float = 0.0
    n_cloture: int = 0
    ll_modele_c: float = 0.0
    ll_cloture: float = 0.0


@dataclass
class Resultat:
    strategie: Strategie
    paris: list[PariJoue] = field(default_factory=list)
    ruine: bool = False
    qualite: Qualite | None = None


def _cotes_effectives(cotes: Cotes, decote: float) -> Cotes:
    """Applique une décote (ex. 0.05 = cotes 5 % moins bonnes, comme chez un bookmaker FR)."""
    return tuple(max(1.01, c * (1 - decote)) for c in cotes)  # type: ignore[return-value]


def _clv(match: Match, issue: int, cote: float) -> float | None:
    cloture = match.cotes.get("ps_c") or match.cotes.get("avg_c")
    if cloture is None:
        return None
    juste = 1 / probas_sans_marge(cloture)[issue]
    return cote / juste - 1


def _mise(params: ParamsMise, bankroll: float, proba: float | None, cote: float) -> float:
    if params.mode == "kelly" and proba is not None:
        f = (proba * cote - 1) / (cote - 1)
        if f <= 0:
            return 0.0
        mise = min(bankroll * params.fraction_kelly * f, bankroll * params.mise_max_pct)
    else:
        # Mise fixe (aussi utilisée en mode kelly pour une stratégie sans probabilité, ex. favori).
        mise = params.mise
    return round(min(mise, bankroll), 2)


def simuler(matchs: list[Match], strategies: list[Strategie], source: str, params: ParamsMise,
            decote: float = 0.0, cote_min: float = 1.01, cote_max: float = 100.0
            ) -> tuple[list[Resultat], dict[str, float]]:
    """Rejoue les matchs dans l'ordre. Pour chaque journée : toutes les décisions d'abord
    (sans connaître aucun résultat du jour), puis révélation des résultats aux stratégies."""
    resultats = [Resultat(s, qualite=Qualite() if hasattr(s, "probas") else None) for s in strategies]
    bankrolls = [params.bankroll] * len(strategies)
    marges: list[float] = []
    sans_cote = 0

    for _, journee in groupby(matchs, key=lambda m: m.jour):
        journee = list(journee)

        for m in journee:
            brutes = m.cotes.get(source)
            if brutes is None:
                sans_cote += 1
                continue
            marges.append(marge(brutes))
            cotes = _cotes_effectives(brutes, decote)

            for k, (strat, res) in enumerate(zip(strategies, resultats)):
                if res.ruine:
                    continue
                pari = strat.choisir(m, cotes)
                if pari is None:
                    continue
                cote = cotes[pari.issue]
                if not cote_min <= cote <= cote_max:
                    continue
                mise = _mise(params, bankrolls[k], pari.proba, cote)
                if mise < 0.01:
                    continue
                gagne = ISSUES[pari.issue] == m.resultat
                gain = round(mise * (cote - 1), 2) if gagne else -mise
                bankrolls[k] = round(bankrolls[k] + gain, 2)
                res.paris.append(PariJoue(m.date, m.ligue, m.saison, m.libelle, ISSUES[pari.issue],
                                          cote, pari.proba, mise, gain, bankrolls[k],
                                          _clv(m, pari.issue, cote)))
                if bankrolls[k] < 0.01 or (params.mode == "fixe" and bankrolls[k] < params.mise):
                    res.ruine = True

        for m in journee:  # qualité des prédictions, toujours AVANT d'apprendre le résultat
            pinnacle, cloture = m.cotes.get("ps"), m.cotes.get("ps_c")
            if pinnacle is None:
                continue
            k = ISSUES.index(m.resultat)
            for strat, res in zip(strategies, resultats):
                if res.qualite is None:
                    continue
                p = strat.probas(m)  # type: ignore[attr-defined]
                if p is None:
                    continue
                q = res.qualite
                ll = -math.log(max(p[k], 1e-9))
                q.n += 1
                q.ll_modele += ll
                q.ll_pinnacle += -math.log(probas_sans_marge(pinnacle)[k])
                if cloture is not None:
                    q.n_cloture += 1
                    q.ll_modele_c += ll
                    q.ll_cloture += -math.log(probas_sans_marge(cloture)[k])

        for m in journee:  # les résultats du jour ne sont connus qu'ici
            for strat in strategies:
                strat.apprendre(m)

    infos = {
        "matchs": float(len(matchs)),
        "matchs_sans_cote": float(sans_cote),
        "marge_moyenne": statistics.fmean(marges) if marges else math.nan,
    }
    return resultats, infos


def qualite(res: Resultat) -> dict | None:
    q = res.qualite
    if q is None or q.n == 0:
        return None
    return {
        "n": q.n,
        "modele": q.ll_modele / q.n,
        "pinnacle": q.ll_pinnacle / q.n,
        "n_cloture": q.n_cloture,
        "modele_c": q.ll_modele_c / q.n_cloture if q.n_cloture else None,
        "cloture": q.ll_cloture / q.n_cloture if q.n_cloture else None,
    }


def statistiques(res: Resultat, bankroll_initiale: float) -> dict:
    paris = res.paris
    n = len(paris)
    if n == 0:
        return {"n": 0, "ruine": res.ruine, "qualite": qualite(res)}

    mises = sum(p.mise for p in paris)
    profit = sum(p.gain for p in paris)
    rendements = [p.gain / p.mise for p in paris]
    roi = profit / mises
    ecart = statistics.stdev(rendements) / math.sqrt(n) if n > 1 else None

    pic, dd_max = bankroll_initiale, 0.0
    serie, serie_max = 0, 0
    for p in paris:
        pic = max(pic, p.bankroll)
        dd_max = max(dd_max, (pic - p.bankroll) / pic if pic > 0 else 0)
        serie = serie + 1 if p.gain < 0 else 0
        serie_max = max(serie_max, serie)

    clvs = [p.clv for p in paris if p.clv is not None]
    par_saison: dict[str, dict] = {}
    for p in paris:
        s = par_saison.setdefault(p.saison, {"n": 0, "mises": 0.0, "profit": 0.0})
        s["n"] += 1
        s["mises"] += p.mise
        s["profit"] += p.gain
    for s in par_saison.values():
        s["roi"] = s["profit"] / s["mises"] if s["mises"] else 0.0

    return {
        "n": n,
        "gagnes": sum(1 for p in paris if p.gain > 0),
        "taux": sum(1 for p in paris if p.gain > 0) / n,
        "cote_moyenne": statistics.fmean(p.cote for p in paris),
        "mises": mises,
        "profit": profit,
        "roi": roi,
        "ic95": (roi - 1.96 * ecart, roi + 1.96 * ecart) if ecart is not None else None,
        "bankroll_finale": paris[-1].bankroll,
        "drawdown_max": dd_max,
        "serie_perdante_max": serie_max,
        "clv_moyen": statistics.fmean(clvs) if clvs else None,
        "clv_positif": sum(1 for c in clvs if c > 0) / len(clvs) if clvs else None,
        "par_saison": dict(sorted(par_saison.items())),
        "ruine": res.ruine,
        "qualite": qualite(res),
    }


def verdict_qualite(q: dict | None) -> str:
    if q is None:
        return ""
    f = lambda x: f"{x:.4f}".replace(".", ",")  # noqa: E731
    chiffres = f"(log-loss {f(q['modele'])} contre {f(q['pinnacle'])} sur {q['n']} matchs)"
    ecart = q["modele"] - q["pinnacle"]
    if ecart > 0.002:
        return (f" Prédictions moins précises que Pinnacle avant-match {chiffres} : le modèle ne bat pas le "
                "marché, ses « bonnes affaires » sont surtout ses erreurs.")
    if ecart > -0.002:
        return (f" Prédictions à peu près aussi précises que Pinnacle avant-match {chiffres} : pas d'avantage "
                "net sur le marché.")
    return (f" Prédictions plus précises que Pinnacle avant-match {chiffres} : c'est rare, vérifie que ça "
            "tient sur d'autres saisons et ligues avant d'y croire.")


def verdict(stats: dict) -> str:
    if stats["n"] < 100:
        return "Trop peu de paris (< 100) pour conclure quoi que ce soit." + verdict_qualite(stats.get("qualite"))
    bas, haut = stats["ic95"]
    if haut < 0:
        texte = "Perte nette, et ce n'est pas de la malchance : la stratégie perd structurellement."
    elif bas > 0:
        texte = ("Gain statistiquement significatif sur cet historique. Avant d'y croire : refais le test "
                 "sur d'autres saisons, avec une décote (cotes des bookmakers FR), et garde en tête qu'un "
                 "compte qui gagne se fait limiter.")
    else:
        texte = "Résultat indiscernable du hasard : l'intervalle de confiance contient 0."
    clv = stats.get("clv_moyen")
    if clv is not None:
        if clv > 0.01:
            texte += (" CLV positif : tu prends en moyenne de meilleures cotes que la clôture, c'est le meilleur "
                      "indice d'un vrai avantage.")
        elif clv < -0.01:
            texte += " CLV négatif : en moyenne, le marché finit par te donner tort."
        else:
            texte += " CLV proche de 0 : aucun avantage visible face au marché."
    if stats.get("ruine"):
        texte += " Bankroll ruinée en cours de route : les paris se sont arrêtés là."
    return texte + verdict_qualite(stats.get("qualite"))
