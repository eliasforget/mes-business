"""Génère des saisons FICTIVES au format football-data.co.uk, avec des probabilités « vraies » connues.

Sert aux tests : on sait exactement ce qu'un parieur devrait gagner ou perdre.
"""
from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path


def _poisson(rng: random.Random, lam: float) -> int:
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def _probas(lh: float, la: float) -> tuple[float, float, float]:
    ph = [math.exp(-lh) * lh ** k / math.factorial(k) for k in range(11)]
    pa = [math.exp(-la) * la ** k / math.factorial(k) for k in range(11)]
    h = sum(x * y for i, x in enumerate(ph) for j, y in enumerate(pa) if i > j)
    d = sum(x * y for i, x in enumerate(ph) for j, y in enumerate(pa) if i == j)
    a = sum(x * y for i, x in enumerate(ph) for j, y in enumerate(pa) if i < j)
    t = h + d + a
    return h / t, d / t, a / t


def _cotes(rng: random.Random, probas, marge: float, bruit: float) -> list[float]:
    perturbees = [p * math.exp(rng.gauss(0, bruit)) for p in probas]
    total = sum(perturbees)
    return [round(1 / (p / total * (1 + marge)), 2) for p in perturbees]


def generer(dossier: Path, ligue: str = "F1", saisons=("2122", "2223", "2324"), equipes: int = 20,
            graine: int = 42, date_fr_courte: bool = False) -> list[Path]:
    rng = random.Random(graine)
    dossier.mkdir(parents=True, exist_ok=True)
    noms = [f"Equipe{i:02d}" for i in range(equipes)]
    attaque = {n: math.exp(rng.gauss(0, 0.25)) for n in noms}
    defense = {n: math.exp(rng.gauss(0, 0.2)) for n in noms}
    fichiers = []

    for s_idx, saison in enumerate(saisons):
        debut = date(2000 + int(saison[:2]), 8, 10)
        calendrier = [(h, a) for h in noms for a in noms if h != a]
        rng.shuffle(calendrier)
        lignes = []
        par_journee = equipes // 2
        for k, (h, a) in enumerate(calendrier):
            jour = debut + timedelta(days=7 * (k // par_journee))
            lh, la = 1.45 * attaque[h] * defense[a], 1.15 * attaque[a] * defense[h]
            vraies = _probas(lh, la)
            bh, ba = _poisson(rng, lh), _poisson(rng, la)
            res = "H" if bh > ba else "D" if bh == ba else "A"
            ps = _cotes(rng, vraies, 0.025, 0.02)      # Pinnacle : faible marge, proche du vrai
            avg = _cotes(rng, vraies, 0.055, 0.04)     # moyenne du marché
            mx = _cotes(rng, vraies, 0.01, 0.05)       # meilleure cote : parfois au-dessus du juste
            psc = _cotes(rng, vraies, 0.025, 0.01)     # clôture Pinnacle
            fmt = "%d/%m/%y" if date_fr_courte else "%d/%m/%Y"
            lignes.append({
                "Div": ligue, "Date": jour.strftime(fmt), "Time": "20:00", "HomeTeam": h, "AwayTeam": a,
                "FTHG": bh, "FTAG": ba, "FTR": res,
                "PSH": ps[0], "PSD": ps[1], "PSA": ps[2],
                "AvgH": avg[0], "AvgD": avg[1], "AvgA": avg[2],
                "MaxH": mx[0], "MaxD": mx[1], "MaxA": mx[2],
                "PSCH": psc[0], "PSCD": psc[1], "PSCA": psc[2],
            })
        # Les forces évoluent un peu d'une saison à l'autre
        for n in noms:
            attaque[n] *= math.exp(rng.gauss(0, 0.08))
            defense[n] *= math.exp(rng.gauss(0, 0.08))
        f = dossier / f"{ligue}_{saison}.csv"
        with f.open("w", newline="", encoding="utf-8-sig") as out:
            w = csv.DictWriter(out, fieldnames=list(lignes[0].keys()))
            w.writeheader()
            w.writerows(lignes)
        fichiers.append(f)
    return fichiers


if __name__ == "__main__":
    import sys
    cible = Path(sys.argv[1] if len(sys.argv) > 1 else "data_demo")
    for f in generer(cible):
        print(f)
