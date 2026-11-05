"""Données tennis de tennis-data.co.uk (ATP / WTA, un fichier Excel par saison).

Le site demande de ne pas aspirer ses fichiers avec des robots : on les télécharge À LA MAIN sur
https://www.tennis-data.co.uk/alldata.php, puis `importer()` les reconnaît dans le dossier
Téléchargements et les range dans data/tennis/ sous le nom ATP_2025.xlsx, WTA_2025.xlsx...

Lecture des .xlsx avec la bibliothèque standard (un .xlsx est un zip de fichiers XML).
"""
from __future__ import annotations

import logging
import shutil
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

from donnees import Match

PAGE = "https://www.tennis-data.co.uk/alldata.php"
CIRCUITS = ("ATP", "WTA")
_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

# Cotes du vainqueur (W) et du perdant (L) par source. Notes du site : ce sont les dernières cotes
# avant le match, il n'y a donc pas de cotes de clôture séparées (pas de CLV au tennis).
COLONNES = {"ps": ("PSW", "PSL"), "b365": ("B365W", "B365L"), "avg": ("AvgW", "AvgL"), "max": ("MaxW", "MaxL")}


# ── Lecture xlsx minimale ──────────────────────────────────────────────────

def _index_colonne(ref: str) -> int:
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def _premiere_feuille(z: zipfile.ZipFile) -> str:
    try:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        sheet = next(wb.iter(f"{_NS}sheet"))
        rid = sheet.get(f"{_NS_REL}id")
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        for rel in rels:
            if rel.get("Id") == rid:
                cible = rel.get("Target", "").lstrip("/")
                return cible if cible.startswith("xl/") else f"xl/{cible}"
    except (KeyError, StopIteration, ET.ParseError):
        pass
    return "xl/worksheets/sheet1.xml"


def lire_xlsx(chemin: Path) -> list[dict[str, str]]:
    """Première feuille d'un .xlsx -> liste de dicts {en-tête: valeur texte}."""
    with zipfile.ZipFile(chemin) as z:
        partagees: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{_NS}si"):
                partagees.append("".join(t.text or "" for t in si.iter(f"{_NS}t")))
        feuille = ET.fromstring(z.read(_premiere_feuille(z)))

    lignes: list[dict[int, str]] = []
    for row in feuille.iter(f"{_NS}row"):
        valeurs: dict[int, str] = {}
        for i, c in enumerate(row.findall(f"{_NS}c")):
            idx = _index_colonne(c.get("r", "")) if c.get("r") else i
            t = c.get("t")
            if t == "s":
                v = c.find(f"{_NS}v")
                valeurs[idx] = partagees[int(v.text)] if v is not None and v.text else ""
            elif t == "inlineStr":
                valeurs[idx] = "".join(x.text or "" for x in c.iter(f"{_NS}t"))
            else:
                v = c.find(f"{_NS}v")
                valeurs[idx] = (v.text or "") if v is not None else ""
        lignes.append(valeurs)

    if not lignes:
        return []
    entetes = {i: nom.strip() for i, nom in lignes[0].items() if nom.strip()}
    return [{entetes[i]: v.strip() for i, v in l.items() if i in entetes} for l in lignes[1:]]


# ── Conversion en matchs ───────────────────────────────────────────────────

def _date(brut: str) -> datetime | None:
    if not brut:
        return None
    try:  # date Excel : nombre de jours depuis le 30/12/1899
        return datetime(1899, 12, 30) + timedelta(days=float(brut))
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(brut, fmt)
        except ValueError:
            continue
    return None


def _cote(brut: str | None) -> float | None:
    try:
        v = float((brut or "").replace(",", "."))
    except ValueError:
        return None
    return v if v > 1.0 else None


def _entier(brut: str | None) -> int:
    try:
        return int(float(brut or ""))
    except ValueError:
        return 0


def circuit_du_fichier(lignes: list[dict[str, str]]) -> str | None:
    if not lignes:
        return None
    cles = lignes[0].keys()
    if "ATP" in cles:
        return "ATP"
    if "WTA" in cles:
        return "WTA"
    return None


def convertir(lignes: list[dict[str, str]], circuit: str) -> tuple[list[Match], int]:
    """Lignes tennis-data -> matchs. Le vainqueur n'est JAMAIS mis en premier : les joueurs sont
    rangés par ordre alphabétique, sinon une stratégie « parier sur le joueur 1 » gagnerait toujours."""
    matchs: list[Match] = []
    ignores = 0
    for l in lignes:
        gagnant, perdant = l.get("Winner", ""), l.get("Loser", "")
        d = _date(l.get("Date", ""))
        # Abandons et forfaits exclus : les bookmakers les règlent chacun à leur façon.
        termine = l.get("Comment", "Completed").lower().startswith("complet")
        if not gagnant or not perdant or d is None or not termine:
            if any(l.values()):
                ignores += 1
            continue

        j1, j2 = sorted((gagnant, perdant))
        j1_gagne = j1 == gagnant
        cotes: dict[str, tuple[float, ...]] = {}
        for source, (cw, cl) in COLONNES.items():
            ow, ol = _cote(l.get(cw)), _cote(l.get(cl))
            if ow and ol:
                cotes[source] = (ow, ol) if j1_gagne else (ol, ow)

        sw, sl = _entier(l.get("Wsets")), _entier(l.get("Lsets"))
        matchs.append(Match(
            ligue=circuit, saison=str(d.year), date=d, domicile=j1, exterieur=j2,
            buts_dom=sw if j1_gagne else sl, buts_ext=sl if j1_gagne else sw,
            resultat="1" if j1_gagne else "2", cotes=cotes, sport="tennis",
            contexte={"surface": l.get("Surface", ""), "tournoi": l.get("Tournament", ""),
                      "tour": l.get("Round", ""), "sets": l.get("Best of", "")},
        ))
    return matchs, ignores


# ── Import depuis Téléchargements ──────────────────────────────────────────

def _identifier(fichier: Path) -> tuple[str, str] | None:
    """(circuit, année) d'un fichier tennis-data, ou None si ce n'en est pas un."""
    try:
        lignes = lire_xlsx(fichier)
    except (zipfile.BadZipFile, KeyError, ET.ParseError, OSError):
        return None
    circuit = circuit_du_fichier(lignes)
    if circuit is None or "Winner" not in lignes[0]:
        return None
    annees = Counter(d.year for l in lignes if (d := _date(l.get("Date", ""))) is not None)
    if not annees:
        return None
    return circuit, str(annees.most_common(1)[0][0])  # majoritaire : certains tournois débutent fin décembre


def importer(source: Path, dossier: Path, log: logging.Logger, dry_run: bool = False) -> int:
    """Copie (sans les déplacer) les fichiers tennis-data trouvés dans `source`. Renvoie le nombre importé."""
    if not source.is_dir():
        log.error("Dossier introuvable : %s", source)
        return 0
    candidats = sorted(source.glob("*.xlsx"), key=lambda f: f.stat().st_mtime)
    importes = 0
    for f in candidats:
        ident = _identifier(f)
        if ident is None:
            log.debug("Ignoré (pas un fichier tennis-data) : %s", f.name)
            continue
        circuit, annee = ident
        cible = dossier / f"{circuit}_{annee}.xlsx"
        if cible.exists() and cible.stat().st_size == f.stat().st_size and cible.stat().st_mtime >= f.stat().st_mtime:
            log.debug("Déjà à jour : %s", cible.name)
            continue
        if dry_run:
            log.info("[dry-run] copierait %s -> %s", f.name, cible.name)
        else:
            dossier.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, cible)
            log.info("Importé %s -> %s", f.name, cible.name)
        importes += 1
    if importes == 0 and not any(dossier.glob("*.xlsx")):
        log.warning("Aucun fichier tennis trouvé dans %s. Télécharge-les à la main sur %s "
                    "(un fichier par année, ATP et/ou WTA), puis relance cette commande.", source, PAGE)
    return importes


def charger(dossier: Path, circuits: list[str], annees: list[str], log: logging.Logger) -> list[Match]:
    tous: list[Match] = []
    manquants: list[str] = []
    for annee in annees:
        for circuit in circuits:
            f = dossier / f"{circuit}_{annee}.xlsx"
            if not f.exists():
                manquants.append(f.name)
                continue
            matchs, ignores = convertir(lire_xlsx(f), circuit)
            log.debug("%s : %s matchs, %s ignorés (abandons, forfaits, lignes incomplètes)", f.name, len(matchs), ignores)
            tous.extend(matchs)
    if manquants:
        log.warning("Fichiers tennis absents (lance 'importer-tennis') : %s", ", ".join(manquants))
    tous.sort(key=lambda m: (m.date, m.ligue, m.domicile))
    return tous
