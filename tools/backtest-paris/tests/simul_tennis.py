"""Génère des saisons de tennis FICTIVES au format tennis-data.co.uk (.xlsx), niveaux réels connus."""
from __future__ import annotations

import math
import random
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

SURFACES = ("Hard", "Clay", "Grass")


def ecrire_xlsx(chemin: Path, lignes: list[list[object]]) -> None:
    """Écrit un .xlsx minimal : textes en chaînes partagées, nombres en cellules numériques."""
    partagees: list[str] = []
    index: dict[str, int] = {}

    def ref(col: int, row: int) -> str:
        lettres = ""
        col += 1
        while col:
            col, r = divmod(col - 1, 26)
            lettres = chr(65 + r) + lettres
        return f"{lettres}{row}"

    xml_lignes = []
    for r, ligne in enumerate(lignes, start=1):
        cellules = []
        for c, v in enumerate(ligne):
            if v is None or v == "":
                continue
            if isinstance(v, (int, float)):
                cellules.append(f'<c r="{ref(c, r)}"><v>{v}</v></c>')
            else:
                s = str(v)
                if s not in index:
                    index[s] = len(partagees)
                    partagees.append(s)
                cellules.append(f'<c r="{ref(c, r)}" t="s"><v>{index[s]}</v></c>')
        xml_lignes.append(f'<row r="{r}">{"".join(cellules)}</row>')

    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    nsr = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="xml" ContentType="application/xml"/></Types>')
        z.writestr("xl/workbook.xml", f'<?xml version="1.0"?><workbook {ns} {nsr}><sheets>'
                                      f'<sheet name="2024" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="worksheet" Target="worksheets/feuille.xml"/></Relationships>')
        z.writestr("xl/worksheets/feuille.xml", f'<?xml version="1.0"?><worksheet {ns}><sheetData>'
                                                f'{"".join(xml_lignes)}</sheetData></worksheet>')
        z.writestr("xl/sharedStrings.xml", f'<?xml version="1.0"?><sst {ns}>'
                                           + "".join(f"<si><t>{escape(s)}</t></si>" for s in partagees) + "</sst>")


def serial_excel(d: date) -> int:
    return (datetime(d.year, d.month, d.day) - datetime(1899, 12, 30)).days


def _cotes(rng: random.Random, p: float, marge: float, bruit: float) -> tuple[float, float]:
    q = min(max(p * math.exp(rng.gauss(0, bruit)), 0.02), 0.98)
    return round(1 / (q * (1 + marge)), 2), round(1 / ((1 - q) * (1 + marge)), 2)


def generer(dossier: Path, circuit: str = "ATP", annees=(2022, 2023, 2024), joueurs: int = 64,
            matchs_par_an: int = 1500, graine: int = 3) -> list[Path]:
    rng = random.Random(graine)
    dossier.mkdir(parents=True, exist_ok=True)
    noms = [f"Joueur {chr(65 + i // 26)}{chr(65 + i % 26)}." for i in range(joueurs)]
    base = {n: rng.gauss(1500, 150) for n in noms}
    surf = {(n, s): rng.gauss(0, 60) for n in noms for s in SURFACES}
    entete = [circuit, "Location", "Tournament", "Date", "Series", "Court", "Surface", "Round", "Best of",
              "Winner", "Loser", "WRank", "LRank", "Wsets", "Lsets", "Comment",
              "B365W", "B365L", "PSW", "PSL", "MaxW", "MaxL", "AvgW", "AvgL"]
    fichiers = []
    for annee in annees:
        lignes: list[list[object]] = [entete]
        debut = date(annee, 1, 1)
        for k in range(matchs_par_an):
            d = debut + timedelta(days=int(k * 360 / matchs_par_an))
            s = SURFACES[(d.month - 1) // 4 % 3]
            a, b = rng.sample(noms, 2)
            ra, rb = base[a] + surf[(a, s)], base[b] + surf[(b, s)]
            p = 1 / (1 + 10 ** ((rb - ra) / 400))
            a_gagne = rng.random() < p
            w, l, pw = (a, b, p) if a_gagne else (b, a, 1 - p)
            commentaire = "Completed" if rng.random() > 0.03 else "Retired"
            b365 = _cotes(rng, pw, 0.06, 0.05)
            ps = _cotes(rng, pw, 0.03, 0.02)
            mx = _cotes(rng, pw, 0.0, 0.06)
            avg = _cotes(rng, pw, 0.06, 0.03)
            lignes.append([1, "Ville", f"Tournoi {d.month}", serial_excel(d), "ATP250", "Outdoor", s, "1st Round", 3,
                           w, l, 10, 20, 2, rng.choice((0, 1)), commentaire,
                           b365[0], b365[1], ps[0], ps[1], mx[0], mx[1], avg[0], avg[1]])
            # Les joueurs progressent un peu au fil du temps
            base[a] += rng.gauss(0, 2)
        f = dossier / f"{annee}.xlsx"
        ecrire_xlsx(f, lignes)
        fichiers.append(f)
    return fichiers
