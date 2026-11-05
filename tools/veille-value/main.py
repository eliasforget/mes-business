"""veille-value : test « à blanc » de la value betting sur les matchs À VENIR, sans miser d'argent.

Chaque jour : compare les cotes des bookmakers français aux probabilités « justes » de Pinnacle,
note un pari fictif quand une cote française est trop généreuse, puis le règle avec le score.

    py main.py scanner [--dry-run]     cherche la value sur les prochains matchs
    py main.py regler                  règle les paris fictifs terminés
    py main.py bilan                   ROI, fourchette de confiance, détail par bookmaker
    py main.py tout                    les trois (pour la tâche planifiée)
    py main.py sports                  liste les codes de compétitions disponibles (gratuit)
"""
from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parents[1] / "shared" / "python"))

from autoshared import env_float, env_int, env_list, get_logger, load_env  # noqa: E402

import veille  # noqa: E402
from api import ClientOdds, CreditsInsuffisants, ErreurApi  # noqa: E402

DEFAUTS = {
    "SPORTS": "soccer_france_ligue_one,soccer_epl,soccer_spain_la_liga,soccer_italy_serie_a,soccer_germany_bundesliga",
    "BOOKMAKERS_FR": "betclic_fr,winamax_fr,unibet_fr,pmu_fr,parionssport_fr,netbet_fr",
    "SEUIL": "0.03",
    "MISE": "10",
    "COTE_MIN": "1.2",
    "COTE_MAX": "8",
    "HORIZON_HEURES": "48",
    "AGE_MAX_MINUTES": "60",
    "CREDITS_RESERVE": "25",
    "JOURNAL": "",
}


def _eur(x: float) -> str:
    return f"{x:,.2f} €".replace(",", " ").replace(".", ",")


def _pct(x: float) -> str:
    return f"{x * 100:+.1f} %".replace(".", ",")


def _journal() -> Path:
    brut = env_list("JOURNAL")
    return Path(brut[0]).expanduser() if brut else ICI / "data" / "journal.csv"


def _client() -> ClientOdds:
    return ClientOdds(cle=load_env(tool_dir=ICI, required=["ODDS_API_KEY"])["ODDS_API_KEY"],
                      reserve=env_int("CREDITS_RESERVE"))


def cmd_sports(args, log) -> int:
    client = _client()
    for s in sorted(client.sports(), key=lambda s: s["key"]):
        if s.get("active") and (s["key"].startswith("soccer") or s["key"].startswith("tennis")):
            print(f"{s['key']:<45} {s.get('title', '')}")
    return 0


def cmd_scanner(args, log, client: ClientOdds | None = None) -> int:
    client = client or _client()
    chemin = _journal()
    journal = veille.charger_journal(chemin)
    deja = {p.id for p in journal}
    books = env_list("BOOKMAKERS_FR")
    nouveaux: list[veille.PariFictif] = []

    for sport in env_list("SPORTS"):
        try:
            evenements = client.cotes(sport, ["pinnacle", *books])
        except CreditsInsuffisants as err:
            log.warning("%s", err)
            break
        except ErreurApi as err:
            log.error("%s : %s", sport, err)
            continue
        trouves, c = veille.chercher_value(
            evenements, sport, books, env_float("SEUIL"), env_float("MISE"),
            timedelta(hours=env_float("HORIZON_HEURES")), timedelta(minutes=env_float("AGE_MAX_MINUTES")),
            env_float("COTE_MIN"), env_float("COTE_MAX"))
        frais = [p for p in trouves if p.id not in deja]
        deja.update(p.id for p in frais)
        nouveaux.extend(frais)
        log.info("%s : %s matchs dans les %sh, %s sans Pinnacle, %s cotes trop anciennes, %s value (%s nouvelle(s))",
                 sport, c["matchs"], env_list("HORIZON_HEURES")[0], c["sans_pinnacle"], c["cotes_perimees"],
                 c["value"], len(frais))

    for p in nouveaux:
        log.info("  PARI FICTIF  %s UTC | %s -> %s @ %s chez %s (cote juste Pinnacle %s, avantage %s)",
                 p.debut[:16].replace("T", " "), p.match, p.pari, f"{p.cote:.2f}".replace(".", ","),
                 veille.NOMS_BOOKMAKERS.get(p.bookmaker, p.bookmaker), f"{1 / p.proba_pinnacle:.2f}".replace(".", ","),
                 _pct(p.avantage))
    if args.dry_run:
        log.info("[dry-run] %s pari(s) fictif(s) non enregistré(s).", len(nouveaux))
    elif nouveaux:
        veille.ecrire_journal(chemin, journal + nouveaux)
        log.info("%s pari(s) fictif(s) ajouté(s) au journal %s", len(nouveaux), chemin)
    log.info("Crédits API restants : %s", client.restants if client.restants is not None else "?")
    return 0


def cmd_regler(args, log, client: ClientOdds | None = None) -> int:
    chemin = _journal()
    journal = veille.charger_journal(chemin)
    a_regler = veille.sports_a_regler(journal)
    if not a_regler:
        log.info("Aucun pari fictif à régler pour l'instant.")
        return 0
    client = client or _client()
    scores: dict[str, dict] = {}
    for sport in a_regler:
        try:
            scores.update({s["id"]: s for s in client.scores(sport)})
        except CreditsInsuffisants as err:
            log.warning("%s", err)
            break
        except ErreurApi as err:
            log.error("%s : %s (pas de scores pour ce sport ?)", sport, err)
    avant = {p.id: p.statut for p in journal}
    n = veille.regler(journal, scores)
    for p in journal:
        if avant[p.id] != p.statut:
            log.info("  %s | %s -> %s : %s (%s)", p.debut[:10], p.match, p.pari, p.statut.replace("_", " "),
                     _eur(p.gain) if p.statut in ("gagne", "perdu") else "-")
    veille.ecrire_journal(chemin, journal)
    log.info("%s pari(s) réglé(s). Crédits API restants : %s", n, client.restants if client.restants is not None else "?")
    return 0


def cmd_bilan(args, log) -> int:
    b = veille.bilan(veille.charger_journal(_journal()))
    print()
    print(f"Paris fictifs : {b['total']} au total, {b['regles']} réglés, {b['en_attente']} en attente, "
          f"{b['non_reglables']} sans résultat.")
    if b["regles"]:
        ic = f"[{_pct(b['ic95'][0])} ; {_pct(b['ic95'][1])}]" if b["ic95"] else "-"
        print(f"Depuis le {b['premier']} : {b['gagnes']}/{b['regles']} gagnés, cote moyenne "
              f"{b['cote_moyenne']:.2f}".replace(".", ","))
        print(f"Profit {_eur(b['profit'])} pour {_eur(b['mises'])} misés -> ROI {_pct(b['roi'])}, IC 95 % {ic}")
        print(f"Avantage moyen annoncé au moment du pari : {_pct(b['avantage_moyen_annonce'])}")
        print("\nPar bookmaker :")
        for nom, d in b["par_bookmaker"].items():
            print(f"  {nom:<14}{d['n']:>5} paris  ROI {_pct(d['roi'])}")
    print()
    print(veille.verdict(b))
    return 0


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(prog="veille-value", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="commande", required=True)
    for nom in ("scanner", "tout"):
        p = sub.add_parser(nom)
        p.add_argument("--dry-run", action="store_true", help="n'écrit rien dans le journal")
    sub.add_parser("regler")
    sub.add_parser("bilan")
    sub.add_parser("sports")
    args = parser.parse_args(argv)

    load_env(tool_dir=ICI, defaults=DEFAUTS)
    log = get_logger("veille-value")
    try:
        if args.commande == "tout":
            client = _client()
            code = cmd_scanner(args, log, client)
            if not args.dry_run:
                code |= cmd_regler(args, log, client)
            return code | cmd_bilan(args, log)
        return {"scanner": cmd_scanner, "regler": cmd_regler, "bilan": cmd_bilan, "sports": cmd_sports}[args.commande](args, log)
    except (ErreurApi, ValueError, OSError) as err:
        log.error("%s", err)
        return 1
    except Exception as err:  # noqa: BLE001 - message clair plutôt qu'une trace pour la tâche planifiée
        if type(err).__name__ == "MissingEnvError":
            log.error("%s", err)
            return 1
        raise


if __name__ == "__main__":
    sys.exit(main())
