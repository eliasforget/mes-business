"""Tests : py -m unittest discover -s tests   (depuis tools/backtest-paris)."""
from __future__ import annotations

import logging
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))
sys.path.insert(0, str(ICI.parents[2] / "shared" / "python"))

import donnees  # noqa: E402
import moteur  # noqa: E402
import strategies  # noqa: E402
from autoshared import parse_env_file  # noqa: E402
from simul import generer  # noqa: E402

LOG = logging.getLogger("test")
LOG.addHandler(logging.NullHandler())


def _match(jour: int, res: str, cotes=(2.0, 3.4, 4.0)) -> donnees.Match:
    return donnees.Match("F1", "2324", datetime(2023, 9, jour), f"A{jour}", f"B{jour}",
                         1 if res == "H" else 0, 1 if res == "A" else 0, res, {"avg": cotes})


class TestDonnees(unittest.TestCase):
    def test_lecture_formats_et_lignes_incompletes(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "F1_2324.csv"
            f.write_text(
                "\ufeffDiv,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgH,AvgD,AvgA,PSH,PSD,PSA\n"
                "F1,11/08/2023,20:00,Nice,Lille,1,1,D,2.50,3.20,2.90,2.55,3.30,3.00\n"
                "F1,12/08/23,,Lens,Brest,0,2,A,1.80,3.60,4.50,,,\n"
                "F1,13/08/2023,,Lyon,,1,0,H,1.5,4,6,,,\n"
                ",,,,,,,,,,,,,\n",
                encoding="utf-8",
            )
            matchs, ignores = donnees.lire_fichier(f, "F1", "2324")
        self.assertEqual(len(matchs), 2)
        self.assertEqual(ignores, 1)  # la ligne sans équipe ; la ligne vide n'est pas comptée
        self.assertEqual(matchs[0].date, datetime(2023, 8, 11, 20, 0))
        self.assertEqual(matchs[1].date, datetime(2023, 8, 12))
        self.assertIn("ps", matchs[0].cotes)
        self.assertNotIn("ps", matchs[1].cotes)  # cotes Pinnacle vides -> absentes
        self.assertEqual(matchs[1].cotes["avg"], (1.8, 3.6, 4.5))

    def test_saison_courante(self):
        from datetime import date
        self.assertEqual(donnees.saison_courante(date(2026, 11, 5)), "2627")
        self.assertEqual(donnees.saison_courante(date(2027, 3, 1)), "2627")
        self.assertEqual(donnees.saison_courante(date(2027, 7, 1)), "2728")


class TestCalculs(unittest.TestCase):
    def test_mise_fixe_profit_roi_drawdown(self):
        # Favori = domicile à 2.0 : gagné, perdu, perdu, gagné
        matchs = [_match(1, "H"), _match(2, "A"), _match(3, "D"), _match(4, "H")]
        res, infos = moteur.simuler(matchs, [strategies.Favori()], "avg",
                                    moteur.ParamsMise(mise=10, bankroll=100))
        s = moteur.statistiques(res[0], 100)
        self.assertEqual(s["n"], 4)
        self.assertAlmostEqual(s["profit"], 0.0)          # +10 -10 -10 +10
        self.assertAlmostEqual(s["roi"], 0.0)
        self.assertAlmostEqual(s["bankroll_finale"], 100.0)
        self.assertAlmostEqual(s["drawdown_max"], 20 / 110)  # sommet 110 -> creux 90
        self.assertEqual(s["serie_perdante_max"], 2)
        self.assertAlmostEqual(infos["marge_moyenne"], 1 / 2 + 1 / 3.4 + 1 / 4 - 1)

    def test_decote_et_filtre_cotes(self):
        matchs = [_match(1, "H")]
        res, _ = moteur.simuler(matchs, [strategies.Favori()], "avg", moteur.ParamsMise(mise=10),
                                decote=0.10)
        self.assertAlmostEqual(res[0].paris[0].cote, 1.8)
        self.assertAlmostEqual(res[0].paris[0].gain, 8.0)
        res, _ = moteur.simuler(matchs, [strategies.Favori()], "avg", moteur.ParamsMise(), cote_max=1.9)
        self.assertEqual(res[0].paris, [])

    def test_kelly(self):
        # proba 0.6 à cote 2.0 -> Kelly plein = 0.2 ; quart de Kelly = 5 % de 1000 = 50, plafonné à 5 %
        params = moteur.ParamsMise(mode="kelly", fraction_kelly=0.25, bankroll=1000)
        self.assertAlmostEqual(moteur._mise(params, 1000, 0.6, 2.0), 50.0)
        params.fraction_kelly = 0.1
        self.assertAlmostEqual(moteur._mise(params, 1000, 0.6, 2.0), 20.0)
        self.assertEqual(moteur._mise(params, 1000, 0.4, 2.0), 0.0)  # pas d'avantage -> pas de mise

    def test_ruine_arrete_les_paris(self):
        matchs = [_match(j, "A") for j in range(1, 10)]
        res, _ = moteur.simuler(matchs, [strategies.Favori()], "avg", moteur.ParamsMise(mise=40, bankroll=100))
        self.assertTrue(res[0].ruine)
        self.assertEqual(len(res[0].paris), 2)  # 100 -> 60 -> 20 < 40 : arrêt


class TestSimulation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        generer(Path(cls.tmp.name), saisons=("2122", "2223", "2324", "2425"))
        cls.matchs = donnees.charger(Path(cls.tmp.name), ["F1"], ["2122", "2223", "2324", "2425"], LOG)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def _lancer(self, matchs, source="avg"):
        strats = strategies.construire(list(strategies.DISPONIBLES))
        res, _ = moteur.simuler(matchs, strats, source, moteur.ParamsMise(mise=10, bankroll=1e9))
        return res

    def test_aucune_fuite_du_futur(self):
        """Les décisions prises avant une date ne changent pas si on retire tous les matchs suivants."""
        coupure = self.matchs[len(self.matchs) // 2].jour
        debut = [m for m in self.matchs if m.jour < coupure]
        complet, partiel = self._lancer(self.matchs), self._lancer(debut)
        for r_c, r_p in zip(complet, partiel):
            avant = [(p.date, p.match, p.issue, p.mise) for p in r_c.paris if p.date.date() < coupure]
            self.assertEqual(avant, [(p.date, p.match, p.issue, p.mise) for p in r_p.paris])
            self.assertGreater(len(avant), 0, r_c.strategie.nom)

    def test_aucun_resultat_du_jour_connu_au_moment_de_decider(self):
        test = self

        class Espion(strategies.Strategie):
            nom = "espion"

            def __init__(self):
                self.dernier_jour_appris = None
                self.decisions = 0

            def choisir(self, match, cotes):
                self.decisions += 1
                if self.dernier_jour_appris is not None:
                    test.assertLess(self.dernier_jour_appris, match.jour)
                return None

            def apprendre(self, match):
                self.dernier_jour_appris = match.jour

        espion = Espion()
        moteur.simuler(self.matchs, [espion], "avg", moteur.ParamsMise())
        self.assertEqual(espion.decisions, len(self.matchs))

    def test_favori_perd_environ_la_marge(self):
        res = self._lancer(self.matchs)
        s = moteur.statistiques(res[0], 1e9)
        self.assertEqual(s["n"], len(self.matchs))
        self.assertTrue(-0.15 < s["roi"] < 0.03, s["roi"])  # marge simulée ~5,5 %

    def test_value_sur_meilleures_cotes_a_un_clv_positif(self):
        # Dans la simulation, Pinnacle ≈ vraie proba et « max » est parfois au-dessus : il y a de la value.
        res = self._lancer(self.matchs, source="max")
        s = moteur.statistiques(res[1], 1e9)
        self.assertGreater(s["n"], 100)
        self.assertGreater(s["clv_moyen"], 0)

    def test_poisson_parie_seulement_apres_historique(self):
        res = self._lancer(self.matchs)
        premiers = res[2].paris[:1]  # poisson
        self.assertTrue(premiers)
        # 60 matchs de ligue minimum avant le premier pari
        rang = next(i for i, m in enumerate(self.matchs) if m.date == premiers[0].date)
        self.assertGreaterEqual(rang, 60)


class TestModeles(unittest.TestCase):
    def test_probas_score(self):
        for rho in (0.0, -0.1):
            p = strategies.probas_score(1.5, 1.1, rho)
            self.assertAlmostEqual(sum(p), 1.0)
        # La correction de Dixon-Coles (rho < 0) augmente la probabilité du nul
        self.assertGreater(strategies.probas_score(1.3, 1.1, -0.1)[1], strategies.probas_score(1.3, 1.1, 0.0)[1])
        # Équipes identiques sans avantage du terrain : symétrie
        h, _, a = strategies.probas_score(1.2, 1.2)
        self.assertAlmostEqual(h, a)

    def test_lecture_stats_tirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "F1_2324.csv"
            f.write_text("Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HS,AS,HST,AST,AvgH,AvgD,AvgA\n"
                         "F1,11/08/2023,Nice,Lille,1,1,D,12,9,5,3,2.5,3.2,2.9\n"
                         "F1,12/08/2023,Lens,Brest,0,2,A,,,,,1.8,3.6,4.5\n", encoding="utf-8")
            matchs, _ = donnees.lire_fichier(f, "F1", "2324")
        self.assertEqual(matchs[0].stats, {"tirs_dom": 12, "tirs_ext": 9, "cadres_dom": 5, "cadres_ext": 3})
        self.assertEqual(matchs[1].stats, {})

    def test_mixte_sans_modele_egale_value_pinnacle(self):
        with tempfile.TemporaryDirectory() as tmp:
            generer(Path(tmp), saisons=("2122", "2223"))
            matchs = donnees.charger(Path(tmp), ["F1"], ["2122", "2223"], LOG)
        mixte = strategies.Mixte(seuil=0.03, poids_modele=0.0)
        value = strategies.ValuePinnacle(seuil=0.03)
        res, _ = moteur.simuler(matchs, [mixte, value], "max", moteur.ParamsMise(bankroll=1e9))
        # Mixte ne parie qu'une fois son modèle prêt : ses paris sont un sous-ensemble identique de value_pinnacle
        paris_value = {(p.date, p.match, p.issue) for p in res[1].paris}
        self.assertTrue(res[0].paris)
        self.assertTrue({(p.date, p.match, p.issue) for p in res[0].paris} <= paris_value)

    def test_qualite_mesuree_et_tirs_meilleur_que_buts(self):
        with tempfile.TemporaryDirectory() as tmp:
            saisons = ("2122", "2223", "2324", "2425")
            generer(Path(tmp), saisons=saisons, graine=7)
            matchs = donnees.charger(Path(tmp), ["F1"], list(saisons), LOG)
        strats = strategies.construire(["poisson", "tirs", "favori"])
        res, _ = moteur.simuler(matchs, strats, "avg", moteur.ParamsMise(bankroll=1e9))
        qp, qt = moteur.qualite(res[0]), moteur.qualite(res[1])
        self.assertIsNone(moteur.qualite(res[2]))  # favori n'estime pas de probabilités
        self.assertGreater(qp["n"], 500)
        self.assertEqual(qp["n"], qt["n"])  # comparés sur les mêmes matchs
        # Dans la simulation, les tirs cadrés portent plus d'information que les buts
        self.assertLess(qt["modele"], qp["modele"])


class TestEnv(unittest.TestCase):
    def test_parse_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / ".env"
            f.write_text('\ufeff# commentaire\nA=1\nB="C:\\Users\\moi"\nexport C=x # note\nD=\n', encoding="utf-8")
            self.assertEqual(parse_env_file(f), {"A": "1", "B": "C:\\Users\\moi", "C": "x", "D": ""})


if __name__ == "__main__":
    unittest.main()
