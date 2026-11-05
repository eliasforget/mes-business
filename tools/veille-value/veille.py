"""Logique de la veille : repérer la value, tenir le journal des paris fictifs, les régler, faire le bilan."""
from __future__ import annotations

import csv
import math
import statistics
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timedelta, timezone
from pathlib import Path

NOMS_BOOKMAKERS = {
    "pinnacle": "Pinnacle", "betclic_fr": "Betclic", "winamax_fr": "Winamax", "unibet_fr": "Unibet",
    "pmu_fr": "PMU", "parionssport_fr": "Parions Sport", "netbet_fr": "NetBet",
}


def maintenant() -> datetime:
    return datetime.now(timezone.utc)


def lire_date(brut: str) -> datetime:
    return datetime.fromisoformat(brut.replace("Z", "+00:00"))


# ── Journal ────────────────────────────────────────────────────────────────

@dataclass
class PariFictif:
    id: str                 # evenement + issue : un seul pari par issue d'un match
    detecte_le: str
    sport: str
    evenement_id: str
    match: str
    debut: str              # heure du match (UTC, ISO)
    pari: str               # nom de l'issue : équipe, joueur ou « Draw »
    bookmaker: str
    cote: float
    proba_pinnacle: float   # probabilité « juste » (marge de Pinnacle retirée)
    avantage: float         # proba × cote - 1
    mise: float
    statut: str = "en_attente"   # en_attente, gagne, perdu, non_reglable
    gain: float = 0.0
    regle_le: str = ""

    @property
    def date_debut(self) -> datetime:
        return lire_date(self.debut)


def _texte(v: object) -> str:
    return f"{v:.4f}".rstrip("0").rstrip(".").replace(".", ",") if isinstance(v, float) else str(v)


def charger_journal(chemin: Path) -> list[PariFictif]:
    if not chemin.exists():
        return []
    paris = []
    types = {f.name: f.type for f in fields(PariFictif)}
    with chemin.open(encoding="utf-8-sig", newline="") as f:
        for ligne in csv.DictReader(f, delimiter=";"):
            valeurs = {}
            for nom, typ in types.items():
                brut = ligne.get(nom, "")
                valeurs[nom] = float(brut.replace(",", ".") or 0) if typ in ("float", float) else brut
            paris.append(PariFictif(**valeurs))
    return paris


def ecrire_journal(chemin: Path, paris: list[PariFictif]) -> None:
    """Écriture atomique (fichier temporaire puis remplacement) : jamais de journal à moitié écrit."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_suffix(".tmp")
    noms = [f.name for f in fields(PariFictif)]
    with tmp.open("w", encoding="utf-8-sig", newline="") as f:  # ';' + virgule décimale : Excel FR
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(noms)
        for p in paris:
            w.writerow([_texte(v) for v in asdict(p).values()])
    tmp.replace(chemin)


# ── Détection de la value ──────────────────────────────────────────────────

def _cotes_h2h(bookmaker: dict) -> tuple[dict[str, float], datetime | None]:
    for marche in bookmaker.get("markets", []):
        if marche.get("key") == "h2h":
            maj = marche.get("last_update") or bookmaker.get("last_update")
            cotes = {o["name"]: float(o["price"]) for o in marche.get("outcomes", []) if float(o.get("price", 0)) > 1}
            return cotes, (lire_date(maj) if maj else None)
    return {}, None


def chercher_value(evenements: list[dict], sport: str, books_fr: list[str], seuil: float, mise: float,
                   horizon: timedelta, age_max: timedelta, cote_min: float, cote_max: float,
                   instant: datetime | None = None) -> tuple[list[PariFictif], dict[str, int]]:
    """Compare chaque cote française à la probabilité « juste » de Pinnacle.

    Une seule ligne par issue : la meilleure cote parmi les bookmakers français.
    Ignore les matchs déjà commencés, trop lointains, et les cotes trop anciennes (souvent fausses).
    """
    t = instant or maintenant()
    compteur: dict = {"matchs": 0, "sans_pinnacle": 0, "cotes_perimees": 0, "value": 0,
                      "comparees": 0, "marche_different": 0, "meilleur_avantage": None}
    trouves: list[PariFictif] = []
    for ev in evenements:
        debut = lire_date(ev["commence_time"])
        if not t < debut <= t + horizon:
            continue
        compteur["matchs"] += 1
        par_book = {b["key"]: _cotes_h2h(b) for b in ev.get("bookmakers", [])}
        pin, maj_pin = par_book.get("pinnacle", ({}, None))
        if len(pin) < 2:
            compteur["sans_pinnacle"] += 1
            continue
        if maj_pin is None or t - maj_pin > age_max:
            compteur["cotes_perimees"] += 1
            continue
        total = sum(1 / c for c in pin.values())
        juste = {nom: (1 / c) / total for nom, c in pin.items()}

        for issue, p in juste.items():
            meilleure: tuple[float, str] | None = None
            for book in books_fr:
                cotes, maj = par_book.get(book, ({}, None))
                if not cotes:
                    continue
                if set(cotes) != set(pin):  # issues aux noms différents ou marché sans nul : on ignore
                    compteur["marche_different"] += 1
                    continue
                c = cotes[issue]
                if maj is None or t - maj > age_max:
                    continue
                if meilleure is None or c > meilleure[0]:
                    meilleure = (c, book)
            if meilleure is None:
                continue
            cote, book = meilleure
            avantage = p * cote - 1
            compteur["comparees"] += 1
            if compteur["meilleur_avantage"] is None or avantage > compteur["meilleur_avantage"]:
                compteur["meilleur_avantage"] = avantage
            if avantage > seuil and cote_min <= cote <= cote_max:
                compteur["value"] += 1
                trouves.append(PariFictif(
                    id=f"{ev['id']}|{issue}", detecte_le=t.isoformat(timespec="seconds"), sport=sport,
                    evenement_id=ev["id"], match=f"{ev.get('home_team', '?')} - {ev.get('away_team', '?')}",
                    debut=debut.isoformat(), pari=issue, bookmaker=book, cote=cote,
                    proba_pinnacle=round(p, 4), avantage=round(avantage, 4), mise=mise))
    return trouves, compteur


# ── Règlement ──────────────────────────────────────────────────────────────

def vainqueur(score: dict) -> str | None:
    """Nom du vainqueur, « Draw » pour un nul, None si pas (encore) de résultat exploitable."""
    if not score.get("completed") or not score.get("scores"):
        return None
    try:
        points = {s["name"]: float(s["score"]) for s in score["scores"]}
    except (KeyError, TypeError, ValueError):
        return None
    if len(points) != 2:
        return None
    (a, pa), (b, pb) = points.items()
    if pa == pb:
        return "Draw"
    return a if pa > pb else b


def regler(paris: list[PariFictif], scores: dict[str, dict], instant: datetime | None = None,
           delai_abandon: timedelta = timedelta(days=3)) -> int:
    """Règle les paris en attente dont le score est connu. Renvoie le nombre de paris réglés.
    Au-delà de 3 jours sans résultat (limite de l'API), le pari passe en « non_reglable » (ni gagné ni perdu)."""
    t = instant or maintenant()
    n = 0
    for p in paris:
        if p.statut != "en_attente":
            continue
        gagnant = vainqueur(scores[p.evenement_id]) if p.evenement_id in scores else None
        if gagnant is not None:
            p.statut = "gagne" if gagnant == p.pari else "perdu"
            p.gain = round(p.mise * (p.cote - 1), 2) if p.statut == "gagne" else -p.mise
            p.regle_le = t.isoformat(timespec="seconds")
            n += 1
        elif t - p.date_debut > delai_abandon:
            p.statut = "non_reglable"
            p.regle_le = t.isoformat(timespec="seconds")
            n += 1
    return n


def sports_a_regler(paris: list[PariFictif], instant: datetime | None = None,
                    duree_match: timedelta = timedelta(hours=3)) -> list[str]:
    """Sports ayant au moins un pari en attente dont le match devrait être fini (évite de gaspiller des crédits)."""
    t = instant or maintenant()
    return sorted({p.sport for p in paris if p.statut == "en_attente" and t - p.date_debut > duree_match})


# ── Historique des scans ───────────────────────────────────────────────────

CHAMPS_SCANS = ["date", "sport", "matchs", "cotes_comparees", "marche_different", "value", "meilleur_avantage"]


def ajouter_scans(chemin: Path, lignes: list[dict]) -> None:
    """Ajoute une ligne par compétition scannée : permet de voir si les cotes FR s'approchent de Pinnacle."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    nouveau = not chemin.exists()
    with chemin.open("a", encoding="utf-8-sig" if nouveau else "utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CHAMPS_SCANS, delimiter=";", lineterminator="\n")
        if nouveau:
            w.writeheader()
        for l in lignes:
            w.writerow({k: _texte(l.get(k, "")) if l.get(k) is not None else "" for k in CHAMPS_SCANS})


def charger_scans(chemin: Path) -> list[dict]:
    if not chemin.exists():
        return []
    with chemin.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def resume_scans(scans: list[dict]) -> dict | None:
    if not scans:
        return None
    nombre = lambda v: float(v.replace(",", ".")) if v else None  # noqa: E731
    meilleurs = [m for s in scans if (m := nombre(s.get("meilleur_avantage", ""))) is not None]
    jours = sorted({s["date"][:10] for s in scans})
    return {
        "jours": len(jours), "premier": jours[0], "dernier": jours[-1],
        "matchs": int(sum(nombre(s["matchs"]) or 0 for s in scans)),
        "comparees": int(sum(nombre(s["cotes_comparees"]) or 0 for s in scans)),
        "marche_different": int(sum(nombre(s["marche_different"]) or 0 for s in scans)),
        "value": int(sum(nombre(s["value"]) or 0 for s in scans)),
        "meilleur": max(meilleurs) if meilleurs else None,
        "mediane_meilleurs": statistics.median(meilleurs) if meilleurs else None,
    }


# ── Bilan ──────────────────────────────────────────────────────────────────

def bilan(paris: list[PariFictif]) -> dict:
    regles = [p for p in paris if p.statut in ("gagne", "perdu")]
    res = {
        "total": len(paris),
        "en_attente": sum(1 for p in paris if p.statut == "en_attente"),
        "non_reglables": sum(1 for p in paris if p.statut == "non_reglable"),
        "regles": len(regles),
    }
    if not regles:
        return res
    mises = sum(p.mise for p in regles)
    profit = sum(p.gain for p in regles)
    rendements = [p.gain / p.mise for p in regles]
    roi = profit / mises
    ecart = statistics.stdev(rendements) / math.sqrt(len(regles)) if len(regles) > 1 else None
    attendu = statistics.fmean(p.avantage for p in regles)
    par_book: dict[str, dict] = {}
    for p in regles:
        b = par_book.setdefault(NOMS_BOOKMAKERS.get(p.bookmaker, p.bookmaker), {"n": 0, "mises": 0.0, "profit": 0.0})
        b["n"] += 1
        b["mises"] += p.mise
        b["profit"] += p.gain
    for b in par_book.values():
        b["roi"] = b["profit"] / b["mises"]
    res.update({
        "gagnes": sum(1 for p in regles if p.statut == "gagne"),
        "mises": mises, "profit": profit, "roi": roi,
        "ic95": (roi - 1.96 * ecart, roi + 1.96 * ecart) if ecart is not None else None,
        "avantage_moyen_annonce": attendu,
        "cote_moyenne": statistics.fmean(p.cote for p in regles),
        "par_bookmaker": dict(sorted(par_book.items(), key=lambda kv: -kv[1]["n"])),
        "premier": min(p.detecte_le for p in regles)[:10],
    })
    return res


def verdict(b: dict) -> str:
    n = b.get("regles", 0)
    if n < 100:
        return (f"{n} paris réglés : beaucoup trop peu pour conclure (il en faut plusieurs centaines). "
                "Laisse tourner et ne mise surtout pas d'argent réel d'ici là.")
    bas, haut = b["ic95"]
    if bas > 0:
        return ("Gain significatif sur des matchs que l'outil ne connaissait pas à l'avance : c'est un vrai signal. "
                "Vérifie que ça tient encore quelques semaines et que tes comptes ne sont pas limités.")
    if haut < 0:
        return "Perte nette, pas due au hasard : les cotes françaises ne battent pas Pinnacle. Arrête l'expérience."
    return ("Résultat indiscernable du hasard pour l'instant. Si le ROI reste proche de l'avantage annoncé, "
            "continue ; s'il en est loin, la value détectée est surtout du bruit (cotes Pinnacle en retard...).")


# ── Bilan au format Markdown (BILAN.md lisible sur GitHub) ─────────────────

def _pct(x: float | None) -> str:
    return "-" if x is None else f"{x * 100:+.1f} %".replace(".", ",")


def _eur(x: float) -> str:
    return f"{x:,.2f} €".replace(",", " ").replace(".", ",")


def bilan_markdown(paris: list[PariFictif], scans: dict | None, genere_le: datetime | None = None) -> str:
    b = bilan(paris)
    t = (genere_le or maintenant()).astimezone()
    l = [f"# Bilan veille-value", "", f"_Mis à jour le {t:%d/%m/%Y à %H:%M}. Paris fictifs, aucun argent réel._", ""]

    l += ["## Ce que montrent les scans", ""]
    if scans:
        l += [f"- **{scans['jours']} jour(s)** de veille (du {scans['premier']} au {scans['dernier']}), "
              f"**{scans['matchs']} match(s)** scanné(s), **{scans['comparees']} cotes françaises** comparées à Pinnacle.",
              f"- Meilleur écart jamais vu entre la meilleure cote française et la cote juste de Pinnacle : "
              f"**{_pct(scans['meilleur'])}** (écart typique du meilleur cas de chaque scan : {_pct(scans['mediane_meilleurs'])}).",
              f"- Paris fictifs déclenchés : **{scans['value']}**."]
        if scans["comparees"] == 0 and scans["matchs"] > 0:
            l.append("- ⚠️ Aucune cote comparée alors que des matchs ont été scannés : problème de données à vérifier.")
        if scans["marche_different"]:
            l.append(f"- {scans['marche_different']} cotes ignorées car leurs issues ne correspondaient pas à celles de Pinnacle.")
        if scans["meilleur"] is not None and scans["meilleur"] <= 0:
            l.append("- **Lecture :** jusqu'ici, aucune cote française n'a jamais dépassé la cote juste de Pinnacle. "
                     "Si ça reste vrai pendant 2 à 3 semaines, la réponse est claire : pas de value chez les bookmakers français.")
    else:
        l.append("Aucun scan enregistré pour l'instant.")

    l += ["", "## Résultat des paris fictifs", "",
          f"{b['total']} paris au total : {b['regles']} réglés, {b['en_attente']} en attente, {b['non_reglables']} sans résultat.", ""]
    if b["regles"]:
        ic = f"{_pct(b['ic95'][0])} à {_pct(b['ic95'][1])}" if b["ic95"] else "-"
        l += ["| Indicateur | Valeur |", "|---|---|",
              f"| Paris gagnés | {b['gagnes']} / {b['regles']} |",
              f"| Cote moyenne | {b['cote_moyenne']:.2f} |".replace(".", ","),
              f"| Misé / profit | {_eur(b['mises'])} / {_eur(b['profit'])} |",
              f"| **ROI** | **{_pct(b['roi'])}** |",
              f"| Fourchette de confiance 95 % | {ic} |",
              f"| Avantage moyen annoncé | {_pct(b['avantage_moyen_annonce'])} |", "",
              "| Bookmaker | Paris | ROI |", "|---|---|---|"]
        l += [f"| {nom} | {d['n']} | {_pct(d['roi'])} |" for nom, d in b["par_bookmaker"].items()]
        l.append("")
    l += [f"**Verdict :** {verdict(b)}", ""]

    derniers = sorted(paris, key=lambda p: p.detecte_le, reverse=True)[:20]
    if derniers:
        l += ["## Derniers paris fictifs", "", "| Match (UTC) | Pari | Cote | Bookmaker | Avantage | Statut |", "|---|---|---|---|---|---|"]
        for p in derniers:
            statut = {"gagne": f"✅ {_eur(p.gain)}", "perdu": f"❌ {_eur(p.gain)}", "en_attente": "⏳",
                      "non_reglable": "—"}.get(p.statut, p.statut)
            cote = f"{p.cote:.2f}".replace(".", ",")
            l.append(f"| {p.debut[:16].replace('T', ' ')} {p.match} | {p.pari} | {cote} | "
                     f"{NOMS_BOOKMAKERS.get(p.bookmaker, p.bookmaker)} | {_pct(p.avantage)} | {statut} |")
    return "\n".join(l) + "\n"
