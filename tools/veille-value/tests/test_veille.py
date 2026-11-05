"""Tests : py -m unittest discover -s tests   (depuis tools/veille-value). Aucun appel réseau."""
from __future__ import annotations

import io
import json
import logging
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))
sys.path.insert(0, str(ICI.parents[2] / "shared" / "python"))

import main  # noqa: E402
import veille  # noqa: E402
from api import ClientOdds, CreditsInsuffisants, ErreurApi  # noqa: E402

T0 = datetime(2026, 11, 7, 10, 0, tzinfo=timezone.utc)
ISO = lambda d: d.isoformat().replace("+00:00", "Z")  # noqa: E731


def book(cle: str, cotes: dict[str, float], maj: datetime = T0) -> dict:
    return {"key": cle, "title": cle, "markets": [{"key": "h2h", "last_update": ISO(maj),
            "outcomes": [{"name": n, "price": p} for n, p in cotes.items()]}]}


def evenement(id_: str, debut: datetime, books: list[dict]) -> dict:
    return {"id": id_, "sport_key": "soccer_france_ligue_one", "commence_time": ISO(debut),
            "home_team": "Lyon", "away_team": "Nice", "bookmakers": books}


PIN = {"Lyon": 2.10, "Draw": 3.50, "Nice": 3.60}   # marge Pinnacle ≈ 3,9 %
ARGS = dict(sport="soccer_france_ligue_one", books_fr=["betclic_fr", "winamax_fr"], seuil=0.03, mise=10,
            horizon=timedelta(hours=48), age_max=timedelta(minutes=60), cote_min=1.2, cote_max=8, instant=T0)


class TestDetection(unittest.TestCase):
    def test_value_detectee_sur_la_meilleure_cote_fr(self):
        ev = evenement("e1", T0 + timedelta(hours=30), [
            book("pinnacle", PIN),
            book("betclic_fr", {"Lyon": 2.00, "Draw": 3.30, "Nice": 3.90}),
            book("winamax_fr", {"Lyon": 2.05, "Draw": 3.40, "Nice": 3.75}),
        ])
        trouves, c = veille.chercher_value([ev], **ARGS)
        self.assertEqual(c["value"], 1)
        p = trouves[0]
        juste_nice = (1 / 3.6) / (1 / 2.1 + 1 / 3.5 + 1 / 3.6)
        self.assertEqual((p.pari, p.bookmaker, p.cote), ("Nice", "betclic_fr", 3.90))
        self.assertAlmostEqual(p.avantage, juste_nice * 3.9 - 1, places=4)
        self.assertEqual(p.id, "e1|Nice")

    def test_filtres(self):
        genereux = {"Lyon": 2.6, "Draw": 3.3, "Nice": 3.0}
        cas = {
            "match commencé": evenement("a", T0 - timedelta(minutes=5), [book("pinnacle", PIN), book("betclic_fr", genereux)]),
            "trop lointain": evenement("b", T0 + timedelta(hours=72), [book("pinnacle", PIN), book("betclic_fr", genereux)]),
            "sans Pinnacle": evenement("c", T0 + timedelta(hours=5), [book("betclic_fr", genereux)]),
            "Pinnacle périmé": evenement("d", T0 + timedelta(hours=5), [book("pinnacle", PIN, T0 - timedelta(hours=3)),
                                                                        book("betclic_fr", genereux)]),
            "cote FR périmée": evenement("e", T0 + timedelta(hours=5), [book("pinnacle", PIN),
                                                                        book("betclic_fr", genereux, T0 - timedelta(hours=2))]),
            "marché différent": evenement("f", T0 + timedelta(hours=5), [book("pinnacle", PIN),
                                                                         book("betclic_fr", {"Lyon": 2.6, "Nice": 3.0})]),
        }
        for nom, ev in cas.items():
            trouves, _ = veille.chercher_value([ev], **ARGS)
            self.assertEqual(trouves, [], nom)

    def test_pas_de_value_sans_ecart(self):
        ev = evenement("e1", T0 + timedelta(hours=5), [book("pinnacle", PIN), book("betclic_fr", {"Lyon": 2.0, "Draw": 3.3, "Nice": 3.4})])
        self.assertEqual(veille.chercher_value([ev], **ARGS)[0], [])


class TestDiagnostic(unittest.TestCase):
    def test_compteurs_et_meilleur_ecart(self):
        evs = [
            evenement("a", T0 + timedelta(hours=5), [book("pinnacle", PIN), book("betclic_fr", {"Lyon": 2.0, "Draw": 3.3, "Nice": 3.4})]),
            evenement("b", T0 + timedelta(hours=6), [book("pinnacle", PIN), book("betclic_fr", {"OL": 2.0, "Nul": 3.3, "OGCN": 3.4})]),
        ]
        trouves, c = veille.chercher_value(evs, **ARGS)
        self.assertEqual(trouves, [])
        self.assertEqual(c["comparees"], 3)          # 3 issues du match « a »
        self.assertEqual(c["marche_different"], 3)   # noms différents sur « b » : signalé, pas ignoré en silence
        juste_nice = (1 / 3.6) / (1 / 2.1 + 1 / 3.5 + 1 / 3.6)
        juste_lyon = (1 / 2.1) / (1 / 2.1 + 1 / 3.5 + 1 / 3.6)
        juste_nul = (1 / 3.5) / (1 / 2.1 + 1 / 3.5 + 1 / 3.6)
        self.assertAlmostEqual(c["meilleur_avantage"], max(juste_lyon * 2.0, juste_nul * 3.3, juste_nice * 3.4) - 1)
        self.assertLess(c["meilleur_avantage"], 0)

    def test_historique_des_scans_et_markdown(self):
        with tempfile.TemporaryDirectory() as tmp:
            chemin = Path(tmp) / "suivi" / "scans.csv"
            veille.ajouter_scans(chemin, [{"date": "2026-11-05T22:00:00+00:00", "sport": "s1", "matchs": 3,
                                          "cotes_comparees": 9, "marche_different": 0, "value": 0, "meilleur_avantage": -0.021}])
            veille.ajouter_scans(chemin, [{"date": "2026-11-06T10:40:00+00:00", "sport": "s1", "matchs": 4,
                                          "cotes_comparees": 12, "marche_different": 0, "value": 0, "meilleur_avantage": -0.008},
                                         {"date": "2026-11-06T10:40:00+00:00", "sport": "s2", "matchs": 0,
                                          "cotes_comparees": 0, "marche_different": 0, "value": 0, "meilleur_avantage": None}])
            r = veille.resume_scans(veille.charger_scans(chemin))
        self.assertEqual((r["jours"], r["matchs"], r["comparees"], r["value"]), (2, 7, 21, 0))
        self.assertAlmostEqual(r["meilleur"], -0.008)
        md = veille.bilan_markdown([], r, genere_le=T0)
        self.assertIn("**7 match(s)** scanné(s)", md)
        self.assertIn("-0,8 %", md)
        self.assertIn("aucune cote française n'a jamais dépassé", md)


class TestReglement(unittest.TestCase):
    def _pari(self, pari: str, debut: datetime, cote: float = 3.9) -> veille.PariFictif:
        return veille.PariFictif(id=f"e1|{pari}", detecte_le=ISO(T0), sport="s", evenement_id="e1", match="Lyon - Nice",
                                 debut=debut.isoformat(), pari=pari, bookmaker="betclic_fr", cote=cote,
                                 proba_pinnacle=0.27, avantage=0.05, mise=10)

    def test_vainqueur(self):
        score = lambda a, b, fini=True: {"completed": fini, "scores": [{"name": "Lyon", "score": a}, {"name": "Nice", "score": b}]}  # noqa: E731
        self.assertEqual(veille.vainqueur(score("2", "1")), "Lyon")
        self.assertEqual(veille.vainqueur(score("0", "3")), "Nice")
        self.assertEqual(veille.vainqueur(score("1", "1")), "Draw")
        self.assertIsNone(veille.vainqueur(score("1", "0", fini=False)))
        self.assertIsNone(veille.vainqueur({"completed": True, "scores": None}))

    def test_regler(self):
        debut = T0 - timedelta(hours=4)
        paris = [self._pari("Nice", debut), self._pari("Draw", debut), self._pari("Lyon", T0 - timedelta(days=4))]
        paris[2].evenement_id = "e-ancien"
        scores = {"e1": {"completed": True, "scores": [{"name": "Lyon", "score": "0"}, {"name": "Nice", "score": "2"}]}}
        self.assertEqual(veille.regler(paris, scores, instant=T0), 3)
        self.assertEqual([(p.statut, p.gain) for p in paris], [("gagne", 29.0), ("perdu", -10), ("non_reglable", 0.0)])
        self.assertEqual(veille.regler(paris, scores, instant=T0), 0)  # relançable

    def test_sports_a_regler(self):
        paris = [self._pari("Nice", T0 - timedelta(hours=1)), self._pari("Draw", T0 - timedelta(hours=5))]
        paris[1].sport = "soccer_epl"
        self.assertEqual(veille.sports_a_regler(paris, instant=T0), ["soccer_epl"])

    def test_journal_aller_retour_et_bilan(self):
        paris = [self._pari("Nice", T0), self._pari("Draw", T0, cote=3.4)]
        paris[0].statut, paris[0].gain = "gagne", 29.0
        paris[1].statut, paris[1].gain = "perdu", -10.0
        with tempfile.TemporaryDirectory() as tmp:
            chemin = Path(tmp) / "data" / "journal.csv"
            veille.ecrire_journal(chemin, paris)
            relu = veille.charger_journal(chemin)
        self.assertEqual(relu, paris)
        b = veille.bilan(relu)
        self.assertAlmostEqual(b["roi"], 19 / 20)
        self.assertEqual(b["par_bookmaker"]["Betclic"]["n"], 2)
        self.assertIn("trop peu", veille.verdict(b))


class FauxTransport:
    def __init__(self, reponses: dict[str, object], restants: int = 400):
        self.reponses, self.restants, self.urls = reponses, restants, []

    def __call__(self, url: str):
        self.urls.append(url)
        for motif, rep in self.reponses.items():
            if motif in url:
                cout = 2 if "/scores" in url else 1
                self.restants -= cout
                code = rep if isinstance(rep, int) else 200
                corps = b'{"message":"err"}' if isinstance(rep, int) else json.dumps(rep).encode()
                return code, {"x-requests-remaining": str(self.restants), "x-requests-last": str(cout)}, corps
        return 404, {}, b'{"message":"inconnu"}'


class TestClient(unittest.TestCase):
    def test_reserve_de_credits_et_erreurs(self):
        t = FauxTransport({"/odds": []}, restants=27)
        c = ClientOdds("CLE-SECRETE", reserve=25, transport=t, pause=0)
        c.cotes("soccer_epl", ["pinnacle"])            # 27 -> 26
        c.cotes("soccer_epl", ["pinnacle"])            # 26 -> 25 : on touche la réserve, encore autorisé
        with self.assertRaises(CreditsInsuffisants):  # 25 - 1 < 25 : refusé AVANT l'appel
            c.cotes("soccer_epl", ["pinnacle"])
        self.assertEqual(len(t.urls), 2)
        with self.assertRaises(ErreurApi) as ctx:
            ClientOdds("CLE-SECRETE", transport=FauxTransport({"/odds": 401}), pause=0).cotes("x", ["pinnacle"])
        self.assertNotIn("CLE-SECRETE", str(ctx.exception))
        with self.assertRaises(ValueError):
            c.cotes("x", [f"b{i}" for i in range(11)])


class TestCommandes(unittest.TestCase):
    def test_tout_de_bout_en_bout(self):
        debut = veille.maintenant() + timedelta(hours=20)
        maj = veille.maintenant() - timedelta(minutes=5)
        odds = [evenement("e1", debut, [book("pinnacle", PIN, maj), book("betclic_fr", {"Lyon": 2.0, "Draw": 3.3, "Nice": 3.9}, maj)])]
        # ignore_cleanup_errors : sous Windows, un fichier encore ouvert ne peut pas être supprimé.
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            self.addCleanup(self._fermer_logs)
            env = {"ODDS_API_KEY": "CLE-SECRETE", "SPORTS": "soccer_france_ligue_one,soccer_epl",
                   "BOOKMAKERS_FR": "betclic_fr", "JOURNAL": str(Path(tmp) / "journal.csv"), "LOG_DIR": tmp}
            t = FauxTransport({"soccer_france_ligue_one/odds": odds, "soccer_epl/odds": []})
            with mock.patch.dict(os.environ, env), mock.patch("main._client", lambda: ClientOdds("CLE-SECRETE", transport=t, pause=0)):
                with redirect_stdout(io.StringIO()):
                    self.assertEqual(main.main(["scanner", "--dry-run"]), 0)
                    self.assertFalse((Path(tmp) / "journal.csv").exists())
                    self.assertEqual(main.main(["tout"]), 0)
                    self.assertEqual(main.main(["scanner"]), 0)  # relancé : pas de doublon
                    self.assertEqual(main.main(["bilan", "--markdown", str(Path(tmp) / "BILAN.md")]), 0)
                journal = veille.charger_journal(Path(tmp) / "journal.csv")
                scans = veille.charger_scans(Path(tmp) / "scans.csv")
            self.assertEqual(len(scans), 4)  # 2 scans enregistrés x 2 compétitions (le dry-run n'écrit rien)
            self.assertIn("Lyon - Nice", (Path(tmp) / "BILAN.md").read_text(encoding="utf-8"))
            self.assertEqual([p.id for p in journal], ["e1|Nice"])
            logs = "".join(f.read_text(encoding="utf-8") for f in Path(tmp).rglob("*.log"))
            self.assertNotIn("CLE-SECRETE", logs)
            self._fermer_logs()  # avant la suppression du dossier temporaire

    @staticmethod
    def _fermer_logs():
        """Ferme et retire les handlers du logger de l'outil (sinon le .log reste verrouillé sous Windows)."""
        logger = logging.getLogger("autom.veille-value")
        for h in list(logger.handlers):
            h.close()
            logger.removeHandler(h)


if __name__ == "__main__":
    unittest.main()
