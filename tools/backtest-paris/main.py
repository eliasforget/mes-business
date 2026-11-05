"""backtest-paris : teste des stratégies de paris foot 1X2 sur l'historique, sans argent réel.

    py main.py telecharger [--ligues F1,E0] [--saisons 2324,2425] [--forcer] [--dry-run]
    py main.py lancer [--strategies favori,value_pinnacle,poisson] [--cotes avg] [--decote 0.05]
                      [--mise fixe|kelly] [--ouvrir]
"""
from __future__ import annotations

import argparse
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parents[1] / "shared" / "python"))

from autoshared import env_float, env_list, get_logger, load_env  # noqa: E402

import donnees  # noqa: E402
import moteur  # noqa: E402
import rapport  # noqa: E402
import strategies  # noqa: E402

DEFAUTS = {
    "LIGUES": "F1,E0,SP1,I1,D1",
    "SAISONS": "2122,2223,2324,2425,2526",
    "DATA_DIR": "",
    "OUTPUT_DIR": "",
    "STRATEGIES": "favori,value_pinnacle,poisson",
    "SOURCE_COTES": "avg",
    "DECOTE": "0",
    "SEUIL_VALUE": "0.03",
    "SEUIL_POISSON": "0.05",
    "COTE_MIN": "1.2",
    "COTE_MAX": "8",
    "MODE_MISE": "fixe",
    "MISE": "10",
    "FRACTION_KELLY": "0.25",
    "BANKROLL": "1000",
}


def _liste(valeur: str | None, nom_env: str) -> list[str]:
    if valeur:
        return [v.strip() for v in valeur.split(",") if v.strip()]
    return env_list(nom_env)


def _dossier(nom_env: str, defaut: Path) -> Path:
    brut = env_list(nom_env)
    return Path(brut[0]).expanduser() if brut else defaut


def cmd_telecharger(args: argparse.Namespace, log) -> int:
    ligues = _liste(args.ligues, "LIGUES")
    saisons = _liste(args.saisons, "SAISONS")
    dossier = _dossier("DATA_DIR", ICI / "data")
    log.info("Téléchargement : ligues %s, saisons %s -> %s", ",".join(ligues), ",".join(saisons), dossier)
    erreurs = donnees.telecharger(ligues, saisons, dossier, log, forcer=args.forcer, dry_run=args.dry_run)
    if erreurs:
        log.error("%s fichier(s) en échec (vérifie le code ligue/saison).", erreurs)
        return 1
    log.info("Données à jour.")
    return 0


def cmd_lancer(args: argparse.Namespace, log) -> int:
    ligues = _liste(args.ligues, "LIGUES")
    saisons = _liste(args.saisons, "SAISONS")
    source = args.cotes or env_list("SOURCE_COTES")[0]
    if source not in donnees.SOURCES_PARI:
        raise ValueError(f"Source de cotes inconnue : {source} (choix : {', '.join(donnees.SOURCES_PARI)})")
    decote = args.decote if args.decote is not None else env_float("DECOTE")
    if not 0 <= decote < 0.5:
        raise ValueError("La décote doit être entre 0 et 0.5 (ex. 0.05 pour 5 %).")
    mode = args.mise or env_list("MODE_MISE")[0]
    if mode not in ("fixe", "kelly"):
        raise ValueError("MODE_MISE doit valoir 'fixe' ou 'kelly'.")

    noms = _liste(args.strategies, "STRATEGIES")
    if source == "ps" and "value_pinnacle" in noms:
        log.warning("value_pinnacle avec les cotes Pinnacle elles-mêmes ne trouvera jamais de value.")
    strats = strategies.construire(noms, env_float("SEUIL_VALUE"), env_float("SEUIL_POISSON"))

    matchs = donnees.charger(_dossier("DATA_DIR", ICI / "data"), ligues, saisons, log)
    if not matchs:
        log.error("Aucun match chargé. Lance d'abord : py main.py telecharger")
        return 1
    log.info("%s matchs chargés (%s -> %s)", len(matchs), matchs[0].jour, matchs[-1].jour)

    params_mise = moteur.ParamsMise(mode=mode, mise=env_float("MISE"),
                                    fraction_kelly=env_float("FRACTION_KELLY"), bankroll=env_float("BANKROLL"))
    resultats, infos = moteur.simuler(matchs, strats, source, params_mise, decote,
                                      env_float("COTE_MIN"), env_float("COTE_MAX"))
    stats = [moteur.statistiques(r, params_mise.bankroll) for r in resultats]

    horodatage = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    sortie = _dossier("OUTPUT_DIR", ICI / "resultats") / horodatage
    sortie.mkdir(parents=True, exist_ok=True)
    params = {"source": source, "decote": decote, "mode": mode, "bankroll": params_mise.bankroll,
              "ligues": ligues, "saisons": saisons, "horodatage": datetime.strptime(horodatage, "%Y-%m-%d_%H%M%S").strftime("%d/%m/%Y %H:%M")}

    print(rapport.tableau_console(resultats, stats, infos, params))
    for r in resultats:
        rapport.ecrire_csv(r, sortie)
    page = rapport.ecrire_html(resultats, stats, infos, params, sortie)
    log.info("Rapport : %s", page)
    if args.ouvrir:
        webbrowser.open(page.as_uri())
    return 0


def main(argv: list[str] | None = None) -> int:
    try:  # console Windows : jamais de plantage sur un caractère non encodable
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

    parser = argparse.ArgumentParser(prog="backtest-paris", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="commande", required=True)

    t = sub.add_parser("telecharger", help="télécharge les CSV football-data.co.uk")
    t.add_argument("--ligues", help="codes séparés par des virgules (ex. F1,E0)")
    t.add_argument("--saisons", help="codes saison (ex. 2324,2425)")
    t.add_argument("--forcer", action="store_true", help="re-télécharge même si le fichier existe")
    t.add_argument("--dry-run", action="store_true", help="affiche ce qui serait téléchargé")

    l = sub.add_parser("lancer", help="lance le backtest et produit le rapport")  # noqa: E741
    l.add_argument("--ligues")
    l.add_argument("--saisons")
    l.add_argument("--strategies", help=f"parmi : {', '.join(strategies.DISPONIBLES)}")
    l.add_argument("--cotes", choices=donnees.SOURCES_PARI, help="cotes auxquelles on « parie »")
    l.add_argument("--decote", type=float, help="ex. 0.05 = cotes 5 %% moins bonnes (bookmaker FR)")
    l.add_argument("--mise", choices=("fixe", "kelly"))
    l.add_argument("--ouvrir", action="store_true", help="ouvre le rapport HTML à la fin")

    args = parser.parse_args(argv)
    load_env(tool_dir=ICI, defaults=DEFAUTS)
    log = get_logger("backtest-paris")
    try:
        return cmd_telecharger(args, log) if args.commande == "telecharger" else cmd_lancer(args, log)
    except (ValueError, OSError) as err:
        log.error("%s", err)
        return 1


if __name__ == "__main__":
    sys.exit(main())
