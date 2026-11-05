"""Téléchargement et lecture des CSV de football-data.co.uk (résultats + cotes 1X2)."""
from __future__ import annotations

import csv
import io
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

URL = "https://www.football-data.co.uk/mmz4281/{saison}/{ligue}.csv"
USER_AGENT = "automatisations-backtest/1.0 (usage perso, non commercial)"

LIGUES = {
    "F1": "Ligue 1", "F2": "Ligue 2", "E0": "Premier League", "E1": "Championship",
    "SP1": "LaLiga", "I1": "Serie A", "D1": "Bundesliga", "N1": "Eredivisie", "P1": "Liga Portugal",
}

# Colonnes 1X2 par source. Plusieurs alias possibles (les vieux fichiers utilisent BbAv/BbMx).
COLONNES: dict[str, list[tuple[str, str, str]]] = {
    "ps": [("PSH", "PSD", "PSA"), ("PH", "PD", "PA")],          # Pinnacle, avant-match
    "b365": [("B365H", "B365D", "B365A")],
    "avg": [("AvgH", "AvgD", "AvgA"), ("BbAvH", "BbAvD", "BbAvA")],  # moyenne du marché
    "max": [("MaxH", "MaxD", "MaxA"), ("BbMxH", "BbMxD", "BbMxA")],  # meilleure cote du marché
    "ps_c": [("PSCH", "PSCD", "PSCA")],                         # Pinnacle, clôture
    "b365_c": [("B365CH", "B365CD", "B365CA")],
    "avg_c": [("AvgCH", "AvgCD", "AvgCA")],
    "max_c": [("MaxCH", "MaxCD", "MaxCA")],
}
SOURCES_PARI = ("avg", "max", "b365", "ps")
ISSUES = ("H", "D", "A")

Cotes = tuple[float, ...]  # 3 cotes (1/N/2) au foot, 2 au tennis


@dataclass
class Match:
    ligue: str
    saison: str
    date: datetime
    domicile: str
    exterieur: str
    buts_dom: int
    buts_ext: int
    resultat: str  # foot : "H", "D" ou "A" ; tennis : "1" ou "2"
    cotes: dict[str, Cotes] = field(default_factory=dict)
    # Statistiques du match (révélées APRÈS le match) : tirs_dom, tirs_ext, cadres_dom, cadres_ext
    stats: dict[str, int] = field(default_factory=dict)
    sport: str = "foot"  # "foot" (1/N/2) ou "tennis" (joueur 1 / joueur 2)
    # Infos connues AVANT le match (tennis : surface, tournoi, tour...)
    contexte: dict[str, str] = field(default_factory=dict)

    @property
    def issues(self) -> tuple[str, ...]:
        return ISSUES if self.sport == "foot" else ("1", "2")

    def libelle_issue(self, i: int) -> str:
        if self.sport == "foot":
            return ISSUES[i]
        return (self.domicile, self.exterieur)[i]

    @property
    def jour(self) -> date:
        return self.date.date()

    @property
    def libelle(self) -> str:
        return f"{self.domicile} - {self.exterieur}"


def saison_courante(aujourd_hui: date | None = None) -> str:
    """Code football-data de la saison en cours, ex. 2627 pour 2026/27."""
    d = aujourd_hui or date.today()
    debut = d.year if d.month >= 7 else d.year - 1
    return f"{debut % 100:02d}{(debut + 1) % 100:02d}"


def chemin_fichier(dossier: Path, ligue: str, saison: str) -> Path:
    return dossier / f"{ligue}_{saison}.csv"


def telecharger(ligues: list[str], saisons: list[str], dossier: Path, log: logging.Logger,
                forcer: bool = False, dry_run: bool = False) -> int:
    """Télécharge les fichiers manquants. Renvoie le nombre d'erreurs."""
    dossier.mkdir(parents=True, exist_ok=True)
    en_cours = saison_courante()
    erreurs = 0
    premier = True

    for saison in saisons:
        for ligue in ligues:
            cible = chemin_fichier(dossier, ligue, saison)
            # La saison en cours grossit chaque semaine : on la rafraîchit si le fichier a plus de 12 h.
            perime = saison == en_cours and cible.exists() and time.time() - cible.stat().st_mtime > 12 * 3600
            if cible.exists() and not (forcer or perime):
                log.debug("Déjà présent : %s", cible.name)
                continue

            url = URL.format(saison=saison, ligue=ligue)
            if dry_run:
                log.info("[dry-run] téléchargerait %s -> %s", url, cible.name)
                continue

            if not premier:
                time.sleep(1.0)  # politesse envers le serveur
            premier = False

            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=30) as rep:
                    contenu = rep.read()
            except (urllib.error.URLError, TimeoutError) as err:
                log.error("Échec %s : %s", url, err)
                erreurs += 1
                continue

            if not contenu.lstrip(b"\xef\xbb\xbf").startswith(b"Div"):
                log.error("Contenu inattendu pour %s (pas un CSV football-data), ignoré.", url)
                erreurs += 1
                continue

            tmp = cible.with_suffix(".tmp")
            tmp.write_bytes(contenu)
            tmp.replace(cible)  # écriture atomique : jamais de fichier à moitié écrit
            log.info("Téléchargé %s %s (%s Ko)", LIGUES.get(ligue, ligue), saison, len(contenu) // 1024)

    return erreurs


def _cote(ligne: dict[str, str], col: str) -> float | None:
    brut = (ligne.get(col) or "").strip().replace(",", ".")
    try:
        valeur = float(brut)
    except ValueError:
        return None
    return valeur if valeur > 1.0 else None


def _lire_cotes(ligne: dict[str, str]) -> dict[str, Cotes]:
    trouvees: dict[str, Cotes] = {}
    for source, alias in COLONNES.items():
        for cols in alias:
            valeurs = [_cote(ligne, c) for c in cols]
            if all(v is not None for v in valeurs):
                trouvees[source] = (valeurs[0], valeurs[1], valeurs[2])  # type: ignore[assignment]
                break
    return trouvees


_STATS = {"tirs_dom": "HS", "tirs_ext": "AS", "cadres_dom": "HST", "cadres_ext": "AST"}


def _lire_stats(ligne: dict[str, str]) -> dict[str, int]:
    stats: dict[str, int] = {}
    for cle, col in _STATS.items():
        try:
            stats[cle] = int(float((ligne.get(col) or "").strip()))
        except ValueError:
            return {}  # stats incomplètes : on n'en garde aucune
    return stats


def _lire_date(ligne: dict[str, str]) -> datetime | None:
    brut = (ligne.get("Date") or "").strip()
    heure = (ligne.get("Time") or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            d = datetime.strptime(brut, fmt)
            break
        except ValueError:
            continue
    else:
        return None
    if len(heure) == 5 and heure[2] == ":":
        try:
            d = d.replace(hour=int(heure[:2]), minute=int(heure[3:]))
        except ValueError:
            pass
    return d


def lire_fichier(fichier: Path, ligue: str, saison: str) -> tuple[list[Match], int]:
    """Lit un CSV. Renvoie (matchs valides, nombre de lignes ignorées)."""
    brut = fichier.read_bytes()
    try:
        texte = brut.decode("utf-8-sig")
    except UnicodeDecodeError:
        texte = brut.decode("latin-1")

    matchs: list[Match] = []
    ignores = 0
    for ligne in csv.DictReader(io.StringIO(texte)):
        resultat = (ligne.get("FTR") or ligne.get("Res") or "").strip()
        dom, ext = (ligne.get("HomeTeam") or "").strip(), (ligne.get("AwayTeam") or "").strip()
        d = _lire_date(ligne)
        try:
            bd = int(ligne.get("FTHG") or ligne.get("HG") or "")
            be = int(ligne.get("FTAG") or ligne.get("AG") or "")
        except ValueError:
            bd = be = -1
        if resultat not in ISSUES or not dom or not ext or d is None or bd < 0:
            if any((v or "").strip() for v in ligne.values()):
                ignores += 1
            continue
        matchs.append(Match(ligue, saison, d, dom, ext, bd, be, resultat, _lire_cotes(ligne),
                            _lire_stats(ligne)))
    return matchs, ignores


def charger(dossier: Path, ligues: list[str], saisons: list[str], log: logging.Logger) -> list[Match]:
    """Charge tous les fichiers disponibles, triés chronologiquement."""
    tous: list[Match] = []
    manquants: list[str] = []
    for saison in saisons:
        for ligue in ligues:
            f = chemin_fichier(dossier, ligue, saison)
            if not f.exists():
                manquants.append(f.name)
                continue
            matchs, ignores = lire_fichier(f, ligue, saison)
            if ignores:
                log.debug("%s : %s lignes incomplètes ignorées", f.name, ignores)
            tous.extend(matchs)
    if manquants:
        log.warning("Fichiers absents (lance d'abord 'telecharger') : %s", ", ".join(manquants))
    tous.sort(key=lambda m: (m.date, m.ligue, m.domicile))
    return tous
