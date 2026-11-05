"""Sorties : tableau console, CSV des paris (format Excel FR) et rapport HTML autonome."""
from __future__ import annotations

import csv
import html
import json
from datetime import datetime
from pathlib import Path

from moteur import Resultat, verdict, verdict_qualite

# Palette catégorielle validée (ordre fixe : la couleur suit la stratégie, pas son rang).
COULEURS_CLAIR = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
COULEURS_SOMBRE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]


def eur(x: float) -> str:
    return f"{x:,.2f} €".replace(",", " ").replace(".", ",")


def pct(x: float | None, signe: bool = True) -> str:
    if x is None:
        return "-"
    return (f"{x * 100:+.1f} %" if signe else f"{x * 100:.1f} %").replace(".", ",")


def ic(s: dict) -> str:
    if not s.get("ic95"):
        return "-"
    return f"[{pct(s['ic95'][0])} ; {pct(s['ic95'][1])}]"


def _ll(x: float | None) -> str:
    return "-" if x is None else f"{x:.4f}".replace(".", ",")


# ── Console ────────────────────────────────────────────────────────────────

def tableau_console(resultats: list[Resultat], stats: list[dict], infos: dict, params: dict) -> str:
    lignes = [
        "",
        f"Backtest : {int(infos['matchs'])} matchs, cotes '{params['source']}' "
        f"(marge moyenne du marché {pct(infos['marge_moyenne'], False)}), décote {pct(params['decote'], False)}, "
        f"mise {params['mode']}, bankroll de départ {eur(params['bankroll'])}",
        "",
    ]
    entete = f"{'Stratégie':<16}{'Paris':>7}{'Réussite':>10}{'Cote moy.':>10}{'Profit':>14}{'ROI':>9}" \
             f"{'IC 95 %':>22}{'CLV':>8}{'Drawdown':>10}"
    lignes += [entete, "-" * len(entete)]
    for res, s in zip(resultats, stats):
        if s["n"] == 0:
            lignes.append(f"{res.strategie.nom:<16}{0:>7}   aucun pari")
            continue
        lignes.append(
            f"{res.strategie.nom:<16}{s['n']:>7}{pct(s['taux'], False):>10}{_num(s['cote_moyenne']):>10}"
            f"{eur(s['profit']):>14}{pct(s['roi']):>9}{ic(s):>22}{pct(s['clv_moyen']):>8}"
            f"{pct(s['drawdown_max'], False):>10}" + ("  RUINE" if s["ruine"] else "")
        )
    qualites = [(r.strategie.nom, s.get("qualite")) for r, s in zip(resultats, stats) if s.get("qualite")]
    if qualites:
        lignes += ["", "Qualité des prédictions (log-loss, plus bas = mieux, mêmes matchs) :",
                   f"{'Modèle':<16}{'Matchs':>8}{'Modèle':>10}{'Pinnacle':>10}{'Clôture':>10}"]
        for nom, q in qualites:
            lignes.append(f"{nom:<16}{q['n']:>8}{_ll(q['modele']):>10}{_ll(q['pinnacle']):>10}{_ll(q['cloture']):>10}")
    lignes.append("")
    for res, s in zip(resultats, stats):
        lignes.append(f"- {res.strategie.nom} : {verdict(s) if s['n'] else 'aucun pari.' + verdict_qualite(s.get('qualite'))}")
    return "\n".join(lignes)


# ── CSV ────────────────────────────────────────────────────────────────────

def _num(x: float | None, dec: int = 2) -> str:
    return "" if x is None else f"{x:.{dec}f}".replace(".", ",")


def ecrire_csv(res: Resultat, dossier: Path) -> Path:
    chemin = dossier / f"paris_{res.strategie.nom}.csv"
    with chemin.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig + ';' : s'ouvre bien dans Excel FR
        w = csv.writer(f, delimiter=";")
        w.writerow(["date", "ligue", "saison", "match", "pari", "cote", "proba_estimee", "mise",
                    "gain_net", "bankroll", "clv"])
        for p in res.paris:
            w.writerow([p.date.strftime("%Y-%m-%d %H:%M"), p.ligue, p.saison, p.match, p.issue,
                        _num(p.cote), _num(p.proba, 4), _num(p.mise), _num(p.gain), _num(p.bankroll),
                        _num(p.clv, 4)])
    return chemin


# ── HTML ───────────────────────────────────────────────────────────────────

def _series(resultats: list[Resultat], bankroll: float, max_points: int = 1500) -> list[dict]:
    series = []
    for res in resultats:
        pts = [(p.date.timestamp(), p.bankroll) for p in res.paris]
        if len(pts) > max_points:  # sous-échantillonnage, en gardant le dernier point
            pas = len(pts) / max_points
            pts = [pts[int(i * pas)] for i in range(max_points)] + [pts[-1]]
        series.append({"nom": res.strategie.nom, "points": pts, "depart": bankroll})
    return series


def _graphique(series: list[dict], bankroll: float) -> str:
    tous = [p for s in series for p in s["points"]]
    if not tous:
        return "<p>Aucun pari, pas de courbe.</p>"
    W, H, ml, mr, mt, mb = 960, 380, 64, 120, 16, 32
    t0, t1 = min(p[0] for p in tous), max(p[0] for p in tous)
    v0 = min([bankroll] + [p[1] for p in tous])
    v1 = max([bankroll] + [p[1] for p in tous])
    marge_v = (v1 - v0) * 0.06 or bankroll * 0.1
    v0, v1 = max(0.0, v0 - marge_v), v1 + marge_v
    t1 = t1 if t1 > t0 else t0 + 1

    def x(t: float) -> float:
        return ml + (t - t0) / (t1 - t0) * (W - ml - mr)

    def y(v: float) -> float:
        return mt + (1 - (v - v0) / (v1 - v0)) * (H - mt - mb)

    svg = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Évolution de la bankroll par stratégie" '
           f'id="graph" data-t0="{t0}" data-t1="{t1}" data-ml="{ml}" data-mr="{mr}" data-w="{W}" '
           f'data-v0="{v0}" data-v1="{v1}" data-mt="{mt}" data-mb="{mb}" data-h="{H}">']
    # Grille horizontale + axe Y
    for k in range(5):
        v = v0 + (v1 - v0) * k / 4
        svg.append(f'<line class="grille" x1="{ml}" x2="{W - mr}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
        svg.append(f'<text class="axe" x="{ml - 8}" y="{y(v) + 4:.1f}" text-anchor="end">{eur(v)[:-5]} €</text>')
    # Axe X : années
    debut = datetime.fromtimestamp(t0).year
    fin = datetime.fromtimestamp(t1).year
    for an in range(debut, fin + 1):
        t = datetime(an, 1, 1).timestamp()
        if t0 <= t <= t1:
            svg.append(f'<text class="axe" x="{x(t):.1f}" y="{H - 10}" text-anchor="middle">{an}</text>')
    # Bankroll de départ
    svg.append(f'<line class="depart" x1="{ml}" x2="{W - mr}" y1="{y(bankroll):.1f}" y2="{y(bankroll):.1f}"/>')
    # Courbes (en escalier : la bankroll ne bouge qu'à chaque pari)
    fins = []
    for i, s in enumerate(series):
        if not s["points"]:
            continue
        d = f"M{x(s['points'][0][0]):.1f},{y(bankroll):.1f}"
        prev_v = bankroll
        for t, v in s["points"]:
            d += f" H{x(t):.1f} V{y(v):.1f}"
            prev_v = v
        svg.append(f'<path class="serie s{i}" d="{d}"/>')
        fins.append([y(prev_v), i, s["nom"], prev_v])
    # Étiquettes directes en bout de courbe, écartées si elles se chevauchent
    fins.sort()
    for k in range(1, len(fins)):
        fins[k][0] = max(fins[k][0], fins[k - 1][0] + 16)
    for yy, i, nom, v in fins:
        svg.append(f'<text class="etiquette" x="{W - mr + 8}" y="{yy + 4:.1f}">'
                   f'<tspan class="puce s{i}">●</tspan> {html.escape(nom)}</text>')
    svg.append(f'<line id="curseur" class="curseur" x1="0" x2="0" y1="{mt}" y2="{H - mb}" visibility="hidden"/>')
    svg.append(f'<rect class="zone" x="{ml}" y="{mt}" width="{W - ml - mr}" height="{H - mt - mb}"/>')
    svg.append("</svg>")
    return "\n".join(svg)


def ecrire_html(resultats: list[Resultat], stats: list[dict], infos: dict, params: dict, dossier: Path) -> Path:
    series = _series(resultats, params["bankroll"])
    legende = "".join(f'<span class="leg"><span class="puce s{i}">●</span> {html.escape(r.strategie.nom)}</span>'
                      for i, r in enumerate(resultats))

    lignes = []
    for r, s in zip(resultats, stats):
        if s["n"] == 0:
            lignes.append(f"<tr><td>{html.escape(r.strategie.nom)}</td><td colspan='8'>aucun pari</td></tr>")
            continue
        lignes.append(
            f"<tr><td>{html.escape(r.strategie.nom)}</td><td>{s['n']}</td><td>{pct(s['taux'], False)}</td>"
            f"<td>{_num(s['cote_moyenne'])}</td><td>{eur(s['profit'])}</td><td><b>{pct(s['roi'])}</b></td>"
            f"<td>{ic(s)}</td><td>{pct(s['clv_moyen'])}</td>"
            f"<td>{pct(s['drawdown_max'], False)}{' · ruine' if s['ruine'] else ''}</td></tr>")

    saisons = sorted({sa for s in stats if s["n"] for sa in s["par_saison"]})
    lignes_saison = []
    for r, s in zip(resultats, stats):
        if not s["n"]:
            continue
        cells = "".join(
            f"<td>{pct(s['par_saison'][sa]['roi'])} <small>({s['par_saison'][sa]['n']})</small></td>"
            if sa in s["par_saison"] else "<td>-</td>" for sa in saisons)
        lignes_saison.append(f"<tr><td>{html.escape(r.strategie.nom)}</td>{cells}</tr>")

    verdicts = "".join(f"<li><b>{html.escape(r.strategie.nom)}</b> - {html.escape(r.strategie.description)}<br>"
                       f"{html.escape(verdict(s) if s['n'] else 'Aucun pari.' + verdict_qualite(s.get('qualite')))}</li>"
                       for r, s in zip(resultats, stats))
    qualites = [(r.strategie.nom, s["qualite"]) for r, s in zip(resultats, stats) if s.get("qualite")]
    table_qualite = ""
    if qualites:
        lignes_q = "".join(
            f"<tr><td>{html.escape(nom)}</td><td>{q['n']}</td><td><b>{_ll(q['modele'])}</b></td>"
            f"<td>{_ll(q['pinnacle'])}</td><td>{_ll(q['cloture'])}</td>"
            f"<td>{'oui' if q['modele'] < q['pinnacle'] else 'non'}</td></tr>" for nom, q in qualites)
        table_qualite = f"""<h2>Qualité des prédictions <small>(log-loss : plus c'est bas, mieux le modèle prédit)</small></h2>
<table>
<thead><tr><th>Modèle</th><th>Matchs</th><th>Modèle</th><th>Pinnacle avant-match</th><th>Pinnacle clôture</th>
<th>Bat le marché ?</th></tr></thead>
<tbody>{lignes_q}</tbody>
</table>
<p class="meta">Comparaison sur exactement les mêmes matchs. Un modèle qui prédit moins bien que Pinnacle ne peut pas
gagner sur la durée : quand il croit voir une bonne affaire, c'est le plus souvent lui qui se trompe.</p>"""

    clair = "\n".join(f"  --s{i}: {c};" for i, c in enumerate(COULEURS_CLAIR))
    sombre = "\n".join(f"  --s{i}: {c};" for i, c in enumerate(COULEURS_SOMBRE))
    css_series = "\n".join(f".serie.s{i} {{ stroke: var(--s{i}); }} .puce.s{i} {{ color: var(--s{i}); fill: var(--s{i}); }}"
                           for i in range(len(COULEURS_CLAIR)))

    page = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backtest paris sportifs - {params['horodatage']}</title>
<style>
:root {{
  color-scheme: light;
  --fond: #fcfcfb; --texte: #0b0b0b; --texte-2: #52514e; --trait: #e4e3df;
{clair}
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    color-scheme: dark;
    --fond: #1a1a19; --texte: #f0efec; --texte-2: #c3c2b7; --trait: #3a3936;
{sombre}
  }}
}}
body {{ background: var(--fond); color: var(--texte); font: 15px/1.5 system-ui, "Segoe UI", sans-serif;
       max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }}
h1 {{ font-size: 1.4rem; margin-bottom: .2rem; }} h2 {{ font-size: 1.1rem; margin-top: 2rem; }}
.meta, small {{ color: var(--texte-2); }}
.avert {{ border-left: 3px solid var(--texte-2); padding: .5rem 1rem; color: var(--texte-2); }}
table {{ border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }}
th, td {{ text-align: right; padding: .35rem .6rem; border-bottom: 1px solid var(--trait); }}
th:first-child, td:first-child {{ text-align: left; }}
th {{ color: var(--texte-2); font-weight: 500; }}
.leg {{ margin-right: 1.2rem; }}
.graph {{ position: relative; }}
svg {{ width: 100%; height: auto; display: block; }}
.grille {{ stroke: var(--trait); stroke-width: 1; }}
.depart {{ stroke: var(--texte-2); stroke-width: 1; stroke-dasharray: 4 4; }}
.axe, .etiquette {{ fill: var(--texte-2); font-size: 12px; }}
.etiquette {{ fill: var(--texte); }}
.serie {{ fill: none; stroke-width: 2; stroke-linejoin: round; }}
.curseur {{ stroke: var(--texte-2); stroke-width: 1; }}
.zone {{ fill: transparent; }}
{css_series}
#info {{ position: absolute; pointer-events: none; background: var(--fond); border: 1px solid var(--trait);
        padding: .4rem .6rem; font-size: 13px; border-radius: 6px; display: none; white-space: nowrap;
        box-shadow: 0 2px 8px rgb(0 0 0 / .12); }}
li {{ margin-bottom: .6rem; }}
</style>
</head>
<body>
<h1>Backtest paris sportifs (argent fictif)</h1>
<p class="meta">{params['horodatage']} · {int(infos['matchs'])} matchs · {params.get('sport', 'foot')} · compétitions {html.escape(', '.join(params['ligues']))}
 · saisons {html.escape(', '.join(params['saisons']))}<br>
cotes « {params['source']} » (marge moyenne du marché {pct(infos['marge_moyenne'], False)}) · décote {pct(params['decote'], False)}
 · mise {params['mode']} · bankroll de départ {eur(params['bankroll'])}</p>

<p class="avert">Un backtest montre ce qui <i>aurait</i> marché sur le passé, pas ce qui marchera. Les cotes « moyenne »
et surtout « max » sont meilleures que celles des bookmakers français (dont le taux de retour est plafonné à 85 % en
moyenne) : utilise la décote pour t'en rapprocher.</p>

<h2>Évolution de la bankroll</h2>
<div>{legende}<span class="leg meta">- - bankroll de départ</span></div>
<div class="graph">{_graphique(series, params['bankroll'])}<div id="info"></div></div>

<h2>Résultats</h2>
<table>
<thead><tr><th>Stratégie</th><th>Paris</th><th>Réussite</th><th>Cote moy.</th><th>Profit</th><th>ROI</th>
<th>IC 95 % du ROI</th><th>CLV moyen</th><th>Drawdown max</th></tr></thead>
<tbody>{''.join(lignes)}</tbody>
</table>

{table_qualite}

<h2>ROI par saison <small>(nombre de paris)</small></h2>
<table>
<thead><tr><th>Stratégie</th>{''.join(f'<th>{html.escape(s)}</th>' for s in saisons)}</tr></thead>
<tbody>{''.join(lignes_saison)}</tbody>
</table>

<h2>Lecture</h2>
<ul>{verdicts}</ul>
<p class="meta"><b>ROI</b> : profit / total misé. <b>IC 95 %</b> : fourchette où se situe le vrai ROI avec 95 % de
confiance ; s'il contient 0, impossible de distinguer la stratégie du hasard. <b>CLV</b> (closing line value) : de combien
ta cote dépasse la cote « juste » de clôture de Pinnacle ; c'est l'indicateur le plus fiable d'un avantage réel.
<b>Drawdown</b> : plus forte baisse depuis un sommet.</p>

<script>
const series = {json.dumps(series)};
const svg = document.getElementById('graph');
const info = document.getElementById('info');
const curseur = document.getElementById('curseur');
const d = k => parseFloat(svg.dataset[k]);
const fmt = v => v.toLocaleString('fr-FR', {{ style: 'currency', currency: 'EUR' }});
function valeurA(points, t, depart) {{
  let lo = 0, hi = points.length - 1, res = depart;
  while (lo <= hi) {{ const m = (lo + hi) >> 1; if (points[m][0] <= t) {{ res = points[m][1]; lo = m + 1; }} else hi = m - 1; }}
  return res;
}}
if (svg) {{
  const zone = svg.querySelector('.zone');
  zone.addEventListener('mousemove', e => {{
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const t = d('t0') + (p.x - d('ml')) / (d('w') - d('ml') - d('mr')) * (d('t1') - d('t0'));
    curseur.setAttribute('x1', p.x); curseur.setAttribute('x2', p.x); curseur.setAttribute('visibility', 'visible');
    const date = new Date(t * 1000).toLocaleDateString('fr-FR');
    info.innerHTML = '<b>' + date + '</b><br>' + series.map((s, i) =>
      '<span class="puce s' + i + '">●</span> ' + s.nom + ' : ' + fmt(valeurA(s.points, t, s.depart))).join('<br>');
    info.style.display = 'block';
    const box = svg.getBoundingClientRect();
    const x = e.clientX - box.left;
    info.style.left = (x > box.width * 0.6 ? x - info.offsetWidth - 12 : x + 12) + 'px';
    info.style.top = (e.clientY - box.top + 12) + 'px';
  }});
  zone.addEventListener('mouseleave', () => {{ info.style.display = 'none'; curseur.setAttribute('visibility', 'hidden'); }});
}}
</script>
</body>
</html>
"""
    chemin = dossier / "rapport.html"
    chemin.write_text(page, encoding="utf-8")
    return chemin
